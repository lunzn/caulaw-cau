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
  .get("/:id/courses", ({ params: { id } }) => {
    const student = getStudentById(id);
    if (!student) {
      return { success: false, message: "学生不存在" };
    }
    const courses = getCoursesByStudent(id);
    return { success: true, data: courses };
  })
  // 删除学生
  .delete("/:id", ({ params: { id } }) => {
    const success = deleteStudent(id);
    if (!success) {
      return { success: false, message: "学生不存在" };
    }
    return { success: true, message: "删除成功" };
  });
