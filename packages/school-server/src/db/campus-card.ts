import { getDatabase } from "./database";

export function getCampusCard(studentId: string) {
  return getDatabase()
    .query("SELECT * FROM campus_cards WHERE student_id = ?")
    .get(studentId);
}

export function upsertCampusCard(studentId: string, balance: number, netBalance: number) {
  const db = getDatabase();
  db.run(
    `INSERT INTO campus_cards (student_id, balance, net_balance, updated_at)
     VALUES (?1, ?2, ?3, unixepoch())
     ON CONFLICT(student_id) DO UPDATE SET
       balance = ?2, net_balance = ?3, updated_at = unixepoch()`,
    [studentId, balance, netBalance],
  );
  return getCampusCard(studentId);
}
