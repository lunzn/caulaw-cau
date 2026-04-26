import { Elysia } from "elysia";
import { getTeacherById } from "../db/teachers";
import { getTeacherPapers, getTeacherPatents, getOpenProjects } from "../db/teacher-portal";

export const teacherPortalRoutes = new Elysia()
  // GET /api/teachers/:id/papers?year=2024&region=港澳&limit=20&offset=0
  .get("/teachers/:id/papers", ({ params: { id }, query }) => {
    const teacher = getTeacherById(id);
    if (!teacher) return { success: false, message: "教师不存在" };
    const papers = getTeacherPapers(id, {
      year:      query.year      ? parseInt(query.year      as string) : undefined,
      year_from: query.year_from ? parseInt(query.year_from as string) : undefined,
      region:    query.region    ? (query.region as string) : undefined,
      limit:     query.limit     ? parseInt(query.limit     as string) : undefined,
      offset:    query.offset    ? parseInt(query.offset    as string) : undefined,
    });
    return { success: true, total: papers.length, data: papers };
  })

  // GET /api/teachers/:id/patents?type=发明专利&region=港澳&limit=20
  .get("/teachers/:id/patents", ({ params: { id }, query }) => {
    const teacher = getTeacherById(id);
    if (!teacher) return { success: false, message: "教师不存在" };
    const patents = getTeacherPatents(id, {
      type:   query.type   ? (query.type   as string) : undefined,
      region: query.region ? (query.region as string) : undefined,
      limit:  query.limit  ? parseInt(query.limit  as string) : undefined,
      offset: query.offset ? parseInt(query.offset as string) : undefined,
    });
    return { success: true, total: patents.length, data: patents };
  })

  // GET /api/projects/open?category=智慧农业&status=open
  .get("/projects/open", ({ query }) => {
    const projects = getOpenProjects({
      category: query.category ? (query.category as string) : undefined,
      status:   query.status   ? (query.status   as string) : "open",
    });
    return { success: true, total: projects.length, data: projects };
  });
