import { getDatabase } from "./database";
import type { Assignment, Submission, Student, Course, AssignmentWithCourse, SubmissionWithDetails } from "../types";

export function createAssignment(assignment: Omit<Assignment, "created_at">): Assignment {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO assignments (id, course_id, title, description, deadline, max_score, created_at)
    VALUES (?, ?, ?, ?, ?, ?, unixepoch())
  `);
  stmt.run(
    assignment.id,
    assignment.course_id,
    assignment.title,
    assignment.description,
    assignment.deadline,
    assignment.max_score
  );
  return getAssignmentById(assignment.id)!;
}

export function getAssignmentById(id: string): Assignment | null {
  const db = getDatabase();
  const stmt = db.prepare("SELECT * FROM assignments WHERE id = ?");
  return stmt.get(id) as Assignment | null;
}

export function getAllAssignments(limit?: number, offset?: number): Assignment[] {
  const db = getDatabase();
  let sql = "SELECT * FROM assignments ORDER BY created_at DESC";
  const params: number[] = [];
  if (limit !== undefined) { sql += " LIMIT ?"; params.push(limit); }
  if (offset !== undefined) { sql += " OFFSET ?"; params.push(offset); }
  return db.prepare(sql).all(...params) as Assignment[];
}

export function getAssignmentsByCourse(courseId: string): Assignment[] {
  const db = getDatabase();
  const stmt = db.prepare("SELECT * FROM assignments WHERE course_id = ? ORDER BY deadline ASC");
  return stmt.all(courseId) as Assignment[];
}

export function getAssignmentsByDeadlineBefore(deadline: number): Assignment[] {
  const db = getDatabase();
  const stmt = db.prepare("SELECT * FROM assignments WHERE deadline <= ? ORDER BY deadline ASC");
  return stmt.all(deadline) as Assignment[];
}

export function getAssignmentWithCourse(id: string): AssignmentWithCourse | null {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT a.*, c.id as course_id_ref, c.name as course_name, c.code as course_code,
           c.description as course_description, c.teacher_id as course_teacher_id,
           c.semester as course_semester, c.credit as course_credit,
           c.schedule as course_schedule, c.location as course_location, c.course_type as course_course_type, c.created_at as course_created_at
    FROM assignments a
    JOIN courses c ON a.course_id = c.id
    WHERE a.id = ?
  `);
  const row = stmt.get(id) as Record<string, unknown> | null;
  if (!row) return null;

  const course: Course = {
    id: row.course_id_ref as string,
    name: row.course_name as string,
    code: row.course_code as string,
    description: row.course_description as string | null,
    teacher_id: row.course_teacher_id as string,
    semester: row.course_semester as string,
    credit: row.course_credit as number,
    schedule: row.course_schedule as string | null,
    location: row.course_location as string | null,
    course_type: (row.course_course_type ?? "undergraduate") as "undergraduate" | "graduate",
    created_at: row.course_created_at as number,
  };

  return {
    id: row.id as string,
    course_id: row.course_id as string,
    title: row.title as string,
    description: row.description as string | null,
    deadline: row.deadline as number,
    max_score: row.max_score as number,
    created_at: row.created_at as number,
    course,
  };
}

export function updateAssignment(id: string, updates: Partial<Omit<Assignment, "id" | "created_at">>): Assignment | null {
  const db = getDatabase();
  const fields: string[] = [];
  const values: Array<string | number | null> = [];

  if (updates.course_id !== undefined) {
    fields.push("course_id = ?");
    values.push(updates.course_id);
  }
  if (updates.title !== undefined) {
    fields.push("title = ?");
    values.push(updates.title);
  }
  if (updates.description !== undefined) {
    fields.push("description = ?");
    values.push(updates.description);
  }
  if (updates.deadline !== undefined) {
    fields.push("deadline = ?");
    values.push(updates.deadline);
  }
  if (updates.max_score !== undefined) {
    fields.push("max_score = ?");
    values.push(updates.max_score);
  }

  if (fields.length === 0) return getAssignmentById(id);

  values.push(id);
  const stmt = db.prepare(`UPDATE assignments SET ${fields.join(", ")} WHERE id = ?`);
  stmt.run(...values);
  return getAssignmentById(id);
}

