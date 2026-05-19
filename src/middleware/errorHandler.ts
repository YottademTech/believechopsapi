import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/AppError.js";

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: "Validation failed",
      details: err.flatten(),
    });
    return;
  }
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      ...(err.retryAfterSeconds != null ? { retryAfterSeconds: err.retryAfterSeconds } : {}),
    });
    return;
  }

  console.error(err);
  const message =
    process.env.NODE_ENV === "production" ? "Internal server error" : (err as Error).message;
  res.status(500).json({ error: message });
};
