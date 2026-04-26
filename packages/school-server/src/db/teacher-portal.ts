import { getDatabase } from "./database";

// ── Papers ───────────────────────────────────────────────────────────────────

export interface TeacherPaper {
  id: string;
  teacher_id: string;
  title: string;
  journal: string;
  year: number;
  authors: string;
  keywords: string | null;
  region: string;
  citation_count: number;
}

export function getTeacherPapers(
  teacherId: string,
  opts: { year?: number; year_from?: number; region?: string; limit?: number; offset?: number } = {},
): TeacherPaper[] {
  const db = getDatabase();
  const conditions: string[] = ["teacher_id = ?"];
  const params: (string | number)[] = [teacherId];
  if (opts.year)      { conditions.push("year = ?");    params.push(opts.year); }
  if (opts.year_from) { conditions.push("year >= ?");   params.push(opts.year_from); }
  if (opts.region)    { conditions.push("region LIKE ?"); params.push(`%${opts.region}%`); }
  let sql = `SELECT * FROM teacher_papers WHERE ${conditions.join(" AND ")} ORDER BY year DESC, citation_count DESC`;
  if (opts.limit) { sql += " LIMIT ?"; params.push(opts.limit); }
  if (opts.offset) { sql += " OFFSET ?"; params.push(opts.offset); }
  return db.prepare(sql).all(...params) as TeacherPaper[];
}

export function countTeacherPapers(teacherId: string): number {
  const db = getDatabase();
  const row = db.prepare("SELECT COUNT(*) as n FROM teacher_papers WHERE teacher_id = ?").get(teacherId) as { n: number };
  return row?.n ?? 0;
}

// ── Patents ──────────────────────────────────────────────────────────────────

export interface TeacherPatent {
  id: string;
  teacher_id: string;
  title: string;
  type: string;
  cert_number: string | null;
  year: number;
  region: string;
  keywords: string | null;
  status: string;
}

export function getTeacherPatents(
  teacherId: string,
  opts: { type?: string; region?: string; limit?: number; offset?: number } = {},
): TeacherPatent[] {
  const db = getDatabase();
  const conditions: string[] = ["teacher_id = ?"];
  const params: (string | number)[] = [teacherId];
  if (opts.type) { conditions.push("type = ?"); params.push(opts.type); }
  if (opts.region) { conditions.push("region LIKE ?"); params.push(`%${opts.region}%`); }
  let sql = `SELECT * FROM teacher_patents WHERE ${conditions.join(" AND ")} ORDER BY year DESC`;
  if (opts.limit) { sql += " LIMIT ?"; params.push(opts.limit); }
  if (opts.offset) { sql += " OFFSET ?"; params.push(opts.offset); }
  return db.prepare(sql).all(...params) as TeacherPatent[];
}

// ── Open Projects ─────────────────────────────────────────────────────────────

export interface OpenProject {
  id: string;
  title: string;
  source: string;
  category: string;
  deadline: string;
  amount: string | null;
  description: string | null;
  requirements: string | null;
  contact: string | null;
  status: string;
}

export function getOpenProjects(opts: { category?: string; status?: string } = {}): OpenProject[] {
  const db = getDatabase();
  const conditions: string[] = [];
  const params: string[] = [];
  if (opts.category) { conditions.push("category LIKE ?"); params.push(`%${opts.category}%`); }
  if (opts.status) { conditions.push("status = ?"); params.push(opts.status); }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return db.prepare(`SELECT * FROM open_projects ${where} ORDER BY deadline ASC`).all(...params) as OpenProject[];
}
