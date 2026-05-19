import { createServer } from "node:http";
import { setDefaultResultOrder } from "node:dns";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { attachStaffSocket } from "./realtime/staffSocket.js";

/** Prefer IPv4 when resolving SMTP hosts — avoids broken IPv6 routes to Gmail (“Unexpected socket close”). */
setDefaultResultOrder("ipv4first");

const app = createApp();
const httpServer = createServer(app);

attachStaffSocket(httpServer);

httpServer.listen(env.PORT, () => {
  console.log(`believechopsapi listening on port ${env.PORT} (HTTP + Socket.IO)`);
});
