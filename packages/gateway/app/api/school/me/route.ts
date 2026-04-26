import { requireUserContextFromRequest } from "@/lib/api-session";
import { schoolServerBaseUrl } from "@/lib/school-server";

type SchoolApiOk<T> = { success: true; data: T };
type SchoolApiFail = { success: false; message?: string };
type SchoolApiResponse<T> = SchoolApiOk<T> | SchoolApiFail;

/** 动态数据（作业截止、提交状态）不缓存；静态数据（档案、课程）缓存 5 分钟 */
async function fetchSchoolData<T>(path: string, revalidate?: number): Promise<T> {
  const res = await fetch(`${schoolServerBaseUrl()}${path}`, {
    next: revalidate ? { revalidate } : undefined,
    cache: revalidate ? undefined : "no-store",
  });
  if (!res.ok) {
    throw new Error(`school-server 请求失败（${res.status}）`);
  }
  const payload = (await res.json()) as SchoolApiResponse<T>;
  if (!payload.success) {
    throw new Error(payload.message || "school-server 返回失败");
  }
  return payload.data;
}

export async function GET(request: Request) {
  const ctx = await requireUserContextFromRequest(request);
  if (ctx instanceof Response) return ctx;

  if (!ctx.identity) {
    return Response.json(
      { error: "请先在 Dashboard 绑定学生或教师身份" },
      { status: 403 },
    );
  }

  const { role, schoolId } = ctx.identity;
  try {
    if (role === "student") {
      // profile/courses 变化少，缓存 5 分钟；作业/提交实时获取
      const [profile, courses, unsubmittedAssignments, submissions] =
        await Promise.all([
          fetchSchoolData(`/api/students/${schoolId}`, 300),
          fetchSchoolData(`/api/students/${schoolId}/courses`, 300),
          fetchSchoolData(`/api/assignments/unsubmitted/${schoolId}`),
          fetchSchoolData(`/api/assignments/student-submissions/${schoolId}`),
        ]);

      return Response.json({
        role,
        schoolId,
        profile,
        courses,
        unsubmittedAssignments,
        submissions,
      });
    }

    // 教师：profile/courses 缓存 5 分钟；作业通过聚合接口一次取完（避免 N+1）
    const [profile, courses, assignmentsByCourse] = await Promise.all([
      fetchSchoolData(`/api/teachers/${schoolId}`, 300),
      fetchSchoolData(`/api/courses/by-teacher/${schoolId}`, 300),
      fetchSchoolData(`/api/teachers/${schoolId}/assignments`, 300),
    ]);

    return Response.json({
      role,
      schoolId,
      profile,
      courses,
      assignmentsByCourse,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "查询教务信息失败";
    return Response.json({ error: message }, { status: 502 });
  }
}
