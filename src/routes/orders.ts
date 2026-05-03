import { Router } from "express";
import { z } from "zod";
import { deliveryPayloadSchema, refineDeliveryHasContent } from "../lib/deliveryValidation.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import * as orderService from "../services/orderService.js";

export const ordersRouter = Router();

const createOrderSchema = z
  .object({
    totalAmount: z.number().int().positive(),
    currency: z.string().min(1).optional(),
    items: z.unknown().optional(),
    delivery: deliveryPayloadSchema,
  })
  .superRefine((val, ctx) => {
    refineDeliveryHasContent(val.delivery, ctx, ["delivery"]);
  });

ordersRouter.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = createOrderSchema.parse(req.body);
    const order = await orderService.createOrder({
      ...body,
      userId: req.userId,
    });
    res.status(201).json({ order });
  }),
);

ordersRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = z.string().min(1).parse(req.params.id);
    const order = await orderService.getOrderById(id);
    res.json({ order });
  }),
);
