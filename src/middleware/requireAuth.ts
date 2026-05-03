import type { RequestHandler } from "express";
import { verifyAccessToken } from "../lib/jwt.js";
import { AppError } from "../utils/AppError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const requireAuth: RequestHandler = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization;
  const match = typeof header === "string" ? /^Bearer\s+(.+)$/i.exec(header) : null;
  const token = match?.[1]?.trim();
  if (!token) {
    throw new AppError("Unauthorized", 401);
  }
  const { sub } = await verifyAccessToken(token);
  req.userId = sub;
  next();
});
