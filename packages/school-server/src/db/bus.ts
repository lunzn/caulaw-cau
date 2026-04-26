import { getDatabase } from "./database";

export function getAllBusRoutes() {
  return getDatabase().query("SELECT * FROM bus_routes ORDER BY name").all();
}

export function getBusRouteById(id: string) {
  return getDatabase().query("SELECT * FROM bus_routes WHERE id = ?").get(id);
}

export function getBusStops(routeId: string) {
  return getDatabase()
    .query("SELECT * FROM bus_stops WHERE route_id = ? ORDER BY sequence")
    .all(routeId);
}

/**
 * 返回今天（按 days 位掩码）有效的发车时刻，并标注距现在最近的班次。
 * days 字段存储为逗号分隔的周几（1=周一…7=周日）。
 */
export function getBusSchedules(routeId: string, weekday?: number) {
  const db = getDatabase();
  const rows = db
    .query("SELECT * FROM bus_schedules WHERE route_id = ? ORDER BY departure_time")
    .all(routeId) as { id: string; route_id: string; departure_time: string; days: string; direction: string }[];

  if (weekday === undefined) return rows;
  return rows.filter((r) => r.days.split(",").map(Number).includes(weekday));
}
