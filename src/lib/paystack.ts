import crypto from "node:crypto";
import type { GhanaMomoProvider } from "./ghanaMomo.js";
import { env } from "../config/env.js";

const BASE_URL = "https://api.paystack.co";

function authHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
    "Content-Type": "application/json",
  };
}

export type InitializeTransactionParams = {
  email: string;
  amountKobo: number;
  reference?: string;
  callbackUrl?: string;
  metadata?: Record<string, string | number | boolean>;
};

export type InitializeTransactionResult = {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
};

export type ChargeGhanaMomoParams = {
  email: string;
  /** Ghana pesewas (smallest GHS unit). */
  amountPesewas: number;
  reference?: string;
  metadata?: Record<string, string | number | boolean>;
  mobileMoney: { phone: string; provider: GhanaMomoProvider };
};

export type ChargeGhanaMomoResult = {
  reference: string;
  status: string;
  displayText: string | null;
  amountPesewas: number;
};

/**
 * Starts a Ghana Mobile Money charge — customer completes authorization on their handset (offline prompt).
 * @see https://paystack.com/docs/payments/payment-channels/#mobile-money
 */
export async function chargeGhanaMobileMoney(
  params: ChargeGhanaMomoParams,
): Promise<ChargeGhanaMomoResult> {
  const body: Record<string, unknown> = {
    email: params.email,
    amount: params.amountPesewas,
    currency: "GHS",
    mobile_money: {
      phone: params.mobileMoney.phone,
      provider: params.mobileMoney.provider,
    },
    metadata: params.metadata ?? {},
  };
  if (params.reference) body.reference = params.reference;

  const res = await fetch(`${BASE_URL}/charge`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });

  const json = (await res.json()) as {
    status: boolean;
    message: string;
    data?: {
      reference: string;
      status: string;
      display_text?: string;
      amount: number;
    };
  };

  if (!res.ok || !json.status || !json.data?.reference) {
    throw new Error(json.message || `Paystack MoMo charge failed (${res.status})`);
  }

  const d = json.data;
  return {
    reference: d.reference,
    status: d.status,
    displayText: d.display_text ?? null,
    amountPesewas: d.amount,
  };
}

export async function initializeTransaction(
  params: InitializeTransactionParams,
): Promise<InitializeTransactionResult> {
  const body: Record<string, unknown> = {
    email: params.email,
    amount: params.amountKobo,
    metadata: params.metadata ?? {},
  };
  if (params.reference) body.reference = params.reference;
  if (params.callbackUrl) body.callback_url = params.callbackUrl;

  const res = await fetch(`${BASE_URL}/transaction/initialize`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });

  const json = (await res.json()) as {
    status: boolean;
    message: string;
    data?: { authorization_url: string; access_code: string; reference: string };
  };

  if (!res.ok || !json.status || !json.data) {
    throw new Error(json.message || `Paystack initialize failed (${res.status})`);
  }

  return {
    authorizationUrl: json.data.authorization_url,
    accessCode: json.data.access_code,
    reference: json.data.reference,
  };
}

export type VerifyTransactionResult = {
  reference: string;
  status: string;
  amountKobo: number;
  paidAt: Date | null;
  customerEmail: string | null;
  metadata: Record<string, unknown> | null;
};

export async function verifyTransaction(reference: string): Promise<VerifyTransactionResult> {
  const res = await fetch(`${BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`, {
    method: "GET",
    headers: authHeaders(),
  });

  const json = (await res.json()) as {
    status: boolean;
    message: string;
    data?: {
      reference: string;
      status: string;
      amount: number;
      paid_at: string | null;
      customer?: { email: string };
      metadata: Record<string, unknown> | null;
    };
  };

  if (!res.ok || !json.status || !json.data) {
    throw new Error(json.message || `Paystack verify failed (${res.status})`);
  }

  const d = json.data;
  return {
    reference: d.reference,
    status: d.status,
    amountKobo: d.amount,
    paidAt: d.paid_at ? new Date(d.paid_at) : null,
    customerEmail: d.customer?.email ?? null,
    metadata: d.metadata ?? null,
  };
}

/**
 * Validates `x-paystack-signature` against the raw request body (HMAC SHA512).
 * @see https://paystack.com/docs/payments/webhooks
 */
export function verifyPaystackWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
): boolean {
  if (!signatureHeader) return false;
  const secret = env.PAYSTACK_SECRET_KEY;
  const hash = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
  const sig = signatureHeader.trim();
  if (hash.length !== sig.length) return false;
  return crypto.timingSafeEqual(Buffer.from(hash, "utf8"), Buffer.from(sig, "utf8"));
}
