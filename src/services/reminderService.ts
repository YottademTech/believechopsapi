import { prisma } from "../lib/prisma.js";

export type ScheduleReminderInput = {
  userId?: string;
  channel: string;
  sendAt: Date;
  payload?: unknown;
};

export async function scheduleReminder(input: ScheduleReminderInput) {
  return prisma.reminder.create({
    data: {
      userId: input.userId,
      channel: input.channel,
      sendAt: input.sendAt,
      payload: input.payload === undefined ? undefined : (input.payload as object),
    },
  });
}

export async function listPendingReminders(now = new Date()) {
  return prisma.reminder.findMany({
    where: {
      sentAt: null,
      sendAt: { lte: now },
    },
    orderBy: { sendAt: "asc" },
    take: 50,
  });
}
