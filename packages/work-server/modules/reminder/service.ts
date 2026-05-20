import { Cron } from "croner";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { reminders } from "@cau-claw/db/schema";
import {
  describeSendError,
  queuePendingDelivery,
  sendScheduledText,
} from "@/lib/scheduled-delivery";

export type ReminderHooks = {
  enqueue: (userId: string, task: () => Promise<void>) => void;
  prompt: (userId: string, text: string) => Promise<string>;
};

let hooks: ReminderHooks | null = null;

export function setReminderHooks(h: ReminderHooks): void {
  hooks = h;
}

export type ReminderRow = {
  id: number;
  user_id: string;
  run_at: string;
  prompt: string;
  target_user_id: string;
  status: string;
  last_error: string | null;
  created_at: string;
};

function toReminderRow(r: typeof reminders.$inferSelect): ReminderRow {
  return {
    id: r.id,
    user_id: r.userId,
    run_at:
      r.runAt instanceof Date ? r.runAt.toISOString() : String(r.runAt),
    prompt: r.prompt,
    target_user_id: r.targetUserId,
    status: r.status,
    last_error: r.lastError ?? null,
    created_at:
      r.createdAt instanceof Date
        ? r.createdAt.toISOString()
        : String(r.createdAt),
  };
}

function parseRunAt(runAtStr: string): Date {
  const d = new Date(runAtStr);
  if (Number.isNaN(d.getTime())) throw new Error(`无效的时间: ${runAtStr}`);
  return d;
}

export class ReminderService {
  private timers = new Map<number, Cron>();

  async init(): Promise<void> {
    const rows = await db
      .select()
      .from(reminders)
      .where(eq(reminders.status, "pending"));
    let restored = 0;
    for (const row of rows) {
      const rr = toReminderRow(row);
      const runDate = parseRunAt(rr.run_at);
      if (runDate.getTime() <= Date.now()) {
        this.executeReminder(rr);
      } else {
        this.scheduleTimer(rr, runDate);
      }
      restored++;
    }
    if (restored) {
      console.log(`[reminder] 已恢复 ${restored} 个待执行提醒`);
    }
  }

  async addReminder(
    userId: string,
    runAt: string,
    prompt: string,
    targetUserId: string,
  ): Promise<ReminderRow | Error> {
    let runDate: Date;
    try {
      runDate = parseRunAt(runAt);
    } catch {
      return new Error(`无效的时间格式: ${runAt}`);
    }
    if (runDate.getTime() <= Date.now()) {
      return new Error("提醒时间必须在当前时间之后");
    }

    const inserted = await db
      .insert(reminders)
      .values({
        userId,
        runAt: new Date(runAt),
        prompt,
        targetUserId,
      })
      .returning();

    const first = inserted[0];
    if (!first) return new Error("创建提醒后无法读取记录");

    const row = toReminderRow(first);
    this.scheduleTimer(row, runDate);
    return row;
  }

  async listReminders(userId: string): Promise<ReminderRow[]> {
    const rows = await db
      .select()
      .from(reminders)
      .where(eq(reminders.userId, userId));
    return rows.map(toReminderRow).sort((a, b) => a.run_at.localeCompare(b.run_at));
  }

  async cancelReminder(userId: string, reminderId: number): Promise<boolean> {
    this.timers.get(reminderId)?.stop();
    this.timers.delete(reminderId);
    const removed = await db
      .delete(reminders)
      .where(
        and(
          eq(reminders.id, reminderId),
          eq(reminders.userId, userId),
          eq(reminders.status, "pending"),
        ),
      )
      .returning({ id: reminders.id });
    return removed.length > 0;
  }

  async removeAllByUser(userId: string): Promise<number> {
    const pending = await db
      .select()
      .from(reminders)
      .where(
        and(eq(reminders.userId, userId), eq(reminders.status, "pending")),
      );
    for (const r of pending) {
      this.timers.get(r.id)?.stop();
      this.timers.delete(r.id);
    }
    const removed = await db
      .delete(reminders)
      .where(eq(reminders.userId, userId))
      .returning({ id: reminders.id });
    const n = removed.length;
    if (n) console.log(`[reminder] 已删除用户 ${userId} 的 ${n} 个提醒`);
    return n;
  }

  private scheduleTimer(row: ReminderRow, runDate: Date): void {
    this.timers.get(row.id)?.stop();
    const job = new Cron(runDate, () => this.executeReminder(row));
    this.timers.set(row.id, job);
  }

  /** 记录提醒的最终状态 */
  private async markReminder(
    id: number,
    status: string,
    error: string | null,
  ): Promise<void> {
    try {
      await db
        .update(reminders)
        .set({ status, lastError: error })
        .where(eq(reminders.id, id));
    } catch (e) {
      console.error(`[reminder:${id}] 记录状态失败`, e);
    }
  }

  private executeReminder(row: ReminderRow): void {
    const h = hooks;
    if (!h) {
      console.error(`[reminder:${row.id}] hooks 未注入，跳过`);
      return;
    }
    h.enqueue(row.user_id, async () => {
      const { botService } = await import("@/lib/bot/service");
      const bot = botService.getBot(row.user_id);
      if (!bot || !botService.isOnline(row.user_id)) {
        console.warn(`[reminder:${row.id}] bot 不在线，标记过期`);
        await this.markReminder(row.id, "expired", "微信 Bot 不在线");
        return;
      }

      // 1. 生成内容
      let textOut = "";
      try {
        const reply = await h.prompt(row.user_id, row.prompt);
        textOut = reply.trim();
      } catch (err) {
        const desc = describeSendError(err);
        console.error(`[reminder:${row.id}] 生成内容失败:`, desc);
        await this.markReminder(row.id, "failed", `生成内容失败：${desc}`);
        return;
      }

      // 提醒为用户主动安排，即使无文本也视为已完成（可能仅做了别的动作）
      if (!textOut) {
        await this.markReminder(row.id, "done", null);
        console.log(`[reminder:${row.id}] 已执行（无文本）`);
        return;
      }

      // 2. 发送（带重试）
      const result = await sendScheduledText(bot, row.target_user_id, textOut);
      if (result.ok) {
        await this.markReminder(row.id, "done", null);
        console.log(
          `[reminder:${row.id}] 已执行并发送 → ${row.target_user_id}`,
        );
      } else {
        // 3. 推送失败 → 入队，等对方下次主动联系时补发
        await queuePendingDelivery(
          row.user_id,
          row.target_user_id,
          textOut,
          "reminder",
          row.id,
        );
        await this.markReminder(row.id, "queued", result.error);
        console.warn(
          `[reminder:${row.id}] 推送失败已入队补发：${result.error}`,
        );
      }
    });
    this.timers.delete(row.id);
  }
}

export const reminderService = new ReminderService();
