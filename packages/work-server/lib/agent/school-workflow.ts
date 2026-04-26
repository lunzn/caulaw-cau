import type { IncomingMessage, WeChatBot } from "@wechatbot/wechatbot";
import { db } from "@/lib/db";
import { userSchoolBindings } from "@cau-claw/db";
import { and, eq, inArray } from "drizzle-orm";
import type { SchoolIdentityContext } from "@/lib/agent/bash-tool";

type UnsubmittedAssignment = {
  id: string;
  title: string;
  deadline: number;
  course?: { name?: string; code?: string };
};

export type PendingSubmissionFile = {
  relativePath: string;
  fileName: string;
  receivedAt: number;
};

type PendingSubmissionContext = {
  file: PendingSubmissionFile;
  options: UnsubmittedAssignment[];
};

type TeacherCourseOption = {
  id: string;
  name: string;
  code: string;
};

type PendingTeacherPublishContext = {
  file: PendingSubmissionFile;
  courses: TeacherCourseOption[];
};

const DEFAULT_SCHOOL_SERVER_URL = "http://127.0.0.1:3002";

function schoolServerBaseUrl(): string {
  return (
    process.env.SCHOOL_SERVER_URL?.trim() || DEFAULT_SCHOOL_SERVER_URL
  ).replace(/\/$/, "");
}

async function schoolApiGet<T>(apiPath: string): Promise<T> {
  const res = await fetch(`${schoolServerBaseUrl()}${apiPath}`);
  if (!res.ok) {
    throw new Error(`school-server 请求失败（${res.status}）`);
  }
  const payload = (await res.json()) as {
    success?: boolean;
    data?: T;
    message?: string;
  };
  if (!payload.success) {
    throw new Error(payload.message || "school-server 返回失败");
  }
  return payload.data as T;
}

async function schoolApiPost<T>(
  apiPath: string,
  body: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${schoolServerBaseUrl()}${apiPath}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`school-server 请求失败（${res.status}）`);
  }
  const payload = (await res.json()) as {
    success?: boolean;
    data?: T;
    message?: string;
  };
  if (!payload.success) {
    throw new Error(payload.message || "school-server 返回失败");
  }
  return payload.data as T;
}

export async function loadUserSchoolIdentity(
  userId: string,
): Promise<SchoolIdentityContext> {
  const rows = await db
    .select({
      role: userSchoolBindings.role,
      schoolId: userSchoolBindings.schoolId,
    })
    .from(userSchoolBindings)
    .where(eq(userSchoolBindings.userId, userId))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  if (row.role !== "student" && row.role !== "teacher") return null;
  return { role: row.role, schoolId: row.schoolId };
}

export function injectSchoolIdentityContext(
  text: string,
  identity: SchoolIdentityContext,
): string {
  const base = text.trim();
  if (!identity) {
    return (
      "系统约束：当前用户未绑定 student/teacher 身份。你必须拒绝任何教务系统数据查询、列举、下载、统计请求，并提示先在 dashboard 绑定身份。\n\n" +
      base
    );
  }

  return (
    `系统上下文：当前用户已绑定身份 ${identity.role}:${identity.schoolId}，可使用全部校园服务功能。\n\n` +
    base
  );
}

export class SchoolWorkflowService {
  private pendingSubmissionFiles = new Map<string, PendingSubmissionContext>();
  private pendingTeacherPublishFiles = new Map<string, PendingTeacherPublishContext>();
  private lastIncomingPeerByOwner = new Map<string, string>();

  noteIncomingPeer(ownerUserId: string, peerUserId: string): void {
    this.lastIncomingPeerByOwner.set(ownerUserId, peerUserId);
  }

  clearPending(userId: string): void {
    this.pendingSubmissionFiles.delete(userId);
    this.pendingTeacherPublishFiles.delete(userId);
  }

  clearAll(userId: string): void {
    this.clearPending(userId);
    this.lastIncomingPeerByOwner.delete(userId);
  }

  hasPendingSubmission(userId: string): boolean {
    return this.pendingSubmissionFiles.has(userId);
  }

  hasPendingPublish(userId: string): boolean {
    return this.pendingTeacherPublishFiles.has(userId);
  }

