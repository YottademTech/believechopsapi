import { env } from "./env.js";
import { LIVE_STOREFRONT_ORIGIN } from "./liveStorefront.js";

/** Browser `Origin` values never include a trailing slash — normalize env/list entries. */
export function normalizeBrowserOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, "");
}

function mergeLiveFrontendBrowsers(): boolean {
  return env.NODE_ENV === "production" || process.env.VERCEL === "1";
}

/**
 * Origins allowed for browser CORS and Socket.IO (storefront + optional admin portal).
 * In development (non-Vercel), storefront dev servers are typically listed in `CORS_ORIGINS` / `ADMIN_CORS_ORIGINS`.
 */
export function getCorsAllowedOrigins(): Set<string> {
  const fromEnv =
    env.CORS_ORIGINS?.split(",")
      .map((s) => normalizeBrowserOrigin(s))
      .filter(Boolean) ?? [];
  const adminOrigins =
    env.ADMIN_CORS_ORIGINS?.split(",")
      .map((s) => normalizeBrowserOrigin(s))
      .filter(Boolean) ?? [];
  if (!mergeLiveFrontendBrowsers()) {
    return new Set([...fromEnv, ...adminOrigins]);
  }
  const live = [normalizeBrowserOrigin(`${LIVE_STOREFRONT_ORIGIN}/`)];
  return new Set([...live, ...fromEnv, ...adminOrigins]);
}
