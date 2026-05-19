import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { getCorsAllowedOrigins, normalizeBrowserOrigin } from "../config/corsOrigins.js";
import { env } from "../config/env.js";
import { verifyAccessToken } from "../lib/jwt.js";
import { prisma } from "../lib/prisma.js";
import { isStaffRole } from "../lib/adminRoles.js";
import { setStaffIo } from "./staffEmit.js";

export function attachStaffSocket(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    path: "/socket.io/",
    cors: {
      origin:
        env.NODE_ENV === "development"
          ? true
          : (origin, callback) => {
              const allowed = getCorsAllowedOrigins();
              if (!origin) {
                callback(null, true);
                return;
              }
              if (allowed.has(normalizeBrowserOrigin(origin))) {
                callback(null, true);
                return;
              }
              callback(new Error("Not allowed by CORS"));
            },
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const raw =
        typeof socket.handshake.auth?.token === "string" ? socket.handshake.auth.token.trim() : "";
      if (!raw) {
        next(new Error("Unauthorized"));
        return;
      }
      const { sub } = await verifyAccessToken(raw);
      const user = await prisma.user.findUnique({ where: { id: sub } });
      if (!user || !isStaffRole(user.staffRole)) {
        next(new Error("Forbidden"));
        return;
      }
      socket.data.userId = sub;
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    void socket.join("staff");
  });

  setStaffIo(io);
  return io;
}
