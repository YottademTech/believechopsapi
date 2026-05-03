import type { User } from "@prisma/client";
import { scheduleMenuReminderJob } from "../lib/schedulerClient.js";
import { sendWelcomeEmail } from "./notification/email.js";
import { sendWelcomeSms } from "./notification/sms.js";

/**
 * After successful OTP sign-in, send a welcome email and/or SMS when we have
 * a verified address. Does not block the auth response; errors are logged only.
 */
export function notifyWelcomeAfterLogin(user: User): void {
  const jobs: Promise<void>[] = [];

  if (user.email) {
    jobs.push(
      sendWelcomeEmail(user.email, user.name).catch((err) => {
        console.error("[welcome email]", err);
      }),
    );
  }
  if (user.phone) {
    jobs.push(
      sendWelcomeSms(user.phone).catch((err) => {
        console.error("[welcome sms]", err);
      }),
    );
  }

  if (jobs.length > 0) {
    void Promise.all(jobs);
  }

  void scheduleMenuReminderJob(user.id).catch((err) => {
    console.error("[scheduler] menu reminder job:", err);
  });
}
