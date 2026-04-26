import path from "node:path";
import { createBashTool, bashTool } from "@mariozechner/pi-coding-agent";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { wechatbotAgentWorkspace } from "../../lib/wechatbot-workspace";

export type SchoolIdentityContext = {
  role: "student" | "teacher";
  schoolId: string;
} | null;

const PROJECT_ROOT = path.resolve(process.cwd());

/** 所有用户数据目录的公共父目录，用于检测跨用户访问 */
const WECHATBOT_DATA_ROOT = path.resolve(PROJECT_ROOT, ".data", "wechatbot");

/** Skills 只读目录 */
export const PI_SKILLS_ROOT = path.resolve(PROJECT_ROOT, ".pi", "skills");

/** 绝对封锁的系统路径前缀 */
const BLOCKED_PREFIXES = [
  "/etc",
  "/root",
  "/sys",
  "/proc",
  "/dev",
  "/boot",
  "/private/etc", // macOS
];

const DEFAULT_SCHOOL_SERVER_URL = "http://127.0.0.1:3002";

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function schoolServerBaseUrls(): string[] {
  const envBase = process.env.SCHOOL_SERVER_URL?.trim();
  return [envBase, DEFAULT_SCHOOL_SERVER_URL]
    .filter((v): v is string => Boolean(v))
    .map((v) => v.replace(/\/$/, ""));
}

function commandTargetsSchoolServer(command: string): boolean {
  const bases = schoolServerBaseUrls();
  if (bases.some((base) => command.includes(base))) return true;
  return /\/api\/(students|teachers|courses|assignments|library|cafeteria|bus|campus-card|rooms|clinic)\b/.test(command);
}

/**
 * 检查命令是否合法访问 school-server。
 * 策略：已绑定身份的用户可访问所有 /api/* 接口；
 * 未绑定身份则禁止访问任何教务接口。
 */
function validateSchoolApiAccess(
  command: string,
  identity: SchoolIdentityContext,
): void {
  if (!commandTargetsSchoolServer(command)) return;

  if (!identity) {
    throw new Error("当前账号未绑定 student/teacher 身份，请先在网页端完成身份绑定后再查询教务信息。");
  }
  // 已绑定身份：放行所有 /api/* 路径
}

function isUnder(parent: string, candidate: string): boolean {
  const rel = path.relative(parent, candidate);
  return !rel.startsWith("..") && !path.isAbsolute(rel);
}

/** 提取绝对路径 token：以 / 开头、由合法路径字符组成（模块级缓存，避免每次调用重新编译） */
const _ABS_PATH_RE = /(?:^|[\s"'`|;&><(])(\/([\w.@%+\-]+(?:\/[\w.@%+\-]*)*)\/?)/g;

/**
 * 从 shell 命令字符串中提取所有看起来像绝对路径的 token，
 * 并对每个路径执行访问策略检查：
 *
 *   - userRoot（.data/wechatbot/{userId}/）：读写均可
 *   - PI_SKILLS_ROOT（.pi/skills）：仅读；若命令含写操作则阻止
 *   - 其他路径：
 *       - BLOCKED_PREFIXES → 绝对封锁
 *       - 属于其他用户目录 → 封锁
 *       - 属于项目目录内其他位置 → 封锁
 *       - /usr、/bin、/tmp 等系统可执行路径 → 放行（仅作为命令本身）
 */
function validatePaths(
  command: string,
  userRoot: string,
  schoolIdentity: SchoolIdentityContext,
): void {
  // 复用模块级 regex（注意：RegExp 有状态，每次用前必须 reset lastIndex）
  const absPathRegex = _ABS_PATH_RE;
  absPathRegex.lastIndex = 0;
  let match: RegExpExecArray | null;

  // 检测是否有写操作（用于 .pi/skills 只读约束）
  // 先去掉 2>&1、1>&2 等 fd 重定向，避免误判；两个标志只算一次
  const commandForWriteCheck = command.replace(/\d+>&\d+/g, "");
  const hasOutputRedirect = />{1,2}/.test(commandForWriteCheck);
  const hasWriteCommand = /\b(rm|rmdir|mv|cp|chmod|chown|touch|truncate|dd|tee|install)\b/.test(command);

  while ((match = absPathRegex.exec(command)) !== null) {
    const rawPath = match[1];
    const resolved = path.resolve(rawPath);

    // 系统封锁路径
    if (
      BLOCKED_PREFIXES.some(
        (bp) => resolved === bp || resolved.startsWith(`${bp}/`),
      )
    ) {
      throw new Error(`禁止访问系统路径：${resolved}`);
    }

    const inUserRoot = isUnder(userRoot, resolved);
    const inPiSkills = isUnder(PI_SKILLS_ROOT, resolved);

    if (inUserRoot) continue; // 当前用户目录，完全放行

    if (inPiSkills) {
      // .pi/skills 只读：有写操作时阻止
      if (hasOutputRedirect || hasWriteCommand) {
        throw new Error(
          `.pi/skills 为只读目录，禁止写入操作（路径：${resolved}）`,
        );
      }
      continue;
    }

    // 其他用户的数据目录：封锁
    if (isUnder(WECHATBOT_DATA_ROOT, resolved)) {
      throw new Error(`禁止访问其他用户目录：${resolved}`);
    }

    // 项目目录内的其他路径：封锁
    if (isUnder(PROJECT_ROOT, resolved)) {
      throw new Error(
        `禁止访问项目路径 ${resolved}（仅允许 .data/wechatbot/<用户ID>/ 和 .pi/skills/）`,
      );
    }

    // /usr/bin、/tmp 等系统工具路径：放行（agent 执行命令本身需要）
  }

  validateSchoolApiAccess(command, schoolIdentity);
}

/**
 * 为特定 wechat 用户创建路径受限的 bash 工具。
 *
 * 规则：
 *   - cwd 固定为 .data/wechatbot/{userId}/
 *   - .data/wechatbot/{userId}/ 读写均可（相对路径天然安全）
 *   - .pi/skills/ 可读，不可写（skill 脚本通过 $PI_SKILLS_ROOT 访问）
 *   - 其他用户目录及项目目录其他位置均被阻止
 */
export function createUserScopedBashTool(
  userId: string,
  schoolIdentity: SchoolIdentityContext = null,
): AgentTool {
  const userRoot = path.resolve(wechatbotAgentWorkspace(userId));

  return createBashTool(userRoot, {
    spawnHook: (ctx) => {
      validatePaths(ctx.command, userRoot, schoolIdentity);
      return {
        ...ctx,
        cwd: userRoot,
        env: {
          ...ctx.env,
          HOME: userRoot,
          PI_SKILLS_ROOT: PI_SKILLS_ROOT,
          SCHOOL_SERVER_URL: process.env.SCHOOL_SERVER_URL ?? "http://school-server:3002",
          // 与服务端 news-warmer 使用同一缓存目录，agent 调用 scraper 时命中预热缓存
          SKILLS_CACHE_DIR: path.resolve(PROJECT_ROOT, ".cache", "skills"),
        },
      };
    },
  }) as unknown as AgentTool;
}

/** 与 buildWechatMediaTools 一致的命名导出，供 service.ts 识别可替换工具 */
export const BASH_TOOL_NAMES = ["bash"] as const;

/** 仅用于告知 pi session「bash 工具已启用」的占位符，实际实现由 _baseToolsOverride 替换 */
export { bashTool as bashToolPlaceholder };
