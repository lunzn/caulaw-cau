import { Elysia } from "elysia";
import { getCampusCard } from "../db";

export const campusCardRoutes = new Elysia({ prefix: "/campus-card" })
  .get("/:studentId", ({ params: { studentId } }) => {
    const card = getCampusCard(studentId);
    if (!card) return { success: false, message: "校园卡不存在或该学生无记录" };
    return { success: true, data: card };
  });
