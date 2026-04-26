import { getDatabase } from "./database";

export type RepairStatus = "pending" | "in_progress" | "done" | "closed";

export function createRepairTicket(data: {
  id: string;
  student_id: string;
  dorm_room: string;
  category: string;
  description: string;
}) {
  const db = getDatabase();
  db.run(
    `INSERT INTO repair_tickets (id, student_id, dorm_room, category, description, status)
     VALUES (?1, ?2, ?3, ?4, ?5, 'pending')`,
    [data.id, data.student_id, data.dorm_room, data.category, data.description],
  );
  return getRepairTicketById(data.id);
}

export function getRepairTicketsByStudent(studentId: string) {
  return getDatabase()
    .query("SELECT * FROM repair_tickets WHERE student_id = ? ORDER BY created_at DESC")
    .all(studentId);
}

export function getRepairTicketById(id: string) {
  return getDatabase().query("SELECT * FROM repair_tickets WHERE id = ?").get(id);
}

export function updateRepairStatus(id: string, status: RepairStatus) {
  const db = getDatabase();
  const result = db.run(
    "UPDATE repair_tickets SET status = ?1, updated_at = unixepoch() WHERE id = ?2",
    [status, id],
  );
  if (result.changes === 0) return null;
  return getRepairTicketById(id);
}
