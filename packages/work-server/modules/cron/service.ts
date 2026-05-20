import { Cron, CronPattern } from "croner";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { scheduledTasks } from "@cau-claw/db/schema";
import {
  describeSendError,
  digestText,
  isNoContentReply,
  queuePendingDelivery,
  sendScheduledText,
  wrapCronPrompt,
} from "@/lib/scheduled-delivery";

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
  /** 最近一次执行时间（ISO） */
  last_run_at: string | null;
  /** ok | skipped | queued | failed */
  last_run_status: string | null;
  /** 最近一次执行的错误信息（成功为 null） */
  last_error: string | null;
  /** 上次已推送内容的指纹（用于去重） */
  last_digest: string | null;
};

function isoOrNull(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string" && v) return v;
  return null;
}

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
    last_run_at: isoOrNull(r.lastRunAt),
    last_run_status: r.lastRunStatus ?? null,
    last_error: r.lastError ?? null,
    last_digest: r.lastDigest ?? null,
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

  /** 记录一次执行结果，供控制台展示与去重 */
  private async recordRun(
    taskId: number,
    fields: { status: string; error?: string | null; digest?: string },
  ): Promise<void> {
    try {
      const set: Partial<typeof scheduledTasks.$inferInsert> = {
        lastRunAt: new Date(),
        lastRunStatus: fields.status,
        lastError: fields.error ?? null,
      };
      if (fields.digest !== undefined) set.lastDigest = fields.digest;
      await db
        .update(scheduledTasks)
        .set(set)
        .where(eq(scheduledTasks.id, taskId));
    } catch (e) {
      console.error(`[cron task:${taskId}] 记录执行状态失败`, e);
    }
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
            await this.recordRun(task.id, {
              status: "failed",
              error: "微信 Bot 不在线",
            });
            return;
          }

          // 1. 生成内容（prompt 末尾注入「无新内容只回复哨兵」约束）
          let textOut = "";
          try {
            const reply = await hooks.prompt(
              task.user_id,
              wrapCronPrompt(task.prompt),
            );
            textOut = reply.trim();
          } catch (err) {
            const desc = describeSendError(err);
            console.error(`[cron task:${task.id}] 生成内容失败:`, desc);
            await this.recordRun(task.id, {
              status: "failed",
              error: `生成内容失败：${desc}`,
            });
            return;
          }

          // 2. 无新内容 → 不发送（直接解决"没有通知仍骚扰"）
          if (!textOut || isNoContentReply(textOut)) {
            console.log(`[cron task:${task.id}] 本次无新内容，跳过发送`);
            await this.recordRun(task.id, { status: "skipped", error: null });
            return;
          }

          // 3. 与上次推送内容相同 → 跳过（去重）
          const digest = digestText(textOut);
          if (digest === task.last_digest) {
            console.log(
              `[cron task:${task.id}] 内容与上次相同，跳过发送（去重）`,
            );
            await this.recordRun(task.id, { status: "skipped", error: null });
            return;
          }

          // 4. 发送（带重试）
          const result = await sendScheduledText(
            bot,
            task.target_user_id,
            textOut,
          );
          if (result.ok) {
            task.last_digest = digest;
            await this.recordRun(task.id, {
              status: "ok",
              error: null,
              digest,
            });
            console.log(
              `[cron task:${task.id}] 已执行并发送 → ${task.target_user_id}`,
            );
          } else {
            // 5. 推送失败 → 入队，等对方下次主动联系时补发
            await queuePendingDelivery(
              task.user_id,
              task.target_user_id,
              textOut,
              "cron",
              task.id,
            );
            task.last_digest = digest;
            await this.recordRun(task.id, {
              status: "queued",
              error: result.error,
              digest,
            });
            console.warn(
              `[cron task:${task.id}] 推送失败已入队补发：${result.error}`,
            );
          }
        });
      },
    );

    this.jobs.set(task.id, job);
  }
}

export const cronService = new CronService();
