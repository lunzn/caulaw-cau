import { Cron, CronPattern } from "croner";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { scheduledTasks } from "@cau-claw/db/schema";

/** 由入口注入，避免 cron 与 agent 模块循环依赖 */
export type CronAgentHooks = {
  enqueue: (userId: string, task: () => Promise<void>) => void;
  prompt: (userId: string, text: string) => Promise<string>;
};

let cronAgentHooks: CronAgentHooks | null = null;

export function setCronAgentHooks(hooks: CronAgentHooks): void {
  cronAgentHooks = hooks;
}

const CRON_TIMEZONE =
  process.env.CRON_TIMEZONE?.trim() || "Asia/Shanghai";

export type CronTaskRow = {
  id: number;
  user_id: string;
  cron_expr: string;
  prompt: string;
  target_user_id: string;
  enabled: number;
  created_at: string;
};

function toRow(
  r: typeof scheduledTasks.$inferSelect,
): CronTaskRow {
  return {
    id: r.id,
    user_id: r.userId,
    cron_expr: r.cronExpr,
    prompt: r.prompt,
    target_user_id: r.targetUserId,
    enabled: r.enabled ? 1 : 0,
    created_at:
      r.createdAt instanceof Date
        ? r.createdAt.toISOString()
        : String(r.createdAt),
  };
}

export class CronService {
  private jobs = new Map<number, Cron>();

  async init(): Promise<void> {
    const tasks = await db
      .select()
      .from(scheduledTasks)
      .where(eq(scheduledTasks.enabled, true));
    for (const t of tasks) {
      this.scheduleJob(toRow(t));
    }
    if (tasks.length) {
      console.log(`[cron] 已恢复 ${tasks.length} 个定时任务`);
    }
  }

  async listTasks(userId: string): Promise<CronTaskRow[]> {
    const rows = await db
      .select()
      .from(scheduledTasks)
      .where(eq(scheduledTasks.userId, userId));
    return rows.map(toRow);
  }

  async addTask(
    userId: string,
    cronExpr: string,
    prompt: string,
    targetUserId: string,
  ): Promise<CronTaskRow | Error> {
    const trimmedCronExpr = cronExpr.trim();
    const trimmedPrompt = prompt.trim();
    const trimmedTargetUserId = targetUserId.trim();
    if (!trimmedCronExpr || !trimmedPrompt || !trimmedTargetUserId) {
      return new Error("cronExpr、prompt、targetUserId 必填");
    }
    try {
      new CronPattern(trimmedCronExpr);
    } catch {
      return new Error(`无效的 cron 表达式: ${trimmedCronExpr}`);
    }

    const inserted = await db
      .insert(scheduledTasks)
      .values({
        userId,
        cronExpr: trimmedCronExpr,
        prompt: trimmedPrompt,
        targetUserId: trimmedTargetUserId,
        enabled: true,
      })
      .returning();

    const first = inserted[0];
    if (!first) return new Error("创建任务后无法读取记录，请重试");

    const task = toRow(first);
    this.scheduleJob(task);
    return task;
  }

  async removeAllByUser(userId: string): Promise<number> {
    const tasks = await db
      .select()
      .from(scheduledTasks)
      .where(eq(scheduledTasks.userId, userId));
    for (const t of tasks) {
      this.jobs.get(t.id)?.stop();
      this.jobs.delete(t.id);
    }
    const removed = await db
      .delete(scheduledTasks)
      .where(eq(scheduledTasks.userId, userId))
      .returning({ id: scheduledTasks.id });
    const n = removed.length;
    if (n) console.log(`[cron] 已删除用户 ${userId} 的 ${n} 个定时任务`);
    return n;
  }

  async removeTask(userId: string, taskId: number): Promise<boolean> {
    this.jobs.get(taskId)?.stop();
    this.jobs.delete(taskId);
    const removed = await db
      .delete(scheduledTasks)
      .where(
        and(eq(scheduledTasks.id, taskId), eq(scheduledTasks.userId, userId)),
      )
      .returning({ id: scheduledTasks.id });
    return removed.length > 0;
  }

  async toggleTask(
    userId: string,
    taskId: number,
    enabled: boolean,
  ): Promise<CronTaskRow | null> {
    await db
      .update(scheduledTasks)
      .set({ enabled })
      .where(
        and(eq(scheduledTasks.id, taskId), eq(scheduledTasks.userId, userId)),
      );
    const rows = await db
      .select()
      .from(scheduledTasks)
      .where(
        and(eq(scheduledTasks.id, taskId), eq(scheduledTasks.userId, userId)),
      )
      .limit(1);
    const task = rows[0];
    if (!task) return null;

    const tr = toRow(task);
    if (enabled) {
      this.scheduleJob(tr);
    } else {
      this.jobs.get(taskId)?.stop();
      this.jobs.delete(taskId);
    }
    return tr;
  }

  private scheduleJob(task: CronTaskRow): void {
    this.jobs.get(task.id)?.stop();

    const job = new Cron(
      task.cron_expr,
      {
        timezone: CRON_TIMEZONE,
        protect: true,
      },
      () => {
        const hooks = cronAgentHooks;
        if (!hooks) {
          console.error(
            `[cron task:${task.id}] CronAgentHooks 未注入，跳过（应在启动时调用 setCronAgentHooks）`,
          );
          return;
        }
        hooks.enqueue(task.user_id, async () => {
          const { botService } = await import("@/lib/bot/service");
          const bot = botService.getBot(task.user_id);
          if (!bot || !botService.isOnline(task.user_id)) {
            console.warn(
              `[cron task:${task.id}] 用户 ${task.user_id} 的 bot 不在线，跳过`,
            );
            return;
          }

          try {
            const reply = await hooks.prompt(task.user_id, task.prompt);
            const textOut = reply.trim();
            if (textOut) {
              await bot.send(task.target_user_id, textOut);
            }
            console.log(
              `[cron task:${task.id}] 已执行 → ${task.target_user_id}${textOut ? "（已发文本）" : "（无文本；可能仅用工具发图等）"}`,
            );
          } catch (err) {
            console.error(`[cron task:${task.id}] 执行失败:`, err);
          }
        });
      },
    );

    this.jobs.set(task.id, job);
  }
}

export const cronService = new CronService();
