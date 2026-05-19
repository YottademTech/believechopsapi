import type { User } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      staffUser?: User;
    }
  }
}

export {};
