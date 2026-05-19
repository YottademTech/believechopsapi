import type { StaffRole, User } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { normalizeE164Phone } from "../lib/phone.js";
import { AppError } from "../utils/AppError.js";

export type RegisterInput = {
  email?: string;
  phone?: string;
  name?: string;
};

export async function registerUser(input: RegisterInput): Promise<User> {
  if (!input.email?.trim() && !input.phone?.trim()) {
    throw new AppError("Either email or phone is required", 400);
  }

  const email = input.email?.trim() ? input.email.trim().toLowerCase() : undefined;
  const phone = input.phone?.trim() ? normalizeE164Phone(input.phone) : undefined;

  try {
    return await prisma.user.create({
      data: {
        email,
        phone,
        name: input.name?.trim(),
      },
    });
  } catch (e: unknown) {
    const code = typeof e === "object" && e !== null && "code" in e ? String((e as { code: string }).code) : "";
    if (code === "P2002") {
      throw new AppError("Email or phone already registered", 409);
    }
    throw e;
  }
}

export async function getUserById(id: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { id } });
}

export async function updateUserProfile(
  userId: string,
  input: { name?: string },
): Promise<User> {
  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) {
    throw new AppError("User not found", 404);
  }

  const data: { name?: string | null } = {};
  if (input.name !== undefined) {
    const trimmed = input.name.trim();
    data.name = trimmed.length ? trimmed : null;
  }

  if (Object.keys(data).length === 0) {
    return existing;
  }

  return prisma.user.update({
    where: { id: userId },
    data,
  });
}

const staffUserListSelect = {
  id: true,
  email: true,
  phone: true,
  name: true,
  staffRole: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function listUsersForStaff(params: {
  take: number;
  cursor?: string;
  search?: string;
  staffRole?: StaffRole | "customer" | "all";
}) {
  const where: Record<string, unknown> = {};

  if (params.staffRole === "customer") {
    where.staffRole = null;
  } else if (params.staffRole && params.staffRole !== "all") {
    where.staffRole = params.staffRole as StaffRole;
  }

  if (params.search?.trim()) {
    const q = params.search.trim();
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { phone: { contains: q, mode: "insensitive" } },
    ];
  }

  const rows = await prisma.user.findMany({
    take: params.take + 1,
    orderBy: { createdAt: "desc" },
    where,
    ...(params.cursor ? { skip: 1, cursor: { id: params.cursor } } : {}),
    select: staffUserListSelect,
  });
  return rows;
}

export async function setUserStaffRole(targetUserId: string, staffRole: StaffRole | null): Promise<User> {
  const existing = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!existing) {
    throw new AppError("User not found", 404);
  }
  return prisma.user.update({
    where: { id: targetUserId },
    data: { staffRole },
  });
}
