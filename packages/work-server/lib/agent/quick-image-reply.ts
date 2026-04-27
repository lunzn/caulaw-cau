/**
 * 快速模式匹配回复：课程表 / 食堂时间 / 校医院时间 / 班车时间
 * 直接发送预构建图片，不经过 AI，保证 2s 内完成响应。
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

type Rule = {
  patterns: RegExp[];
  asset: string;
  fallbackText: string;
};

const RULES: Rule[] = [
  {
    patterns: [
      /课[程表]|课表|今天.*课|明天.*课|这周.*课|本周.*课|我的课|上课/,
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
    patterns: [
      /校医院|医院.*时间|出诊|门诊|急诊.*时间|医院.*几点|几点.*医院|卫生|看病.*时间/,
    ],
    asset: "clinic-hours.png",
    fallbackText: "校医院时间图片暂时无法加载，请稍后重试。",
  },
  {
    patterns: [
      /班车|校车|东西.*车|西东.*车|几点.*车|车.*几点|发车|通勤|去西校区|去东校区/,
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
): Promise<boolean> {
  if (!text) return false;

  for (const rule of RULES) {
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
