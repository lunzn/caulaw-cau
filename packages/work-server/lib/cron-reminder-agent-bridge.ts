import type { CronAgentHooks } from "../modules/cron/service";
import type { ReminderHooks } from "../modules/reminder/service";
import { agentService } from "@/modules/agent/service";
import { botService } from "@/lib/bot/service";

/**
 * Cron / Reminder 到点执行时调用的「无定时工具」agent.prompt，与会话内 chat 共用同一 pi-coding-agent 用户级 Session。
 */
export function createCronReminderAgentHooks(): CronAgentHooks & ReminderHooks {
  return {
    enqueue: (userId: string, task: () => Promise<void>) =>
      agentService.enqueue(userId, task),
    prompt: (userId: string, text: string) =>
      agentService.prompt(userId, text, undefined, {
        cronTools: false,
        wechatBot: botService.getBot(userId),
      }),
  };
}
