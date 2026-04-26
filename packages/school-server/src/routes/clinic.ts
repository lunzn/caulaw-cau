import { Elysia } from "elysia";
import { getDatabase } from "../db";

export const clinicRoutes = new Elysia({ prefix: "/clinic" })
  .get("/schedule", () => {
    const rows = getDatabase()
      .query("SELECT * FROM clinic_schedule ORDER BY department, day_type")
      .all();
    return { success: true, data: rows };
  })
  .get("/schedule/:department", ({ params: { department } }) => {
    const rows = getDatabase()
      .query("SELECT * FROM clinic_schedule WHERE department = ? ORDER BY day_type")
      .all(department);
    return { success: true, data: rows };
  });
