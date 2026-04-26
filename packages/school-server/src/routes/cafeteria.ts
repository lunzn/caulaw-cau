import { Elysia } from "elysia";
import { getAllCafeterias, getCafeteriaMenu, getCafeteriaMenuByDate } from "../db";
import { getStudentTransactions, getStudentTransactionSummary } from "../db/transactions";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export const cafeteriaRoutes = new Elysia({ prefix: "/cafeteria" })
  .get("/", () => {
    const list = getAllCafeterias();
    return { success: true, data: list };
  })
  .get("/:id/menu", ({ params: { id }, query }) => {
    const date = (query.date as string | undefined) || today();
    const items = getCafeteriaMenu(id, date);
    return { success: true, data: items, date };
  })
  .get("/menu/today", ({ query }) => {
    const date = (query.date as string | undefined) || today();
    const items = getCafeteriaMenuByDate(date);
    return { success: true, data: items, date };
  })
  .get("/transactions/:studentId", ({ params: { studentId }, query }) => {
    const limit = Math.min(Number(query.limit ?? 50), 200);
    const list = getStudentTransactions(studentId, limit);
    return { success: true, data: list };
  })
  .get("/transactions/:studentId/summary", ({ params: { studentId } }) => {
    const summary = getStudentTransactionSummary(studentId);
    return { success: true, data: summary };
  });
