import { getDatabase } from "./database";

export function getAllCafeterias() {
  return getDatabase().query("SELECT * FROM cafeterias ORDER BY name").all();
}

export function getCafeteriaMenu(cafeteriaId: string, date: string) {
  return getDatabase()
    .query(
      "SELECT * FROM cafeteria_menu WHERE cafeteria_id = ?1 AND date = ?2 ORDER BY category, name",
    )
    .all(cafeteriaId, date);
}

export function getCafeteriaMenuByDate(date: string) {
  return getDatabase()
    .query(
      `SELECT m.*, c.name as cafeteria_name, c.location as cafeteria_location
       FROM cafeteria_menu m
       JOIN cafeterias c ON c.id = m.cafeteria_id
       WHERE m.date = ?
       ORDER BY c.name, m.category, m.name`,
    )
    .all(date);
}
