import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import nodemailer from "nodemailer";
import type Mail from "nodemailer/lib/mailer/index.js";
import type { Transporter } from "nodemailer";
import { env } from "../../config/env.js";
import { resolveMenuUrl } from "../../lib/publicUrls.js";
import { AppError } from "../../utils/AppError.js";

/** Inline attachment id — must match `<img src="cid:…">` in HTML. */
const LOGO_CID = "believechops-logo";

function resolveBrandingLogoPath(): string | null {
  const dir = dirname(fileURLToPath(import.meta.url));
  const logoPath = join(dir, "../../../assets/branding/logo.jpeg");
  return existsSync(logoPath) ? logoPath : null;
}

export function isEmailTransportConfigured(): boolean {
  return (
    env.NOTIFICATION_EMAIL_PROVIDER === "smtp" &&
    Boolean(env.SMTP_HOST?.length) &&
    Boolean(env.SMTP_FROM?.length)
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function createSmtpTransporter(): Transporter {
  const auth =
    env.SMTP_USER && env.SMTP_PASS !== undefined
      ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
      : undefined;

  const timeouts = {
    connectionTimeout: 60_000,
    greetingTimeout: 45_000,
    socketTimeout: 180_000,
  };

  const tlsBase: { minVersion: "TLSv1.2"; servername?: string } = {
    minVersion: "TLSv1.2",
  };

  const hostLower = env.SMTP_HOST?.toLowerCase() ?? "";
  /** Nodemailer’s preset matches Gmail’s TLS/STARTTLS behaviour better than raw host:587 on some networks. */
  if (hostLower.includes("gmail")) {
    return nodemailer.createTransport({
      service: "gmail",
      auth,
      ...timeouts,
      tls: { ...tlsBase, servername: "smtp.gmail.com" },
    });
  }

  const port = env.SMTP_PORT ?? 587;
  const secure = env.SMTP_SECURE !== undefined ? env.SMTP_SECURE : port === 465;

  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port,
    secure,
    auth,
    ...timeouts,
    requireTLS: !secure && port === 587,
    tls: tlsBase,
  });
}

function isRetryableSmtpError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /socket|ECONNRESET|ETIMEDOUT|timeout|closed|EPIPE/i.test(msg) ||
    msg.includes("Unexpected socket close")
  );
}

