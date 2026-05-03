import crypto from "node:crypto";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";
import { sendMenuReminderEmail } from "./notification/email.js";
import { sendMenuReminderSms } from "./notification/sms.js";

function timingSafeEqualUtf8(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "utf8");
    const bb = Buffer.from(b, "utf8");
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

/**
 * SchedulingEngine POSTs to `/api/reminders/dispatch?secret=…` (secret embedded in registered `callbackUrl`).
 * Body: `{ callbackUrl, uniqueId }` where `uniqueId` is the user id. No bearer token.
 */
export async function dispatchMenuReminder(params: {
  userId: string;
  querySecret: string | undefined;
}): Promise<void> {
  const expected = env.SCHEDULER_DISPATCH_SECRET;
  if (!expected) {
    throw new AppError("Scheduler dispatch is not configured", 503);
  }

  const provided = params.querySecret ?? "";
  if (!timingSafeEqualUtf8(provided, expected)) {
    throw new AppError("Forbidden", 403);
  }

  const userId = params.userId.trim();
  if (!userId) {
    throw new AppError("Invalid user id", 400);
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    console.warn("[menu reminder] user not found:", userId);
    return;
  }

  const tasks: Promise<void>[] = [];
  if (user.email) {
    tasks.push(
      sendMenuReminderEmail(user.email, user.name).catch((err) => {
        console.error("[menu reminder email]", err);
      }),
    );
  }
  if (user.phone) {
    tasks.push(
      sendMenuReminderSms(user.phone).catch((err) => {
        console.error("[menu reminder sms]", err);
      }),
    );
  }

  if (tasks.length === 0) {
    console.warn("[menu reminder] no email or phone on user:", userId);
    return;
  }

  await Promise.all(tasks);
}
