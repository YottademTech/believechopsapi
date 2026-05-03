import crypto from "node:crypto";
import { env } from "../config/env.js";

export function hashOtpCode(identifier: string, code: string): string {
  return crypto
    .createHash("sha256")
    .update(env.OTP_PEPPER, "utf8")
    .update("\0", "utf8")
    .update(identifier, "utf8")
    .update("\0", "utf8")
    .update(code, "utf8")
    .digest("hex");
}

export function safeEqualOtpHash(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export function generateNumericOtp(length: number): string {
  const n = 10 ** length;
  return crypto.randomInt(0, n).toString().padStart(length, "0");
}
