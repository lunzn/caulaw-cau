/**
 * 时区安全的时间解析与格式化。
 *
 * 背景：容器内进程本地时区不可依赖（曾因容器跑 UTC，导致"早上8点"的提醒
 * 被 `new Date("…T08:00:00")` 按 UTC 解析，北京时间偏移 8 小时）。
 * 本模块所有换算基于 Intl 显式按 APP_TIMEZONE 计算，与进程 TZ 无关。
 */

/** 全站业务时区（提醒、定时任务、教务时间均按此解析/展示） */
export const APP_TIMEZONE = process.env.CRON_TIMEZONE?.trim() || "Asia/Shanghai";

const EXPLICIT_OFFSET_RE = /(?:Z|[+-]\d{2}:?\d{2})\s*$/i;

/** 时间字符串是否带显式时区后缀（Z / +08:00 等） */
export function hasExplicitOffset(input: string): boolean {
  return EXPLICIT_OFFSET_RE.test(input.trim());
}

const WALL_CLOCK_RE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/;

/** 某 IANA 时区在给定时刻相对 UTC 的偏移（毫秒），如 Asia/Shanghai → 28800000 */
export function tzOffsetMs(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const v = (type: string): number =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  const wallAsUtc = Date.UTC(
    v("year"),
    v("month") - 1,
    v("day"),
    v("hour"),
    v("minute"),
    v("second"),
  );
  return wallAsUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/**
 * 把时间字符串解析为绝对时刻：
 *  - 带显式时区后缀（Z / ±hh:mm）→ 按标注解析（DB 回读 toISOString 走此分支）；
 *  - 不带后缀（如 "2026-06-02T08:00:00"、"2026-06-02"）→ 按 timeZone 的墙上时钟解析，
 *    与进程本地时区无关。
 * 解析失败返回 Invalid Date（getTime() 为 NaN）。
 */
export function parseWallClockInTZ(
  input: string,
  timeZone: string = APP_TIMEZONE,
): Date {
  const s = input.trim();
  if (EXPLICIT_OFFSET_RE.test(s)) return new Date(s);
  const m = WALL_CLOCK_RE.exec(s);
  if (!m) return new Date(Number.NaN);
  const wallAsUtc = Date.UTC(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4] ?? "0"),
    Number(m[5] ?? "0"),
    Number(m[6] ?? "0"),
  );
  // 先用墙上时钟近似时刻取偏移，再用修正后的时刻二次取偏移：
  // 固定偏移时区（如 Asia/Shanghai）一轮收敛，DST 时区可正确处理边界
  let utc = wallAsUtc - tzOffsetMs(timeZone, new Date(wallAsUtc));
  utc = wallAsUtc - tzOffsetMs(timeZone, new Date(utc));
  return new Date(utc);
}

const WEEKDAY_ZH = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function wallClockParts(
  at: Date,
  timeZone: string,
): { y: string; mo: string; d: string; h: string; mi: string; s: string; weekday: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
  }).formatToParts(at);
  const v = (type: string): string =>
    parts.find((p) => p.type === type)?.value ?? "";
  const weekdayIdx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    v("weekday"),
  );
  return {
    y: v("year"),
    mo: v("month"),
    d: v("day"),
    h: v("hour"),
    mi: v("minute"),
    s: v("second"),
    weekday: WEEKDAY_ZH[weekdayIdx] ?? "",
  };
}

/** "2026-06-02 08:00（周二）"；withWeekday=false 时省略括号部分 */
export function formatInTZ(
  at: Date | number,
  opts?: { timeZone?: string; weekday?: boolean; seconds?: boolean },
): string {
  const d = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(d.getTime())) return "无效时间";
  const tz = opts?.timeZone ?? APP_TIMEZONE;
  const p = wallClockParts(d, tz);
  const time = opts?.seconds
    ? `${p.h}:${p.mi}:${p.s}`
    : `${p.h}:${p.mi}`;
  const weekday = (opts?.weekday ?? true) && p.weekday ? `（${p.weekday}）` : "";
  return `${p.y}-${p.mo}-${p.d} ${time}${weekday}`;
}

/** "2026-06-02"（按业务时区的日历日期；offsetDays 可取今天±N 天） */
export function dateStringInTZ(
  at: Date | number = Date.now(),
  offsetDays = 0,
  timeZone: string = APP_TIMEZONE,
): string {
  const base = (at instanceof Date ? at.getTime() : at) + offsetDays * 86_400_000;
  const p = wallClockParts(new Date(base), timeZone);
  return `${p.y}-${p.mo}-${p.d}`;
}

/** "周二"（按业务时区） */
export function weekdayInTZ(
  at: Date | number = Date.now(),
  timeZone: string = APP_TIMEZONE,
): string {
  return wallClockParts(
    at instanceof Date ? at : new Date(at),
    timeZone,
  ).weekday;
}
