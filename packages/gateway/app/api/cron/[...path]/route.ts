import { proxyToElysia } from "@/lib/proxy-elysia";

export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const segments = (await context.params).path ?? [];
  if (segments.length !== 1 || segments[0] !== "tasks") {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  return proxyToElysia(request, "cron/tasks");
}

export async function POST(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const segments = (await context.params).path ?? [];
  if (segments.length !== 1 || segments[0] !== "tasks") {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  return proxyToElysia(request, "cron/tasks");
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const segments = (await context.params).path ?? [];
  if (
    segments.length !== 2 ||
    segments[0] !== "tasks" ||
    !/^\d+$/.test(segments[1])
  ) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  return proxyToElysia(request, `cron/tasks/${segments[1]}`);
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const segments = (await context.params).path ?? [];
  if (
    segments.length !== 2 ||
    segments[0] !== "tasks" ||
    !/^\d+$/.test(segments[1])
  ) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  return proxyToElysia(request, `cron/tasks/${segments[1]}`);
}
