import { Router } from "express";
import { z } from "zod";
import { OrderStatus } from "@prisma/client";
import {
  chargeGhanaMobileMoney,
  initializeTransaction,
  verifyTransaction,
} from "../lib/paystack.js";
import { e164GhanaToLocal10, inferGhanaMomoProvider } from "../lib/ghanaMomo.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../utils/AppError.js";
import * as orderService from "../services/orderService.js";
import * as paymentService from "../services/paymentService.js";
import * as userService from "../services/userService.js";

export const paymentsRouter = Router();

const initializeSchema = z.object({
  orderId: z.string().min(1),
  email: z.string().email(),
  callbackUrl: z.string().url().optional(),
});

const momoChargeSchema = z.object({
  orderId: z.string().min(1),
  provider: z.enum(["mtn", "vod", "atl"]).optional(),
});

paymentsRouter.post(
  "/momo/charge",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = momoChargeSchema.parse(req.body);
    const userId = req.userId!;

    await paymentService.deleteStalePendingPaymentsForOrder(body.orderId, 12 * 60 * 1000);

    const order = await orderService.requireOrderForUser(body.orderId, userId);
    if (order.status !== OrderStatus.PENDING) {
      throw new AppError("Order is not payable in its current state", 409);
    }

    const user = await userService.getUserById(userId);
    if (!user) throw new AppError("User not found", 404);
    if (!user.phone || !user.phoneVerifiedAt) {
      throw new AppError(
        "Verify your phone number on your profile before paying with Mobile Money",
        403,
      );
    }

    const pending = await paymentService.findPendingPaymentForOrder(order.id);
    if (pending) {
      throw new AppError(
        "A Mobile Money payment was already started for this order. Approve the prompt on your phone, or wait a few minutes and try again.",
        409,
      );
    }

    const local10 = e164GhanaToLocal10(user.phone);
    if (!local10) {
      throw new AppError(
        "Verified phone must be a Ghana mobile number (+233…) for MoMo checkout",
        400,
      );
    }

    const provider = body.provider ?? inferGhanaMomoProvider(local10);
    if (!provider) {
      throw new AppError(
        "Could not detect network from your phone number. Retry with provider set to mtn, vod, or atl.",
        400,
      );
    }

    const paystackEmail =
      user.email?.trim() && user.email.includes("@")
        ? user.email.trim().toLowerCase()
        : `${user.id.replace(/[^a-z0-9]/gi, "")}@guest.believechops.order`;

    let charge;
    try {
      charge = await chargeGhanaMobileMoney({
        email: paystackEmail,
        amountPesewas: order.totalAmount,
        metadata: { order_id: order.id },
        mobileMoney: { phone: local10, provider },
      });
    } catch (e) {
      throw new AppError(e instanceof Error ? e.message : "MoMo charge failed", 400);
    }

    await paymentService.initializePaymentRecord({
      orderId: order.id,
      reference: charge.reference,
      amountKobo: order.totalAmount,
      currency: order.currency,
    });

    res.status(201).json({
      reference: charge.reference,
      status: charge.status,
      displayText: charge.displayText,
      payOffline: charge.status.toLowerCase() === "pay_offline",
      provider,
    });
  }),
);

paymentsRouter.post(
  "/initialize",
  asyncHandler(async (req, res) => {
    const body = initializeSchema.parse(req.body);
    const order = await orderService.getOrderById(body.orderId);

    if (order.status !== OrderStatus.PENDING) {
      throw new AppError("Order is not payable in its current state", 409);
    }

    const init = await initializeTransaction({
      email: body.email,
      amountKobo: order.totalAmount,
      callbackUrl: body.callbackUrl,
      metadata: { order_id: order.id },
    });

    await paymentService.initializePaymentRecord({
      orderId: order.id,
      reference: init.reference,
      amountKobo: order.totalAmount,
      currency: order.currency,
    });

    res.status(201).json({
      authorizationUrl: init.authorizationUrl,
      accessCode: init.accessCode,
      reference: init.reference,
    });
  }),
);

paymentsRouter.get(
  "/verify/:reference",
  asyncHandler(async (req, res) => {
    const reference = z.string().min(1).parse(req.params.reference);
    const remote = await verifyTransaction(reference);

    if (remote.status.toLowerCase() !== "success") {
      throw new AppError(`Payment not successful: ${remote.status}`, 400);
    }

    await paymentService.applyVerifiedPayment({
      reference: remote.reference,
      amountKobo: remote.amountKobo,
      paidAt: remote.paidAt,
    });

    const payment = await paymentService.getPaymentByReference(reference);
    res.json({ payment });
  }),
);
