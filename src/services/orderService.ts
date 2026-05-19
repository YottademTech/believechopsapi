import type { Order } from "@prisma/client";
import { OrderStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { emitToStaff } from "../realtime/staffEmit.js";
import { AppError } from "../utils/AppError.js";

export type CreateOrderInput = {
  userId?: string;
  totalAmount: number;
  currency?: string;
  items?: unknown;
  delivery?: unknown;
};

export async function createOrder(input: CreateOrderInput): Promise<Order> {
  if (input.totalAmount < 0) {
    throw new AppError("totalAmount must be zero or positive", 400);
  }

  if (input.userId) {
    const user = await prisma.user.findUnique({ where: { id: input.userId } });
    if (!user) throw new AppError("User not found", 404);
  }

  const order = await prisma.order.create({
    data: {
      userId: input.userId,
      totalAmount: input.totalAmount,
      currency: input.currency ?? "GHS",
      items: input.items === undefined ? undefined : (input.items as object),
      delivery: input.delivery === undefined ? undefined : (input.delivery as object),
    },
  });
  emitToStaff("order:created", { order });
  return order;
}

export async function getOrderById(id: string): Promise<Order> {
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) throw new AppError("Order not found", 404);
  return order;
}

export async function requireOrderForUser(orderId: string, userId: string): Promise<Order> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, userId },
  });
  if (!order) throw new AppError("Order not found", 404);
  return order;
}

const orderStaffInclude = {
  user: { select: { id: true, email: true, phone: true, name: true } },
} as const;

export async function listOrdersForStaff(params: {
  take: number;
  cursor?: string;
  status?: OrderStatus;
  search?: string;
}) {
  const where: Record<string, unknown> = {};
  if (params.status) {
    where.status = params.status;
  }
  if (params.search?.trim()) {
    const q = params.search.trim();
    where.user = {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { phone: { contains: q, mode: "insensitive" } },
      ],
    };
  }
  return prisma.order.findMany({
    take: params.take + 1,
    orderBy: { createdAt: "desc" },
    where,
    ...(params.cursor ? { skip: 1, cursor: { id: params.cursor } } : {}),
    include: orderStaffInclude,
  });
}

export async function updateOrderStatus(orderId: string, status: OrderStatus): Promise<Order> {
  await getOrderById(orderId);
  const order = await prisma.order.update({
    where: { id: orderId },
    data: { status },
    include: orderStaffInclude,
  });
  emitToStaff("order:updated", { order });
  return order;
}
