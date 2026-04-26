import { proxyToElysia } from "@/lib/proxy-elysia";

export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const segments = (await context.params).path ?? [];
  if (segments.length !== 1 || segments[0] !== "status") {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  return proxyToElysia(request, "bot/status");
}

export async function POST(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const segments = (await context.params).path ?? [];
  if (
    segments.length !== 1 ||
    (segments[0] !== "start" && segments[0] !== "stop")
  ) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  return proxyToElysia(request, `bot/${segments[0]}`);
}
