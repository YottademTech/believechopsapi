import { setDefaultResultOrder } from "node:dns";
import { createApp } from "../dist/app.js";

/** Same as `src/index.ts` — prefer IPv4 for SMTP-related DNS on cold starts. */
setDefaultResultOrder("ipv4first");

const app = createApp();
export default app;
