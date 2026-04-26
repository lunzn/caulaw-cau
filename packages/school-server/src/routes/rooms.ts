import { Elysia } from "elysia";
import {
  getAllRooms,
  getRoomById,
  getStudentReservations,
  getRoomReservationsByDate,
  createRoomReservation,
  cancelRoomReservation,
} from "../db";

export const roomRoutes = new Elysia({ prefix: "/rooms" })
  .get("/", ({ query }) => {
    const type = query.type as string | undefined;
    const rooms = getAllRooms(type);
    return { success: true, data: rooms };
  })
  .get("/:id", ({ params: { id } }) => {
    const room = getRoomById(id);
    if (!room) return new Response(JSON.stringify({ error: "教室/会议室不存在" }), { status: 404 });
    return { success: true, data: room };
  })
  .get("/:id/reservations", ({ params: { id }, query }) => {
    const date = query.date as string | undefined;
    if (!date) return new Response(JSON.stringify({ error: "请提供 date 参数（YYYY-MM-DD）" }), { status: 400 });
    const list = getRoomReservationsByDate(id, date);
    return { success: true, data: list, date };
  })
  .get("/student/:studentId", ({ params: { studentId } }) => {
    const list = getStudentReservations(studentId);
    return { success: true, data: list };
  })
  .post("/reserve", ({ body }) => {
    const b = body as {
      student_id?: string;
      room_id?: string;
      date?: string;
      start_time?: string;
      end_time?: string;
      purpose?: string;
    };
    if (!b.student_id || !b.room_id || !b.date || !b.start_time || !b.end_time) {
      return new Response(
        JSON.stringify({ error: "缺少必填字段：student_id, room_id, date, start_time, end_time" }),
        { status: 400 },
      );
    }
    const result = createRoomReservation({
      studentId: b.student_id,
      roomId: b.room_id,
      date: b.date,
      startTime: b.start_time,
      endTime: b.end_time,
      purpose: b.purpose,
    });
    if ("error" in result) {
      return new Response(JSON.stringify({ error: result.error }), { status: 409 });
    }
    return { success: true, data: result.reservation, message: result.message };
  })
  .delete("/reservations/:id", ({ params: { id }, body }) => {
    const b = body as { student_id?: string };
    if (!b?.student_id) {
      return new Response(JSON.stringify({ error: "缺少 student_id" }), { status: 400 });
    }
    const ok = cancelRoomReservation(id, b.student_id);
    if (!ok) return new Response(JSON.stringify({ error: "预约不存在或无权操作" }), { status: 404 });
    return { success: true, message: "预约已取消" };
  });
