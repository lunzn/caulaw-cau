import "dotenv/config";
import { Elysia } from "elysia";
import { initBackgroundServices } from "./modules/init-background";
import { internalRoutes } from "./internal-routes";

await initBackgroundServices();

const listenPort = Number.parseInt(process.env.WORKER_PORT ?? "3100", 10);
const listenHostname = process.env.WORKER_HOST ?? "0.0.0.0";

new Elysia()
  .get("/health", () => ({ ok: true, service: "cau-claw-background" }))
  .use(internalRoutes)
  .listen({ port: listenPort, hostname: listenHostname });

console.log(
  `[cau-claw] Elysia 后台 http://${listenHostname}:${listenPort}`,
);
