import { Elysia } from "elysia";
import {
  createAssignment,
  getAssignmentById,
  getStudentById,
  getAllAssignments,
  getAssignmentsByCourse,
  getAssignmentWithCourse,
  updateAssignment,
  deleteAssignment,
  createSubmission,
  getSubmissionById,
  getSubmissionsByAssignment,
  getSubmissionsByStudent,
  gradeSubmission,
  getUpcomingAssignments,
  getUnsubmittedAssignmentsByStudent,
  isStudentInAssignmentCourse,
} from "../db";

function parsePagination(query: Record<string, string | undefined>) {
  const limit  = query.limit  ? parseInt(query.limit)  : undefined;
  const offset = query.offset ? parseInt(query.offset) : undefined;
  return { limit, offset };
}

export const assignmentRoutes = new Elysia({ prefix: "/assignments" })
  // 获取所有作业（支持 ?limit=N&offset=M 分页，不传则返回全量）
  .get("/", ({ query }) => {
    const { limit, offset } = parsePagination(query as Record<string, string | undefined>);
    const assignments = getAllAssignments(limit, offset);
    return { success: true, data: assignments };
  })
  // 获取即将截止的作业
  .get("/upcoming", ({ query }) => {
    const hours = query.hours ? parseInt(query.hours as string) : 24;
    const assignments = getUpcomingAssignments(hours);
    return { success: true, data: assignments };
  })
  // 获取单个作业
  .get("/:id", ({ params: { id } }) => {
    const assignment = getAssignmentById(id);
    if (!assignment) {
      return { success: false, message: "作业不存在" };
    }
    return { success: true, data: assignment };
  })
  // 获取作业详情（包含课程信息）
  .get("/:id/detail", ({ params: { id } }) => {
    const assignment = getAssignmentWithCourse(id);
    if (!assignment) {
      return { success: false, message: "作业不存在" };
    }
    return { success: true, data: assignment };
  })
  // 通过课程获取作业
  .get("/by-course/:courseId", ({ params: { courseId } }) => {
    const assignments = getAssignmentsByCourse(courseId);
    return { success: true, data: assignments };
  })
  // 创建作业
  .post("/", ({ body }) => {
    const assignment = createAssignment({
      id: crypto.randomUUID(),
      ...body as { course_id: string; title: string; description: string | null; deadline: number; max_score: number },
    });
    return { success: true, data: assignment };
  })
  // 更新作业
  .patch("/:id", ({ params: { id }, body }) => {
    const assignment = updateAssignment(id, body as { course_id?: string; title?: string; description?: string | null; deadline?: number; max_score?: number });
    if (!assignment) {
      return { success: false, message: "作业不存在" };
    }
    return { success: true, data: assignment };
  })
  // 删除作业
  .delete("/:id", ({ params: { id } }) => {
    const success = deleteAssignment(id);
    if (!success) {
      return { success: false, message: "作业不存在" };
    }
    return { success: true, message: "删除成功" };
  })
  // 获取学生的未提交作业
  .get("/unsubmitted/:studentId", ({ params: { studentId } }) => {
    const assignments = getUnsubmittedAssignmentsByStudent(studentId);
    return { success: true, data: assignments };
  })
  // 提交作业
  .post("/:id/submit", ({ params: { id }, body }) => {
    const assignment = getAssignmentById(id);
    if (!assignment) {
      return { success: false, message: "作业不存在" };
    }
    const { student_id, content, file_url } = body as { student_id: string; content?: string | null; file_url?: string | null };
    const student = getStudentById(student_id);
    if (!student) {
      return { success: false, message: "学生不存在" };
    }
    if (!isStudentInAssignmentCourse(id, student_id)) {
      return { success: false, message: "学生不在该课程中，不能提交此作业" };
    }
    if (!content && !file_url) {
      return { success: false, message: "提交内容不能为空" };
    }
    const submission = createSubmission({
      id: crypto.randomUUID(),
      assignment_id: id,
      student_id,
      content: content || null,
      file_url: file_url || null,
      score: null,
      feedback: null,
    });
    if (!submission) {
      return { success: false, message: "提交失败" };
    }
    return { success: true, data: submission };
  })
  // 获取作业的提交
  .get("/:id/submissions", ({ params: { id } }) => {
    const assignment = getAssignmentById(id);
    if (!assignment) {
      return { success: false, message: "作业不存在" };
    }
    const submissions = getSubmissionsByAssignment(id);
    return { success: true, data: submissions };
  })
  // 获取单个提交
  .get("/submissions/:submissionId", ({ params: { submissionId } }) => {
    const submission = getSubmissionById(submissionId);
    if (!submission) {
      return { success: false, message: "提交不存在" };
    }
    return { success: true, data: submission };
  })
  // 批改作业
  .post("/submissions/:submissionId/grade", ({ params: { submissionId }, body }) => {
    const submission = getSubmissionById(submissionId);
    if (!submission) {
      return { success: false, message: "提交不存在" };
    }
    const { score, feedback } = body as { score: number; feedback?: string };
    const graded = gradeSubmission(submissionId, score, feedback);
    return { success: true, data: graded };
  })
  // 获取学生的提交
  .get("/student-submissions/:studentId", ({ params: { studentId } }) => {
    const submissions = getSubmissionsByStudent(studentId);
    return { success: true, data: submissions };
  });
