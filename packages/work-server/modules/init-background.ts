import { setCronAgentHooks } from "@/modules/cron/service";
import { setReminderHooks } from "@/modules/reminder/service";
import { createCronReminderAgentHooks } from "@/lib/cron-reminder-agent-bridge";
import { cronService } from "@/modules/cron/service";
import { reminderService } from "@/modules/reminder/service";
import { botService } from "@/lib/bot/service";
import { startNewsWarmup } from "@/lib/news-warmer";

export async function initBackgroundServices(): Promise<void> {
  const agentHooks = createCronReminderAgentHooks();
  setCronAgentHooks(agentHooks);
  setReminderHooks(agentHooks);

  await botService.restorePersistedBots();
  await cronService.init();
  await reminderService.init();

  // 启动新闻缓存预热（立即执行 + 每 25 分钟定时执行）
  startNewsWarmup();
}
