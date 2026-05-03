import { env } from "../../config/env.js";
import { AppError } from "../../utils/AppError.js";

/**
 * Arkesel SMS **V2** — we only integrate `POST /api/v2/sms/send` (single / bulk recipients).
 * Auth: `api-key` header. Optional `sandbox: true` for test sends (see env).
 * Not used: template send, balance, message reports, contacts — add only if product needs them.
 */
const DEFAULT_ARKESEL_V2_SEND_URL = "https://sms.arkesel.com/api/v2/sms/send";

/** International digits without `+`, as required by Arkesel (e.g. `233544919953`). */
function e164ToSmsDigits(e164: string): string {
  const digits = e164.startsWith("+") ? e164.slice(1) : e164;
  if (!/^\d{8,16}$/.test(digits)) {
    throw new AppError("Invalid destination number for SMS", 400);
  }
  return digits;
}

export function isSmsTransportConfigured(): boolean {
  if (env.NOTIFICATION_SMS_PROVIDER === "none") return false;
  if (env.NOTIFICATION_SMS_PROVIDER === "arkesel") {
    return Boolean(env.ARKESEL_API_KEY?.length && env.ARKESEL_SENDER_ID?.length);
  }
  if (env.NOTIFICATION_SMS_PROVIDER === "twilio") {
    return Boolean(
      env.TWILIO_ACCOUNT_SID?.length &&
        env.TWILIO_AUTH_TOKEN?.length &&
        env.TWILIO_FROM_NUMBER?.length,
    );
  }
  return false;
}

async function deliverSms(toE164: string, message: string): Promise<void> {
  if (!isSmsTransportConfigured()) {
    if (env.NODE_ENV === "development") {
      console.warn(`[dev] SMS (${env.NOTIFICATION_SMS_PROVIDER}) → ${toE164}: ${message}`);
      return;
    }
    throw new AppError(
      "SMS delivery is not configured. Set NOTIFICATION_SMS_PROVIDER=arkesel with ARKESEL_API_KEY and ARKESEL_SENDER_ID (or Twilio variables).",
      503,
    );
  }

  if (env.NOTIFICATION_SMS_PROVIDER === "arkesel") {
    await sendViaArkeselV2(toE164, message);
    return;
  }

  await sendViaTwilio(toE164, message);
}

export async function sendOtpSms(toE164: string, code: string): Promise<void> {
  await deliverSms(
    toE164,
    `Your BelieveChops code is ${code}. It expires in ${env.OTP_TTL_MINUTES} minutes.`,
  );
}

/** Short welcome SMS after sign-in. */
export async function sendWelcomeSms(toE164: string): Promise<void> {
  await deliverSms(
    toE164,
    `BelieveChops: Welcome! Explore our menu for meals & fresh juices — glad you're here.`,
  );
}

/** Scheduled menu nudge (short). */
export async function sendMenuReminderSms(toE164: string): Promise<void> {
  await deliverSms(
    toE164,
    `BelieveChops: Hungry? Lots on our menu — meals & fresh juices. Open the site & order when ready.`,
  );
}

async function sendViaArkeselV2(toE164: string, message: string): Promise<void> {
  const apiKey = env.ARKESEL_API_KEY!;
  const sender = env.ARKESEL_SENDER_ID!;
  const url = env.ARKESEL_SMS_URL ?? DEFAULT_ARKESEL_V2_SEND_URL;
  const recipient = e164ToSmsDigits(toE164);

  const body: Record<string, unknown> = {
    sender,
    message,
    recipients: [recipient],
  };
  if (env.ARKESEL_SANDBOX) {
    body.sandbox = true;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json: { status?: string; data?: unknown; message?: string } | null = null;
  try {
    json = JSON.parse(text) as { status?: string; data?: unknown; message?: string };
  } catch {
    /* non-JSON error body */
  }

  if (res.status === 401) {
    console.error("Arkesel SMS V2: authentication failed");
    throw new AppError("SMS provider authentication failed", 502);
  }
  if (res.status === 402) {
    console.error("Arkesel SMS V2: insufficient balance");
    throw new AppError("SMS provider balance too low", 502);
  }
  if (res.status === 403) {
    console.error("Arkesel SMS V2: inactive gateway");
    throw new AppError("SMS gateway inactive", 502);
  }
  if (res.status === 422) {
    console.error("Arkesel SMS V2 validation:", text);
    throw new AppError("SMS request rejected by provider", 422);
  }

  if (!res.ok || json?.status !== "success") {
    console.error("Arkesel SMS V2 error:", res.status, text);
    throw new AppError("Failed to send SMS", 502);
  }

  if (arkeselV2RejectedRecipient(json?.data, recipient)) {
    console.error("Arkesel SMS V2 rejected recipient:", text);
    throw new AppError("SMS recipient rejected by provider", 422);
  }
}

/**
 * V2 success responses often use `data: [{}, …]` (one entry per recipient). Only treat as failure when
 * the payload explicitly lists `invalid numbers` containing our recipient.
 */
function arkeselV2RejectedRecipient(data: unknown, recipientDigits: string): boolean {
  if (!Array.isArray(data)) return false;
  for (const item of data) {
    if (item && typeof item === "object" && "invalid numbers" in item) {
      const bad = (item as { "invalid numbers": string[] })["invalid numbers"];
      if (Array.isArray(bad) && bad.includes(recipientDigits)) return true;
    }
  }
  return false;
}

async function sendViaTwilio(toE164: string, message: string): Promise<void> {
  const sid = env.TWILIO_ACCOUNT_SID!;
  const token = env.TWILIO_AUTH_TOKEN!;
  const from = env.TWILIO_FROM_NUMBER!;
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");

  const body = new URLSearchParams({
    From: from,
    To: toE164,
    Body: message,
  });

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Twilio SMS error:", res.status, errText);
    throw new AppError("Failed to send SMS", 502);
  }
}
