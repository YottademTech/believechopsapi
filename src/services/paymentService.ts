import type { Payment } from "@prisma/client";
import { OrderStatus, PaymentStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { emitToStaff } from "../realtime/staffEmit.js";
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
  const payment = await prisma.payment.create({
    data: {
      orderId: params.orderId,
      paystackReference: params.reference,
      amount: params.amountKobo,
      currency: params.currency,
      status: PaymentStatus.PENDING,
    },
  });
  const withOrder = await prisma.payment.findUnique({
    where: { id: payment.id },
    include: { order: true },
  });
  if (withOrder) {
    emitToStaff("payment:updated", { payment: withOrder });
  }
  return payment;
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

  const updated = await prisma.payment.findUnique({
    where: { id: payment.id },
    include: {
      order: {
        include: {
          user: { select: { id: true, email: true, phone: true, name: true } },
        },
      },
    },
  });
  if (updated) {
    emitToStaff("payment:updated", { payment: updated });
    emitToStaff("order:updated", { order: updated.order });
  }
}

export async function getPaymentByReference(reference: string) {
  return prisma.payment.findUnique({
    where: { paystackReference: reference },
    include: { order: true },
  });
}

export async function listPaymentsForStaff(params: {
  take: number;
  cursor?: string;
  status?: PaymentStatus;
  search?: string;
}) {
  const where: Record<string, unknown> = {};
  if (params.status) {
    where.status = params.status;
  }
  if (params.search?.trim()) {
    const q = params.search.trim();
    where.OR = [
      { paystackReference: { contains: q, mode: "insensitive" } },
      {
        order: {
          user: {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              { phone: { contains: q, mode: "insensitive" } },
            ],
          },
        },
      },
    ];
  }
  return prisma.payment.findMany({
    take: params.take + 1,
    orderBy: { createdAt: "desc" },
    where,
    ...(params.cursor ? { skip: 1, cursor: { id: params.cursor } } : {}),
    include: {
      order: {
        include: {
          user: { select: { id: true, email: true, phone: true, name: true } },
        },
      },
    },
  });
}