  async preparePromptInput(userId: string, text: string): Promise<{
    identity: SchoolIdentityContext;
    inputText: string;
  }> {
    const identity = await loadUserSchoolIdentity(userId);
    return {
      identity,
      inputText: injectSchoolIdentityContext(text, identity),
    };
  }

  private async getStudentUnsubmittedAssignments(
    studentId: string,
  ): Promise<UnsubmittedAssignment[]> {
    return schoolApiGet<UnsubmittedAssignment[]>(
      `/api/assignments/unsubmitted/${studentId}`,
    );
  }

  private async getTeacherCourses(
    teacherId: string,
  ): Promise<TeacherCourseOption[]> {
    return schoolApiGet<TeacherCourseOption[]>(
      `/api/courses/by-teacher/${teacherId}`,
    );
  }

  private formatAssignmentOptions(items: UnsubmittedAssignment[]): string {
    if (items.length === 0) return "当前没有待提交作业。";
    return items
      .slice(0, 6)
      .map((a, i) => {
        const deadlineText =
          Number.isFinite(a.deadline) && a.deadline > 0
            ? new Date(a.deadline * 1000).toLocaleString()
            : "未知";
        const courseText = a.course?.name || a.course?.code || "未命名课程";
        return `${i + 1}. ${courseText} | ${a.title} | 截止 ${deadlineText}`;
      })
      .join("\n");
  }

  private resolveAssignmentByIndex(
    rawInput: string,
    options: UnsubmittedAssignment[],
  ): { assignmentId: string; index: number } | null {
    const input = rawInput.trim();
    if (!/^\d+$/.test(input)) return null;
    const idx = Number.parseInt(input, 10) - 1;
    if (idx < 0 || idx >= options.length) return null;
    return { assignmentId: options[idx].id, index: idx + 1 };
  }

  private formatTeacherCourseOptions(courses: TeacherCourseOption[]): string {
    if (courses.length === 0) return "当前你名下没有课程。";
    return courses
      .slice(0, 10)
      .map((c, i) => `${i + 1}. ${c.name}（${c.code}）`)
      .join("\n");
  }

  private resolveTeacherCourseByIndex(
    rawInput: string,
    courses: TeacherCourseOption[],
  ): { course: TeacherCourseOption; index: number } | null {
    const input = rawInput.trim();
    if (!/^\d+$/.test(input)) return null;
    const idx = Number.parseInt(input, 10) - 1;
    if (idx < 0 || idx >= courses.length) return null;
    return { course: courses[idx], index: idx + 1 };
  }

