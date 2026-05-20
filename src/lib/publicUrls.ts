import { env } from "../config/env.js";

/** Menu page URL for welcome / scheduled reminder emails. */
export function resolveMenuUrl(): string {
  const origin = env.EMAIL_PUBLIC_SITE_ORIGIN.replace(/\/+$/, "");
  return `${origin}/menu`;
}
