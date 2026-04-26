import { Elysia } from "elysia";
import {
  getLibrarySeats,
  searchLibraryBooks,
  getLibraryBookByIsbn,
  getSeatsAvailability,
  createReservation,
  getReservationsByStudent,
  cancelReservation,
  LIBRARY_TIME_SLOTS,
} from "../db";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export const libraryRoutes = new Elysia({ prefix: "/library" })
  .get("/seats", () => {
    const seats = getLibrarySeats();
    return { success: true, data: seats };
  })
  .get("/seats/availability", ({ query }) => {
    const date = (query.date as string | undefined) || today();
    const data = getSeatsAvailability(date);
    return { success: true, data, date, time_slots: LIBRARY_TIME_SLOTS };
  })
  .get("/books", ({ query }) => {
    const books = searchLibraryBooks(query.q as string | undefined);
    return { success: true, data: books };
  })
  .get("/books/:isbn", ({ params: { isbn } }) => {
    const book = getLibraryBookByIsbn(isbn);
    if (!book) return { success: false, message: "图书不存在" };
    return { success: true, data: book };
  })
  .get("/reservations/:studentId", ({ params: { studentId } }) => {
    const data = getReservationsByStudent(studentId);
    return { success: true, data };
  })
  .post("/reservations", ({ body }) => {
    const { student_id, area_name, date, time_slot } = body as {
      student_id: string; area_name: string; date: string; time_slot: string;
    };
    if (!student_id || !area_name || !date || !time_slot) {
      return { success: false, message: "student_id、area_name、date、time_slot 均为必填" };
    }
    if (!(LIBRARY_TIME_SLOTS as readonly string[]).includes(time_slot)) {
      return { success: false, message: `time_slot 须为：${LIBRARY_TIME_SLOTS.join("、")}` };
    }
    try {
      const reservation = createReservation({
        id: crypto.randomUUID(),
        student_id,
        area_name,
        date,
        time_slot,
      });
      return { success: true, data: reservation };
    } catch (e) {
      return { success: false, message: (e as Error).message };
    }
  })
  .delete("/reservations/:id", ({ params: { id }, body }) => {
    const { student_id } = (body ?? {}) as { student_id?: string };
    if (!student_id) return { success: false, message: "需要提供 student_id" };
    const result = cancelReservation(id, student_id);
    if (!result) return { success: false, message: "预约不存在、无权操作或已取消" };
    return { success: true, data: result };
  });
