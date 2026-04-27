/**
 * 服务端新闻缓存预热器
 *
 * 启动时及每隔 25 分钟：
 *   1. 爬取农大头条(ttgznew) + 综合新闻(zhxwnew)
 *   2. 爬取就业服务网就业公告(scc)
 *   3. 把结果写入 .cache/news-snapshot.json，供 quick-news-reply.ts 直接读取
 *
 * 缓存目录与 _cache.py 一致（SKILLS_CACHE_DIR），agent bash 调用 scraper 时也能命中。
 */
import { Cron } from "croner";
import path from "node:path";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

const PROJECT_ROOT = path.resolve(process.cwd());
const SKILLS_ROOT  = path.resolve(PROJECT_ROOT, ".pi", "skills");
export const CACHE_DIR     = path.resolve(PROJECT_ROOT, ".cache", "skills");
export const SNAPSHOT_PATH = path.resolve(PROJECT_ROOT, ".cache", "news-snapshot.json");
const SCRAPER      = path.resolve(SKILLS_ROOT, "cau-news-scraper", "main.py");

export type NewsItem = {
  title: string;
  url: string;
  date: string;
  source: string;
  source_name: string;
  channel: string;
  channel_name: string;
  summary: string | null;
};

export type NewsSnapshot = {
  updated_at: string;
  /** 农大综合新闻 (zhxwnew) */
  cau_news: NewsItem[];
  /** 农大头条 (ttgznew) */
  cau_headline: NewsItem[];
  /** 就业公告 (scc) */
  employment: NewsItem[];
};

function ensureDirs(): void {
  mkdirSync(CACHE_DIR, { recursive: true });
  mkdirSync(path.dirname(SNAPSHOT_PATH), { recursive: true });
}

async function runScraper(args: string[]): Promise<{ items: NewsItem[]; ok: boolean }> {
  try {
    const proc = Bun.spawn(
      ["python3", SCRAPER, ...args],
      {
        env: {
          ...process.env,
          SKILLS_CACHE_DIR: CACHE_DIR,
          PI_SKILLS_ROOT:   SKILLS_ROOT,
        },
        stdout: "pipe",
        stderr: "pipe",
        cwd: path.resolve(SKILLS_ROOT, "cau-news-scraper"),
      },
    );
    const [exitCode, stdout] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
    ]);
    if (exitCode !== 0) {
      const err = await new Response(proc.stderr).text();
      console.warn("[news-warmer] scraper exit", exitCode, err.slice(0, 200));
      return { items: [], ok: false };
    }
    const result = JSON.parse(stdout) as { items?: NewsItem[] };
    return { items: result.items ?? [], ok: true };
  } catch (e) {
    console.error("[news-warmer] scraper spawn error:", e);
    return { items: [], ok: false };
  }
}

async function warmOnce(): Promise<void> {
  ensureDirs();
  const tag = new Date().toISOString().slice(0, 16);
  console.log(`[news-warmer] ${tag} warming...`);
  const t0 = Date.now();

  // 并行爬取：农大新闻（头条+综合）和就业公告
  const [cauResult, sccResult] = await Promise.all([
    runScraper([
      "--sites", "cau_news",
      "--channels", "ttgznew", "zhxwnew",
      "--limit", "10",
      "--no-fetch-content",
    ]),
    runScraper([
      "--sites", "scc",
      "--channels", "6ebab28e72ba46da99a0f2c372b129d7",
      "--limit", "20",
      "--no-fetch-content",
    ]),
  ]);

  const allCau = cauResult.items;
  const snapshot: NewsSnapshot = {
    updated_at: new Date().toISOString(),
    cau_headline: allCau.filter((i) => i.channel === "ttgznew").slice(0, 10),
    cau_news:     allCau.filter((i) => i.channel === "zhxwnew").slice(0, 10),
    employment:   sccResult.items.slice(0, 20),
  };

  try {
    writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2), "utf-8");
  } catch (e) {
    console.error("[news-warmer] write snapshot failed:", e);
  }

  const ms = Date.now() - t0;
  const ok = cauResult.ok || sccResult.ok;
  console.log(
    `[news-warmer] done in ${ms}ms — cau:${allCau.length} scc:${sccResult.items.length}${ok ? "" : " (all failed)"}`,
  );
}

export function startNewsWarmup(): void {
  warmOnce().catch((e) => console.error("[news-warmer] initial warm failed:", e));

  new Cron(
    "*/25 * * * *",
    { protect: true },
    () => warmOnce().catch((e) => console.error("[news-warmer] scheduled warm failed:", e)),
  );

  console.log("[news-warmer] scheduled every 25 min");
}
