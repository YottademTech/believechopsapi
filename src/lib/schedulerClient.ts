import { env } from "../config/env.js";

/** Quartz cron in UTC: sec min hour dom month dow year — one fire at `fireAt`. */
export function buildOneTimeQuartzCronUtc(fireAt: Date): string {
  const sec = fireAt.getUTCSeconds();
  const min = fireAt.getUTCMinutes();
  const hour = fireAt.getUTCHours();
  const dom = fireAt.getUTCDate();
  const month = fireAt.getUTCMonth() + 1;
  const year = fireAt.getUTCFullYear();
  return `${sec} ${min} ${hour} ${dom} ${month} ? ${year}`;
}

/**
 * Registers a one-time job (~5 minutes from now) with the Hubtel SchedulingEngine.
 * `callbackUrl` includes `?secret=` (`SCHEDULER_DISPATCH_SECRET`); `uniqueId` is the user id (plain).
 */
export async function scheduleMenuReminderJob(userId: string): Promise<void> {
  const engineBase = env.SCHEDULING_ENGINE_URL?.replace(/\/$/, "");
  const appPublic = env.APP_PUBLIC_URL?.replace(/\/$/, "");
  const dispatchSecret = env.SCHEDULER_DISPATCH_SECRET;

  if (!engineBase) {
    console.warn("[scheduler] SCHEDULING_ENGINE_URL not set — skip menu reminder job");
    return;
  }
  if (!appPublic) {
    console.warn("[scheduler] APP_PUBLIC_URL not set — skip menu reminder job (callback unreachable)");
    return;
  }
  if (!dispatchSecret) {
    console.warn("[scheduler] SCHEDULER_DISPATCH_SECRET not set — skip menu reminder job");
    return;
  }

  const delayMs = 5 * 60 * 1000;
  const fireAt = new Date(Date.now() + delayMs);
  const schedule = buildOneTimeQuartzCronUtc(fireAt);

  const secretParam = encodeURIComponent(dispatchSecret);
  const callbackUrl = `${appPublic}/api/reminders/dispatch?secret=${secretParam}`;
  const jobName = `menu-reminder-${userId}-${Date.now()}`;

  const body = {
    name: jobName,
    description: "One-time menu reminder (email + SMS) 5 minutes after login",
    schedule,
    startDate: new Date(Date.now() - 60_000).toISOString(),
    endDate: new Date(fireAt.getTime() + 15 * 60 * 1000).toISOString(),
    customData: {
      callbackUrl,
      uniqueId: userId,
    },
  };

  const res = await fetch(`${engineBase}/api/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error(`[scheduler] POST /api/jobs failed ${res.status}:`, text);
    return;
  }
  console.info(`[scheduler] menu reminder job registered: ${jobName}, fire ~${fireAt.toISOString()} UTC`);
}
