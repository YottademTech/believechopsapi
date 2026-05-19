-- Customers are not a role: shoppers have staffRole NULL; only staff have ADMIN / SUPERADMIN.

CREATE TYPE "StaffRole" AS ENUM ('ADMIN', 'SUPERADMIN');

ALTER TABLE "User" ADD COLUMN "staffRole" "StaffRole";

UPDATE "User" SET "staffRole" = 'ADMIN'::"StaffRole" WHERE "role"::text = 'ADMIN';
UPDATE "User" SET "staffRole" = 'SUPERADMIN'::"StaffRole" WHERE "role"::text = 'SUPERADMIN';

ALTER TABLE "User" DROP COLUMN "role";

DROP TYPE "UserRole";
