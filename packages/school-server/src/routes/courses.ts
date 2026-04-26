import { Elysia } from "elysia";
import {
  createCourse,
  getCourseById,
  getAllCourses,
  getCoursesByTeacher,
  getCoursesBySemester,
  getCourseWithTeacher,
  updateCourse,
  deleteCourse,
  addStudentToCourse,
  removeStudentFromCourse,
  getStudentsByCourse,
} from "../db";

export const courseRoutes = new Elysia({ prefix: "/courses" })
  // 获取所有课程
  .get("/", () => {
    const courses = getAllCourses();
    return { success: true, data: courses };
  })
  // 获取单个课程
  .get("/:id", ({ params: { id } }) => {
    const course = getCourseById(id);
    if (!course) {
      return { success: false, message: "课程不存在" };
    }
    return { success: true, data: course };
  })
  // 获取课程详情（包含教师信息）
  .get("/:id/detail", ({ params: { id } }) => {
    const course = getCourseWithTeacher(id);
    if (!course) {
      return { success: false, message: "课程不存在" };
    }
    return { success: true, data: course };
  })
  // 通过教师获取课程
  .get("/by-teacher/:teacherId", ({ params: { teacherId } }) => {
    const courses = getCoursesByTeacher(teacherId);
    return { success: true, data: courses };
  })
  // 通过学期获取课程
  .get("/by-semester/:semester", ({ params: { semester } }) => {
    const courses = getCoursesBySemester(semester);
    return { success: true, data: courses };
  })
  // 创建课程
  .post("/", ({ body }) => {
    const b = body as { name: string; code: string; description: string | null; teacher_id: string; semester: string; credit: number; schedule: string | null; location: string | null; course_type?: "undergraduate" | "graduate" };
    const course = createCourse({
      id: crypto.randomUUID(),
      course_type: b.course_type ?? "undergraduate",
      ...b,
    });
    return { success: true, data: course };
  })
  // 更新课程
  .patch("/:id", ({ params: { id }, body }) => {
    const course = updateCourse(id, body as { name?: string; code?: string; description?: string | null; teacher_id?: string; semester?: string; credit?: number; schedule?: string | null; location?: string | null });
    if (!course) {
      return { success: false, message: "课程不存在" };
    }
    return { success: true, data: course };
  })
  // 删除课程
  .delete("/:id", ({ params: { id } }) => {
    const success = deleteCourse(id);
    if (!success) {
      return { success: false, message: "课程不存在" };
    }
    return { success: true, message: "删除成功" };
  })
  // 获取课程的学生
  .get("/:id/students", ({ params: { id } }) => {
    const course = getCourseById(id);
    if (!course) {
      return { success: false, message: "课程不存在" };
    }
    const students = getStudentsByCourse(id);
    return { success: true, data: students };
  })
  // 添加学生到课程
  .post("/:id/students", ({ params: { id }, body }) => {
    const course = getCourseById(id);
    if (!course) {
      return { success: false, message: "课程不存在" };
    }
    const { studentId } = body as { studentId: string };
    const courseStudent = addStudentToCourse(id, studentId);
    return { success: true, data: courseStudent };
  })
  // 从课程移除学生
  .delete("/:id/students/:studentId", ({ params: { id, studentId } }) => {
    const course = getCourseById(id);
    if (!course) {
      return { success: false, message: "课程不存在" };
    }
    const success = removeStudentFromCourse(id, studentId);
    if (!success) {
      return { success: false, message: "学生未在课程中" };
    }
    return { success: true, message: "移除成功" };
  });
