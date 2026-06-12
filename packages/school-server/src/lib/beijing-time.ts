/**
 * 北京时间（UTC+8）日期工具。
 *
 * 不依赖进程 TZ：容器若跑 UTC，北京 0–8 点之间 `toISOString()` 会取到"昨天"，
 * 导致今日菜单/座位日期/出诊排班错一天。中国无夏令时，固定 +8 即准确。
 */
const BJ_OFFSET_MS = 8 * 3600_000;

/** 北京时间的日期串 "YYYY-MM-DD"（offsetDays 取今天 ±N 天） */
export function beijingDateString(offsetDays = 0): string {
  return new Date(Date.now() + BJ_OFFSET_MS + offsetDays * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** 北京时间今天是周几（1=周一…7=周日） */
export function beijingWeekday(): number {
  const d = new Date(Date.now() + BJ_OFFSET_MS).getUTCDay(); // 0=Sunday
  return d === 0 ? 7 : d;
}

/** 北京时间第 N 天（可为负）23:59:00 的 epoch 秒；作业截止时间用，避免出现凌晨钟点 */
export function beijingEndOfDay(daysFromNow: number): number {
  const nowBj = Date.now() + BJ_OFFSET_MS;
  const bjMidnightUtcMs =
    Math.floor(nowBj / 86_400_000) * 86_400_000 - BJ_OFFSET_MS;
  return Math.floor(
    (bjMidnightUtcMs + daysFromNow * 86_400_000 + (23 * 3600 + 59 * 60) * 1000) /
      1000,
  );
}
