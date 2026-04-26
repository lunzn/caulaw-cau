import { auth } from "@/lib/auth";
import { getUserSchoolIdentity } from "@/lib/user-identity";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { workerUserHeaders } from "@/lib/worker-proxy";
import { DashboardView } from "./dashboard-view";
import type { BotPayload, CronTaskRow } from "./dashboard-view";

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/");

  const userId = session.user.id;
  const identity = await getUserSchoolIdentity(userId);

  let initialDataFromServer = false;
  let initialBot: BotPayload | null = null;
  let initialTasks: CronTaskRow[] = [];

  try {
    const [botResponse, tasksResponse] = await Promise.all([
      fetch(`${process.env.WORK_SERVER_URL}/internal/bot/status`, {
        headers: workerUserHeaders(userId, identity),
        cache: "no-store",
      }),
      fetch(`${process.env.WORK_SERVER_URL}/internal/cron/tasks`, {
        headers: workerUserHeaders(userId, identity),
        cache: "no-store",
      }),
    ]);

    if (botResponse.ok && tasksResponse.ok) {
      initialBot = (await botResponse.json()) as BotPayload;
      const tasksJson = (await tasksResponse.json()) as { tasks: CronTaskRow[] };
      initialTasks = tasksJson.tasks ?? [];
      initialDataFromServer = true;
    }
  } catch {
    /* Elysia 未启动等：由客户端再通过 /api 补拉 */
  }

  return (
    <DashboardView
      username={session.user.name ?? session.user.email ?? session.user.id}
      userId={userId}
      identity={identity}
      initialDataFromServer={initialDataFromServer}
      initialBot={initialBot}
      initialTasks={initialTasks}
    />
  );
}