export function deleteAssignment(id: string): boolean {
  const db = getDatabase();
  const stmt = db.prepare("DELETE FROM assignments WHERE id = ?");
  const result = stmt.run(id);
  return result.changes > 0;
}

// 提交管理
export function createSubmission(submission: Omit<Submission, "submitted_at">): Submission | null {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO submissions (id, assignment_id, student_id, content, file_url, submitted_at, score, feedback)
    VALUES (?, ?, ?, ?, ?, unixepoch(), ?, ?)
    ON CONFLICT(assignment_id, student_id) DO UPDATE SET
      content = excluded.content,
      file_url = excluded.file_url,
      submitted_at = excluded.submitted_at,
      score = NULL,
      feedback = NULL
  `);
  stmt.run(
    submission.id,
    submission.assignment_id,
    submission.student_id,
    submission.content,
    submission.file_url,
    submission.score,
    submission.feedback
  );
  return getSubmissionByAssignmentAndStudent(
    submission.assignment_id,
    submission.student_id,
  );
}

export function getSubmissionById(id: string): Submission | null {
  const db = getDatabase();
  const stmt = db.prepare("SELECT * FROM submissions WHERE id = ?");
  return stmt.get(id) as Submission | null;
}

export function getSubmissionByAssignmentAndStudent(assignmentId: string, studentId: string): Submission | null {
  const db = getDatabase();
  const stmt = db.prepare("SELECT * FROM submissions WHERE assignment_id = ? AND student_id = ?");
  return stmt.get(assignmentId, studentId) as Submission | null;
}

export function getSubmissionsByAssignment(assignmentId: string): Submission[] {
  const db = getDatabase();
  const stmt = db.prepare("SELECT * FROM submissions WHERE assignment_id = ? ORDER BY submitted_at DESC");
  return stmt.all(assignmentId) as Submission[];
}

export function getSubmissionsByStudent(studentId: string): Submission[] {
  const db = getDatabase();
  const stmt = db.prepare("SELECT * FROM submissions WHERE student_id = ? ORDER BY submitted_at DESC");
  return stmt.all(studentId) as Submission[];
}

export function isStudentInAssignmentCourse(assignmentId: string, studentId: string): boolean {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT 1
    FROM assignments a
    JOIN course_students cs ON cs.course_id = a.course_id
    WHERE a.id = ? AND cs.student_id = ?
    LIMIT 1
  `);
  const row = stmt.get(assignmentId, studentId) as { 1: number } | null;
  return Boolean(row);
}

export function gradeSubmission(id: string, score: number, feedback?: string): Submission | null {
  const db = getDatabase();
  const stmt = db.prepare("UPDATE submissions SET score = ?, feedback = ? WHERE id = ?");
  stmt.run(score, feedback || null, id);
  return getSubmissionById(id);
}

export function deleteSubmission(id: string): boolean {
  const db = getDatabase();
  const stmt = db.prepare("DELETE FROM submissions WHERE id = ?");
  const result = stmt.run(id);
  return result.changes > 0;
}

/**
 * 获取某教师所有课程的全部作业（单次 JOIN 查询，避免 N+1）
 * 返回 { courseId, courseName, assignments[] } 列表
 */
