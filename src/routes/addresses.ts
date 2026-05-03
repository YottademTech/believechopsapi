import { Router } from "express";
import { z } from "zod";
import { addressBodySchema } from "../lib/deliveryValidation.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import * as addressService from "../services/addressService.js";

export const addressesRouter = Router();

function serializeAddress(a: import("@prisma/client").Address) {
  return {
    id: a.id,
    label: a.label,
    ghanaPost: a.ghanaPost,
    community: a.community,
    locality: a.locality,
    geo:
      a.latitude != null && a.longitude != null
        ? {
            lat: a.latitude,
            lng: a.longitude,
            ...(a.accuracyM != null ? { accuracyM: a.accuracyM } : {}),
          }
        : undefined,
    updatedAt: a.updatedAt.toISOString(),
  };
}

addressesRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = await addressService.listAddresses(req.userId!);
    res.json({ addresses: rows.map(serializeAddress) });
  }),
);

addressesRouter.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = addressBodySchema.parse(req.body);
    const row = await addressService.createAddress(req.userId!, body);
    res.status(201).json({ address: serializeAddress(row) });
  }),
);

addressesRouter.patch(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = z.string().min(1).parse(req.params.id);
    const body = addressBodySchema.parse(req.body);
    const row = await addressService.updateAddress(req.userId!, id, body);
    res.json({ address: serializeAddress(row) });
  }),
);

addressesRouter.delete(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = z.string().min(1).parse(req.params.id);
    await addressService.deleteAddress(req.userId!, id);
    res.status(204).send();
  }),
);
