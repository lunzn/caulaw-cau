import { requireUserIdFromRequest } from "@/lib/api-session";
import {
  bindUserSchoolIdentity,
  getUserSchoolIdentity,
  isSchoolIdentityRole,
  unbindUserSchoolIdentity,
} from "@/lib/user-identity";

export async function GET(request: Request) {
  const session = await requireUserIdFromRequest(request);
  if (session instanceof Response) return session;

  const identity = await getUserSchoolIdentity(session.userId);
  return Response.json({ identity });
}

export async function PUT(request: Request) {
  const session = await requireUserIdFromRequest(request);
  if (session instanceof Response) return session;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "请求体必须是 JSON" }, { status: 400 });
  }

  const role = String((payload as { role?: unknown }).role ?? "").trim();
  const schoolId = String((payload as { schoolId?: unknown }).schoolId ?? "").trim();

  if (!isSchoolIdentityRole(role)) {
    return Response.json(
      { error: "role 必须是 student 或 teacher" },
      { status: 400 },
    );
  }
  if (!schoolId) {
    return Response.json({ error: "schoolId 不能为空" }, { status: 400 });
  }

  try {
    const identity = await bindUserSchoolIdentity({
      userId: session.userId,
      role,
      schoolId,
    });
    return Response.json({ identity });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // 唯一约束冲突：该校园卡号已被其他账号绑定
    if (msg.includes("unique") || msg.includes("duplicate") || msg.includes("23505")) {
      return Response.json(
        { error: "该校园卡号已被其他账号绑定，请先解绑原账号" },
        { status: 409 },
      );
    }
    console.error("[identity PUT]", err);
    return Response.json({ error: "绑定失败，请稍后重试" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await requireUserIdFromRequest(request);
  if (session instanceof Response) return session;

  await unbindUserSchoolIdentity(session.userId);
  return Response.json({ ok: true });
}
