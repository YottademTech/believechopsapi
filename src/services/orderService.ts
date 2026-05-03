import type { Order } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";

export type CreateOrderInput = {
  userId?: string;
  totalAmount: number;
  currency?: string;
  items?: unknown;
  delivery?: unknown;
};

export async function createOrder(input: CreateOrderInput): Promise<Order> {
  if (input.totalAmount <= 0) {
    throw new AppError("totalAmount must be positive", 400);
  }

  if (input.userId) {
    const user = await prisma.user.findUnique({ where: { id: input.userId } });
    if (!user) throw new AppError("User not found", 404);
  }

  return prisma.order.create({
    data: {
      userId: input.userId,
      totalAmount: input.totalAmount,
      currency: input.currency ?? "GHS",
      items: input.items === undefined ? undefined : (input.items as object),
      delivery: input.delivery === undefined ? undefined : (input.delivery as object),
    },
  });
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
