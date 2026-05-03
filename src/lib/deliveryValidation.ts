import { z } from "zod";

export const deliveryGeoSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracyM: z.number().positive().optional(),
});

/** Same shape as `Order.delivery` JSON and checkout/API payloads. */
export const deliveryPayloadSchema = z
  .object({
    ghanaPost: z.string().max(80).optional(),
    community: z.string().max(160).optional(),
    locality: z.string().max(1000).optional(),
    geo: deliveryGeoSchema.optional(),
  })
  .strict();

export type DeliveryPayloadInput = z.infer<typeof deliveryPayloadSchema>;

export function refineDeliveryHasContent(
  d: DeliveryPayloadInput,
  ctx: z.RefinementCtx,
  path: (string | number)[],
): void {
  const hasText = [d.ghanaPost, d.community, d.locality].some((s) => s?.trim());
  const hasGeo = d.geo != null;
  if (!hasText && !hasGeo) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "Provide Ghana Post / community / locality, or share your current location (GPS).",
      path,
    });
  }
}

/** Saved address body = delivery fields + optional label (profile CRUD). */
export const addressBodySchema = z
  .object({
    label: z.string().max(80).optional(),
    ghanaPost: z.string().max(80).optional(),
    community: z.string().max(160).optional(),
    locality: z.string().max(1000).optional(),
    geo: deliveryGeoSchema.optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    const { label: _l, ...rest } = val;
    refineDeliveryHasContent(rest, ctx, []);
  });
