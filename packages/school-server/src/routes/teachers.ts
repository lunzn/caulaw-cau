import { Elysia, t } from "elysia";
import {
  createTeacher,
  getTeacherById,
  getAllTeachers,
  updateTeacher,
  deleteTeacher,
  getAssignmentsByTeacher,
} from "../db";

export const teacherRoutes = new Elysia({ prefix: "/teachers" })
  // 获取所有教师（支持 ?limit=N&offset=M 分页，不传则返回全量）
  .get("/", ({ query }) => {
    const limit  = query.limit  ? parseInt(query.limit  as string) : undefined;
    const offset = query.offset ? parseInt(query.offset as string) : undefined;
    const teachers = getAllTeachers(limit, offset);
    return { success: true, data: teachers };
  })
  // 获取单个教师
  .get("/:id", ({ params: { id } }) => {
    const teacher = getTeacherById(id);
    if (!teacher) {
      return { success: false, message: "教师不存在" };
    }
    return { success: true, data: teacher };
  })
  // 创建教师
  .post("/", ({ body }) => {
    const teacher = createTeacher({
      id: crypto.randomUUID(),
      ...body as { name: string; email: string; department: string; title: string },
    });
    return { success: true, data: teacher };
  })
  // 更新教师
  .patch("/:id", ({ params: { id }, body }) => {
    const teacher = updateTeacher(id, body as { name?: string; email?: string; department?: string; title?: string });
    if (!teacher) {
      return { success: false, message: "教师不存在" };
    }
    return { success: true, data: teacher };
  })
  // 获取教师所有课程的全部作业（单次 JOIN，避免 N+1）
  .get("/:id/assignments", ({ params: { id } }) => {
    const teacher = getTeacherById(id);
    if (!teacher) {
      return { success: false, message: "教师不存在" };
    }
    const data = getAssignmentsByTeacher(id);
    return { success: true, data };
  })
  // 删除教师
  .delete("/:id", ({ params: { id } }) => {
    const success = deleteTeacher(id);
    if (!success) {
      return { success: false, message: "教师不存在" };
    }
    return { success: true, message: "删除成功" };
  });
