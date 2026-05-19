/**
 * OpenAPI 3 document for Swagger UI (development only).
 */
export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "BelieveChops API",
    description:
      "REST API for BelieveChops — auth (OTP), cart (DB-backed per user), orders, Paystack payments, reminders. **Swagger is enabled only when NODE_ENV=development.**",
    version: "0.1.0",
  },
  servers: [{ url: "/", description: "This server" }],
  tags: [
    { name: "Health" },
    { name: "Auth" },
    { name: "Cart" },
    { name: "Orders" },
    { name: "Payments" },
    { name: "Reminders" },
    { name: "Webhooks" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          error: { type: "string" },
          code: { type: "string" },
          details: { type: "object" },
        },
      },
      User: {
        type: "object",
        properties: {
          id: { type: "string" },
          email: { type: "string", nullable: true },
          phone: { type: "string", nullable: true },
          name: { type: "string", nullable: true },
          staffRole: {
            type: "string",
            nullable: true,
            enum: ["ADMIN", "SUPERADMIN"],
            description:
              "Admin portal only: `ADMIN` = restaurant/ops employees; `SUPERADMIN` = top operator. Null for customers (they never use the admin app).",
          },
          emailVerifiedAt: { type: "string", format: "date-time", nullable: true },
          phoneVerifiedAt: { type: "string", format: "date-time", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      CartLine: {
        type: "object",
        required: ["itemId", "quantity"],
        properties: {
          itemId: { type: "string", description: "Menu item id (matches storefront)" },
          quantity: { type: "integer", minimum: 1, maximum: 999 },
        },
      },
      OrderDelivery: {
        type: "object",
        description:
          "At least one of ghanaPost, community, locality, or geo required when creating an order.",
        properties: {
          ghanaPost: { type: "string", description: "Ghana Post GPS / digital address" },
          community: { type: "string", description: "Community or neighbourhood" },
          locality: { type: "string", description: "Street, landmark, directions" },
          geo: {
            type: "object",
            properties: {
              lat: { type: "number" },
              lng: { type: "number" },
              accuracyM: { type: "number", description: "GPS accuracy in metres (optional)" },
            },
          },
        },
      },
      Order: {
        type: "object",
        properties: {
          id: { type: "string" },
          userId: { type: "string", nullable: true },
          status: { type: "string", enum: ["PENDING", "PAID", "CANCELLED", "FULFILLED"] },
          totalAmount: { type: "integer", description: "Smallest currency unit (e.g. kobo)" },
          currency: { type: "string" },
          items: { type: "object", nullable: true },
          delivery: { $ref: "#/components/schemas/OrderDelivery", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      PaymentWithOrder: {
        type: "object",
        properties: {
          id: { type: "string" },
          orderId: { type: "string" },
          amount: { type: "integer" },
          currency: { type: "string" },
          paystackReference: { type: "string" },
          status: { type: "string", enum: ["PENDING", "SUCCESS", "FAILED"] },
          paidAt: { type: "string", format: "date-time", nullable: true },
          order: { $ref: "#/components/schemas/Order" },
        },
      },
    },
  },
  paths: {
    "/api/health": {
      get: {
        tags: ["Health"],
        summary: "Health check",
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean" },
                    service: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/auth/otp/send": {
      post: {
        tags: ["Auth"],
        summary: "Send OTP (email or SMS)",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  channel: { type: "string", enum: ["EMAIL", "SMS"], description: "Defaults from OTP_DEFAULT_CHANNEL" },
                  purpose: { type: "string", enum: ["SIGN_IN"] },
                  email: { type: "string", format: "email" },
                  phone: { type: "string", description: "E.164, e.g. +233..." },
                },
              },
            },
          },
        },
        responses: {
          "202": { description: "OTP queued / sent" },
          "400": { description: "Validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "429": { description: "Rate limited" },
          "503": { description: "Email/SMS not configured (production)" },
        },
      },
    },
    "/api/auth/otp/verify": {
      post: {
        tags: ["Auth"],
        summary: "Verify OTP and receive JWT",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["code"],
                properties: {
                  channel: { type: "string", enum: ["EMAIL", "SMS"] },
                  email: { type: "string", format: "email" },
                  phone: { type: "string" },
                  code: { type: "string" },
                  name: { type: "string", maxLength: 120 },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Session token",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    token: { type: "string" },
                    tokenType: { type: "string", example: "Bearer" },
                    expiresIn: { type: "string", example: "7d" },
                    user: { $ref: "#/components/schemas/User" },
                  },
                },
              },
            },
          },
          "400": { description: "Invalid code", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Current user",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { user: { $ref: "#/components/schemas/User" } },
                },
              },
            },
          },
          "401": { description: "Missing or invalid JWT" },
          "404": { description: "User not found" },
        },
      },
    },
    "/api/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Register without OTP (unverified account)",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  email: { type: "string", format: "email" },
                  phone: { type: "string" },
                  name: { type: "string" },
                },
                description: "At least one of email or phone required",
              },
            },
          },
        },
        responses: {
          "201": {
            content: {
              "application/json": {
                schema: { type: "object", properties: { user: { $ref: "#/components/schemas/User" } } },
              },
            },
          },
          "409": { description: "Duplicate email/phone" },
        },
      },
    },
    "/api/cart": {
      get: {
        tags: ["Cart"],
        summary: "Get current user cart",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Cart lines",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    lines: {
                      type: "array",
                      items: { $ref: "#/components/schemas/CartLine" },
                    },
                  },
                },
              },
            },
          },
          "401": { description: "Missing or invalid JWT" },
        },
      },
      put: {
        tags: ["Cart"],
        summary: "Replace cart",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["lines"],
                properties: {
                  lines: {
                    type: "array",
                    maxItems: 100,
                    items: { $ref: "#/components/schemas/CartLine" },
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Saved",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean" },
                    lines: {
                      type: "array",
                      items: { $ref: "#/components/schemas/CartLine" },
                    },
                  },
                },
              },
            },
          },
          "400": { description: "Invalid payload" },
          "401": { description: "Missing or invalid JWT" },
        },
      },
    },
    "/api/orders": {
      post: {
        tags: ["Orders"],
        summary: "Create order",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["totalAmount", "delivery"],
                properties: {
                  userId: { type: "string" },
                  totalAmount: { type: "integer", minimum: 1 },
                  currency: { type: "string", default: "GHS" },
                  items: {},
                  delivery: { $ref: "#/components/schemas/OrderDelivery" },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            content: {
              "application/json": {
                schema: { type: "object", properties: { order: { $ref: "#/components/schemas/Order" } } },
              },
            },
          },
        },
      },
    },
    "/api/orders/{id}": {
      get: {
        tags: ["Orders"],
        summary: "Get order by id",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: { type: "object", properties: { order: { $ref: "#/components/schemas/Order" } } },
              },
            },
          },
          "404": { description: "Not found" },
        },
      },
    },
    "/api/payments/momo/charge": {
      post: {
        tags: ["Payments"],
        summary: "Start Ghana Mobile Money charge (Paystack)",
        description:
          "Uses the user's **verified** phone from their profile (not from the request). Sends an MoMo authorization prompt via Paystack. Requires `phoneVerifiedAt` and a Ghana (+233) number.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["orderId"],
                properties: {
                  orderId: { type: "string" },
                  provider: {
                    type: "string",
                    enum: ["mtn", "vod", "atl"],
                    description: "Optional — inferred from MSISDN when omitted",
                  },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Charge started — customer completes on handset",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    reference: { type: "string" },
                    status: { type: "string" },
                    displayText: { type: "string", nullable: true },
                    payOffline: { type: "boolean" },
                    provider: { type: "string", enum: ["mtn", "vod", "atl"] },
                  },
                },
              },
            },
          },
          "400": { description: "Invalid phone or Paystack error" },
          "403": { description: "Phone not verified" },
          "404": { description: "Order not found" },
          "409": { description: "Order not payable or MoMo already in progress" },
        },
      },
    },
    "/api/payments/initialize": {
      post: {
        tags: ["Payments"],
        summary: "Start Paystack checkout for an order",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["orderId", "email"],
                properties: {
                  orderId: { type: "string" },
                  email: { type: "string", format: "email" },
                  callbackUrl: { type: "string", format: "uri" },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Redirect customer to authorizationUrl",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    authorizationUrl: { type: "string", format: "uri" },
                    accessCode: { type: "string" },
                    reference: { type: "string" },
                  },
                },
              },
            },
          },
          "409": { description: "Order not payable" },
        },
      },
    },
    "/api/payments/verify/{reference}": {
      get: {
        tags: ["Payments"],
        summary: "Verify Paystack transaction by reference",
        parameters: [{ name: "reference", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { payment: { $ref: "#/components/schemas/PaymentWithOrder" } },
                },
              },
            },
          },
          "400": { description: "Payment not successful" },
        },
      },
    },
    "/api/reminders": {
      post: {
        tags: ["Reminders"],
        summary: "Schedule a reminder",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["channel", "sendAt"],
                properties: {
                  userId: { type: "string" },
                  channel: { type: "string", enum: ["email", "sms", "push"] },
                  sendAt: { type: "string", format: "date-time" },
                  payload: {},
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Created" },
        },
      },
    },
    "/api/reminders/dispatch": {
      post: {
        tags: ["Reminders"],
        summary: "SchedulingEngine callback (menu reminder)",
        description:
          "No `Authorization` header. Register `callbackUrl` with `?secret=` (see `SCHEDULER_DISPATCH_SECRET`). Body: `{ callbackUrl, uniqueId }` where `uniqueId` is the **user id**.",
        parameters: [
          {
            name: "secret",
            in: "query",
            required: true,
            schema: { type: "string" },
            description: "Must match server env `SCHEDULER_DISPATCH_SECRET`",
          },
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["callbackUrl", "uniqueId"],
                properties: {
                  callbackUrl: { type: "string", format: "uri" },
                  uniqueId: { type: "string", description: "User id (same as registered on the job)" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Reminder dispatched or skipped" },
          "400": { description: "Invalid body" },
          "403": { description: "Wrong or missing secret" },
          "503": { description: "Dispatch secret not configured on server" },
        },
      },
    },
    "/api/reminders/due": {
      get: {
        tags: ["Reminders"],
        summary: "List due reminders (worker/cron)",
        responses: {
          "200": { description: "OK" },
        },
      },
    },
    "/api/webhooks/paystack": {
      post: {
        tags: ["Webhooks"],
        summary: "Paystack webhook (server-to-server)",
        description:
          "Raw JSON body; signed with `x-paystack-signature`. Not intended for browser calls.",
        parameters: [
          {
            name: "x-paystack-signature",
            in: "header",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: { type: "object", description: "Paystack event payload" },
            },
          },
        },
        responses: {
          "200": { description: "Acknowledged" },
          "400": { description: "Bad signature or JSON" },
          "500": { description: "Processing error (retry)" },
        },
      },
    },
  },
} as const;
