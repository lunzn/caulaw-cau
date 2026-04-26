import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { initDatabase, closeDatabase } from "./db/database";
import { seedDatabase } from "./seed";
import { setupRoutes } from "./routes";

const PORT = process.env.SCHOOL_SERVER_PORT || "3002";
const HOST = process.env.SCHOOL_SERVER_HOST || "0.0.0.0";

// 初始化数据库
initDatabase();

// 如果环境变量设置了 SEED，则生成模拟数据
if (process.env.SEED === "true") {
  seedDatabase();
}

const app = new Elysia()
  .use(cors())
  .get("/health", () => ({ status: "ok", timestamp: Date.now() }))
  .use(setupRoutes)
  .onStop(() => {
    closeDatabase();
    console.log("数据库连接已关闭");
  });

app.listen({
  port: parseInt(PORT),
  hostname: HOST,
});

console.log(`🎓 School Server 运行在 http://${HOST}:${PORT}`);
console.log(`📚 API 文档: http://${HOST}:${PORT}/swagger`);

export type App = typeof app;