export function getAssignmentsByTeacher(teacherId: string): { courseId: string; courseName: string; assignments: Assignment[] }[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT a.*, c.name as course_name
    FROM assignments a
    JOIN courses c ON a.course_id = c.id
    WHERE c.teacher_id = ?
    ORDER BY a.course_id, a.deadline ASC
  `);
  const rows = stmt.all(teacherId) as (Assignment & { course_name: string })[];

  // 按 course_id 分组
  const map = new Map<string, { courseId: string; courseName: string; assignments: Assignment[] }>();
  for (const row of rows) {
    const { course_name, ...assignment } = row;
    if (!map.has(assignment.course_id)) {
      map.set(assignment.course_id, { courseId: assignment.course_id, courseName: course_name, assignments: [] });
    }
    map.get(assignment.course_id)!.assignments.push(assignment);
  }
  return [...map.values()];
}

// 获取即将截止的作业（用于提醒）
export function getUpcomingAssignments(hours: number = 24): AssignmentWithCourse[] {
  const db = getDatabase();
  const now = Math.floor(Date.now() / 1000);
  const deadlineThreshold = now + hours * 3600;

  const stmt = db.prepare(`
    SELECT a.*, c.id as course_id_ref, c.name as course_name, c.code as course_code,
           c.description as course_description, c.teacher_id as course_teacher_id,
           c.semester as course_semester, c.credit as course_credit,
           c.schedule as course_schedule, c.location as course_location, c.course_type as course_course_type, c.created_at as course_created_at
    FROM assignments a
    JOIN courses c ON a.course_id = c.id
    WHERE a.deadline > ? AND a.deadline <= ?
    ORDER BY a.deadline ASC
  `);

  const rows = stmt.all(now, deadlineThreshold) as Record<string, unknown>[];

  return rows.map(row => {
    const course: Course = {
      id: row.course_id_ref as string,
      name: row.course_name as string,
      code: row.course_code as string,
      description: row.course_description as string | null,
      teacher_id: row.course_teacher_id as string,
      semester: row.course_semester as string,
      credit: row.course_credit as number,
      schedule: row.course_schedule as string | null,
      location: row.course_location as string | null,
      course_type: (row.course_course_type ?? "undergraduate") as "undergraduate" | "graduate",
      created_at: row.course_created_at as number,
    };

    return {
      id: row.id as string,
      course_id: row.course_id as string,
      title: row.title as string,
      description: row.description as string | null,
      deadline: row.deadline as number,
      max_score: row.max_score as number,
      created_at: row.created_at as number,
      course,
    };
  });
}

// 获取学生未提交的作业
export function getUnsubmittedAssignmentsByStudent(studentId: string): AssignmentWithCourse[] {
  const db = getDatabase();
  const now = Math.floor(Date.now() / 1000);

  const stmt = db.prepare(`
    SELECT a.*, c.id as course_id_ref, c.name as course_name, c.code as course_code,
           c.description as course_description, c.teacher_id as course_teacher_id,
           c.semester as course_semester, c.credit as course_credit,
           c.schedule as course_schedule, c.location as course_location, c.course_type as course_course_type, c.created_at as course_created_at
    FROM assignments a
    JOIN courses c ON a.course_id = c.id
    JOIN course_students cs ON c.id = cs.course_id
    WHERE cs.student_id = ?
      AND a.deadline > ?
      AND NOT EXISTS (
        SELECT 1 FROM submissions s
        WHERE s.assignment_id = a.id AND s.student_id = ?
      )
    ORDER BY a.deadline ASC
  `);

  const rows = stmt.all(studentId, now, studentId) as Record<string, unknown>[];

  return rows.map(row => {
    const course: Course = {
      id: row.course_id_ref as string,
      name: row.course_name as string,
      code: row.course_code as string,
      description: row.course_description as string | null,
      teacher_id: row.course_teacher_id as string,
      semester: row.course_semester as string,
      credit: row.course_credit as number,
      schedule: row.course_schedule as string | null,
      location: row.course_location as string | null,
      course_type: (row.course_course_type ?? "undergraduate") as "undergraduate" | "graduate",
      created_at: row.course_created_at as number,
    };

    return {
      id: row.id as string,
      course_id: row.course_id as string,
      title: row.title as string,
      description: row.description as string | null,
      deadline: row.deadline as number,
      max_score: row.max_score as number,
      created_at: row.created_at as number,
      course,
    };
  });
}
