import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import * as cartService from "../services/cartService.js";

export const cartRouter = Router();

const lineSchema = z.object({
  itemId: z.string().min(1).max(128),
  quantity: z.number().int().min(1).max(999),
});

const putCartSchema = z.object({
  lines: z.array(lineSchema).max(100),
});

cartRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const lines = await cartService.getCartLines(req.userId!);
    res.json({ lines });
  }),
);

cartRouter.put(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = putCartSchema.parse(req.body);
    await cartService.replaceCart(req.userId!, body.lines);
    res.json({ ok: true, lines: body.lines });
  }),
);
