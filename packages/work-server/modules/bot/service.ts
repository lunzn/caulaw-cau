import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { WeChatBot, type Credentials } from "@wechatbot/wechatbot";
import { eq } from "drizzle-orm";
import { wechatStorageBase } from "@/lib/wechat-storage";
import { db } from "@/lib/db";
import { wechatBotAutostart } from "@cau-claw/db";
import { agentService } from "@/modules/agent/service";
import { cronService } from "@/modules/cron/service";
import { reminderService } from "@/modules/reminder/service";
import type { BotStatusPayload } from "@/lib/bot/types";

export type BotStatus = "idle" | "waiting_scan" | "online" | "error";

interface BotEntry {
  bot: WeChatBot;
  status: BotStatus;
  qrUrl?: string;
  credentials?: Credentials;
  error?: string;
}

function removeUserWechatStorage(userId: string): void {
  const dir = path.join(wechatStorageBase(), userId);
  try {
    if (!existsSync(dir)) return;
    rmSync(dir, { recursive: true, force: true });
    console.log(`[bot user:${userId}] 已删除本地凭据目录: ${dir}`);
  } catch (e) {
    console.warn(`[bot user:${userId}] 删除凭据目录失败: ${dir}`, e);
  }
}

/**
 * 从本地目录发现已有 credentials.json 的用户，补全 autostart 表。
 */
async function seedAutostartFromCredentialFiles(): Promise<number> {
  const base = wechatStorageBase();
  let n = 0;
  let names: string[];
  try {
    names = readdirSync(base);
  } catch {
    return 0;
  }
  for (const name of names) {
    const credPath = path.join(base, name, "credentials.json");
    if (!existsSync(credPath)) continue;
    try {
      await db
        .insert(wechatBotAutostart)
        .values({ userId: name, updatedAt: new Date() })
        .onConflictDoNothing();
      n++;
    } catch {
      /* FK：无对应 user */
    }
  }
  if (n) {
    console.log(`[bot] 已从本地凭据目录补全 ${n} 条自动恢复标记`);
  }
  return n;
}

/** 从本地 credentials.json 读取微信号（SDK 落地文件名），用于内存里尚未带齐字段时的展示兜底 */
function readStoredAccountId(userId: string): string | undefined {
  const credPath = path.join(wechatStorageBase(), userId, "credentials.json");
  if (!existsSync(credPath)) return undefined;
  try {
    const raw = readFileSync(credPath, "utf8");
    const parsed = JSON.parse(raw) as { accountId?: unknown };
    return typeof parsed.accountId === "string" ? parsed.accountId : undefined;
  } catch {
    return undefined;
  }
}

export class BotService {
  private bots = new Map<string, BotEntry>();
  /** 与 `wechat_bot_autostart` 同步，供仪表盘展示「自动恢复」 */
  private autostartCache = new Map<string, boolean>();
  /** 同步互斥：同一 userId 上并发 `startBot`（双 SSE、ensure+restore 竞态）只跑一条连接流程 */
  private pendingBotStart = new Set<string>();

  // ── 启动门控：init 恢复完成前阻塞懒启动与状态查询 ──────────────────

  private _restoreDone = false;
  private _restoreResolve: (() => void) | undefined;
  /**
   * 进程启动时 `restorePersistedBots()` 完成（或失败）后 resolve。
   * API 路由调用 `awaitRestore()` 后再做懒启动，避免与 init 竞态。
   */
  readonly afterRestore = new Promise<void>((res) => {
    this._restoreResolve = res;
  });

  /** 由 `restorePersistedBots` 的 finally 调用（独立 worker 进程）。 */
  signalRestoreComplete(): void {
    if (this._restoreDone) return;
    this._restoreDone = true;
    this._restoreResolve?.();
  }

  /**
   * 等待 `restorePersistedBots` 完成，随后若本地存有凭据且进程内还无该用户 Bot，
   * 则触发懒启动（冷启动/新 worker 场景的兜底）。
   */
  async ensureStarted(userId: string): Promise<void> {
    await this.afterRestore;
    if (!this.hasLocalCredentials(userId)) return;
    if (this.bots.has(userId)) return;
    this.startBot(userId);
  }

  getStatus(userId: string): BotStatusPayload {
    const autostart =
      this.autostartCache.get(userId) === true ||
      this.hasLocalCredentials(userId);
    const entry = this.bots.get(userId);
    if (!entry) {
      return { status: "idle" as BotStatus, autostart };
    }
    let accountId = entry.credentials?.accountId;
    if (!accountId && entry.status === "online") {
      const fromDisk = readStoredAccountId(userId);
      if (fromDisk) {
        accountId = fromDisk;
        if (entry.credentials) {
          entry.credentials = { ...entry.credentials, accountId: fromDisk };
        }
      }
    }
    return {
      status: entry.status,
      qrUrl: entry.qrUrl,
      accountId,
      error: entry.error,
      autostart,
    };
  }

  private async persistAutostart(userId: string): Promise<void> {
    try {
      await db
        .insert(wechatBotAutostart)
        .values({ userId, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: wechatBotAutostart.userId,
          set: { updatedAt: new Date() },
        });
      this.autostartCache.set(userId, true);
    } catch (e) {
      console.warn(`[bot] 写入 wechat_bot_autostart 失败 user ${userId}`, e);
    }
  }

  getBot(userId: string): WeChatBot | undefined {
    return this.bots.get(userId)?.bot;
  }

