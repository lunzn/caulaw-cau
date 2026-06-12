import { constants } from "node:fs";
import { access as fsAccess, open as fsOpen, readFile as fsReadFile } from "node:fs/promises";
import path from "node:path";
import { fileTypeFromBuffer } from "file-type";
import { createReadTool } from "@mariozechner/pi-coding-agent";
import { wechatbotAgentWorkspace } from "@/lib/wechatbot-workspace";

/** 项目级 skills 只读目录。 */
export const PI_SKILLS_ROOT = path.resolve(process.cwd(), ".pi", "skills");

const SUPPORTED_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);
const IMAGE_SNIFF_BYTES = 4100;

/**
 * 确保绝对路径在 userRoot 之下，防止路径逃逸。
 * 被 read-tool 和 wechat-media-tools 共用。
 */
export function assertPathUnderUserRoot(
  userRootResolved: string,
  absolutePath: string,
): void {
  const resolved = path.resolve(absolutePath);
  const rel = path.relative(userRootResolved, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("仅允许访问当前用户目录 .data/wechatbot/<用户ID>/ 下的文件");
  }
}

/**
 * 当 agent 传入形如 `.pi/skills/...` 的相对路径时，
 * createReadTool 会将其解析为 `{userRoot}/.pi/skills/...`（不存在）。
 * 此函数将其重映射到真实的 `PROJECT_ROOT/.pi/skills/...`。
 */
function remapSkillsPath(absolutePath: string, userRoot: string): string {
  const skillsUnderUser = path.join(userRoot, ".pi", "skills");
  if (
    absolutePath === skillsUnderUser ||
    absolutePath.startsWith(skillsUnderUser + path.sep)
  ) {
    const rel = path.relative(skillsUnderUser, absolutePath);
    return path.join(PI_SKILLS_ROOT, rel);
  }
  return absolutePath;
}

/** 路径是否位于 .pi/skills 只读目录内（含目录本身）。 */
function isPiSkillsPath(absolutePath: string): boolean {
  const rel = path.relative(PI_SKILLS_ROOT, path.resolve(absolutePath));
  return !rel.startsWith("..") && !path.isAbsolute(rel);
}

/**
 * 解析 read 目标路径：先做 .pi/skills 重映射；
 * 落在 PI_SKILLS_ROOT 内的路径（重映射结果，或 agent 直接传的真实绝对路径
 * 如 /app/.pi/skills/...）只读放行，其余路径必须位于 userRoot 内。
 */
function resolveReadTarget(absolutePath: string, userRoot: string): string {
  const target = remapSkillsPath(absolutePath, userRoot);
  if (!isPiSkillsPath(target)) assertPathUnderUserRoot(userRoot, target);
  return target;
}

/** 与 pi-coding-agent read 工具一致：仅识别支持的图片 MIME。 */
async function detectSupportedImageMimeTypeFromFile(
  filePath: string,
): Promise<string | null | undefined> {
  const fh = await fsOpen(filePath, "r");
  try {
    const buffer = Buffer.alloc(IMAGE_SNIFF_BYTES);
    const { bytesRead } = await fh.read(buffer, 0, IMAGE_SNIFF_BYTES, 0);
    if (bytesRead === 0) return null;
    const fileType = await fileTypeFromBuffer(buffer.subarray(0, bytesRead));
    if (!fileType || !SUPPORTED_IMAGE_MIMES.has(fileType.mime)) return null;
    return fileType.mime;
  } finally {
    await fh.close();
  }
}

/**
 * 为特定 wechat 用户创建路径受限的 read 工具。
 *
 * - cwd 固定为 .data/wechatbot/{userId}/
 * - .pi/skills/ 只读放行：相对路径自动重映射到项目真实路径，
 *   真实绝对路径（/app/.pi/skills/...）也可直接读（与 bash-tool 只读策略对齐）
 * - 其他路径若逃逸出 userRoot 则抛错
 */
export function createUserScopedReadTool(
  userId: string,
): ReturnType<typeof createReadTool> {
  const userRoot = path.resolve(wechatbotAgentWorkspace(userId));
  const base = createReadTool(userRoot, {
    operations: {
      readFile: async (absolutePath) =>
        fsReadFile(resolveReadTarget(absolutePath, userRoot)),
      access: async (absolutePath) =>
        fsAccess(resolveReadTarget(absolutePath, userRoot), constants.R_OK),
      detectImageMimeType: async (absolutePath) =>
        detectSupportedImageMimeTypeFromFile(
          resolveReadTarget(absolutePath, userRoot),
        ),
    },
  });
  return {
    ...base,
    description:
      `${base.description} 当前会话 read 的根目录已固定为「本机账号 ${userId}」的 Agent 工作区：${userRoot}。` +
      `只传相对路径（如用户消息里的保存文件名）。` +
      `.pi/skills/ 下的 skill 文档与脚本可直接 read（相对或绝对路径均可，只读）。` +
      `不要对 .data/wechatbot 父目录做 read（应先用 list_wechat_user_media 再 read 子目录内文件）。` +
      `向外发本地文件用 wechat_send 的 file_path / image_path / video_path。`,
  };
}
