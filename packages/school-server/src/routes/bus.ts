import { Elysia } from "elysia";
import { getAllBusRoutes, getBusRouteById, getBusStops, getBusSchedules } from "../db";
import { beijingWeekday } from "../lib/beijing-time";

/** 今天是周几（1=周一…7=周日，按北京时间） */
function todayWeekday(): number {
  return beijingWeekday();
}

export const busRoutes = new Elysia({ prefix: "/bus" })
  .get("/routes", () => {
    const routes = getAllBusRoutes();
    return { success: true, data: routes };
  })
  .get("/routes/:id", ({ params: { id }, query }) => {
    const route = getBusRouteById(id);
    if (!route) return { success: false, message: "路线不存在" };
    const stops = getBusStops(id);
    const weekday = query.weekday ? Number(query.weekday) : todayWeekday();
    const schedules = getBusSchedules(id, weekday);
    return { success: true, data: { route, stops, schedules, weekday } };
  });
