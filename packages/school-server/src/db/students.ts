import { getDatabase } from "./database";
import type { Student } from "../types";

export function createStudent(student: Omit<Student, "created_at">): Student {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO students (id, name, email, student_number, type, major, grade, campus, dorm, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
  `);
  stmt.run(
    student.id,
    student.name,
    student.email,
    student.student_number,
    student.type ?? "undergraduate",
    student.major,
    student.grade,
    student.campus ?? "东校区",
    student.dorm ?? null
  );
  return getStudentById(student.id)!;
}

export function getStudentById(id: string): Student | null {
  const db = getDatabase();
  const stmt = db.prepare("SELECT * FROM students WHERE id = ?");
  return stmt.get(id) as Student | null;
}

export function getStudentByEmail(email: string): Student | null {
  const db = getDatabase();
  const stmt = db.prepare("SELECT * FROM students WHERE email = ?");
  return stmt.get(email) as Student | null;
}

export function getStudentByNumber(studentNumber: string): Student | null {
  const db = getDatabase();
  const stmt = db.prepare("SELECT * FROM students WHERE student_number = ?");
  return stmt.get(studentNumber) as Student | null;
}

export function getAllStudents(limit?: number, offset?: number): Student[] {
  const db = getDatabase();
  let sql = "SELECT * FROM students ORDER BY created_at DESC";
  const params: number[] = [];
  if (limit !== undefined) { sql += " LIMIT ?"; params.push(limit); }
  if (offset !== undefined) { sql += " OFFSET ?"; params.push(offset); }
  return db.prepare(sql).all(...params) as Student[];
}

export function updateStudent(id: string, updates: Partial<Omit<Student, "id" | "created_at">>): Student | null {
  const db = getDatabase();
  const fields: string[] = [];
  const values: Array<string | number | null> = [];

  if (updates.name !== undefined) {
    fields.push("name = ?");
    values.push(updates.name);
  }
  if (updates.email !== undefined) {
    fields.push("email = ?");
    values.push(updates.email);
  }
  if (updates.student_number !== undefined) {
    fields.push("student_number = ?");
    values.push(updates.student_number);
  }
  if (updates.major !== undefined) {
    fields.push("major = ?");
    values.push(updates.major);
  }
  if (updates.grade !== undefined) {
    fields.push("grade = ?");
    values.push(updates.grade);
  }
  if (updates.type !== undefined) {
    fields.push("type = ?");
    values.push(updates.type);
  }
  if (updates.campus !== undefined) {
    fields.push("campus = ?");
    values.push(updates.campus);
  }
  if (updates.dorm !== undefined) {
    fields.push("dorm = ?");
    values.push(updates.dorm);
  }

  if (fields.length === 0) return getStudentById(id);

  values.push(id);
  const stmt = db.prepare(`UPDATE students SET ${fields.join(", ")} WHERE id = ?`);
  stmt.run(...values);
  return getStudentById(id);
}

export function deleteStudent(id: string): boolean {
  const db = getDatabase();
  const stmt = db.prepare("DELETE FROM students WHERE id = ?");
  const result = stmt.run(id);
  return result.changes > 0;
}
