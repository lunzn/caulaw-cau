import { getDatabase } from "./database";

export const LIBRARY_TIME_SLOTS = [
  "08:00-10:00",
  "10:00-12:00",
  "14:00-16:00",
  "16:00-18:00",
  "19:00-21:00",
] as const;

export type LibraryTimeSlot = (typeof LIBRARY_TIME_SLOTS)[number];

// ── 座位可用性（含预约数） ──

export function getSeatsAvailability(date: string) {
  const db = getDatabase();
  const seats = db.query("SELECT * FROM library_seats ORDER BY area_name").all() as {
    area_name: string; total: number; available: number; updated_at: number;
  }[];

  return seats.map((seat) => {
    const slots = LIBRARY_TIME_SLOTS.map((slot) => {
      const row = db
        .query(
          `SELECT COUNT(*) as cnt FROM library_reservations
           WHERE area_name = ?1 AND date = ?2 AND time_slot = ?3 AND status = 'active'`,
        )
        .get(seat.area_name, date, slot) as { cnt: number };
      return { time_slot: slot, reserved: row.cnt, available: Math.max(0, seat.total - row.cnt) };
    });
    return { area_name: seat.area_name, total: seat.total, slots };
  });
}

// ── 预约 CRUD ──

export function createReservation(data: {
  id: string;
  student_id: string;
  area_name: string;
  date: string;
  time_slot: string;
}) {
  const db = getDatabase();

  // 重复检查
  const dup = db
    .query(
      `SELECT id FROM library_reservations
       WHERE student_id = ?1 AND date = ?2 AND time_slot = ?3 AND status = 'active'`,
    )
    .get(data.student_id, data.date, data.time_slot);
  if (dup) throw new Error("该时段已有预约，不可重复预约");

  // 容量检查
  const seat = db
    .query("SELECT total FROM library_seats WHERE area_name = ?")
    .get(data.area_name) as { total: number } | null;
  if (!seat) throw new Error(`区域不存在：${data.area_name}`);

  const row = db
    .query(
      `SELECT COUNT(*) as cnt FROM library_reservations
       WHERE area_name = ?1 AND date = ?2 AND time_slot = ?3 AND status = 'active'`,
    )
    .get(data.area_name, data.date, data.time_slot) as { cnt: number };
  if (row.cnt >= seat.total) throw new Error("该时段座位已满");

  db.run(
    `INSERT INTO library_reservations (id, student_id, area_name, date, time_slot, status)
     VALUES (?1, ?2, ?3, ?4, ?5, 'active')`,
    [data.id, data.student_id, data.area_name, data.date, data.time_slot],
  );
  return getReservationById(data.id);
}

export function getReservationsByStudent(studentId: string) {
  return getDatabase()
    .query(
      `SELECT * FROM library_reservations WHERE student_id = ?
       ORDER BY date DESC, time_slot`,
    )
    .all(studentId);
}

export function getReservationById(id: string) {
  return getDatabase()
    .query("SELECT * FROM library_reservations WHERE id = ?")
    .get(id);
}

export function cancelReservation(id: string, studentId: string) {
  const db = getDatabase();
  const result = db.run(
    `UPDATE library_reservations SET status = 'cancelled'
     WHERE id = ?1 AND student_id = ?2 AND status = 'active'`,
    [id, studentId],
  );
  if (result.changes === 0) return null;
  return getReservationById(id);
}

export function getLibrarySeats() {
  const db = getDatabase();
  return db.query("SELECT * FROM library_seats ORDER BY area_name").all();
}

export function updateLibrarySeatAvailable(areaName: string, available: number) {
  const db = getDatabase();
  db.run(
    "UPDATE library_seats SET available = ?1, updated_at = unixepoch() WHERE area_name = ?2",
    [available, areaName],
  );
  return db.query("SELECT * FROM library_seats WHERE area_name = ?").get(areaName);
}

export function searchLibraryBooks(q?: string) {
  const db = getDatabase();
  if (!q?.trim()) {
    return db.query("SELECT * FROM library_books ORDER BY title").all();
  }
  const like = `%${q.trim()}%`;
  return db
    .query(
      "SELECT * FROM library_books WHERE title LIKE ?1 OR author LIKE ?1 OR isbn LIKE ?1 ORDER BY title",
    )
    .all(like);
}

export function getLibraryBookByIsbn(isbn: string) {
  return getDatabase().query("SELECT * FROM library_books WHERE isbn = ?").get(isbn);
}
