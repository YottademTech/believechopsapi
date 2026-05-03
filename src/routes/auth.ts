import { Router } from "express";
import rateLimit from "express-rate-limit";
import { OtpChannel, OtpPurpose } from "@prisma/client";
import { env } from "../config/env.js";
import { signAccessToken } from "../lib/jwt.js";
import { requireAuth } from "../middleware/requireAuth.js";
import * as otpService from "../services/otpService.js";
import * as userService from "../services/userService.js";
import { notifyWelcomeAfterLogin } from "../services/welcomeNotifications.js";
import { AppError } from "../utils/AppError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { z } from "zod";

export const authRouter = Router();

const otpSendLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many OTP send attempts. Try again later." },
});

const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
});

const otpSendSchema = z
  .object({
    channel: z.enum(["EMAIL", "SMS"]).optional(),
    purpose: z.nativeEnum(OtpPurpose).optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
  })
  .transform((d) => {
    const channel =
      d.channel ??
      (env.OTP_DEFAULT_CHANNEL === "email" ? OtpChannel.EMAIL : OtpChannel.SMS);
    return { ...d, channel };
  })
  .superRefine((d, ctx) => {
    if (d.channel === OtpChannel.EMAIL && !d.email?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "email is required when channel is EMAIL or default is email",
      });
    }
    if (d.channel === OtpChannel.SMS && !d.phone?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "phone is required when channel is SMS (E.164)",
      });
    }
  });

const otpVerifySchema = z
  .object({
    channel: z.enum(["EMAIL", "SMS"]).optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    code: z.string().min(1),
    name: z.string().max(120).optional(),
  })
  .transform((d) => {
    const channel =
      d.channel ??
      (env.OTP_DEFAULT_CHANNEL === "email" ? OtpChannel.EMAIL : OtpChannel.SMS);
    return { ...d, channel };
  })
  .superRefine((d, ctx) => {
    if (d.channel === OtpChannel.EMAIL && !d.email?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "email is required for EMAIL OTP" });
    }
    if (d.channel === OtpChannel.SMS && !d.phone?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "phone is required for SMS OTP" });
    }
  });

authRouter.post(
  "/otp/send",
  otpSendLimiter,
  asyncHandler(async (req, res) => {
    const body = otpSendSchema.parse(req.body);
    await otpService.requestOtp({
      channel: body.channel,
      purpose: body.purpose,
      email: body.email,
      phone: body.phone,
    });
    res.status(202).json({
      sent: true,
      channel: body.channel,
      ttlMinutes: env.OTP_TTL_MINUTES,
    });
  }),
);

authRouter.post(
  "/otp/verify",
  otpVerifyLimiter,
  asyncHandler(async (req, res) => {
    const body = otpVerifySchema.parse(req.body);
    const user = await otpService.verifyOtpAndSignIn({
      channel: body.channel,
      email: body.email,
      phone: body.phone,
      code: body.code,
      name: body.name,
    });
    notifyWelcomeAfterLogin(user);
    const token = await signAccessToken(user.id);
    res.json({
      token,
      tokenType: "Bearer",
      expiresIn: env.JWT_EXPIRES_IN,
      user,
    });
  }),
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await userService.getUserById(req.userId!);
    if (!user) {
      throw new AppError("User not found", 404);
    }
    res.json({ user });
  }),
);

const patchProfileSchema = z.object({
  name: z.string().max(120).optional(),
});

authRouter.patch(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = patchProfileSchema.parse(req.body);
    const user = await userService.updateUserProfile(req.userId!, body);
    res.json({ user });
  }),
);

const contactSendSchema = z
  .object({
    channel: z.enum(["EMAIL", "SMS"]),
    email: z.string().email().optional(),
    phone: z.string().optional(),
  })
  .superRefine((d, ctx) => {
    if (d.channel === "EMAIL" && !d.email?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "email is required" });
    }
    if (d.channel === "SMS" && !d.phone?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "phone is required (E.164)" });
    }
  });

const contactVerifySchema = z
  .object({
    channel: z.enum(["EMAIL", "SMS"]),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    code: z.string().min(1),
  })
  .superRefine((d, ctx) => {
    if (d.channel === "EMAIL" && !d.email?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "email is required" });
    }
    if (d.channel === "SMS" && !d.phone?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "phone is required" });
    }
  });

authRouter.post(
  "/contact/send",
  otpSendLimiter,
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = contactSendSchema.parse(req.body);
    await otpService.requestContactVerification(req.userId!, {
      channel: body.channel,
      email: body.email,
      phone: body.phone,
    });
    res.status(202).json({
      sent: true,
      channel: body.channel,
      ttlMinutes: env.OTP_TTL_MINUTES,
    });
  }),
);

authRouter.post(
  "/contact/verify",
  otpVerifyLimiter,
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = contactVerifySchema.parse(req.body);
    const user = await otpService.verifyContactAndLink(req.userId!, {
      channel: body.channel,
      email: body.email,
      phone: body.phone,
      code: body.code,
    });
    res.json({ user });
  }),
);

const registerSchema = z
  .object({
    email: z.string().email().optional(),
    phone: z.string().optional(),
    name: z.string().optional(),
  })
  .refine((d) => Boolean(d.email?.trim()) || Boolean(d.phone?.trim()), {
    message: "Either email or phone is required",
  });

authRouter.post(
  "/register",
  asyncHandler(async (req, res) => {
    const body = registerSchema.parse(req.body);
    const user = await userService.registerUser(body);
    res.status(201).json({ user });
  }),
);
