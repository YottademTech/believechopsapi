import { Router } from "express";
import rateLimit from "express-rate-limit";
import { addressesRouter } from "./addresses.js";
import { authRouter } from "./auth.js";
import { cartRouter } from "./cart.js";
import { healthRouter } from "./health.js";
import { ordersRouter } from "./orders.js";
import { paymentsRouter } from "./payments.js";
import { remindersRouter } from "./reminders.js";

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

export const apiRouter = Router();

apiRouter.use(apiLimiter);

apiRouter.use(healthRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/addresses", addressesRouter);
apiRouter.use("/cart", cartRouter);
apiRouter.use("/orders", ordersRouter);
apiRouter.use("/payments", paymentsRouter);
apiRouter.use("/reminders", remindersRouter);
