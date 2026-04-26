import { auth } from "@/lib/auth";
import { getUserSchoolIdentity } from "@/lib/user-identity";
import { headers } from "next/headers";

export async function getSessionFromHeaders() {
  return auth.api.getSession({ headers: await headers() });
}

export async function requireUserIdFromRequest(
  request: Request,
): Promise<{ userId: string } | Response> {
  const data = await auth.api.getSession({ headers: request.headers });
  const userId = data?.user?.id;
  if (!userId) {
    return Response.json({ error: "未登录或 token 无效" }, { status: 401 });
  }
  return { userId };
}

export async function requireUserContextFromRequest(
  request: Request,
): Promise<{ userId: string; identity: Awaited<ReturnType<typeof getUserSchoolIdentity>> } | Response> {
  const data = await auth.api.getSession({ headers: request.headers });
  const userId = data?.user?.id;
  if (!userId) {
    return Response.json({ error: "未登录或 token 无效" }, { status: 401 });
  }
  const identity = await getUserSchoolIdentity(userId);
  return { userId, identity };
}
