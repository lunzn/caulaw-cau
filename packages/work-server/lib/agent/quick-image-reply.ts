/**
 * 快速模式匹配回复：课程表 / 食堂时间 / 校医院时间 / 班车时间
 * 直接发送预构建图片，不经过 AI，保证 2s 内完成响应。
 *
 * 注意：复杂决策性查询（如"什么时候去校医院不耽误上课"）不在此处处理，
 * 应交由 AI + schedule-check.py 综合分析。
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import type { WeChatBot, IncomingMessage } from "@wechatbot/wechatbot";

const ASSETS_DIR = path.resolve(process.cwd(), "assets");

function loadAsset(name: string): Buffer | null {
  const p = path.join(ASSETS_DIR, name);
  if (!existsSync(p)) {
    console.warn(`[quick-image-reply] 图片文件不存在: ${p}`);
    return null;
  }
  return readFileSync(p);
}

// 预加载图片到内存，避免每次 I/O
const IMAGE_CACHE = new Map<string, Buffer>();

function getImage(name: string): Buffer | null {
  if (!IMAGE_CACHE.has(name)) {
    const buf = loadAsset(name);
    if (buf) IMAGE_CACHE.set(name, buf);
    return buf;
  }
  return IMAGE_CACHE.get(name)!;
}

/**
 * 复杂决策性查询特征：含这些词且消息较长 → 跳过图片，交 AI 综合分析。
 * 典型场景："我最近胃不舒服，想去校医院，不想耽误上课，该什么时候去？"
 */
const COMPLEX_RE =
  /什么时候|该.*去|帮我.*安排|耽误|合适|不想.*[上耽]|想去.*但|建议.*时间|几点.*比较|最好|沙龙|跨校区|计划/;

function isComplexQuery(text: string): boolean {
  // 超过 20 字且含决策词，视为综合决策类问题，不用图片快答
  return text.length > 20 && COMPLEX_RE.test(text);
}

type Rule = {
  patterns: RegExp[];
  asset: string;
  fallbackText: string;
};

const RULES: Rule[] = [
  {
    // 课程表：仅匹配明确课程表查询，不含泛化的"上课"（避免与校医院冲突）
    patterns: [
      /课[程表]|课表|这周.*课|本周.*课|我的课|今天.*课|明天.*课/,
    ],
    asset: "course-schedule.png",
    fallbackText: "课程表图片暂时无法加载，请稍后重试。",
  },
  {
    patterns: [
      /食堂|吃饭|开饭|营业|几点.*饭|饭.*几点|饮食|伙食/,
    ],
    asset: "cafeteria-hours.png",
    fallbackText: "食堂时间图片暂时无法加载，请稍后重试。",
  },
  {
    // 校医院：仅单纯询问时间/科室的简单查询，复杂决策查询由 schedule-check.py 处理
    patterns: [
      /校医院|医院.*时间|出诊|门诊|急诊.*时间|医院.*几点|几点.*医院|卫生.*时间|看病.*时间/,
    ],
    asset: "clinic-hours.png",
    fallbackText: "校医院时间图片暂时无法加载，请稍后重试。",
  },
  {
    patterns: [
      /班车|校车|东西.*车|西东.*车|几点.*车|车.*几点|发车|通勤/,
    ],
    asset: "bus-schedule.png",
    fallbackText: "班车时刻图片暂时无法加载，请稍后重试。",
  },
];

/**
 * 尝试快速图片回复。
 * @returns true 表示已处理（调用者应 return），false 表示未匹配（继续走 AI）
 */
export async function quickImageReply(
  bot: WeChatBot,
  msg: IncomingMessage,
  text: string,
  identity?: { role: string } | null,
): Promise<boolean> {
  if (!text) return false;

  // 教师询问课程表 → 跳过图片，让 AI 输出文字（在 service.ts 层已处理）
  // 复杂决策查询 → 跳过图片，交 AI + skill 处理
  if (isComplexQuery(text)) return false;

  for (const rule of RULES) {
    // 课程表图片只发给明确绑定为学生的用户；
    // 教师或未绑定用户（identity 为 null）均跳过，交 AI 输出文字课表。
    if (rule.asset === "course-schedule.png" && identity?.role !== "student") {
      continue;
    }

    const matched = rule.patterns.some((p) => p.test(text));
    if (!matched) continue;

    const buf = getImage(rule.asset);
    if (!buf) {
      await bot.reply(msg, rule.fallbackText);
      return true;
    }

    try {
      await bot.reply(msg, { image: buf });
    } catch (e) {
      console.error(`[quick-image-reply] 图片发送失败 ${rule.asset}:`, e);
      await bot.reply(msg, rule.fallbackText);
    }
    return true;
  }

  return false;
}
