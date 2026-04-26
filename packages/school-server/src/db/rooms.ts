import { getDatabase } from "./database";
import type { Room, RoomReservation } from "../types";

export function getAllRooms(type?: string): Room[] {
  const db = getDatabase();
  if (type) {
    return db.query("SELECT * FROM rooms WHERE type = ? ORDER BY building, floor, name").all(type) as Room[];
  }
  return db.query("SELECT * FROM rooms ORDER BY building, floor, name").all() as Room[];
}

export function getRoomById(id: string): Room | null {
  return getDatabase().query("SELECT * FROM rooms WHERE id = ?").get(id) as Room | null;
}

export function getStudentReservations(studentId: string): RoomReservation[] {
  return getDatabase()
    .query(`
      SELECT rr.*, r.name as room_name, r.address, r.building, r.type as room_type
      FROM room_reservations rr
      JOIN rooms r ON r.id = rr.room_id
      WHERE rr.student_id = ?
      ORDER BY rr.date DESC, rr.start_time DESC
    `)
    .all(studentId) as RoomReservation[];
}

export function getRoomReservationsByDate(roomId: string, date: string): RoomReservation[] {
  return getDatabase()
    .query("SELECT * FROM room_reservations WHERE room_id = ? AND date = ? AND status = 'confirmed' ORDER BY start_time")
    .all(roomId, date) as RoomReservation[];
}

export function createRoomReservation(input: {
  studentId: string;
  roomId: string;
  date: string;
  startTime: string;
  endTime: string;
  purpose?: string;
}): { reservation: RoomReservation & { room: Room; student_name: string }; message: string } | { error: string } {
  const db = getDatabase();

  const room = getRoomById(input.roomId);
  if (!room) return { error: "教室/会议室不存在" };

  const student = db.query("SELECT id, name FROM students WHERE id = ?").get(input.studentId) as { id: string; name: string } | null;
  if (!student) return { error: "学生不存在" };

  // 检查时间冲突
  const conflict = db.query(`
    SELECT id FROM room_reservations
    WHERE room_id = ? AND date = ? AND status = 'confirmed'
      AND NOT (end_time <= ? OR start_time >= ?)
  `).get(input.roomId, input.date, input.startTime, input.endTime);
  if (conflict) return { error: "该时间段已被预约，请选择其他时段" };

  const id = crypto.randomUUID();
  db.run(`
    INSERT INTO room_reservations (id, student_id, room_id, date, start_time, end_time, purpose, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed')
  `, [id, input.studentId, input.roomId, input.date, input.startTime, input.endTime, input.purpose ?? null]);

  const roomTypeName = room.type === "meeting_room" ? "会议室" : "教室";
  const message = `您的${roomTypeName}已预约成功，地址：${room.address}。时间：${input.date} ${input.startTime}-${input.endTime}，预约人：${student.name}。`;

  const reservation = db.query(`
    SELECT rr.*, r.name as room_name, r.address, r.building, r.type as room_type, s.name as student_name
    FROM room_reservations rr
    JOIN rooms r ON r.id = rr.room_id
    JOIN students s ON s.id = rr.student_id
    WHERE rr.id = ?
  `).get(id) as RoomReservation & { room: Room; student_name: string };

  return { reservation, message };
}

export function cancelRoomReservation(id: string, studentId: string): boolean {
  const result = getDatabase().run(
    "UPDATE room_reservations SET status = 'cancelled' WHERE id = ? AND student_id = ? AND status = 'confirmed'",
    [id, studentId],
  );
  return result.changes > 0;
}
