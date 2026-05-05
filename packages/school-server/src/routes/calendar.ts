import { Elysia } from "elysia";
import { getCurrentWeekInfo, getSemesterWeek } from "../lib/schedule-week";

export const calendarRoutes = new Elysia({ prefix: "/calendar" })
  .get("/current-week", () => {
    const info = getCurrentWeekInfo();
    if (!info) {
      return { success: true, data: { in_semester: false, week: null, semester: null } };
    }
    return {
      success: true,
      data: { in_semester: true, week: info.week, semester: info.semester },
    };
  })
  .get("/week-of", ({ query }) => {
    const { date, semester } = query as { date?: string; semester?: string };
    if (!date || !semester) {
      return { success: false, message: "需要 date（YYYY-MM-DD）和 semester 参数" };
    }
    const d = new Date(date);
    if (isNaN(d.getTime())) {
      return { success: false, message: "date 格式不合法，请用 YYYY-MM-DD" };
    }
    const week = getSemesterWeek(semester, d);
    if (week === null) {
      return { success: false, message: "该学期配置不存在或日期早于学期开始" };
    }
    return { success: true, data: { date, semester, week } };
  });
