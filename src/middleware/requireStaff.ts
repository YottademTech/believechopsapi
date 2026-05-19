import type { RequestHandler } from "express";
import { verifyAccessToken } from "../lib/jwt.js";
import { prisma } from "../lib/prisma.js";
import { isStaffRole } from "../lib/adminRoles.js";
import { AppError } from "../utils/AppError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const requireStaff: RequestHandler = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization;
  const match = typeof header === "string" ? /^Bearer\s+(.+)$/i.exec(header) : null;
  const token = match?.[1]?.trim();
  if (!token) {
    throw new AppError("Unauthorized", 401);
  }
  const { sub } = await verifyAccessToken(token);
  const user = await prisma.user.findUnique({ where: { id: sub } });
  if (!user || !isStaffRole(user.staffRole)) {
    throw new AppError("Forbidden", 403);
  }
  req.userId = sub;
  req.staffUser = user;
  next();
});
