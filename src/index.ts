import { setDefaultResultOrder } from "node:dns";
import { createApp } from "./app.js";
import { env } from "./config/env.js";

/** Prefer IPv4 when resolving SMTP hosts — avoids broken IPv6 routes to Gmail (“Unexpected socket close”). */
setDefaultResultOrder("ipv4first");

const app = createApp();
app.listen(env.PORT, () => {
  console.log(`believechopsapi listening on port ${env.PORT}`);
});
