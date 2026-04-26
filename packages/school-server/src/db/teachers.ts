import { getDatabase } from "./database";
import type { Teacher } from "../types";

export function createTeacher(teacher: Omit<Teacher, "created_at">): Teacher {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO teachers (id, name, email, department, title, created_at)
    VALUES (?, ?, ?, ?, ?, unixepoch())
  `);
  stmt.run(teacher.id, teacher.name, teacher.email, teacher.department, teacher.title);
  return getTeacherById(teacher.id)!;
}

export function getTeacherById(id: string): Teacher | null {
  const db = getDatabase();
  const stmt = db.prepare("SELECT * FROM teachers WHERE id = ?");
  return stmt.get(id) as Teacher | null;
}

export function getTeacherByEmail(email: string): Teacher | null {
  const db = getDatabase();
  const stmt = db.prepare("SELECT * FROM teachers WHERE email = ?");
  return stmt.get(email) as Teacher | null;
}

export function getAllTeachers(limit?: number, offset?: number): Teacher[] {
  const db = getDatabase();
  let sql = "SELECT * FROM teachers ORDER BY created_at DESC";
  const params: number[] = [];
  if (limit !== undefined) { sql += " LIMIT ?"; params.push(limit); }
  if (offset !== undefined) { sql += " OFFSET ?"; params.push(offset); }
  return db.prepare(sql).all(...params) as Teacher[];
}

export function updateTeacher(id: string, updates: Partial<Omit<Teacher, "id" | "created_at">>): Teacher | null {
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
  if (updates.department !== undefined) {
    fields.push("department = ?");
    values.push(updates.department);
  }
  if (updates.title !== undefined) {
    fields.push("title = ?");
    values.push(updates.title);
  }

  if (fields.length === 0) return getTeacherById(id);

  values.push(id);
  const stmt = db.prepare(`UPDATE teachers SET ${fields.join(", ")} WHERE id = ?`);
  stmt.run(...values);
  return getTeacherById(id);
}

export function deleteTeacher(id: string): boolean {
  const db = getDatabase();
  const stmt = db.prepare("DELETE FROM teachers WHERE id = ?");
  const result = stmt.run(id);
  return result.changes > 0;
}
