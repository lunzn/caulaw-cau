import { Elysia, status, t } from "elysia";
import { botService } from "@/lib/bot/service";
import { cronService } from "@/modules/cron/service";

export const internalRoutes = new Elysia({
  prefix: "/internal",
  name: "cau-internal",
})
  .onBeforeHandle(({ request }) => {
    const internalToken = process.env.WORKER_INTERNAL_TOKEN?.trim();
    if (!internalToken) return;
    const authorizationHeader = request.headers.get("authorization");
    if (authorizationHeader !== `Bearer ${internalToken}`) {
      return status(401, { error: "unauthorized" });
    }
  })
  .derive(({ headers }) => {
    const headerValue = headers["x-user-id"];
    const userId = typeof headerValue === "string" ? headerValue.trim() : "";
    if (!userId) return status(400, { error: "缺少 X-User-Id" });
    return { userId };
  })
  .get("/bot/status", async ({ userId }) => {
    await botService.ensureStarted(userId);
    return botService.getStatus(userId);
  })
  .post("/bot/start", async ({ userId }) => {
    await botService.afterRestore;
    const startResult = botService.startBot(userId, { force: true });
    if ("error" in startResult) return status(400, startResult);
    return startResult;
  })
  .post("/bot/stop", async ({ userId }) => {
    await botService.stopBot(userId);
    return { ok: true };
  })
  .get("/cron/tasks", async ({ userId }) => ({
    tasks: await cronService.listTasks(userId),
  }))
  .post(
    "/cron/tasks",
    async ({ userId, body }) => {
      const result = await cronService.addTask(
        userId,
        body.cronExpr,
        body.prompt,
        body.targetUserId,
      );
      if (result instanceof Error) {
        return status(400, { error: result.message });
      }
      return result;
    },
    {
      body: t.Object({
        cronExpr: t.String(),
        prompt: t.String(),
        targetUserId: t.String(),
      }),
    },
  )
  .guard(
    {
      params: t.Object({
        id: t.Numeric({ minimum: 1 }),
      }),
    },
    (routes) =>
      routes
        .patch(
          "/cron/tasks/:id",
          async ({ userId, params, body }) => {
            const updatedTask = await cronService.toggleTask(
              userId,
              params.id,
              body.enabled,
            );
            if (!updatedTask) return status(404, { error: "任务不存在" });
            return updatedTask;
          },
          {
            body: t.Object({
              enabled: t.Boolean(),
            }),
          },
        )
        .delete("/cron/tasks/:id", async ({ userId, params }) => {
          const removed = await cronService.removeTask(userId, params.id);
          if (!removed) return status(404, { error: "任务不存在" });
          return { ok: true };
        }),
  );
