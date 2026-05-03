import { Router } from "express";
import { z } from "zod";
import * as menuReminderDispatch from "../services/menuReminderDispatch.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import * as reminderService from "../services/reminderService.js";

export const remindersRouter = Router();

/** SchedulingEngine `NotifyJob` POSTs `CustomData` (camelCase or PascalCase). `uniqueId` = user id. */
const schedulerDispatchSchema = z
  .object({
    callbackUrl: z.string().url().optional(),
    CallbackUrl: z.string().url().optional(),
    uniqueId: z.string().min(1).optional(),
    UniqueId: z.string().min(1).optional(),
  })
  .transform((v) => {
    const callbackUrl = v.callbackUrl ?? v.CallbackUrl;
    const uniqueId = v.uniqueId ?? v.UniqueId;
    if (!callbackUrl?.trim() || !uniqueId?.trim()) {
      throw new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          message: "callbackUrl and uniqueId are required",
          path: ["body"],
        },
      ]);
    }
    return { callbackUrl, uniqueId };
  });

const scheduleSchema = z.object({
  userId: z.string().optional(),
  channel: z.enum(["email", "sms", "push"]),
  sendAt: z.coerce.date(),
  payload: z.unknown().optional(),
});

/**
 * Hubtel SchedulingEngine POSTs here (no bearer auth). Auth: `?secret=` must match `SCHEDULER_DISPATCH_SECRET`
 * (embedded in `callbackUrl` when the job was registered). Body echoes `customData`: `uniqueId` = user id.
 */
remindersRouter.post(
  "/dispatch",
  asyncHandler(async (req, res) => {
    const body = schedulerDispatchSchema.parse(req.body);
    const secret =
      typeof req.query.secret === "string"
        ? req.query.secret
        : typeof req.query.Secret === "string"
          ? req.query.Secret
          : undefined;
    await menuReminderDispatch.dispatchMenuReminder({
      userId: body.uniqueId,
      querySecret: secret,
    });
    res.status(200).json({ ok: true });
  }),
);

remindersRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = scheduleSchema.parse(req.body);
    const reminder = await reminderService.scheduleReminder(body);
    res.status(201).json({ reminder });
  }),
);

/** Worker/cron can poll this — replace with a real queue when you scale. */
remindersRouter.get(
  "/due",
  asyncHandler(async (_req, res) => {
    const reminders = await reminderService.listPendingReminders();
    res.json({ reminders });
  }),
);
