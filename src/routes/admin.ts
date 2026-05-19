import { Router } from "express";
import { OrderStatus, PaymentStatus, StaffRole } from "@prisma/client";
import { z } from "zod";
import { requireStaff } from "../middleware/requireStaff.js";
import { requireSuperAdmin } from "../middleware/requireSuperAdmin.js";
import * as adminStatsService from "../services/adminStatsService.js";
import * as orderService from "../services/orderService.js";
import * as paymentService from "../services/paymentService.js";
import * as userService from "../services/userService.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const adminRouter = Router();

const pagination = z.object({
  take: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1).optional(),
});

adminRouter.use(requireStaff);

adminRouter.get(
  "/stats",
  asyncHandler(async (_req, res) => {
    const stats = await adminStatsService.getAdminStats();
    res.json({ stats });
  }),
);

const ordersFilter = z.object({
  status: z.nativeEnum(OrderStatus).optional(),
  search: z.string().max(100).optional(),
});

adminRouter.get(
  "/orders",
  asyncHandler(async (req, res) => {
    const q = pagination.parse(req.query);
    const f = ordersFilter.parse(req.query);
    const rows = await orderService.listOrdersForStaff({ take: q.take, cursor: q.cursor, ...f });
    const hasMore = rows.length > q.take;
    const orders = hasMore ? rows.slice(0, q.take) : rows;
    const nextCursor = hasMore ? orders[orders.length - 1]?.id : undefined;
    res.json({ orders, nextCursor });
  }),
);

const patchOrderSchema = z.object({
  status: z.nativeEnum(OrderStatus),
});

adminRouter.patch(
  "/orders/:id",
  asyncHandler(async (req, res) => {
    const id = z.string().min(1).parse(req.params.id);
    const body = patchOrderSchema.parse(req.body);
    const order = await orderService.updateOrderStatus(id, body.status);
    res.json({ order });
  }),
);

const paymentsFilter = z.object({
  status: z.nativeEnum(PaymentStatus).optional(),
  search: z.string().max(100).optional(),
});

adminRouter.get(
  "/payments",
  asyncHandler(async (req, res) => {
    const q = pagination.parse(req.query);
    const f = paymentsFilter.parse(req.query);
    const rows = await paymentService.listPaymentsForStaff({ take: q.take, cursor: q.cursor, ...f });
    const hasMore = rows.length > q.take;
    const payments = hasMore ? rows.slice(0, q.take) : rows;
    const nextCursor = hasMore ? payments[payments.length - 1]?.id : undefined;
    res.json({ payments, nextCursor });
  }),
);

const usersFilter = z.object({
  search: z.string().max(100).optional(),
  staffRole: z.enum(["ADMIN", "SUPERADMIN", "customer", "all"]).optional(),
});

adminRouter.get(
  "/users",
  asyncHandler(async (req, res) => {
    const q = pagination.parse(req.query);
    const f = usersFilter.parse(req.query);
    const rows = await userService.listUsersForStaff({ take: q.take, cursor: q.cursor, ...f });
    const hasMore = rows.length > q.take;
    const users = hasMore ? rows.slice(0, q.take) : rows;
    const nextCursor = hasMore ? users[users.length - 1]?.id : undefined;
    res.json({ users, nextCursor });
  }),
);

const patchStaffRoleSchema = z.object({
  staffRole: z.nativeEnum(StaffRole).nullable(),
});

adminRouter.patch(
  "/users/:id/staff-role",
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const id = z.string().min(1).parse(req.params.id);
    const body = patchStaffRoleSchema.parse(req.body);
    const user = await userService.setUserStaffRole(id, body.staffRole);
    res.json({ user });
  }),
);
