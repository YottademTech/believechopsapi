import type { Payment } from "@prisma/client";
import { OrderStatus, PaymentStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";

export async function findPendingPaymentForOrder(orderId: string): Promise<Payment | null> {
  return prisma.payment.findFirst({
    where: { orderId, status: PaymentStatus.PENDING },
    orderBy: { createdAt: "desc" },
  });
}

/** Drops abandoned MoMo attempts so the customer can start a fresh prompt. */
export async function deleteStalePendingPaymentsForOrder(
  orderId: string,
  maxAgeMs: number,
): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeMs);
  const r = await prisma.payment.deleteMany({
    where: {
      orderId,
      status: PaymentStatus.PENDING,
      createdAt: { lt: cutoff },
    },
  });
  return r.count;
}

export async function initializePaymentRecord(params: {
  orderId: string;
  reference: string;
  amountKobo: number;
  currency: string;
}): Promise<Payment> {
  return prisma.payment.create({
    data: {
      orderId: params.orderId,
      paystackReference: params.reference,
      amount: params.amountKobo,
      currency: params.currency,
      status: PaymentStatus.PENDING,
    },
  });
}

export async function applyVerifiedPayment(params: {
  reference: string;
  amountKobo: number;
  paidAt: Date | null;
  rawPayload?: unknown;
}): Promise<void> {
  const payment = await prisma.payment.findUnique({
    where: { paystackReference: params.reference },
    include: { order: true },
  });

  if (!payment) {
    console.warn(`Payment row missing for reference ${params.reference}`);
    return;
  }

  if (payment.status === PaymentStatus.SUCCESS) {
    return;
  }

  if (params.amountKobo > 0 && params.amountKobo !== payment.amount) {
    console.warn(`Amount mismatch for ${params.reference}: expected ${payment.amount}, got ${params.amountKobo}`);
    throw new AppError("Payment amount mismatch", 400);
  }

  await prisma.$transaction([
    prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.SUCCESS,
        paidAt: params.paidAt ?? new Date(),
        rawWebhookPayload:
          params.rawPayload === undefined ? undefined : (params.rawPayload as object),
      },
    }),
    prisma.order.update({
      where: { id: payment.orderId },
      data: { status: OrderStatus.PAID },
    }),
  ]);
}

export async function getPaymentByReference(reference: string) {
  return prisma.payment.findUnique({
    where: { paystackReference: reference },
    include: { order: true },
  });
}
