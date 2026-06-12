/**
 * 定时任务 / 一次性提醒的「发送 + 兜底」基础设施。
 *
 * 解决三类问题：
 *  1. 推送报错（如微信 ret=-2）：诊断日志 + 重试 + 失败入队，下次对方联系时补发；
 *  2. 无新内容仍骚扰：哨兵串 + 内容指纹去重；
 *  3. 失败不可见：把服务端 errcode/errmsg/payload 完整提取出来记录。
 */
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { WeChatBot } from "@wechatbot/wechatbot";
import { db } from "@/lib/db";
import { pendingDeliveries } from "@cau-claw/db";

// ── 错误诊断 ──────────────────────────────────────────────────────────────

/**
 * 把微信 SDK 抛出的错误（含 iLink `ApiError`：errcode/httpStatus/payload）
 * 提取成一行可读字符串，便于定位 ret=-2 之类的服务端业务错误。
 */
export function describeSendError(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as {
      name?: string;
      message?: string;
      errcode?: unknown;
      httpStatus?: unknown;
      payload?: unknown;
    };
    const parts: string[] = [];
    if (e.name) parts.push(e.name);
    if (e.errcode !== undefined && e.errcode !== null) {
      parts.push(`errcode=${String(e.errcode)}`);
    }
    if (e.httpStatus !== undefined && e.httpStatus !== null) {
      parts.push(`http=${String(e.httpStatus)}`);
    }
    if (e.message) parts.push(e.message);
    if (e.payload !== undefined) {
      try {
        parts.push(`payload=${JSON.stringify(e.payload)}`);
      } catch {
        /* ignore */
      }
    }
    const joined = parts.join(" ");
    if (joined) return joined.slice(0, 500);
  }
  return String(err).slice(0, 500);
}

// ── 带重试的发送 ──────────────────────────────────────────────────────────

export type SendResult = { ok: true } | { ok: false; error: string };

/**
 * 发送一段文本，失败自动重试。
 * 微信 SDK 对 `ApiError`（业务错误）不重试，这里在 cron 层自行补一层退避重试，
 * 偶发错误可借此恢复；若是 context_token 失效之类的硬错误，重试无效但无害。
 */
export async function sendScheduledText(
  bot: WeChatBot,
  targetUserId: string,
  text: string,
): Promise<SendResult> {
  const MAX_ATTEMPTS = 3;
  let lastError = "未知错误";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await bot.send(targetUserId, text);
      if (attempt > 1) {
        console.log(
          `[scheduled-delivery] 第 ${attempt} 次重试发送成功 → ${targetUserId}`,
        );
      }
      return { ok: true };
    } catch (err) {
      lastError = describeSendError(err);
      console.warn(
        `[scheduled-delivery] 发送失败（第 ${attempt}/${MAX_ATTEMPTS} 次）→ ${targetUserId}: ${lastError}`,
      );
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 2_000 * attempt));
      }
    }
  }
  return { ok: false, error: lastError };
}

// ── 无新内容哨兵 + 内容去重 ───────────────────────────────────────────────

/** 定时任务「本次无新内容」的约定哨兵串 */
export const NO_CONTENT_SENTINEL = "[无新内容]";

/**
 * 给定时任务的 prompt 追加系统约束：没有新内容时只回复哨兵串。
 * 直接解决"没有新通知仍发消息骚扰"——cron 层据此判断是否跳过发送。
 */
export function wrapCronPrompt(prompt: string): string {
  return (
    prompt.trim() +
    `\n\n[系统要求] 这是一条定时任务。如果此刻没有任何新的、值得推送给用户的内容，` +
    `请只回复「${NO_CONTENT_SENTINEL}」这五个字，不要回复任何其他文字、解释或问候语。`
  );
}

/** 判断 agent 回复是否表示"本次无新内容" */
export function isNoContentReply(text: string): boolean {
  return text.includes(NO_CONTENT_SENTINEL);
}

