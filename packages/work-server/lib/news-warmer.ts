/**
 * 服务端新闻缓存预热器
 *
 * 在服务启动时及每隔 25 分钟调用 cau-news-scraper，把结果写入磁盘缓存。
 * 同时将格式化后的 NewsSnapshot 写入 .cache/news-snapshot.json，
 * 供 quick-news-reply.ts 直接读取（绕过 AI 推理，低延迟输出）。
 */
import { Cron } from "croner";
import path from "node:path";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

const PROJECT_ROOT = path.resolve(process.cwd());
const SKILLS_ROOT  = path.resolve(PROJECT_ROOT, ".pi", "skills");
const CACHE_DIR    = path.resolve(PROJECT_ROOT, ".cache", "skills");
const SCRAPER      = path.resolve(SKILLS_ROOT, "cau-news-scraper", "main.py");

/** quick-news-reply 读取的结构化快照路径 */
export const SNAPSHOT_PATH = path.resolve(PROJECT_ROOT, ".cache", "news-snapshot.json");

export type NewsItem = {
  title: string;
  url: string;
  date: string;
  source: string;
  channel: string;
};

export type NewsSnapshot = {
  updated_at: string;          // ISO 8601
  cau_news: NewsItem[];        // zhxwnew - 综合新闻
  cau_headline: NewsItem[];    // ttgznew - 头条关注
  employment: NewsItem[];      // scc 就业公告
};

function ensureDirs(): void {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  const snapshotDir = path.dirname(SNAPSHOT_PATH);
  if (!existsSync(snapshotDir)) mkdirSync(snapshotDir, { recursive: true });
}

type RawItem = {
  title?: string;
  url?: string;
  date?: string;
  source?: string;
  channel?: string;
  [key: string]: unknown;
};

async function runScraper(args: string[]): Promise<NewsItem[]> {
  const proc = Bun.spawn(
    ["python3", SCRAPER, "--limit", "15", "--no-fetch-content", ...args],
    {
      env: { ...process.env, SKILLS_CACHE_DIR: CACHE_DIR, PI_SKILLS_ROOT: SKILLS_ROOT },
      stdout: "pipe",
      stderr: "pipe",
      cwd: path.resolve(SKILLS_ROOT, "cau-news-scraper"),
    },
  );

  const [exitCode, rawOut] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
  ]);

  if (exitCode !== 0) {
    const errText = await new Response(proc.stderr).text();
    throw new Error(`scraper exit ${exitCode}: ${errText.slice(0, 300)}`);
  }

  try {
    const raw = JSON.parse(rawOut);
    // 爬虫返回 { success, items: [...] } 或直接是数组
    const list: RawItem[] = Array.isArray(raw) ? raw : (Array.isArray(raw?.items) ? raw.items : []);
    return list.map((item) => ({
      title:   String(item.title   ?? "").trim(),
      url:     String(item.url     ?? "").trim(),
      date:    String(item.date    ?? "").trim(),
      source:  String(item.source  ?? "").trim(),
      channel: String(item.channel ?? "").trim(),
    }));
  } catch {
    return [];
  }
}

async function warmOnce(): Promise<void> {
  ensureDirs();
  const tag = new Date().toISOString().slice(0, 16);
  console.log(`[news-warmer] ${tag} warming...`);
  const t0 = Date.now();

  try {
    const [cauResults, sccResults] = await Promise.all([
      runScraper(["--sites", "cau_news", "--channels", "ttgznew", "zhxwnew"]),
      runScraper(["--sites", "scc", "--channels", "6ebab28e72ba46da99a0f2c372b129d7"]),
    ]);

    const snapshot: NewsSnapshot = {
      updated_at:    new Date().toISOString(),
      cau_headline:  cauResults.filter((i) => i.channel === "ttgznew"),
      cau_news:      cauResults.filter((i) => i.channel === "zhxwnew"),
      employment:    sccResults,
    };

    writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2), "utf-8");
    const ms = Date.now() - t0;
    console.log(
      `[news-warmer] done in ${ms}ms ` +
      `(头条:${snapshot.cau_headline.length} 综合:${snapshot.cau_news.length} 就业:${snapshot.employment.length})`,
    );
  } catch (e) {
    console.error("[news-warmer] warm error:", e);
  }
}

/**
 * 启动预热服务：
 * - 立即执行一次（不阻塞启动流程）
 * - 之后每 25 分钟执行一次（低于 30 分钟的 TTL，保持缓存始终有效）
 */
export function startNewsWarmup(): void {
  warmOnce().catch((e) => console.error("[news-warmer] initial warm failed:", e));
  new Cron(
    "*/25 * * * *",
    { protect: true },
    () => warmOnce().catch((e) => console.error("[news-warmer] scheduled warm failed:", e)),
  );
  console.log("[news-warmer] scheduled every 25 min (snapshot → .cache/news-snapshot.json)");
}
