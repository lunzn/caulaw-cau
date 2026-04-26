import { getDatabase } from "./database";
import type { Course, CourseStudent, Student, Teacher, CourseWithTeacher } from "../types";

export function createCourse(course: Omit<Course, "created_at">): Course {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO courses (id, name, code, description, teacher_id, semester, credit, schedule, location, course_type, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
  `);
  stmt.run(
    course.id,
    course.name,
    course.code,
    course.description,
    course.teacher_id,
    course.semester,
    course.credit,
    course.schedule,
    course.location,
    course.course_type ?? "undergraduate"
  );
  return getCourseById(course.id)!;
}

export function getCourseById(id: string): Course | null {
  const db = getDatabase();
  const stmt = db.prepare("SELECT * FROM courses WHERE id = ?");
  return stmt.get(id) as Course | null;
}

export function getCourseByCode(code: string): Course | null {
  const db = getDatabase();
  const stmt = db.prepare("SELECT * FROM courses WHERE code = ?");
  return stmt.get(code) as Course | null;
}

export function getAllCourses(limit?: number, offset?: number): Course[] {
  const db = getDatabase();
  let sql = "SELECT * FROM courses ORDER BY created_at DESC";
  const params: number[] = [];
  if (limit !== undefined) { sql += " LIMIT ?"; params.push(limit); }
  if (offset !== undefined) { sql += " OFFSET ?"; params.push(offset); }
  return db.prepare(sql).all(...params) as Course[];
}

export function getCoursesByTeacher(teacherId: string): Course[] {
  const db = getDatabase();
  const stmt = db.prepare("SELECT * FROM courses WHERE teacher_id = ? ORDER BY created_at DESC");
  return stmt.all(teacherId) as Course[];
}

export function getCoursesBySemester(semester: string): Course[] {
  const db = getDatabase();
  const stmt = db.prepare("SELECT * FROM courses WHERE semester = ? ORDER BY created_at DESC");
  return stmt.all(semester) as Course[];
}

export function getCourseWithTeacher(id: string): CourseWithTeacher | null {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT c.*, c.course_type as c_course_type, t.id as teacher_id, t.name as teacher_name, t.email as teacher_email,
           t.department as teacher_department, t.title as teacher_title, t.created_at as teacher_created_at
    FROM courses c
    JOIN teachers t ON c.teacher_id = t.id
    WHERE c.id = ?
  `);
  const row = stmt.get(id) as Record<string, unknown> | null;
  if (!row) return null;

  const teacher: Teacher = {
    id: row.teacher_id as string,
    name: row.teacher_name as string,
    email: row.teacher_email as string,
    department: row.teacher_department as string,
    title: row.teacher_title as string,
    created_at: row.teacher_created_at as number,
  };

  return {
    id: row.id as string,
    name: row.name as string,
    code: row.code as string,
    description: row.description as string | null,
    teacher_id: row.teacher_id as string,
    semester: row.semester as string,
    credit: row.credit as number,
    schedule: row.schedule as string | null,
    location: row.location as string | null,
    course_type: ((row.c_course_type ?? row.course_type) ?? "undergraduate") as "undergraduate" | "graduate",
    created_at: row.created_at as number,
    teacher,
  };
}

export function updateCourse(id: string, updates: Partial<Omit<Course, "id" | "created_at">>): Course | null {
  const db = getDatabase();
  const fields: string[] = [];
  const values: Array<string | number | null> = [];

  if (updates.name !== undefined) {
    fields.push("name = ?");
    values.push(updates.name);
  }
  if (updates.code !== undefined) {
    fields.push("code = ?");
    values.push(updates.code);
  }
  if (updates.description !== undefined) {
    fields.push("description = ?");
    values.push(updates.description);
  }
  if (updates.teacher_id !== undefined) {
    fields.push("teacher_id = ?");
    values.push(updates.teacher_id);
  }
  if (updates.semester !== undefined) {
    fields.push("semester = ?");
    values.push(updates.semester);
  }
  if (updates.credit !== undefined) {
    fields.push("credit = ?");
    values.push(updates.credit);
  }
  if (updates.schedule !== undefined) {
    fields.push("schedule = ?");
    values.push(updates.schedule);
  }
  if (updates.location !== undefined) {
    fields.push("location = ?");
    values.push(updates.location);
  }

  if (fields.length === 0) return getCourseById(id);

  values.push(id);
  const stmt = db.prepare(`UPDATE courses SET ${fields.join(", ")} WHERE id = ?`);
  stmt.run(...values);
  return getCourseById(id);
}

export function deleteCourse(id: string): boolean {
  const db = getDatabase();
  const stmt = db.prepare("DELETE FROM courses WHERE id = ?");
  const result = stmt.run(id);
  return result.changes > 0;
}

// 课程学生管理
export function addStudentToCourse(courseId: string, studentId: string): CourseStudent {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO course_students (course_id, student_id, joined_at)
    VALUES (?, ?, unixepoch())
    ON CONFLICT(course_id, student_id) DO UPDATE SET joined_at = unixepoch()
  `);
  stmt.run(courseId, studentId);
  return getCourseStudent(courseId, studentId)!;
}

export function getCourseStudent(courseId: string, studentId: string): CourseStudent | null {
  const db = getDatabase();
  const stmt = db.prepare("SELECT * FROM course_students WHERE course_id = ? AND student_id = ?");
  return stmt.get(courseId, studentId) as CourseStudent | null;
}

export function removeStudentFromCourse(courseId: string, studentId: string): boolean {
  const db = getDatabase();
  const stmt = db.prepare("DELETE FROM course_students WHERE course_id = ? AND student_id = ?");
  const result = stmt.run(courseId, studentId);
  return result.changes > 0;
}

export function getStudentsByCourse(courseId: string): Student[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT s.* FROM students s
    JOIN course_students cs ON s.id = cs.student_id
    WHERE cs.course_id = ?
    ORDER BY cs.joined_at DESC
  `);
  return stmt.all(courseId) as Student[];
}

export function getCoursesByStudent(studentId: string): Course[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT c.* FROM courses c
    JOIN course_students cs ON c.id = cs.course_id
    WHERE cs.student_id = ?
    ORDER BY cs.joined_at DESC
  `);
  return stmt.all(studentId) as Course[];
}