  async handleSubmitCommand(
    userId: string,
    bot: WeChatBot,
    msg: IncomingMessage,
    assignmentIndexRaw: string,
  ): Promise<void> {
    const identity = await loadUserSchoolIdentity(userId);
    if (!identity || identity.role !== "student") {
      await bot.reply(msg, "仅绑定学生身份后才可提交作业。请先在 Dashboard 绑定学生身份。");
      return;
    }

    const pending = this.pendingSubmissionFiles.get(userId);
    if (!pending) {
      await bot.reply(
        msg,
        "你还没有可提交的最近文件。请先发送附件，然后再输入序号（如 1）提交。",
      );
      return;
    }

    const resolved = this.resolveAssignmentByIndex(
      assignmentIndexRaw,
      pending.options,
    );
    if (!resolved) {
      const unsubmitted = pending.options.length
        ? pending.options
        : await this.getStudentUnsubmittedAssignments(identity.schoolId);
      await bot.reply(
        msg,
        `请按序号提交：回复数字（如 1）或 /submit 1。\n可选作业：\n${this.formatAssignmentOptions(unsubmitted)}`,
      );
      return;
    }

    try {
      await schoolApiPost(`/api/assignments/${resolved.assignmentId}/submit`, {
        student_id: identity.schoolId,
        content: `微信文件提交：${pending.file.fileName}`,
        file_url: `local://${pending.file.relativePath}`,
      });
      this.pendingSubmissionFiles.delete(userId);
      await bot.reply(
        msg,
        `已按序号 ${resolved.index} 提交作业，文件：${pending.file.fileName}。如需改交，重新发送文件后再次选择序号。`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "提交失败，请稍后重试";
      await bot.reply(msg, `作业提交失败：${message}`);
    }
  }

  private async maybeAskAssignmentSubmission(
    userId: string,
    bot: WeChatBot,
    msg: IncomingMessage,
    file: PendingSubmissionFile | null,
  ): Promise<boolean> {
    if (!file) return false;
    const identity = await loadUserSchoolIdentity(userId);
    if (!identity || identity.role !== "student") return false;

    let unsubmitted: UnsubmittedAssignment[] = [];
    try {
      unsubmitted = await this.getStudentUnsubmittedAssignments(identity.schoolId);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "查询教务系统失败";
      await bot.reply(
        msg,
        `已收到文件「${file.fileName}」，但读取待交作业失败：${message}`,
      );
      return true;
    }

    if (unsubmitted.length === 0) {
      await bot.reply(
        msg,
        `已收到文件「${file.fileName}」。当前没有待提交作业，如需普通处理可继续发指令。`,
      );
      return true;
    }

    this.pendingSubmissionFiles.set(userId, {
      file,
      options: unsubmitted.slice(0, 6),
    });
    await bot.reply(
      msg,
      `检测到你发送了文件「${file.fileName}」。是否作为作业提交？\n` +
        `请直接回复序号（如 1），或输入 /submit 1。\n` +
        `可提交作业：\n${this.formatAssignmentOptions(unsubmitted)}`,
    );
    return true;
  }

  private async maybeAskTeacherPublishAssignment(
    userId: string,
    bot: WeChatBot,
    msg: IncomingMessage,
    file: PendingSubmissionFile | null,
  ): Promise<boolean> {
    if (!file) return false;
    const identity = await loadUserSchoolIdentity(userId);
    if (!identity || identity.role !== "teacher") return false;

    let courses: TeacherCourseOption[] = [];
    try {
      courses = await this.getTeacherCourses(identity.schoolId);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "查询课程失败";
      await bot.reply(
        msg,
        `已收到文件「${file.fileName}」，但读取教师课程失败：${message}`,
      );
      return true;
    }

    if (courses.length === 0) {
      await bot.reply(
        msg,
        `已收到文件「${file.fileName}」，但当前你名下没有课程，无法发布作业。`,
      );
      return true;
    }

    this.pendingTeacherPublishFiles.set(userId, {
      file,
      courses: courses.slice(0, 10),
    });
    await bot.reply(
      msg,
      `检测到你上传了文件「${file.fileName}」。是否发布为课程作业？\n` +
        `请回复序号（如 1）或 /publish 1。\n` +
        `可选课程：\n${this.formatTeacherCourseOptions(courses)}`,
    );
    return true;
  }

  private async notifyCourseStudentsForPublishedAssignment(input: {
    courseId: string;
    courseName: string;
    assignmentTitle: string;
    deadlineUnix: number;
  }): Promise<{ delivered: number; skipped: number }> {
    const students = await schoolApiGet<Array<{ id: string }>>(
      `/api/courses/${input.courseId}/students`,
    );
    if (students.length === 0) return { delivered: 0, skipped: 0 };

    const studentIds = students.map((s) => s.id);
    const bindings = await db
      .select({
        userId: userSchoolBindings.userId,
      })
      .from(userSchoolBindings)
      .where(
        and(
          eq(userSchoolBindings.role, "student"),
          inArray(userSchoolBindings.schoolId, studentIds),
        ),
      );

    const studentUserIds = bindings.map((b) => b.userId);
    if (studentUserIds.length === 0) return { delivered: 0, skipped: students.length };

    const { botService } = await import("@/lib/bot/service");
    const deadlineText = new Date(input.deadlineUnix * 1000).toLocaleString();
    const text =
      `你有新的课程作业：${input.assignmentTitle}\n` +
      `课程：${input.courseName}\n` +
      `截止：${deadlineText}\n` +
      `请及时完成并提交。`;

    let delivered = 0;
    let skipped = 0;
    for (const studentUserId of studentUserIds) {
      const peer = this.lastIncomingPeerByOwner.get(studentUserId);
      const targetBot = botService.getBot(studentUserId);
      if (!peer || !targetBot) {
        skipped += 1;
        continue;
      }
      try {
        await targetBot.send(peer, text);
        delivered += 1;
      } catch {
        skipped += 1;
      }
    }
    return { delivered, skipped };
  }

  async handlePublishCommand(
    userId: string,
    bot: WeChatBot,
    msg: IncomingMessage,
    courseIndexRaw: string,
  ): Promise<void> {
    const identity = await loadUserSchoolIdentity(userId);
    if (!identity || identity.role !== "teacher") {
      await bot.reply(msg, "仅绑定教师身份后才可发布作业。");
      return;
    }

    const pending = this.pendingTeacherPublishFiles.get(userId);
    if (!pending) {
      await bot.reply(msg, "你还没有待发布的文件。请先上传文件。");
      return;
    }

    const resolved = this.resolveTeacherCourseByIndex(
      courseIndexRaw,
      pending.courses,
    );
    if (!resolved) {
      await bot.reply(
        msg,
        `请按序号选择课程（如 1 或 /publish 1）。\n可选课程：\n${this.formatTeacherCourseOptions(
          pending.courses,
        )}`,
      );
      return;
    }

    const deadlineUnix = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
    const assignmentTitle = pending.file.fileName.replace(/\.[^.]+$/, "") || "新作业";

    try {
      await schoolApiPost("/api/assignments", {
        course_id: resolved.course.id,
        title: assignmentTitle,
        description: `老师通过微信上传文件发布作业：${pending.file.fileName}`,
        deadline: deadlineUnix,
        max_score: 100,
      });

      const notifyResult = await this.notifyCourseStudentsForPublishedAssignment({
        courseId: resolved.course.id,
        courseName: resolved.course.name,
        assignmentTitle,
        deadlineUnix,
      });

      this.pendingTeacherPublishFiles.delete(userId);
      await bot.reply(
        msg,
        `已发布作业到课程「${resolved.course.name}」。` +
          `通知结果：成功 ${notifyResult.delivered} 人，跳过/失败 ${notifyResult.skipped} 人。`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "发布失败，请稍后重试";
      await bot.reply(msg, `发布作业失败：${message}`);
    }
  }

  async maybeHandleIncomingFile(
    userId: string,
    bot: WeChatBot,
    msg: IncomingMessage,
    file: PendingSubmissionFile | null,
  ): Promise<boolean> {
    if (await this.maybeAskAssignmentSubmission(userId, bot, msg, file)) {
      return true;
    }
    if (await this.maybeAskTeacherPublishAssignment(userId, bot, msg, file)) {
      return true;
    }
    return false;
  }

  async maybeHandleTextCommand(
    userId: string,
    bot: WeChatBot,
    msg: IncomingMessage,
    raw: string,
  ): Promise<boolean> {
    if (raw === "不提交" || raw.toLowerCase() === "/nosubmit") {
      this.clearPending(userId);
      await bot.reply(msg, "好的，这个文件不会作为作业提交。");
      return true;
    }

    const quickSubmitMatch = raw.match(/^(?:submit\s+)?(\d+)$/i);
    if (quickSubmitMatch && this.hasPendingSubmission(userId)) {
      await this.handleSubmitCommand(userId, bot, msg, quickSubmitMatch[1] ?? "");
      return true;
    }

    const submitMatch = raw.match(/^\/submit(?:\s+(.+))?$/i);
    if (submitMatch) {
      await this.handleSubmitCommand(userId, bot, msg, submitMatch[1] ?? "");
      return true;
    }

    const quickPublishMatch = raw.match(/^(?:publish\s+)?(\d+)$/i);
    if (quickPublishMatch && this.hasPendingPublish(userId)) {
      await this.handlePublishCommand(userId, bot, msg, quickPublishMatch[1] ?? "");
      return true;
    }

    const publishMatch = raw.match(/^\/publish(?:\s+(.+))?$/i);
    if (publishMatch) {
      await this.handlePublishCommand(userId, bot, msg, publishMatch[1] ?? "");
      return true;
    }

    return false;
  }
}
