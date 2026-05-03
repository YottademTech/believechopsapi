import cors from "cors";
import express from "express";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { env } from "./config/env.js";
import { openApiDocument } from "./docs/openapi.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { notFound } from "./middleware/notFound.js";
import { apiRouter } from "./routes/index.js";
import { paystackWebhookRouter } from "./routes/webhooks.js";
import * as paymentService from "./services/paymentService.js";

function corsOptions(): cors.CorsOptions {
  const list = env.CORS_ORIGINS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (list?.length) {
    return { origin: list, credentials: true };
  }
  if (env.NODE_ENV === "development") {
    return { origin: true, credentials: true };
  }
  return { origin: false, credentials: true };
}

export function createApp() {
  const app = express();

  /** Vercel — correct client IPs for rate limiting (`express-rate-limit`). */
  if (process.env.VERCEL === "1") {
    app.set("trust proxy", 1);
  }

  app.use(
    env.NODE_ENV === "development"
      ? helmet({ contentSecurityPolicy: false })
      : helmet(),
  );
  app.use(cors(corsOptions()));

  if (env.NODE_ENV === "development") {
    app.get("/openapi.json", (_req, res) => {
      res.json(openApiDocument);
    });
    app.use(
      "/api-docs",
      swaggerUi.serve,
      swaggerUi.setup(openApiDocument, {
        customSiteTitle: "BelieveChops API",
        swaggerOptions: {
          persistAuthorization: true,
          displayRequestDuration: true,
        },
      }),
    );
  }

  app.use(
    "/api/webhooks/paystack",
    express.raw({ type: "application/json" }),
    paystackWebhookRouter,
  );

  if (env.NODE_ENV === "development" && env.WEBHOOK_SIMULATE_SECRET) {
    app.post(
      "/api/dev/simulate-paystack-paid",
      express.json({ limit: "32kb" }),
      async (req, res) => {
        const auth = req.headers.authorization;
        if (auth !== `Bearer ${env.WEBHOOK_SIMULATE_SECRET}`) {
          res.status(401).json({ error: "Unauthorized" });
          return;
        }
        const reference = typeof req.body?.reference === "string" ? req.body.reference.trim() : "";
        if (!reference) {
          res.status(400).json({ error: "Body must include { reference: string }" });
          return;
        }
        try {
          await paymentService.applyVerifiedPayment({
            reference,
            amountKobo: 0,
            paidAt: new Date(),
            rawPayload: { source: "dev-simulate-paystack-paid", at: new Date().toISOString() },
          });
          const payment = await paymentService.getPaymentByReference(reference);
          res.json({ ok: true, payment });
        } catch (err) {
          console.error("simulate-paystack-paid:", err);
          res.status(500).json({ error: err instanceof Error ? err.message : "Processing failed" });
        }
      },
    );
  }

  app.use(express.json({ limit: "1mb" }));

  app.use("/api", apiRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
