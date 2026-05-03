import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";

export type CartLineInput = {
  itemId: string;
  quantity: number;
};

export async function getCartLines(userId: string): Promise<CartLineInput[]> {
  const cart = await prisma.cart.findUnique({
    where: { userId },
    include: { lines: true },
  });
  if (!cart) return [];
  return cart.lines.map((l) => ({
    itemId: l.menuItemId,
    quantity: l.quantity,
  }));
}

export async function replaceCart(userId: string, lines: CartLineInput[]): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError("User not found", 404);

  await prisma.$transaction(async (tx) => {
    const cart = await tx.cart.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
    await tx.cartLine.deleteMany({ where: { cartId: cart.id } });
    if (lines.length === 0) return;
    await tx.cartLine.createMany({
      data: lines.map((l) => ({
        cartId: cart.id,
        menuItemId: l.itemId,
        quantity: l.quantity,
      })),
    });
  });
}
