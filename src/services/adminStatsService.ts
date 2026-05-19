import { PaymentStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

const MS_7D = 7 * 24 * 60 * 60 * 1000;

export type AdminStats = {
  orderCountByStatus: { status: string; count: number }[];
  revenueSuccessLast7dSmallestUnit: number;
  ordersCreatedLast7d: number;
  payments: {
    /** Payment rows created in the last 7 days (all statuses). */
    createdLast7d: number;
    /** Grouped by status for that window — counts and total amounts (smallest currency unit). */
    byStatusLast7d: { status: string; count: number; volumeSmallestUnit: number }[];
    /** Successful charges in the window (same period as revenue sum). */
    successCountLast7d: number;
    /** Sum of amounts still `PENDING` for attempts created in the window (in-flight MoMo, etc.). */
    pendingExposureLast7dSmallestUnit: number;
  };
};

export async function getAdminStats(): Promise<AdminStats> {
  const since = new Date(Date.now() - MS_7D);

  const [orderCountByStatus, revenueAgg, ordersCreatedLast7d, paymentByStatus, paymentsCreatedLast7d] =
    await Promise.all([
      prisma.order.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
      prisma.payment.aggregate({
        where: {
          status: PaymentStatus.SUCCESS,
          paidAt: { gte: since },
        },
        _sum: { amount: true },
      }),
      prisma.order.count({
        where: { createdAt: { gte: since } },
      }),
      prisma.payment.groupBy({
        by: ["status"],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
        _sum: { amount: true },
      }),
      prisma.payment.count({
        where: { createdAt: { gte: since } },
      }),
    ]);

  const byStatusLast7d = paymentByStatus.map((r) => ({
    status: r.status,
    count: r._count._all,
    volumeSmallestUnit: r._sum.amount ?? 0,
  }));

  const successRow = paymentByStatus.find((r) => r.status === PaymentStatus.SUCCESS);
  const successCountLast7d = successRow?._count._all ?? 0;

  const pendingRow = paymentByStatus.find((r) => r.status === PaymentStatus.PENDING);
  const pendingExposureLast7dSmallestUnit = pendingRow?._sum.amount ?? 0;

  return {
    orderCountByStatus: orderCountByStatus.map((r) => ({
      status: r.status,
      count: r._count._all,
    })),
    revenueSuccessLast7dSmallestUnit: revenueAgg._sum.amount ?? 0,
    ordersCreatedLast7d,
    payments: {
      createdLast7d: paymentsCreatedLast7d,
      byStatusLast7d,
      successCountLast7d,
      pendingExposureLast7dSmallestUnit,
    },
  };
}
