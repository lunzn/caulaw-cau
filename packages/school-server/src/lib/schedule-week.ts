/**
 * 学期周次计算 + schedule 字符串解析
 *
 * 学期起始日配置（每学期第1周的周一）：
 *   2025-2026秋季：2025-09-01
 *   2025-2026春季：2026-03-02
 */

const SEMESTER_STARTS: Record<string, string> = {
  "2025-2026秋季": "2025-09-01",
  // 本科生注册日3月1日（周日），第1周从3月9日（周一）起
  "2025-2026春季": "2026-03-09",
};

/** 计算指定日期处于哪个学期的第几周（1-based，不在任何学期则返回 null） */
export function getSemesterWeek(
  semester: string,
  date: Date = new Date(),
): number | null {
  const startStr = SEMESTER_STARTS[semester];
  if (!startStr) return null;

  const start = new Date(startStr);
  const diffMs = date.getTime() - start.getTime();
  if (diffMs < 0) return null;

  const week = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;
  return week;
}

/** 获取今天所处的周次（返回 { semester, week }，取第一个匹配的学期） */
export function getCurrentWeekInfo(): { semester: string; week: number } | null {
  const now = new Date();
  for (const [sem, startStr] of Object.entries(SEMESTER_STARTS)) {
    const start = new Date(startStr);
    const diffMs = now.getTime() - start.getTime();
    if (diffMs < 0) continue;
    const week = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;
    if (week >= 1 && week <= 20) {
      return { semester: sem, week };
    }
  }
  return null;
}

/**
 * 解析周次描述字符串，展开成周次集合。
 * 支持：
 *   "1-12"   → {1,2,...,12}
 *   "2-3、5-12" → {2,3,5,6,...,12}
 *   "2-10、12、14" → {2,...,10,12,14}
 */
function expandWeekRanges(rangeStr: string): Set<number> {
  const weeks = new Set<number>();
  const parts = rangeStr.split(/[、,，\s]+/);
  for (const part of parts) {
    const trimmed = part.trim();
    const rangeMatch = trimmed.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      for (let w = start; w <= end; w++) weeks.add(w);
    } else if (/^\d+$/.test(trimmed)) {
      weeks.add(parseInt(trimmed, 10));
    }
  }
  return weeks;
}

/**
 * 判断 schedule 字符串在第 week 周是否有课。
 * - 无任何周次标注（如老式格式）→ 视为全程有效
 * - 有标注时只要有一个时间段的周次覆盖 week 即返回 true
 */
export function isScheduleActiveInWeek(
  schedule: string | null | undefined,
  week: number,
): boolean {
  if (!schedule) return true;

  // 提取所有 "第X周" / "第X-Y周" / "第X、Y-Z周" 模式
  const specifiers = [...schedule.matchAll(/第([0-9\-、,，\s]+)周/g)];
  if (specifiers.length === 0) return true; // 无限定 → 全程有效

  for (const m of specifiers) {
    if (expandWeekRanges(m[1]).has(week)) return true;
  }
  return false;
}

/**
 * 从 schedule 字符串中提取本周有效的时间段（供展示用）。
 * 每个"段"以双空格或行首分隔，例：
 *   "周三 08:00-09:50（第1-4周）  周一 14:00-15:50（第1-4周）  周一 14:00-18:00实验（第5-6周）"
 * 在第3周返回前两段，在第6周只返回第三段。
 */
export function getActiveSessionsInWeek(
  schedule: string | null | undefined,
  week: number,
): string {
  if (!schedule) return "";

  const segments = schedule.split(/\s{2,}/).map((s) => s.trim()).filter(Boolean);
  if (segments.length === 0) return schedule;

  // 如果整个字符串没有任何周次限定，直接原样返回
  if (!/第[0-9]/.test(schedule)) return schedule;

  const active = segments.filter((seg) => {
    const specifiers = [...seg.matchAll(/第([0-9\-、,，\s]+)周/g)];
    if (specifiers.length === 0) return true; // 本段无限定 → 有效
    return specifiers.some((m) => expandWeekRanges(m[1]).has(week));
  });

  return active.join("  ");
}
