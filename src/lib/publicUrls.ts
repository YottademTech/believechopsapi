import { env } from "../config/env.js";
import { LIVE_STOREFRONT_ORIGIN } from "../config/liveStorefront.js";

/** Menu page URL for welcome / scheduled reminder emails. */
export function resolveMenuUrl(): string {
  const explicit = env.FRONTEND_PUBLIC_URL?.replace(/\/$/, "");
  if (explicit) return `${explicit}/menu`;

  if (env.NODE_ENV === "production" || process.env.VERCEL === "1") {
    return `${LIVE_STOREFRONT_ORIGIN}/menu`;
  }

  const first = env.CORS_ORIGINS?.split(",")[0]?.trim().replace(/\/+$/, "");
  if (first) return `${first}/menu`;

  return "http://localhost:5173/menu";
}
