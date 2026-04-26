/**
 * 服务端新闻缓存预热器
 *
 * 在服务启动时及每隔 25 分钟调用 cau-news-scraper，把结果写入磁盘缓存
 * （SKILLS_CACHE_DIR = <project>/.cache/skills，缓存 TTL 30 分钟）。
 *
 * 这样当用户问"最新新闻"时，agent 调用同一个 scraper 脚本，会直接命中
 * 缓存返回结果，延迟从 30-60 秒降至 < 3 秒。
 */
import { Cron } from "croner";
import path from "node:path";
import { existsSync, mkdirSync } from "node:fs";

const PROJECT_ROOT = path.resolve(process.cwd());
const SKILLS_ROOT  = path.resolve(PROJECT_ROOT, ".pi", "skills");
const CACHE_DIR    = path.resolve(PROJECT_ROOT, ".cache", "skills");
const SCRAPER      = path.resolve(SKILLS_ROOT, "cau-news-scraper", "main.py");

/** 确保缓存目录存在（Python _cache.py 也会自建，这里只是提前保障） */
function ensureCacheDir(): void {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}

/**
 * 执行一次预热：
 *   1. 抓取 CAU 新闻 + 信电学院公告（不抓正文，速度快）
 * 用同样的参数运行，所以 agent 查询时 run_key 完全命中。
 */
async function warmOnce(): Promise<void> {
  ensureCacheDir();

  const tag = new Date().toISOString().slice(0, 16);
  console.log(`[news-warmer] ${tag} warming...`);
  const t0 = Date.now();

  try {
    const proc = Bun.spawn(
      [
        "python3", SCRAPER,
        "--sites", "cau_news", "ciee",
        "--no-fetch-content",
        "--limit", "10",
      ],
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

    const exitCode = await proc.exited;
    const ms = Date.now() - t0;

    if (exitCode === 0) {
      console.log(`[news-warmer] done in ${ms}ms`);
    } else {
      const errText = await new Response(proc.stderr).text();
      console.warn(`[news-warmer] exit ${exitCode} in ${ms}ms: ${errText.slice(0, 300)}`);
    }
  } catch (e) {
    console.error("[news-warmer] spawn error:", e);
  }
}

/**
 * 启动预热服务：
 * - 立即执行一次（不阻塞启动流程）
 * - 之后每 25 分钟执行一次（低于 30 分钟的 TTL，保持缓存始终有效）
 */
export function startNewsWarmup(): void {
  // 异步立即预热，不阻塞服务启动
  warmOnce().catch((e) => console.error("[news-warmer] initial warm failed:", e));

  new Cron(
    "*/25 * * * *",
    { protect: true },   // 若上一次还未完成则跳过本次
    () => warmOnce().catch((e) => console.error("[news-warmer] scheduled warm failed:", e)),
  );

  console.log("[news-warmer] scheduled every 25 min (cache TTL=30 min)");
}
