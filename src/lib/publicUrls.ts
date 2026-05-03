import { env } from "../config/env.js";

/** Menu page URL for welcome / marketing emails. */
export function resolveMenuUrl(): string {
  const explicit = env.FRONTEND_PUBLIC_URL?.replace(/\/$/, "");
  if (explicit) return `${explicit}/menu`;
  const first = env.CORS_ORIGINS?.split(",")[0]?.trim().replace(/\/$/, "");
  if (first) return `${first}/menu`;
  return "http://localhost:5173/menu";
}
