import { requireUserContextFromRequest } from "@/lib/api-session";
import { workerUserHeaders } from "@/lib/worker-proxy";

/**
 * 已登录用户 → Elysia `/internal/...` 的透明转发（Session Cookie → X-User-Id）。
 */
export async function proxyToElysia(
  request: Request,
  internalPath: string,
): Promise<Response> {
  const sessionResult = await requireUserContextFromRequest(request);
  if (sessionResult instanceof Response) return sessionResult;

  const targetUrl = `${process.env.WORK_SERVER_URL}/internal/${internalPath}`;
  const forwardHeaders = new Headers(
    workerUserHeaders(sessionResult.userId, sessionResult.identity),
  );
  const contentType = request.headers.get("content-type");
  if (contentType) forwardHeaders.set("content-type", contentType);

  const method = request.method;
  const init: RequestInit = {
    method,
    headers: forwardHeaders,
  };

  if (!["GET", "HEAD"].includes(method)) {
    const bodyBuffer = await request.arrayBuffer();
    if (bodyBuffer.byteLength > 0) init.body = bodyBuffer;
  }

  const upstream = await fetch(targetUrl, init);
  return new Response(upstream.body, {
    status: upstream.status,
    headers: upstream.headers,
  });
}
