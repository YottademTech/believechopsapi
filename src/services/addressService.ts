import type { Address } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import type { DeliveryPayloadInput } from "../lib/deliveryValidation.js";
import { AppError } from "../utils/AppError.js";

type AddressWriteInput = DeliveryPayloadInput & { label?: string | null };

function toCreateData(input: AddressWriteInput) {
  return {
    label: input.label?.trim() || null,
    ghanaPost: input.ghanaPost?.trim() || null,
    community: input.community?.trim() || null,
    locality: input.locality?.trim() || null,
    latitude: input.geo?.lat ?? null,
    longitude: input.geo?.lng ?? null,
    accuracyM: input.geo?.accuracyM ?? null,
  };
}

export function addressToDeliveryJson(a: Address): DeliveryPayloadInput {
  const out: DeliveryPayloadInput = {};
  if (a.ghanaPost?.trim()) out.ghanaPost = a.ghanaPost.trim();
  if (a.community?.trim()) out.community = a.community.trim();
  if (a.locality?.trim()) out.locality = a.locality.trim();
  if (a.latitude != null && a.longitude != null) {
    out.geo = {
      lat: a.latitude,
      lng: a.longitude,
      ...(a.accuracyM != null ? { accuracyM: a.accuracyM } : {}),
    };
  }
  return out;
}

export async function listAddresses(userId: string): Promise<Address[]> {
  return prisma.address.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });
}

export async function createAddress(userId: string, input: AddressWriteInput): Promise<Address> {
  return prisma.address.create({
    data: {
      userId,
      ...toCreateData(input),
    },
  });
}

export async function updateAddress(
  userId: string,
  id: string,
  input: AddressWriteInput,
): Promise<Address> {
  const existing = await prisma.address.findFirst({
    where: { id, userId },
  });
  if (!existing) throw new AppError("Address not found", 404);

  return prisma.address.update({
    where: { id },
    data: toCreateData(input),
  });
}

export async function deleteAddress(userId: string, id: string): Promise<void> {
  const existing = await prisma.address.findFirst({
    where: { id, userId },
  });
  if (!existing) throw new AppError("Address not found", 404);

  await prisma.address.delete({ where: { id } });
}