/**
 * 包装一次性提醒到点执行时注入 agent 的 prompt。
 * 不包装时，agent 会把"提醒内容"误读成用户的新请求（曾把正在触发的提醒
 * 误判为"新建提醒"，回复"已设置好，明天会提醒你"），且容易用第三人称称呼用户。
 */
export function wrapReminderPrompt(prompt: string): string {
  return (
    `[系统提醒触发] 用户之前设置的一次性提醒现在到点了，请立即执行提醒。\n` +
    `提醒内容：${prompt.trim()}\n\n` +
    `[系统要求]\n` +
    `· 你的任务是把上述提醒转达给用户本人：直接输出发给用户的提醒消息正文，以「⏰提醒」开头，用第二人称"你"称呼对方；\n` +
    `· 这不是创建新提醒的请求，也不是测试。禁止创建/修改/查询提醒或定时任务，禁止回复"提醒已设置好"之类的确认语；\n` +
    `· 无需调用任何工具，不要解释系统机制，只输出提醒消息本身。`
  );
}

/** 计算内容指纹：与上次推送相同则可跳过，避免重复骚扰 */
export function digestText(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return createHash("sha1").update(normalized).digest("hex");
}

// ── 推送失败补发队列 ──────────────────────────────────────────────────────

/** 把一条推送失败的内容入队，等目标联系人下次主动发消息时补发 */
export async function queuePendingDelivery(
  userId: string,
  targetUserId: string,
  content: string,
  source: "cron" | "reminder",
  sourceId?: number,
): Promise<void> {
  try {
    await db.insert(pendingDeliveries).values({
      userId,
      targetUserId,
      content,
      source,
      sourceId: sourceId ?? null,
    });
    console.log(
      `[scheduled-delivery] 已入队补发 user=${userId} → ${targetUserId}（${source}#${sourceId ?? "-"}）`,
    );
  } catch (e) {
    console.error("[scheduled-delivery] 入队补发失败", e);
  }
}

/**
 * 补发某个目标联系人积压的全部内容。
 * 在该联系人主动给 Bot 发消息时调用（此刻 context_token 新鲜，可用 bot.reply）。
 * @param deliver 实际投递回调，抛错则停止并保留剩余队列，等下次再补
 * @returns 成功补发的条数
 */
export async function flushPendingDeliveries(
  userId: string,
  targetUserId: string,
  deliver: (content: string) => Promise<void>,
): Promise<number> {
  let rows: { id: number; content: string }[];
  try {
    rows = await db
      .select({ id: pendingDeliveries.id, content: pendingDeliveries.content })
      .from(pendingDeliveries)
      .where(
        and(
          eq(pendingDeliveries.userId, userId),
          eq(pendingDeliveries.targetUserId, targetUserId),
        ),
      )
      .orderBy(pendingDeliveries.createdAt);
  } catch (e) {
    console.error("[scheduled-delivery] 读取补发队列失败", e);
    return 0;
  }
  if (rows.length === 0) return 0;

  let delivered = 0;
  for (const row of rows) {
    try {
      await deliver(row.content);
      await db
        .delete(pendingDeliveries)
        .where(eq(pendingDeliveries.id, row.id));
      delivered += 1;
    } catch (e) {
      console.warn("[scheduled-delivery] 补发失败，保留队列待下次重试", e);
      break;
    }
  }
  if (delivered > 0) {
    console.log(
      `[scheduled-delivery] 已补发 ${delivered} 条积压内容 → ${targetUserId}`,
    );
  }
  return delivered;
}

/** 清空某用户的全部补发队列（停用 Bot 时调用） */
export async function clearPendingDeliveries(userId: string): Promise<void> {
  try {
    await db
      .delete(pendingDeliveries)
      .where(eq(pendingDeliveries.userId, userId));
  } catch (e) {
    console.warn("[scheduled-delivery] 清空补发队列失败", e);
  }
}
