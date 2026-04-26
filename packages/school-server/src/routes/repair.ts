import { Elysia } from "elysia";
import { createRepairTicket, getRepairTicketsByStudent, updateRepairStatus, type RepairStatus } from "../db";

const VALID_STATUSES: RepairStatus[] = ["pending", "in_progress", "done", "closed"];
const VALID_CATEGORIES = ["水电", "网络", "家具", "门窗", "空调", "其他"];

export const repairRoutes = new Elysia({ prefix: "/repair" })
  .get("/:studentId", ({ params: { studentId } }) => {
    const tickets = getRepairTicketsByStudent(studentId);
    return { success: true, data: tickets };
  })
  .post("/", ({ body }) => {
    const { student_id, dorm_room, category, description } = body as {
      student_id: string;
      dorm_room: string;
      category: string;
      description: string;
    };
    if (!student_id || !dorm_room || !category || !description) {
      return { success: false, message: "student_id、dorm_room、category、description 均为必填" };
    }
    if (!VALID_CATEGORIES.includes(category)) {
      return { success: false, message: `category 须为以下之一：${VALID_CATEGORIES.join("、")}` };
    }
    const ticket = createRepairTicket({
      id: crypto.randomUUID(),
      student_id,
      dorm_room,
      category,
      description,
    });
    return { success: true, data: ticket };
  })
  .patch("/:id/status", ({ params: { id }, body }) => {
    const { status } = body as { status: string };
    if (!VALID_STATUSES.includes(status as RepairStatus)) {
      return { success: false, message: `status 须为：${VALID_STATUSES.join("、")}` };
    }
    const ticket = updateRepairStatus(id, status as RepairStatus);
    if (!ticket) return { success: false, message: "工单不存在" };
    return { success: true, data: ticket };
  });
