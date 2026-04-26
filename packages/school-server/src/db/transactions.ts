import { getDatabase } from "./database";
import type { CafeteriaTransaction } from "../types";

export function getStudentTransactions(studentId: string, limit = 50): CafeteriaTransaction[] {
  return getDatabase()
    .query(`
      SELECT ct.*, c.name as cafeteria_name, c.short_name as cafeteria_short_name
      FROM cafeteria_transactions ct
      JOIN cafeterias c ON c.id = ct.cafeteria_id
      WHERE ct.student_id = ?
      ORDER BY ct.transaction_time DESC
      LIMIT ?
    `)
    .all(studentId, limit) as CafeteriaTransaction[];
}

export function getStudentTransactionSummary(studentId: string): {
  total_spent: number;
  total_calories: number;
  transaction_count: number;
  by_cafeteria: { cafeteria_name: string; spent: number; count: number }[];
} {
  const db = getDatabase();

  const total = db.query(`
    SELECT
      ROUND(SUM(price), 2) as total_spent,
      SUM(COALESCE(calories, 0)) as total_calories,
      COUNT(*) as transaction_count
    FROM cafeteria_transactions
    WHERE student_id = ?
  `).get(studentId) as { total_spent: number; total_calories: number; transaction_count: number };

  const byCafeteria = db.query(`
    SELECT c.name as cafeteria_name, ROUND(SUM(ct.price), 2) as spent, COUNT(*) as count
    FROM cafeteria_transactions ct
    JOIN cafeterias c ON c.id = ct.cafeteria_id
    WHERE ct.student_id = ?
    GROUP BY ct.cafeteria_id
    ORDER BY spent DESC
  `).all(studentId) as { cafeteria_name: string; spent: number; count: number }[];

  return {
    total_spent: total?.total_spent ?? 0,
    total_calories: total?.total_calories ?? 0,
    transaction_count: total?.transaction_count ?? 0,
    by_cafeteria: byCafeteria,
  };
}

export function insertTransaction(tx: Omit<CafeteriaTransaction, "id">): void {
  getDatabase().run(`
    INSERT INTO cafeteria_transactions (id, student_id, cafeteria_id, item_name, price, calories, meal_type, transaction_time)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [crypto.randomUUID(), tx.student_id, tx.cafeteria_id, tx.item_name, tx.price, tx.calories ?? null, tx.meal_type, tx.transaction_time]);
}
