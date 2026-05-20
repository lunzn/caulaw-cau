/**
 * 快速新闻回复：关键词匹配后直接从 news-snapshot.json 缓存读取，不走 AI。
 *
 * 匹配设计（重点：避免误触）：
 *   1. 数字快捷指令「9」→ 农大头条 + 综合新闻（最优先，绕过下面所有过滤）
 *   2. 先排除"机制/设置类"问法（怎么订阅、能不能定时推送、关掉…）→ 交 AI
 *   3. 只拦截缓存里确实有的三类：农大综合新闻 / 农大头条 / 就业公告
 *   4. "信电学院公告 / 院系通知"等缓存里没有的内容 → 交 AI 走爬虫
 *   5. 偏长句（>10 字）必须含明确意图词（查/看/最新/今天…）才拦截，
 *      纯叙述/吐槽句（如"我觉得农大新闻报道不及时"）不拦截
 *
 * 这样"今天的新闻""农大新闻""头条"等会瞬间命中缓存，
 * 而"我的就业前景如何""新闻怎么订阅"等不会被误触。
 */
import { existsSync, readFileSync } from "node:fs";
import type { WeChatBot, IncomingMessage } from "@wechatbot/wechatbot";
import { SNAPSHOT_PATH, type NewsSnapshot, type NewsItem } from "@/lib/news-warmer";

/** 机制/设置类问法：含这些词说明用户问"功能怎么用 / 推送设置"，不是"给我看新闻" */
const NEGATIVE_RE =
  /怎么|如何|为什么|啥意思|什么意思|订阅|推送|定时|设置|关掉|关闭|取消|别(再)?发|不要发|停止|教程|靠谱吗|准不准|准吗/;

/** 缓存里没有的内容（学院 / 院系级通知）→ 交 AI 走爬虫 */
const NOT_CACHED_RE = /信电|学院公告|学院通知|院系|系里|院里|班级|班委/;

/** 头条 / 学校官方公告 */
const HEADLINE_RE = /头条|校园头条|学校公告|官网公告|学校通知/;
/** 就业公告（注意：不匹配裸"就业""实习"，避免"我的就业前景"被误触） */
const EMPLOYMENT_RE =
  /就业公告|就业信息|就业资讯|招聘信息|招聘公告|招聘会|求职信息|实习招聘/;
/** 农大综合新闻（含"今天的新闻"等时间限定写法） */
const CAU_NEWS_RE =
  /农大新闻|学校新闻|校园新闻|综合新闻|最新新闻|今日新闻|今天.{0,6}新闻|新闻资讯|学校.{0,4}动态|cau ?news/i;
/** 短消息兜底：纯"新闻 / 要闻 / 资讯" */
const GENERIC_NEWS_RE = /新闻|要闻|资讯/;
/** 明确的"要看新闻"意图词，用于长句二次确认 */
const INTENT_RE =
  /查|看|来点?|发我?|给我|获取|有(没有|什么|啥)|最新|今天|今日|最近|更新|播报/;

type Category = "digit9" | "headline" | "employment" | "cau";

/** 判断消息属于哪一类新闻请求；返回 null 表示不拦截（交 AI 处理） */
function detectCategory(text: string): Category | null {
  const compact = text.replace(/\s/g, "");

  // 数字快捷指令「9」最优先
  if (/^9[.、。]*$/.test(compact)) return "digit9";

  if (NEGATIVE_RE.test(text)) return null;
  if (NOT_CACHED_RE.test(text)) return null;

  let category: Exclude<Category, "digit9"> | null = null;
  if (EMPLOYMENT_RE.test(text)) category = "employment";
  else if (HEADLINE_RE.test(text)) category = "headline";
  else if (CAU_NEWS_RE.test(text)) category = "cau";
  else if (GENERIC_NEWS_RE.test(text) && compact.length <= 12) category = "cau";

  if (!category) return null;

  // 偏长的句子（>10 字）必须含明确意图词，否则多半只是闲聊/吐槽里提到"新闻"
  // 例："我觉得农大新闻报道不及时" 含「农大新闻」但无意图词 → 不拦截，交 AI
  if (compact.length > 10 && !INTENT_RE.test(text)) return null;

  return category;
}

function loadSnapshot(): NewsSnapshot | null {
  if (!existsSync(SNAPSHOT_PATH)) return null;
  try {
    return JSON.parse(readFileSync(SNAPSHOT_PATH, "utf-8")) as NewsSnapshot;
  } catch {
    return null;
  }
}

function formatItems(items: NewsItem[], title: string, limit = 10): string {
  if (items.length === 0) {
    return `${title}\n\n暂无数据，缓存可能尚未预热，请稍后再试。`;
  }
  const lines = items
    .slice(0, limit)
    .map((item, i) => `${i + 1}. ${item.title}\n${item.url}`);
  const footer =
    items.length > limit ? `\n共 ${items.length} 条，回复「更多」查看更多` : "";
  return `${title}\n\n${lines.join("\n\n")}${footer}`;
}

function ageLabel(updatedAt: string): string {
  const min = Math.round((Date.now() - new Date(updatedAt).getTime()) / 60_000);
  if (min < 2) return "刚刚更新";
  if (min < 60) return `${min}分钟前更新`;
  return `${Math.round(min / 60)}小时前更新`;
}

export async function quickNewsReply(
  bot: WeChatBot,
  msg: IncomingMessage,
  text: string,
): Promise<boolean> {
  const category = detectCategory(text.trim());
  if (!category) return false;

  const snap = loadSnapshot();
  const age = snap ? `（${ageLabel(snap.updated_at)}）` : "";

  let reply: string;
  if (category === "digit9") {
    // 数字「9」：农大头条 + 综合新闻各 5 条
    const headline = formatItems(
      snap?.cau_headline ?? [],
      `【农大头条】最新 5 条${age}`,
      5,
    );
    const news = formatItems(snap?.cau_news ?? [], "【农大综合新闻】最新 5 条", 5);
    reply = `${headline}\n\n${news}`;
  } else if (category === "employment") {
    reply = formatItems(snap?.employment ?? [], `【就业公告】最新 10 条${age}`);
  } else if (category === "headline") {
    reply = formatItems(snap?.cau_headline ?? [], `【农大头条】最新 10 条${age}`);
  } else {
    reply = formatItems(snap?.cau_news ?? [], `【农大综合新闻】最新 10 条${age}`);
  }

  await bot.reply(msg, reply);
  return true;
}
