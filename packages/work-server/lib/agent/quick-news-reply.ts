/**
 * 快速新闻回复：关键词匹配后直接从 news-snapshot.json 缓存读取，不走 AI。
 *
 * 触发关键词：
 *   农大新闻 / 综合新闻 / 最新新闻   → 综合新闻 (zhxwnew)
 *   头条 / 农大头条                  → 头条关注 (ttgznew)
 *   就业 / 招聘 / 求职 / 就业公告    → 就业公告 (scc)
 */
import { existsSync, readFileSync } from "node:fs";
import type { WeChatBot, IncomingMessage } from "@wechatbot/wechatbot";
import { SNAPSHOT_PATH, type NewsSnapshot, type NewsItem } from "@/lib/news-warmer";

const CAU_NEWS_RE    = /农大新闻|综合新闻|学校新闻|最新新闻|cau news/i;
const HEADLINE_RE    = /头条|农大头条/i;
const EMPLOYMENT_RE  = /就业|招聘|求职|就业公告|offer|实习/i;

function loadSnapshot(): NewsSnapshot | null {
  if (!existsSync(SNAPSHOT_PATH)) return null;
  try {
    const raw = readFileSync(SNAPSHOT_PATH, "utf-8");
    return JSON.parse(raw) as NewsSnapshot;
  } catch {
    return null;
  }
}

function formatItems(items: NewsItem[], title: string, limit = 5): string {
  if (items.length === 0) {
    return `${title}\n\n暂无数据，缓存可能尚未预热，请稍后再试。`;
  }
  const shown = items.slice(0, limit);
  const lines = shown.map(
    (item, i) => `${i + 1}. ${item.title}\n${item.url}`,
  );
  const footer = items.length > limit
    ? `\n共 ${items.length} 条，回复「更多」查看更多`
    : "";
  return `${title}\n\n${lines.join("\n\n")}${footer}`;
}

function ageLabel(updatedAt: string): string {
  const ms = Date.now() - new Date(updatedAt).getTime();
  const min = Math.round(ms / 60_000);
  if (min < 2) return "刚刚更新";
  if (min < 60) return `${min}分钟前更新`;
  const h = Math.round(min / 60);
  return `${h}小时前更新`;
}

export async function quickNewsReply(
  bot: WeChatBot,
  msg: IncomingMessage,
  text: string,
): Promise<boolean> {
  const isHeadline   = HEADLINE_RE.test(text);
  const isCauNews    = !isHeadline && CAU_NEWS_RE.test(text);
  const isEmployment = EMPLOYMENT_RE.test(text);

  if (!isHeadline && !isCauNews && !isEmployment) return false;

  const snap = loadSnapshot();
  const age  = snap ? `（${ageLabel(snap.updated_at)}）` : "";

  let reply: string;

  if (isHeadline) {
    const items = snap?.cau_headline ?? [];
    reply = formatItems(items, `【农大头条】最新 5 条${age}`);
  } else if (isCauNews) {
    const items = snap?.cau_news ?? [];
    reply = formatItems(items, `【农大综合新闻】最新 5 条${age}`);
  } else {
    const items = snap?.employment ?? [];
    reply = formatItems(items, `【就业公告】最新 5 条${age}`);
  }

  await bot.reply(msg, reply);
  return true;
}