/** Several attempts with fresh transports — Gmail / flaky Wi‑Fi often drop the first connection. */
async function sendMailReliable(options: Mail.Options): Promise<void> {
  const maxAttempts = 3;
  let last: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await createSmtpTransporter().sendMail(options);
      return;
    } catch (e: unknown) {
      last = e;
      if (!isRetryableSmtpError(e) || attempt === maxAttempts) {
        throw e;
      }
      const delayMs = 400 * attempt;
      console.warn(
        `[smtp] attempt ${attempt}/${maxAttempts} failed (${e instanceof Error ? e.message : String(e)}), retrying in ${delayMs}ms`,
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw last;
}

function brandedHeaderHtml(embedLogo: boolean): string {
  if (embedLogo) {
    return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:linear-gradient(180deg,#fffbeb 0%,#fffcf7 55%,#fffcf7 100%);border-bottom:1px solid #f3e8d4;">
<tr><td style="height:5px;background-color:#eab308;line-height:5px;font-size:0;">&nbsp;</td></tr>
<tr>
<td align="center" style="padding:28px 24px 8px 24px;">
<img src="cid:${LOGO_CID}" alt="Believe Chops" width="88" height="88" style="display:block;margin:0 auto;border-radius:9999px;border:2px solid #facc15;box-shadow:0 4px 14px rgba(234,179,8,0.2);" />
<p style="margin:14px 0 0 0;font-size:12px;font-weight:600;letter-spacing:0.28em;text-transform:uppercase;color:#78716c;">
Believe Chops
</p>
<p style="margin:14px 0 0 0;text-align:center;line-height:1;">
<span style="color:#e7d4a8;font-size:8px;vertical-align:middle;">&#9679;</span>
<span style="display:inline-block;width:18px;"></span>
<span style="color:#ca8a04;font-size:12px;vertical-align:middle;line-height:1;">&#10022;</span>
<span style="display:inline-block;width:18px;"></span>
<span style="color:#e7d4a8;font-size:8px;vertical-align:middle;">&#9679;</span>
</p>
</td>
</tr>
</table>`;
  }
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0">
<tr><td style="height:4px;background-color:#eab308;line-height:4px;font-size:0;">&nbsp;</td></tr>
<tr><td style="padding:28px 32px 8px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<p style="margin:0;font-size:13px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#7a6f66;">BelieveChops</p>
</td></tr>
</table>`;
}

/** Spaces digits for readability (e.g. 123 456). */
function formatCodeForDisplay(digits: string): string {
  const d = digits.replace(/\D/g, "");
  if (d.length <= 4) return d;
  const mid = Math.ceil(d.length / 2);
  return `${d.slice(0, mid)}\u00a0${d.slice(mid)}`;
}

function buildOtpEmailBodies(
  code: string,
  ttlMinutes: number,
  embedLogo: boolean,
): { html: string; text: string } {
  const safeCode = escapeHtml(code);
  const spaced = formatCodeForDisplay(code);
  const parts = spaced.replace(/\u00a0/g, " ").split(" ");
  const codeSpans =
    parts.length === 2
      ? `<span style="letter-spacing:0.32em;">${escapeHtml(parts[0]!)}</span><span style="display:inline-block;width:14px;"></span><span style="letter-spacing:0.32em;">${escapeHtml(parts[1]!)}</span>`
      : `<span style="letter-spacing:0.22em;">${safeCode}</span>`;

  const headerBlock = brandedHeaderHtml(embedLogo);

  const text = [
    `Believe Chops`,
    ``,
    `Your sign-in code is ${spaced.replace(/\u00a0/g, " ")}.`,
    ``,
    `It works for ${ttlMinutes} minutes. If you didn’t ask for this, ignore this email — nothing changes.`,
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sign-in code</title>
</head>
<body style="margin:0;padding:0;background-color:#f0ebe3;">
<span style="display:none!important;visibility:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#f0ebe3;max-height:0;max-width:0;opacity:0;overflow:hidden;">
Use this code to finish signing in to BelieveChops.
</span>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f0ebe3;padding:40px 16px;">
<tr>
<td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;background-color:#fffcf7;border:1px solid #e5dfd4;border-radius:12px;overflow:hidden;box-shadow:0 8px 28px rgba(44,40,37,0.06);">
<tr>
<td style="padding:0;">
${headerBlock}
</td>
</tr>
<tr>
<td style="padding:8px 32px 28px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#2c2825;">
<h1 style="margin:0 0 18px 0;font-size:22px;font-weight:600;line-height:1.35;color:#1a1715;">
Here’s your code
</h1>
<p style="margin:0 0 24px 0;font-size:16px;line-height:1.55;color:#4a423c;">
Enter it on the site to continue. It’s good for <strong style="font-weight:600;color:#2c2825;">${ttlMinutes} minutes</strong>.
</p>
<table role="presentation" cellspacing="0" cellpadding="0" width="100%">
<tr>
<td style="background-color:#faf6f0;border:1px dashed #cfc6ba;border-radius:8px;padding:20px 16px;text-align:center;">
<p style="margin:0;font-family:ui-monospace,'Cascadia Code','SF Mono',Consolas,'Liberation Mono',Menlo,monospace;font-size:28px;font-weight:600;color:#1a1715;">
${codeSpans}
</p>
</td>
</tr>
</table>
<p style="margin:28px 0 0 0;font-size:14px;line-height:1.6;color:#6b625c;">
Didn’t request this? You can ignore this message — your account stays as it was.
</p>
</td>
</tr>
<tr>
<td style="padding:16px 32px 28px 32px;border-top:1px solid #efe8df;background-color:#faf7f2;">
<p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:12px;line-height:1.5;color:#91887f;">
Plain copy: <span style="font-family:ui-monospace,Consolas,monospace;color:#4a423c;">${safeCode}</span>
</p>
</td>
</tr>
</table>
<p style="margin:24px 0 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:11px;line-height:1.5;color:#9a928a;text-align:center;max-width:480px;">
Sent by BelieveChops for sign-in verification only.
</p>
</td>
</tr>
</table>
</body>
</html>`;

  return { html, text };
}

function firstNameOrThere(name: string | null | undefined): string {
  const raw = name?.trim().split(/\s+/)[0];
  return raw ? escapeHtml(raw) : "there";
}

function buildWelcomeEmailBodies(
  greetingHtml: string,
  menuUrl: string,
  embedLogo: boolean,
): { html: string; text: string } {
  const safeMenu = escapeHtml(menuUrl);
  const safeMenuAttr = menuUrl.replace(/"/g, "&quot;");

  const text = [
    `Believe Chops`,
    ``,
    `Good to see you — thanks for signing in.`,
    ``,
    `Explore our menu for homestyle meals and fresh juices whenever hunger strikes.`,
    ``,
    `Open the menu: ${menuUrl}`,
    ``,
    `— Believe Chops`,
  ].join("\n");

  const headerBlock = brandedHeaderHtml(embedLogo);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Welcome</title>
</head>
<body style="margin:0;padding:0;background-color:#f0ebe3;">
<span style="display:none!important;visibility:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#f0ebe3;max-height:0;max-width:0;opacity:0;overflow:hidden;">
You’re in — explore food & juices on our menu.
</span>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f0ebe3;padding:40px 16px;">
<tr>
<td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;background-color:#fffcf7;border:1px solid #e5dfd4;border-radius:12px;overflow:hidden;box-shadow:0 8px 28px rgba(44,40,37,0.06);">
<tr>
<td style="padding:0;">
${headerBlock}
</td>
</tr>
<tr>
<td style="padding:10px 32px 28px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#2c2825;">
<h1 style="margin:0 0 14px 0;font-size:23px;font-weight:600;line-height:1.35;color:#1a1715;">
Good to see you, ${greetingHtml}
</h1>
<p style="margin:0 0 18px 0;font-size:16px;line-height:1.6;color:#4a423c;">
Thanks for stopping by. Order something warming from the kitchen, or grab a fresh juice — we’d love to cook for you.
</p>
<table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin:8px 0 22px 0;">
<tr>
<td style="border-radius:10px;background-color:#ca8a04;">
<a href="${safeMenuAttr}" style="display:inline-block;padding:14px 26px;font-size:15px;font-weight:600;color:#fffdfc;text-decoration:none;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
Browse the menu
</a>
</td>
</tr>
</table>
<p style="margin:0;font-size:14px;line-height:1.55;color:#6b625c;">
Prefer typing the link? <span style="color:#57534e;font-size:13px;word-break:break-all;">${safeMenu}</span>
</p>
</td>
</tr>
<tr>
<td style="padding:18px 32px 26px 32px;border-top:1px solid #efe8df;background-color:#faf7f2;">
<p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:12px;line-height:1.55;color:#91887f;">
With love from the Believe Chops crew.
</p>
</td>
</tr>
</table>
<p style="margin:24px 0 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:11px;line-height:1.5;color:#9a928a;text-align:center;max-width:480px;">
You received this because you just signed in.
</p>
</td>
</tr>
</table>
</body>
</html>`;

  return { html, text };
}

function buildMenuReminderEmailBodies(
  greetingHtml: string,
  plainFirstName: string,
  menuUrl: string,
  embedLogo: boolean,
): { html: string; text: string } {
  const safeMenu = escapeHtml(menuUrl);
  const safeMenuAttr = menuUrl.replace(/"/g, "&quot;");
  const headerBlock = brandedHeaderHtml(embedLogo);

  const text = [
    `Believe Chops`,
    ``,
    `Hi ${plainFirstName},`,
    ``,
    `Still deciding? Our menu is full of comforting plates and cold juices worth a look.`,
    ``,
    menuUrl,
    ``,
    `— Believe Chops`,
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Hungry yet?</title>
</head>
<body style="margin:0;padding:0;background-color:#f0ebe3;">
<span style="display:none!important;visibility:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#f0ebe3;max-height:0;max-width:0;opacity:0;overflow:hidden;">
Homestyle food & fresh juices — tap to browse the menu.
</span>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f0ebe3;padding:40px 16px;">
<tr>
<td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;background-color:#fffcf7;border:1px solid #e5dfd4;border-radius:12px;overflow:hidden;box-shadow:0 8px 28px rgba(44,40,37,0.06);">
<tr>
<td style="padding:0;">
${headerBlock}
</td>
</tr>
<tr>
<td style="padding:10px 32px 28px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#2c2825;">
<h1 style="margin:0 0 14px 0;font-size:22px;font-weight:600;line-height:1.35;color:#1a1715;">
Still thinking what to eat, ${greetingHtml}?
</h1>
<p style="margin:0 0 18px 0;font-size:16px;line-height:1.6;color:#4a423c;">
There’s a lot to choose from — hearty mains, small bites, and juices mixed fresh. Have a scroll when you’re ready.
</p>
<table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin:8px 0 22px 0;">
<tr>
<td style="border-radius:10px;background-color:#b45309;">
<a href="${safeMenuAttr}" style="display:inline-block;padding:14px 26px;font-size:15px;font-weight:600;color:#fffdfc;text-decoration:none;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
See the menu
</a>
</td>
</tr>
</table>
<p style="margin:0;font-size:14px;line-height:1.55;color:#6b625c;">
<span style="color:#57534e;font-size:13px;word-break:break-all;">${safeMenu}</span>
</p>
</td>
</tr>
<tr>
<td style="padding:18px 32px 26px 32px;border-top:1px solid #efe8df;background-color:#faf7f2;">
<p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:12px;line-height:1.55;color:#91887f;">
Believe Chops — flavour worth coming back for.
</p>
</td>
</tr>
</table>
<p style="margin:24px 0 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:11px;line-height:1.5;color:#9a928a;text-align:center;max-width:480px;">
You’re receiving this friendly nudge because you recently signed in.
</p>
</td>
</tr>
</table>
</body>
</html>`;

  return { html, text };
}

/** Scheduled reminder — logo + menu link (SMTP optional in development). */
export async function sendMenuReminderEmail(to: string, displayName: string | null | undefined): Promise<void> {
  if (!isEmailTransportConfigured()) {
    if (env.NODE_ENV === "development") {
      console.warn(`[dev] Menu reminder email (SMTP not configured) → ${to}`);
      return;
    }
    console.warn("Menu reminder email skipped: SMTP not configured.");
    return;
  }

  const menuUrl = resolveMenuUrl();
  const greetingHtml = firstNameOrThere(displayName);
  const plainFirst = displayName?.trim().split(/\s+/)[0] ?? "there";
  const logoPath = resolveBrandingLogoPath();
  const { html, text } = buildMenuReminderEmailBodies(greetingHtml, plainFirst, menuUrl, Boolean(logoPath));

  const attachments: Mail.Attachment[] | undefined = logoPath
    ? [{ filename: "logo.jpeg", path: logoPath, cid: LOGO_CID }]
    : undefined;

  await sendMailReliable({
    from: env.SMTP_FROM,
    to,
    subject: "Hungry yet? Browse our menu — Believe Chops",
    text,
    html,
    attachments,
  });
}

/** Welcome email after sign-in (does not throw when SMTP disabled in development). */
export async function sendWelcomeEmail(to: string, displayName: string | null | undefined): Promise<void> {
  if (!isEmailTransportConfigured()) {
    if (env.NODE_ENV === "development") {
      console.warn(`[dev] Welcome email (SMTP not configured) → ${to}`);
      return;
    }
    console.warn("Welcome email skipped: SMTP not configured.");
    return;
  }

  const menuUrl = resolveMenuUrl();
  const greetingHtml = firstNameOrThere(displayName);
  const logoPath = resolveBrandingLogoPath();
  const { html, text } = buildWelcomeEmailBodies(greetingHtml, menuUrl, Boolean(logoPath));

  const attachments: Mail.Attachment[] | undefined = logoPath
    ? [{ filename: "logo.jpeg", path: logoPath, cid: LOGO_CID }]
    : undefined;

  await sendMailReliable({
    from: env.SMTP_FROM,
    to,
    subject: "Welcome to Believe Chops",
    text,
    html,
    attachments,
  });
}

export async function sendOtpEmail(to: string, code: string): Promise<void> {
  if (!isEmailTransportConfigured()) {
    if (env.NODE_ENV === "development") {
      console.warn(`[dev] OTP email (SMTP not configured) → ${to}: ${code}`);
      return;
    }
    throw new AppError(
      "Email delivery is not configured. Set NOTIFICATION_EMAIL_PROVIDER=smtp and SMTP_* variables.",
      503,
    );
  }

  const ttl = env.OTP_TTL_MINUTES;
  const logoPath = resolveBrandingLogoPath();
  const { html, text } = buildOtpEmailBodies(code, ttl, Boolean(logoPath));

  const attachments: Mail.Attachment[] | undefined = logoPath
    ? [{ filename: "logo.jpeg", path: logoPath, cid: LOGO_CID }]
    : undefined;

  await sendMailReliable({
    from: env.SMTP_FROM,
    to,
    subject: "Your sign-in code — BelieveChops",
    text,
    html,
    attachments,
  });
}
