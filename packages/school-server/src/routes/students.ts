import { Elysia } from "elysia";
import {
  createStudent,
  getStudentById,
  getStudentByNumber,
  getAllStudents,
  updateStudent,
  deleteStudent,
  getCoursesByStudent,
} from "../db";
import {
  getCurrentWeekInfo,
  isScheduleActiveInWeek,
  getActiveSessionsInWeek,
} from "../lib/schedule-week";

export const studentRoutes = new Elysia({ prefix: "/students" })
  // 获取所有学生（支持 ?limit=N&offset=M 分页，不传则返回全量）
  .get("/", ({ query }) => {
    const limit  = query.limit  ? parseInt(query.limit  as string) : undefined;
    const offset = query.offset ? parseInt(query.offset as string) : undefined;
    const students = getAllStudents(limit, offset);
    return { success: true, data: students };
  })
  // 按学号查询（schoolId 绑定时用此接口）
  .get("/by-number/:number", ({ params: { number } }) => {
    const student = getStudentByNumber(number);
    if (!student) return new Response(JSON.stringify({ success: false, message: "学生不存在" }), { status: 404 });
    return { success: true, data: student };
  })
  .get("/:id", ({ params: { id } }) => {
    const student = getStudentById(id);
    if (!student) {
      return { success: false, message: "学生不存在" };
    }
    return { success: true, data: student };
  })
  // 创建学生
  .post("/", ({ body }) => {
    const b = body as { name: string; email: string; student_number: string; type?: "undergraduate" | "graduate"; major: string; grade: number; campus?: string; dorm?: string | null };
    const student = createStudent({
      id: crypto.randomUUID(),
      type: b.type ?? "undergraduate",
      campus: b.campus ?? "东校区",
      dorm: b.dorm ?? null,
      ...b,
    });
    return { success: true, data: student };
  })
  // 更新学生
  .patch("/:id", ({ params: { id }, body }) => {
    const student = updateStudent(id, body as { name?: string; email?: string; student_number?: string; major?: string; grade?: number });
    if (!student) {
      return { success: false, message: "学生不存在" };
    }
    return { success: true, data: student };
  })
  // 获取学生的课程
  // ?all=true 返回全部已选课程；默认只返回当前周有效的课程
  // 响应中每门课附加 active_sessions（本周有效时间段）和 current_week
  .get("/:id/courses", ({ params: { id }, query }) => {
    const student = getStudentById(id);
    if (!student) {
      return { success: false, message: "学生不存在" };
    }
    const allCourses = getCoursesByStudent(id);
    const weekInfo = getCurrentWeekInfo();
    const returnAll = (query as Record<string, string>).all === "true";

    if (!weekInfo || returnAll) {
      // 学期外或明确要全部：附上 active_sessions 但不过滤
      const data = allCourses.map((c) => ({
        ...c,
        active_sessions: c.schedule ?? "",
        current_week: weekInfo?.week ?? null,
      }));
      return { success: true, data, current_week: weekInfo?.week ?? null };
    }

    const { week } = weekInfo;
    const activeCourses = allCourses
      .filter((c) => isScheduleActiveInWeek(c.schedule, week))
      .map((c) => ({
        ...c,
        active_sessions: getActiveSessionsInWeek(c.schedule, week),
        current_week: week,
      }));

    return { success: true, data: activeCourses, current_week: week };
  })
  // 删除学生
  .delete("/:id", ({ params: { id } }) => {
    const success = deleteStudent(id);
    if (!success) {
      return { success: false, message: "学生不存在" };
    }
    return { success: true, message: "删除成功" };
  });
