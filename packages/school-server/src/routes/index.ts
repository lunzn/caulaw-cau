import { Elysia } from "elysia";
import { teacherRoutes } from "./teachers";
import { studentRoutes } from "./students";
import { courseRoutes } from "./courses";
import { assignmentRoutes } from "./assignments";
import { libraryRoutes } from "./library";
import { cafeteriaRoutes } from "./cafeteria";
import { busRoutes } from "./bus";
import { campusCardRoutes } from "./campus-card";
import { roomRoutes } from "./rooms";
import { clinicRoutes } from "./clinic";
import { teacherPortalRoutes } from "./teacher-portal";

export const setupRoutes = new Elysia({ prefix: "/api" })
  .use(teacherRoutes)
  .use(studentRoutes)
  .use(courseRoutes)
  .use(assignmentRoutes)
  .use(libraryRoutes)
  .use(cafeteriaRoutes)
  .use(busRoutes)
  .use(campusCardRoutes)
  .use(roomRoutes)
  .use(clinicRoutes)
  .use(teacherPortalRoutes);