  isOnline(userId: string): boolean {
    return this.bots.get(userId)?.status === "online";
  }

  startBot(
    userId: string,
    opts?: { force?: boolean },
  ): { ok: true } | { error: string } {
    const existing = this.bots.get(userId);
    if (existing?.status === "online") {
      return { ok: true };
    }
    if (existing?.status === "waiting_scan") {
      return { ok: true };
    }

    if (opts?.force) {
      this.pendingBotStart.delete(userId);
    } else if (this.pendingBotStart.has(userId)) {
      return { ok: true };
    }
    this.pendingBotStart.add(userId);

    existing?.bot.stop();

    const base = wechatStorageBase();

    let bot: WeChatBot;
    try {
      bot = new WeChatBot({
      storage: "file",
      storageDir: `${base}/${userId}`,
      logLevel: (process.env.WECHATBOT_LOG_LEVEL as "debug" | "info" | "warn" | "error") ?? "info",
    });
    } catch (e) {
      this.pendingBotStart.delete(userId);
      throw e;
    }

    const entry: BotEntry = { bot, status: "idle" };
    this.bots.set(userId, entry);

    void (async () => {
      try {
        const creds = await bot.login({
          callbacks: {
            onQrUrl: (url) => {
              entry.qrUrl = url;
              entry.status = "waiting_scan";
              console.log(`[bot user:${userId}] QR: ${url}`);
            },
            onScanned: () => {
              console.log(`[bot user:${userId}] 已扫码，等待确认`);
            },
            onExpired: () => {
              console.log(`[bot user:${userId}] 二维码过期`);
            },
          },
        });

        // 并发再次 startBot 时，新实例会替换 map；本段若继续挂 handler/start，会与旧/新实例叠成两条轮询或双 onMessage。
        if (this.bots.get(userId)?.bot !== bot) {
          console.log(
            `[bot user:${userId}] 已跳过过期登录流程（已被新的连接请求替换）`,
          );
          return;
        }

        entry.credentials = creds;
        entry.status = "online";
        entry.qrUrl = undefined;
        await this.persistAutostart(userId);
        console.log(`[bot user:${userId}] 已上线: ${creds.accountId}`);

        bot.on("session:expired", async () => {
          console.warn(`[bot user:${userId}] 会话过期，自动重连...`);
          entry.status = "waiting_scan";
        });

        bot.on("session:restored", async (c) => {
          entry.credentials = c;
          entry.status = "online";
          await this.persistAutostart(userId);
          console.log(`[bot user:${userId}] 已重连: ${c.accountId}`);
        });

        bot.on("error", (err) => {
          console.error(`[bot user:${userId}] error:`, err);
        });

        // SDK 的 onMessage 为 push；解绑再绑或重复连接时须避免同一实例上挂多个 handler。
        const sink = bot as unknown as { messageHandlers?: unknown[] };
        if (Array.isArray(sink.messageHandlers)) {
          sink.messageHandlers.length = 0;
        }

        bot.onMessage((msg) => {
          if (this.bots.get(userId)?.bot !== bot) return;
          agentService.enqueue(userId, () =>
            agentService.handleWechatMessage(userId, bot, msg),
          );
        });

        if (this.bots.get(userId)?.bot !== bot) {
          return;
        }

        bot.start().catch((err) => {
          entry.status = "error";
          entry.error = err instanceof Error ? err.message : String(err);
          console.error(`[bot user:${userId}] polling error:`, err);
        });
      } catch (err) {
        if (this.bots.get(userId)?.bot !== bot) {
          return;
        }
        entry.status = "error";
        entry.error = err instanceof Error ? err.message : String(err);
        console.error(`[bot user:${userId}] login error:`, err);
      } finally {
        this.pendingBotStart.delete(userId);
      }
    })();

    return { ok: true };
  }

  private hasLocalCredentials(userId: string): boolean {
    return existsSync(
      path.join(wechatStorageBase(), userId, "credentials.json"),
    );
  }

  async restorePersistedBots(): Promise<void> {
    try {
      await seedAutostartFromCredentialFiles();
      const rows = await db
        .select({ userId: wechatBotAutostart.userId })
        .from(wechatBotAutostart);
      this.autostartCache.clear();
      for (const { userId } of rows) {
        this.autostartCache.set(userId, true);
      }
      let started = 0;
      for (const { userId } of rows) {
        if (!this.hasLocalCredentials(userId)) {
          console.log(
            `[bot user:${userId}] 跳过自动连接：本地无凭据，需用户手动扫码`,
          );
          continue;
        }
        this.startBot(userId);
        started++;
      }
      console.log(
        `[bot] 已发起 ${started} 个微信 Bot 自动连接（凭本地存储的 credentials）`,
      );
    } finally {
      this.signalRestoreComplete();
    }
  }

  async stopBot(userId: string): Promise<void> {
    this.pendingBotStart.delete(userId);
    const entry = this.bots.get(userId);
    if (entry) {
      entry.bot.stop();
      this.bots.delete(userId);
    }
    try {
      await db
        .delete(wechatBotAutostart)
        .where(eq(wechatBotAutostart.userId, userId));
    } catch {
      /* ignore */
    }
    this.autostartCache.delete(userId);
    removeUserWechatStorage(userId);
    await cronService.removeAllByUser(userId);
    await reminderService.removeAllByUser(userId);
    await agentService.remove(userId);
    console.log(`[bot user:${userId}] 已停止并清除凭据、定时任务、提醒、对话`);
  }
}

export const botService = new BotService();
