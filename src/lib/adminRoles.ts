import type { StaffRole } from "@prisma/client";

/**
 * Whether this user may use the BelieveChops **admin portal** (employees / superadmin).
 * Customers always have `staffRole` null — they are not “normal admins”.
 */
export function isStaffRole(staffRole: StaffRole | null | undefined): staffRole is StaffRole {
  return staffRole === "ADMIN" || staffRole === "SUPERADMIN";
}

/** Superadmin tier: above restaurant `ADMIN` staff; reserve stricter actions here later. */
export function isSuperAdmin(staffRole: StaffRole | null | undefined): boolean {
  return staffRole === "SUPERADMIN";
}
