import type { CronAgentHooks } from "../modules/cron/service";
import type { ReminderHooks } from "../modules/reminder/service";
import { agentService } from "@/modules/agent/service";

/**
 * Cron / Reminder 到点执行时调用的「无定时工具」agent.prompt，与会话内 chat 共用同一 pi-coding-agent 用户级 Session。
 *
 * 注意：这里**不**传入 wechatBot —— 定时执行时 agent 不应自行调用 wechat_send，
 * 否则会出现「agent 自己发一遍 + cron 层再发一遍」双发，以及 agent 声称「已发送成功」
 * 但实际推送失败的谎报问题。统一由 CronService / ReminderService 作为唯一发送方，
 * 负责重试、失败入队补发与状态记录。
 */
export function createCronReminderAgentHooks(): CronAgentHooks & ReminderHooks {
  return {
    enqueue: (userId: string, task: () => Promise<void>) =>
      agentService.enqueue(userId, task),
    prompt: (userId: string, text: string) =>
      agentService.prompt(userId, text, undefined, {
        cronTools: false,
      }),
  };
}
