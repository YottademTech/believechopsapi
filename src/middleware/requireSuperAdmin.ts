import type { RequestHandler } from "express";
import { isSuperAdmin } from "../lib/adminRoles.js";
import { AppError } from "../utils/AppError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/** Use after `requireStaff`. Only `SUPERADMIN` may pass (e.g. assigning `staffRole`). */
export const requireSuperAdmin: RequestHandler = asyncHandler(async (req, _res, next) => {
  if (!req.staffUser || !isSuperAdmin(req.staffUser.staffRole)) {
    throw new AppError("Forbidden", 403);
  }
  next();
});
