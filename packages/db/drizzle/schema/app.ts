import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

/** 周期性微信定时任务 */
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
});

/** 一次性提醒 */
export const reminders = pgTable("reminders", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  runAt: timestamp("run_at").notNull(),
  prompt: text("prompt").notNull(),
  targetUserId: text("target_user_id").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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

export const userSchoolBindingsRelations = relations(
  userSchoolBindings,
  ({ one }) => ({
    user: one(user, {
      fields: [userSchoolBindings.userId],
      references: [user.id],
    }),
  }),
);
