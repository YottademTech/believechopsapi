import { AppError } from "../utils/AppError.js";

/**
 * Normalizes to E.164: leading +, digits, 8–15 digits after country code.
 */
export function normalizeE164Phone(input: string): string {
  const s = input.trim().replace(/[\s-]/g, "");
  if (!/^\+\d{8,16}$/.test(s)) {
    throw new AppError(
      "Invalid phone number. Use international format (E.164), e.g. +2348012345678",
      400,
    );
  }
  return s;
}
