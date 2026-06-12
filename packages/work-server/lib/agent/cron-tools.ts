import { Type } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { cronService } from "../../modules/cron/service";
import { reminderService } from "../../modules/reminder/service";
import {
  APP_TIMEZONE,
  dateStringInTZ,
  formatInTZ,
  hasExplicitOffset,
  weekdayInTZ,
} from "@/lib/time";

const CRON_TZ = APP_TIMEZONE;

/** "2026-06-01 00:19:19（周一）"，北京时间，含星期 */
function nowInTZ(): string {
  return formatInTZ(new Date(), { seconds: true });
}

/**
 * 供 pi-agent 调用的「周期性 cron + 一次性提醒」工具集；与后台 `CronService` / `ReminderService` 共用数据与调度。
 */
export function buildCronTools(
  ownerUserId: string,
  opts?: { defaultWechatTarget?: string },
): AgentTool[] {
  const createTask: AgentTool = {
    name: "create_scheduled_task",
    label: "创建定时任务",
    description:
      "创建一条定时任务：按 cron 表达式在指定时间向某个微信用户发送一条由本助手生成的消息。" +
      ` 触发时间按时区 ${CRON_TZ} 解析。` +
      ` Cron 为 5 段：分 时 日 月 周（周几 0=周日）。例如每天早 8 点：0 8 * * *；每 15 分钟：*/15 * * * *。` +
      (opts?.defaultWechatTarget
        ? " 若用户未说明发给谁，可省略 target_user_id，将发给当前对话的这位联系人。"
        : " 必须提供 target_user_id（微信 userId，如 xxx@im.wechat）。"),
    parameters: Type.Object({
      cron_expr: Type.String({
        description: `5 段 cron，如 "0 8 * * *" 表示每天 8:00`,
      }),
      prompt: Type.String({
        description:
          "到点时交给助手的提示词，用于生成要发送给对方的那段话（可写清风格与要点）",
      }),
      target_user_id: Type.Optional(
        Type.String({
          description:
            "接收消息的微信 userId，通常形如 xxx@im.wechat；与当前好友聊天时可省略",
        }),
      ),
    }),
    execute: async (_toolCallId, params) => {
      const p = params as Record<string, unknown>;
      const cronExpr = String(p.cron_expr ?? "").trim();
      const prompt = String(p.prompt ?? "").trim();
      const target =
        String(p.target_user_id ?? "").trim() ||
        opts?.defaultWechatTarget?.trim();
      if (!target) {
        throw new Error(
          "需要指定 target_user_id，或在当前私聊/对话中创建以便默认发给对方",
        );
      }
      if (!cronExpr || !prompt) {
        throw new Error("cron_expr 与 prompt 不能为空");
      }

      const result = await cronService.addTask(
        ownerUserId,
        cronExpr,
        prompt,
        target,
      );
      if (result instanceof Error) {
        throw result;
      }

      return {
        content: [
          {
            type: "text",
            text: `已创建定时任务 #${result.id}：${result.cron_expr} → 发给 ${result.target_user_id}。到点会按你的 prompt 生成内容并发出。`,
          },
        ],
        details: { taskId: result.id },
      };
    },
  };

  const listScheduledTasks: AgentTool = {
    name: "list_scheduled_tasks",
    label: "列出定时任务",
    description:
      "列出当前用户创建的所有周期性定时任务（含 id、cron 表达式、是否启用、目标联系人、prompt 摘要）。用户想查看、关闭或删除任务时先调用本工具拿 id。",
    parameters: Type.Object({}),
    execute: async () => {
      const rows = await cronService.listTasks(ownerUserId);
      if (!rows.length) {
        return {
          content: [
            {
              type: "text",
              text: "当前没有定时任务。",
            },
          ],
          details: { tasks: [] },
        };
      }
      const lines = rows.map((t) => {
        const on = t.enabled ? "启用" : "已关闭";
        const promptShort =
          t.prompt.length > 80 ? `${t.prompt.slice(0, 80)}…` : t.prompt;
        return `#${t.id} [${on}] cron=${t.cron_expr} → ${t.target_user_id}\n  说明：${promptShort}`;
      });
      return {
        content: [
          {
            type: "text",
            text: `共 ${rows.length} 条定时任务：\n${lines.join("\n")}`,
          },
        ],
        details: { tasks: rows.map((t) => ({ id: t.id, enabled: !!t.enabled })) },
      };
    },
  };

  const disableScheduledTask: AgentTool = {
    name: "disable_scheduled_task",
    label: "关闭定时任务",
    description:
      "关闭一条周期性定时任务（不再触发，记录仍保留，可之后在控制台重新启用）。需要任务 id，可先 list_scheduled_tasks。",
    parameters: Type.Object({
      task_id: Type.Integer({
        description: "定时任务 id（来自 list_scheduled_tasks 或创建时的返回）",
      }),
    }),
    execute: async (_toolCallId, params) => {
      const taskId = Number((params as Record<string, unknown>).task_id);
      if (!Number.isFinite(taskId) || taskId <= 0) {
        throw new Error("无效的 task_id");
      }
      const task = await cronService.toggleTask(ownerUserId, taskId, false);
      if (!task) {
        throw new Error(`未找到任务 #${taskId}，或无权操作`);
      }
      return {
        content: [
          {
            type: "text",
            text: `已关闭定时任务 #${taskId}（${task.cron_expr}），将不再触发。`,
          },
        ],
        details: { taskId },
      };
    },
  };

  const enableScheduledTask: AgentTool = {
    name: "enable_scheduled_task",
    label: "启用定时任务",
    description:
      "重新启用一条已关闭的周期性定时任务。需要任务 id，可先 list_scheduled_tasks。",
    parameters: Type.Object({
      task_id: Type.Integer({
        description: "定时任务 id",
      }),
    }),
    execute: async (_toolCallId, params) => {
      const taskId = Number((params as Record<string, unknown>).task_id);
      if (!Number.isFinite(taskId) || taskId <= 0) {
        throw new Error("无效的 task_id");
      }
      const task = await cronService.toggleTask(ownerUserId, taskId, true);
      if (!task) {
        throw new Error(`未找到任务 #${taskId}，或无权操作`);
      }
      return {
        content: [
          {
            type: "text",
            text: `已启用定时任务 #${taskId}（${task.cron_expr}），将按设定继续触发。`,
          },
        ],
        details: { taskId },
      };
    },
  };

  const deleteScheduledTask: AgentTool = {
    name: "delete_scheduled_task",
    label: "删除定时任务",
    description:
      "永久删除一条周期性定时任务（从系统中移除，无法恢复）。与「关闭」不同，删除后记录不再保留。",
    parameters: Type.Object({
      task_id: Type.Integer({
        description: "定时任务 id",
      }),
    }),
    execute: async (_toolCallId, params) => {
      const taskId = Number((params as Record<string, unknown>).task_id);
      if (!Number.isFinite(taskId) || taskId <= 0) {
        throw new Error("无效的 task_id");
      }
      const ok = await cronService.removeTask(ownerUserId, taskId);
      if (!ok) {
        throw new Error(`未找到任务 #${taskId}，或无权操作`);
      }
      return {
        content: [
          {
            type: "text",
            text: `已删除定时任务 #${taskId}。`,
          },
        ],
        details: { taskId },
      };
    },
  };

  const listPendingReminders: AgentTool = {
    name: "list_pending_reminders",
    label: "列出待执行提醒",
    description:
      "列出当前用户尚未触发的一次性提醒（含 id、计划时间、目标、prompt）。取消前可先调用以确认 id。",
    parameters: Type.Object({}),
    execute: async () => {
      const all = await reminderService.listReminders(ownerUserId);
      const rows = all.filter((r) => r.status === "pending");
      if (!rows.length) {
        return {
          content: [
            {
              type: "text",
              text: "当前没有待执行的提醒。",
            },
          ],
          details: { reminders: [] },
        };
      }
      const lines = rows.map((r) => {
        const promptShort =
          r.prompt.length > 80 ? `${r.prompt.slice(0, 80)}…` : r.prompt;
        return `#${r.id} 时间=${formatInTZ(new Date(r.run_at))}（北京时间） → ${r.target_user_id}\n  说明：${promptShort}`;
      });
      return {
        content: [
          {
            type: "text",
            text: `共 ${rows.length} 条待执行提醒：\n${lines.join("\n")}`,
          },
        ],
        details: {
          reminders: rows.map((r) => ({ id: r.id, run_at: r.run_at })),
        },
      };
    },
  };

  const cancelReminderTool: AgentTool = {
    name: "cancel_reminder",
    label: "取消提醒",
    description:
      "取消一条尚未执行的一次性提醒（到点前可取消）。需要提醒 id，可先 list_pending_reminders。",
    parameters: Type.Object({
      reminder_id: Type.Integer({
        description: "提醒 id",
      }),
    }),
    execute: async (_toolCallId, params) => {
      const reminderId = Number((params as Record<string, unknown>).reminder_id);
      if (!Number.isFinite(reminderId) || reminderId <= 0) {
        throw new Error("无效的 reminder_id");
      }
      const ok = await reminderService.cancelReminder(ownerUserId, reminderId);
      if (!ok) {
        throw new Error(
          `无法取消提醒 #${reminderId}（不存在、已执行或已结束）。`,
        );
      }
      return {
        content: [
          {
            type: "text",
            text: `已取消提醒 #${reminderId}。`,
          },
        ],
        details: { reminderId },
      };
    },
  };

  const scheduleReminder: AgentTool = {
    name: "schedule_reminder",
    label: "一次性定时提醒",
    description:
      `安排一次性提醒：到指定时间后，助手根据 prompt 生成提醒消息并发送给用户，只执行一次。\n` +
      `当前北京时间：${nowInTZ()}；今天是 ${dateStringInTZ()}（${weekdayInTZ()}），明天是 ${dateStringInTZ(Date.now(), 1)}（${weekdayInTZ(Date.now() + 86_400_000)}）。\n` +
      `【run_at 规则】填北京时间（${CRON_TZ}）的墙上时钟，格式 "YYYY-MM-DDTHH:mm:ss"，` +
      `如 "2026-06-02T08:00:00"。严禁带 Z 或 +08:00 等时区后缀，严禁自行换算成 UTC——直接写用户口中的钟点。\n` +
      `【相对日期换算】以上面给出的"今天/明天"日期为准："明天"=今天+1天，"后天"=今天+2天，"3小时后"用当前北京时间加3小时。` +
      `注意：凌晨 00:00–05:00 用户说"今天/明天"时有歧义（很多人把睡前的深夜仍当作"今天"），此时必须先反问用户确认具体日期（如"你是指今天6月1日早上8点，还是明天6月2日早上8点？"），确认后再创建。\n` +
      `【prompt 规则】到点后接收提醒的是设置提醒的用户本人（除非明确指定他人），prompt 必须用第二人称"你"书写（如"提醒你：8点有会议，请提前准备"），` +
      `严禁用第三人称称呼用户本人（如"提醒某某老师"）；prompt 中应包含事件的绝对日期时间，便于到点时表述准确。\n` +
      `【创建后】向用户确认时必须念出绝对日期+星期+时间（如"已设好，6月2日（周二）早上8点提醒你开会"），不要只说"明天"。` +
      (opts?.defaultWechatTarget
        ? " 若用户未说明发给谁，可省略 target_user_id。"
        : " 必须提供 target_user_id。"),
    parameters: Type.Object({
      run_at: Type.String({
        description: `执行时间，北京时间墙上时钟，格式 "YYYY-MM-DDTHH:mm:ss"（不带任何时区后缀），如 "2026-06-02T08:00:00"`,
      }),
      prompt: Type.String({
        description:
          "到时间后交给助手的提示词，用于生成要发送的提醒消息；用第二人称'你'称呼接收者，并写明事件的绝对日期时间",
      }),
      target_user_id: Type.Optional(
        Type.String({
          description: "接收消息的微信 userId；私聊时可省略",
        }),
      ),
    }),
    execute: async (_toolCallId, params) => {
      const p = params as Record<string, unknown>;
      const runAt = String(p.run_at ?? "").trim();
      const prompt = String(p.prompt ?? "").trim();
      const target =
        String(p.target_user_id ?? "").trim() ||
        opts?.defaultWechatTarget?.trim();
      if (!target) {
        throw new Error("需要指定 target_user_id");
      }
      if (!runAt || !prompt) {
        throw new Error("run_at 与 prompt 不能为空");
      }
      // 带 Z/偏移后缀通常意味着模型把北京时间错换算成了 UTC（会差 8 小时），拒绝并让其重试
      if (hasExplicitOffset(runAt)) {
        throw new Error(
          `run_at 不能带时区后缀（收到 "${runAt}"）。请直接填北京时间墙上时钟，` +
            `如 "2026-06-02T08:00:00"。当前北京时间：${nowInTZ()}。`,
        );
      }

      const result = await reminderService.addReminder(
        ownerUserId,
        runAt,
        prompt,
        target,
      );
      if (result instanceof Error) throw result;

      const runAtText = formatInTZ(new Date(result.run_at));
      return {
        content: [
          {
            type: "text",
            text: `已安排提醒 #${result.id}：将于 ${runAtText}（北京时间）发送给 ${result.target_user_id}。请按此时间向用户确认。`,
          },
        ],
        details: { reminderId: result.id },
      };
    },
  };

  return [
    createTask,
    scheduleReminder,
    listScheduledTasks,
    disableScheduledTask,
    enableScheduledTask,
    deleteScheduledTask,
    listPendingReminders,
    cancelReminderTool,
  ];
}

/** 与 `buildCronTools` 返回的工具名一致；用于合并工具列表时替换本模块工具而不删掉 MCP 等扩展 */
export const CRON_TOOL_NAMES = [
  "create_scheduled_task",
  "list_scheduled_tasks",
  "disable_scheduled_task",
  "enable_scheduled_task",
  "delete_scheduled_task",
  "list_pending_reminders",
  "cancel_reminder",
  "schedule_reminder",
] as const;
