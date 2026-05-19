import type { Server } from "socket.io";

let io: Server | null = null;

export function setStaffIo(server: Server | null): void {
  io = server;
}

export function emitToStaff(event: string, payload: unknown): void {
  io?.to("staff").emit(event, payload);
}
