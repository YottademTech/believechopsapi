import type { User } from "@prisma/client";
import { OtpChannel, OtpPurpose } from "@prisma/client";
import { env } from "../config/env.js";
import { generateNumericOtp, hashOtpCode, safeEqualOtpHash } from "../lib/otpCrypto.js";
import { normalizeE164Phone } from "../lib/phone.js";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";
import { sendOtpEmail } from "./notification/email.js";
import { sendOtpSms } from "./notification/sms.js";

const OTP_SENDS_PER_HOUR = 5;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export type ChannelPayload = {
  channel: OtpChannel;
  email?: string;
  phone?: string;
};

export type RequestOtpInput = ChannelPayload & {
  purpose?: OtpPurpose;
};

export async function requestOtp(input: RequestOtpInput): Promise<void> {
  const purpose = input.purpose ?? OtpPurpose.SIGN_IN;
  const { identifier, channel } = resolveDestination(input);

  const recent = await prisma.otpChallenge.count({
    where: {
      identifier,
      channel,
      purpose,
      createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
    },
  });
  if (recent >= OTP_SENDS_PER_HOUR) {
    throw new AppError("Too many verification attempts. Try again later.", 429, "OTP_RATE_LIMIT");
  }

  const cooldownMs = env.OTP_RESEND_COOLDOWN_SECONDS * 1000;
  const lastSend = await prisma.otpChallenge.findFirst({
    where: { identifier, channel, purpose },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (lastSend) {
    const elapsed = Date.now() - lastSend.createdAt.getTime();
    if (elapsed < cooldownMs) {
      const retryAfterSeconds = Math.ceil((cooldownMs - elapsed) / 1000);
      throw new AppError(
        `Please wait ${retryAfterSeconds} seconds before requesting another code.`,
        429,
        "OTP_COOLDOWN",
        retryAfterSeconds,
      );
    }
  }

  await prisma.otpChallenge.updateMany({
    where: { identifier, channel, purpose, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  const code = generateNumericOtp(env.OTP_LENGTH);
  const codeHash = hashOtpCode(identifier, code);
  const expiresAt = new Date(Date.now() + env.OTP_TTL_MINUTES * 60 * 1000);

  const created = await prisma.otpChallenge.create({
    data: {
      identifier,
      channel,
      purpose,
      codeHash,
      expiresAt,
    },
  });

  try {
    if (channel === OtpChannel.EMAIL) {
      await sendOtpEmail(identifier, code);
    } else {
      await sendOtpSms(identifier, code);
    }
  } catch (err) {
    await prisma.otpChallenge.delete({ where: { id: created.id } }).catch(() => {
      /* ignore double-delete */
    });
    throw err;
  }
}

function resolveDestination(input: ChannelPayload): { identifier: string; channel: OtpChannel } {
  if (input.channel === OtpChannel.EMAIL) {
    if (!input.email?.trim()) {
      throw new AppError("email is required for email OTP", 400);
    }
    return { identifier: normalizeEmail(input.email), channel: OtpChannel.EMAIL };
  }
  if (!input.phone?.trim()) {
    throw new AppError("phone is required for SMS OTP (E.164)", 400);
  }
  return { identifier: normalizeE164Phone(input.phone), channel: OtpChannel.SMS };
}

export type VerifyOtpInput = ChannelPayload & {
  code: string;
  name?: string;
};

export async function verifyOtpAndSignIn(input: VerifyOtpInput): Promise<User> {
  const digits = input.code.replace(/\D/g, "");
  if (digits.length !== env.OTP_LENGTH) {
    throw new AppError("Invalid verification code", 400);
  }

  const { identifier, channel } = resolveDestination({
    channel: input.channel,
    email: input.email,
    phone: input.phone,
  });

  const challenge = await prisma.otpChallenge.findFirst({
    where: {
      identifier,
      channel,
      purpose: OtpPurpose.SIGN_IN,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!challenge) {
    throw new AppError("Invalid or expired verification code", 400);
  }

  if (challenge.attempts >= challenge.maxAttempts) {
    throw new AppError("Too many failed attempts. Request a new code.", 400);
  }

  const expectedHash = hashOtpCode(identifier, digits);
  if (!safeEqualOtpHash(expectedHash, challenge.codeHash)) {
    await prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    });
    throw new AppError("Invalid verification code", 400);
  }

  const user = await ensureUserVerified(channel, identifier, input.name?.trim());

  await prisma.otpChallenge.update({
    where: { id: challenge.id },
    data: { consumedAt: new Date() },
  });

  return user;
}

export async function requestContactVerification(
  userId: string,
  input: ChannelPayload,
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new AppError("User not found", 404);
  }

  const purpose =
    input.channel === OtpChannel.EMAIL ? OtpPurpose.VERIFY_EMAIL : OtpPurpose.VERIFY_PHONE;
  const { identifier, channel } = resolveDestination(input);

  if (channel === OtpChannel.EMAIL) {
    const owner = await prisma.user.findUnique({ where: { email: identifier } });
    if (owner && owner.id !== userId) {
      throw new AppError("That email is already used by another account", 409);
    }
    if (user.email === identifier && user.emailVerifiedAt) {
      throw new AppError("This email is already verified on your account", 400);
    }
  } else {
    const owner = await prisma.user.findUnique({ where: { phone: identifier } });
    if (owner && owner.id !== userId) {
      throw new AppError("That phone number is already used by another account", 409);
    }
    if (user.phone === identifier && user.phoneVerifiedAt) {
      throw new AppError("This phone number is already verified on your account", 400);
    }
  }

  await requestOtp({
    channel,
    email: input.email,
    phone: input.phone,
    purpose,
  });
}

export async function verifyContactAndLink(userId: string, input: VerifyOtpInput): Promise<User> {
  const digits = input.code.replace(/\D/g, "");
  if (digits.length !== env.OTP_LENGTH) {
    throw new AppError("Invalid verification code", 400);
  }

  const purpose =
    input.channel === OtpChannel.EMAIL ? OtpPurpose.VERIFY_EMAIL : OtpPurpose.VERIFY_PHONE;
  const { identifier, channel } = resolveDestination({
    channel: input.channel,
    email: input.email,
    phone: input.phone,
  });

  const challenge = await prisma.otpChallenge.findFirst({
    where: {
      identifier,
      channel,
      purpose,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!challenge) {
    throw new AppError("Invalid or expired verification code", 400);
  }

  if (challenge.attempts >= challenge.maxAttempts) {
    throw new AppError("Too many failed attempts. Request a new code.", 400);
  }

  const expectedHash = hashOtpCode(identifier, digits);
  if (!safeEqualOtpHash(expectedHash, challenge.codeHash)) {
    await prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    });
    throw new AppError("Invalid verification code", 400);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const collision =
      channel === OtpChannel.EMAIL
        ? await tx.user.findFirst({
            where: { email: identifier, id: { not: userId } },
          })
        : await tx.user.findFirst({
            where: { phone: identifier, id: { not: userId } },
          });

    if (collision) {
      throw new AppError("That contact is already linked to another account", 409);
    }

    return tx.user.update({
      where: { id: userId },
      data:
        channel === OtpChannel.EMAIL
          ? { email: identifier, emailVerifiedAt: new Date() }
          : { phone: identifier, phoneVerifiedAt: new Date() },
    });
  });

  await prisma.otpChallenge.update({
    where: { id: challenge.id },
    data: { consumedAt: new Date() },
  });

  return updated;
}

async function ensureUserVerified(
  channel: OtpChannel,
  identifier: string,
  name?: string,
): Promise<User> {
  if (channel === OtpChannel.EMAIL) {
    const existing = await prisma.user.findUnique({
      where: { email: identifier },
    });
    if (existing) {
      if (!existing.emailVerifiedAt) {
        return prisma.user.update({
          where: { id: existing.id },
          data: {
            emailVerifiedAt: new Date(),
            ...(name && !existing.name ? { name } : {}),
          },
        });
      }
      return existing;
    }
    return prisma.user.create({
      data: {
        email: identifier,
        emailVerifiedAt: new Date(),
        ...(name ? { name } : {}),
      },
    });
  }

  const existingByPhone = await prisma.user.findUnique({
    where: { phone: identifier },
  });
  if (existingByPhone) {
    if (!existingByPhone.phoneVerifiedAt) {
      return prisma.user.update({
        where: { id: existingByPhone.id },
        data: {
          phoneVerifiedAt: new Date(),
          ...(name && !existingByPhone.name ? { name } : {}),
        },
      });
    }
    return existingByPhone;
  }

  return prisma.user.create({
    data: {
      phone: identifier,
      phoneVerifiedAt: new Date(),
      ...(name ? { name } : {}),
    },
  });
}
