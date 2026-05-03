import { Router } from "express";
import type { Request, Response } from "express";
import { verifyPaystackWebhookSignature } from "../lib/paystack.js";
import * as paymentService from "../services/paymentService.js";

export const paystackWebhookRouter = Router();

type PaystackWebhookPayload = {
  event: string;
  data?: unknown;
};

/** Normalizes `charge.success` `data` (shape varies slightly across API versions). */
function parseChargeSuccessData(data: unknown): {
  reference?: string;
  amountKobo: number;
  paidAt: Date | null;
} {
  if (!data || typeof data !== "object") {
    return { amountKobo: 0, paidAt: null };
  }
  const d = data as Record<string, unknown>;

  let reference: string | undefined;
  if (typeof d.reference === "string" && d.reference.trim()) {
    reference = d.reference.trim();
  } else if (d.transaction && typeof d.transaction === "object") {
    const tr = (d.transaction as Record<string, unknown>).reference;
    if (typeof tr === "string" && tr.trim()) reference = tr.trim();
  }

  let amountKobo = 0;
  const rawAmount = d.amount;
  if (typeof rawAmount === "number" && Number.isFinite(rawAmount)) {
    amountKobo = rawAmount;
  } else if (typeof rawAmount === "string") {
    const n = parseInt(rawAmount, 10);
    if (!Number.isNaN(n)) amountKobo = n;
  }

  let paidAt: Date | null = null;
  if (typeof d.paid_at === "string" && d.paid_at) {
    const t = new Date(d.paid_at);
    if (!Number.isNaN(t.getTime())) paidAt = t;
  }

  return { reference, amountKobo, paidAt };
}

paystackWebhookRouter.post("/", async (req: Request, res: Response) => {
  const raw = req.body as Buffer;
  const signature = req.headers["x-paystack-signature"];
  const sig = Array.isArray(signature) ? signature[0] : signature;

  if (!verifyPaystackWebhookSignature(Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw)), sig)) {
    res.status(400).json({ error: "Invalid signature" });
    return;
  }

  let payload: PaystackWebhookPayload;
  try {
    payload = JSON.parse(Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw));
  } catch {
    res.status(400).json({ error: "Invalid JSON" });
    return;
  }

  if (payload.event === "charge.success") {
    const { reference, amountKobo, paidAt } = parseChargeSuccessData(payload.data);
    if (reference) {
      try {
        await paymentService.applyVerifiedPayment({
          reference,
          amountKobo,
          paidAt: paidAt ?? new Date(),
          rawPayload: payload,
        });
      } catch (err) {
        console.error("Webhook payment apply failed:", err);
        res.status(500).json({ error: "Processing failed" });
        return;
      }
    } else {
      console.warn("Paystack charge.success webhook missing reference", {
        event: payload.event,
      });
    }
  }

  res.sendStatus(200);
});
