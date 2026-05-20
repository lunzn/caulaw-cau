import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

/**
 * 周期性微信定时任务
 *
 * last_* 字段记录最近一次执行情况，用于控制台可见性与去重：
 * - lastRunStatus: ok（已发送）| skipped（无新内容/重复，未发送）| queued（推送失败已入队补发）| failed（执行/不在线失败）
 * - lastDigest: 上次已推送内容的指纹，与本次相同则跳过，避免重复骚扰
 */
export const scheduledTasks = pgTable("scheduled_tasks", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  cronExpr: text("cron_expr").notNull(),
  prompt: text("prompt").notNull(),
  targetUserId: text("target_user_id").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastRunAt: timestamp("last_run_at"),
  lastRunStatus: text("last_run_status"),
  lastError: text("last_error"),
  lastDigest: text("last_digest"),
});

/**
 * 一次性提醒
 *
 * status: pending（待执行）| done（已完成）| failed（执行失败）| queued（推送失败已入队补发）| expired（bot 不在线已过期）
 */
export const reminders = pgTable("reminders", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  runAt: timestamp("run_at").notNull(),
  prompt: text("prompt").notNull(),
  targetUserId: text("target_user_id").notNull(),
  status: text("status").notNull().default("pending"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * 定时任务/提醒推送失败时的补发队列。
 * 当目标联系人下次主动给 Bot 发消息时（此时有新鲜 context_token），优先补发这些积压内容。
 * 这是对微信个人号协议"不能随意主动推送"限制的兜底——保证内容最终必达。
 */
export const pendingDeliveries = pgTable(
  "pending_deliveries",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    targetUserId: text("target_user_id").notNull(),
    content: text("content").notNull(),
    source: text("source").notNull(), // 'cron' | 'reminder'
    sourceId: integer("source_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("pending_deliveries_user_target_idx").on(
      table.userId,
      table.targetUserId,
    ),
  ],
);

/** 曾成功上线的微信 Bot，用于进程重启后自动连接 */
export const wechatBotAutostart = pgTable("wechat_bot_autostart", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/** 曾向该 Bot 发送过消息的微信联系人，用于重连后主动发欢迎语 */
export const wechatKnownContacts = pgTable(
  "wechat_known_contacts",
  {
    botUserId: text("bot_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    contactUserId: text("contact_user_id").notNull(),
    lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.botUserId, table.contactUserId] })],
);

/** 用户与教务身份绑定（student/teacher） */
export const userSchoolBindings = pgTable(
  "user_school_bindings",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    schoolId: text("school_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("user_school_bindings_role_school_id_uidx").on(
      table.role,
      table.schoolId,
    ),
    index("user_school_bindings_role_idx").on(table.role),
  ],
);

export const scheduledTasksRelations = relations(scheduledTasks, ({ one }) => ({
  user: one(user, {
    fields: [scheduledTasks.userId],
    references: [user.id],
  }),
}));

export const remindersRelations = relations(reminders, ({ one }) => ({
  user: one(user, {
    fields: [reminders.userId],
    references: [user.id],
  }),
}));

export const pendingDeliveriesRelations = relations(
  pendingDeliveries,
  ({ one }) => ({
    user: one(user, {
      fields: [pendingDeliveries.userId],
      references: [user.id],
    }),
  }),
);

export const userSchoolBindingsRelations = relations(
  userSchoolBindings,
  ({ one }) => ({
    user: one(user, {
      fields: [userSchoolBindings.userId],
      references: [user.id],
    }),
  }),
);
