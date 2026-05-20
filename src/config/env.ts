import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  PAYSTACK_SECRET_KEY: z.string().min(1),
  PAYSTACK_PUBLIC_KEY: z.string().optional(),
  /**
   * Development only: minimum 16 chars. When set, `POST /api/dev/simulate-paystack-paid`
   * with `Authorization: Bearer <this>` can apply a successful payment by Paystack reference (no HMAC).
   */
  WEBHOOK_SIMULATE_SECRET: z.string().min(16).optional(),
  /** Comma-separated list; empty uses permissive CORS in development only */
  CORS_ORIGINS: z.string().optional(),
  /** Comma-separated admin portal origins (Vite dev, production admin host). Merged into CORS + Socket.IO allowlist in production. */
  ADMIN_CORS_ORIGINS: z.string().optional(),

  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default("7d"),

  OTP_PEPPER: z.string().min(16),
  OTP_LENGTH: z.coerce.number().min(4).max(8).default(6),
  OTP_TTL_MINUTES: z.coerce.number().min(1).max(60).default(10),
  /** Minimum seconds between OTP sends to the same email/phone. */
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().min(30).max(600).default(60),

  /** Primary routing hint when request omits `channel` — email requires SMTP; sms requires Arkesel or Twilio */
  OTP_DEFAULT_CHANNEL: z.enum(["email", "sms"]).default("email"),

  NOTIFICATION_EMAIL_PROVIDER: z.enum(["smtp", "none"]).default("none"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_SECURE: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().email().optional(),

  /**
   * Customer-facing web origin for transactional email links (welcome + menu reminder), e.g. `https://www.example.com`.
   * Trailing slash is optional; menu URLs are built as `{origin}/menu`.
   */
  EMAIL_PUBLIC_SITE_ORIGIN: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().url(),
  ),

  /** Ghana / Africa: Arkesel (https://developers.arkesel.com/). Legacy: `twilio`. */
  NOTIFICATION_SMS_PROVIDER: z.enum(["arkesel", "twilio", "none"]).default("none"),
  /** SMS V2: sent as `api-key` header on POST /api/v2/sms/send */
  ARKESEL_API_KEY: z.string().optional(),
  /** Registered sender ID (max 11 characters per Arkesel) */
  ARKESEL_SENDER_ID: z.string().optional(),
  /** Default `https://sms.arkesel.com/api/v2/sms/send` */
  ARKESEL_SMS_URL: z.string().url().optional(),
  /** Set `true` to send sandbox SMS (not billed, not delivered to carriers; see Arkesel SMS V2 docs). */
  ARKESEL_SANDBOX: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),

  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),

  /** Hubtel SchedulingEngine / Quartz API base URL (no trailing slash). Optional until wired. */
  SCHEDULING_ENGINE_URL: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().url().optional(),
  ),
  /**
   * Public base URL of **this API** (e.g. ngrok). Use for scheduling-engine `callbackUrl`:
   * `{APP_PUBLIC_URL}/api/...` — no trailing slash.
   */
  APP_PUBLIC_URL: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().url().optional(),
  ),
  /**
   * Shared secret for `GET` query `?secret=` on `/api/reminders/dispatch` (embedded in scheduler `callbackUrl`).
   * Scheduling engine calls the endpoint with **no** bearer token; this proves the request is legitimate.
   */
  SCHEDULER_DISPATCH_SECRET: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().min(16).optional(),
  ),
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);
