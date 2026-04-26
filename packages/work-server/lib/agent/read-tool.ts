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
 * - .pi/skills 下的相对路径自动重映射到项目真实路径（只读）
 * - 其他路径若逃逸出 userRoot 则抛错
 */
export function createUserScopedReadTool(
  userId: string,
): ReturnType<typeof createReadTool> {
  const userRoot = path.resolve(wechatbotAgentWorkspace(userId));
  const base = createReadTool(userRoot, {
    operations: {
      readFile: async (absolutePath) => {
        const remapped = remapSkillsPath(absolutePath, userRoot);
        if (remapped !== absolutePath) return fsReadFile(remapped);
        assertPathUnderUserRoot(userRoot, absolutePath);
        return fsReadFile(absolutePath);
      },
      access: async (absolutePath) => {
        const remapped = remapSkillsPath(absolutePath, userRoot);
        if (remapped !== absolutePath) return fsAccess(remapped, constants.R_OK);
        assertPathUnderUserRoot(userRoot, absolutePath);
        return fsAccess(absolutePath, constants.R_OK);
      },
      detectImageMimeType: async (absolutePath) => {
        const remapped = remapSkillsPath(absolutePath, userRoot);
        if (remapped !== absolutePath)
          return detectSupportedImageMimeTypeFromFile(remapped);
        assertPathUnderUserRoot(userRoot, absolutePath);
        return detectSupportedImageMimeTypeFromFile(absolutePath);
      },
    },
  });
  return {
    ...base,
    description:
      `${base.description} 当前会话 read 的根目录已固定为「本机账号 ${userId}」的 Agent 工作区：${userRoot}。` +
      `只传相对路径（如用户消息里的保存文件名）。` +
      `不要对 .data/wechatbot 父目录做 read（应先用 list_wechat_user_media 再 read 子目录内文件）。` +
      `向外发本地文件用 wechat_send 的 file_path / image_path / video_path。`,
  };
}
