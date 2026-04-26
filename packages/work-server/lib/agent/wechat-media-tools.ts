import { randomBytes } from "node:crypto";
import { readdir as fsReaddir, readFile as fsReadFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { wechatbotAgentWorkspace } from "@/lib/wechatbot-workspace";
import { Type } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import type { IncomingMessage, SendContent, WeChatBot } from "@wechatbot/wechatbot";

export { createUserScopedReadTool } from "@/lib/agent/read-tool";

const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;

function maxBytes(): number {
  const raw = process.env.WECHAT_MEDIA_MAX_BYTES?.trim();
  if (!raw) return DEFAULT_MAX_BYTES;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_BYTES;
}

/**
 * 单个微信 Bot（账号 `userId`）对应的 pi-coding-agent 工作区，与 `wechatbotAgentWorkspace` 相同。
 */
export function wechatUserMediaRoot(userId: string): string {
  return wechatbotAgentWorkspace(userId);
}

/**
 * 将用户输入的路径限制在该用户目录之下（禁止 `..` 与绝对路径逃逸）。
 */
export function resolvePathUnderUserWechatMediaRoot(
  userId: string,
  userRelativePath: string,
): string {
  const root = path.resolve(wechatUserMediaRoot(userId));
  const trimmed = userRelativePath.trim().replace(/\\/g, "/");
  if (!trimmed || trimmed.includes("..")) {
    throw new Error("路径无效：不能为空或包含 ..");
  }
  const normalized = path.normalize(trimmed);
  if (path.isAbsolute(normalized)) {
    throw new Error("请使用相对路径（相对于当前用户可发送目录），不要使用绝对路径");
  }
  const resolved = path.resolve(root, normalized);
  const rel = path.relative(root, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("路径必须在当前用户可发送目录内");
  }
  return resolved;
}

/** 将用户发来的媒体落盘到用户目录，返回相对路径（相对该用户目录）。 */
export async function saveUserIncomingMediaFile(
  userId: string,
  data: Buffer,
  hintFileName?: string,
): Promise<string> {
  const dir = wechatUserMediaRoot(userId);
  const base = path.basename(hintFileName || "file") || "file";
  const safeBase = base.replace(/[^\w.\-]+/g, "_").slice(0, 120);
  const name = `${Date.now()}-${randomBytes(4).toString("hex")}-${safeBase}`;
  const abs = path.join(dir, name);
  await writeFile(abs, data);
  return name;
}

function buildSendContentForLocalFile(
  buf: Buffer,
  fileName: string,
  caption?: string,
): SendContent {
  const base = path.basename(fileName);
  const lower = base.toLowerCase();
  if (/\.(mp4|mov|webm)$/i.test(lower)) {
    return { video: buf, caption };
  }
  if (/\.(png|jpe?g|gif|webp|bmp)$/i.test(lower)) {
    return { image: buf, caption };
  }
  return { file: buf, fileName: base, caption };
}

export type BuildWechatMediaToolsOpts = {
  defaultWechatTarget?: string;
  /** 有值且调用方省略 target_user_id 时，wechat_send 使用 bot.reply(message, …) */
  incomingWechatMessage?: IncomingMessage;
};

/**
 * 供 pi-agent 调用：微信发送能力（对齐 WeChatBot send / reply 与 SendContent）。
 */
export function buildWechatMediaTools(
  ownerUserId: string,
  bot: WeChatBot,
  opts?: BuildWechatMediaToolsOpts,
): AgentTool[] {
  const listWechatUserMedia: AgentTool = {
    name: "list_wechat_user_media",
    label: "列出当前账号微信媒体目录",
    description:
      "列出当前微信 Bot 对应 Agent 工作区（.data/wechatbot/<账号用户ID>/）中的文件名（与 read、wechat_send 的本地路径使用同一根目录）。用于在 read 前确认有哪些已落盘文件；若用户消息含「图片已保存…相对路径：xxx」则该文件在此目录下。",
    parameters: Type.Object({}),
    execute: async () => {
      const root = path.resolve(wechatUserMediaRoot(ownerUserId));
      const names = await fsReaddir(root);
      if (names.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `当前账号媒体目录中尚无文件：${root}`,
            },
          ],
          details: { path: root, count: 0 },
        };
      }
      names.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
      return {
        content: [
          {
            type: "text",
            text: `${names.length} 个条目（${root}）：\n${names.join("\n")}`,
          },
        ],
        details: { path: root, count: names.length },
      };
    },
  };

  const wechatSend: AgentTool = {
    name: "wechat_send",
    label: "微信 send / reply（对齐 SDK）",
    description:
      "与 WeChatBot.send(userId, content) / reply(msg, content) 一致。须且仅能指定一种内容：" +
      "text（纯文本，可直接作为字符串发送）；url（http(s)，微信自动下载并识别类型）；image_path / video_path / file_path（均相对于当前 Bot 工作区 .data/wechatbot/<用户ID>/）。" +
      " file_path 按扩展名自动当作图片、视频或附件，等同 SDK 的 { file, fileName }。" +
      " caption 可选。file_name 可选：与 file_path 合用时覆盖展示文件名（须含扩展名）；与 url 合用时对应 SDK 的 fileName。" +
      " target_user_id：发给「非当前这条入站消息的发送人」时必须填写，此时 bot.send。" +
      " 若当前有入站消息且未填 target、或填的 target 与发消息者相同，则 bot.reply(msg, …)（推荐发图/发文件）。" +
      " 无入站上下文时回退 defaultWechatTarget 的 send；二者皆无则报错（定时任务等须写 target_user_id）。" +
      ` 单文件最大约 ${Math.round(maxBytes() / (1024 * 1024))}MB。`,
    parameters: Type.Object({
      target_user_id: Type.Optional(
        Type.String({
          description:
            "接收方微信 userId（如 xxx@im.wechat）。省略则 reply 或默认 send，见工具说明",
        }),
      ),
      text: Type.Optional(
        Type.String({ description: "纯文本内容；与其它内容字段互斥" }),
      ),
      url: Type.Optional(
        Type.String({
          description: "http(s) 资源地址；与 text/路径类互斥",
        }),
      ),
      image_path: Type.Optional(
        Type.String({
          description:
            "媒体目录内相对路径，按图片发送 { image, caption }；与其它内容字段互斥",
        }),
      ),
      video_path: Type.Optional(
        Type.String({
          description:
            "媒体目录内相对路径，按视频发送 { video, caption }；与其它内容字段互斥",
        }),
      ),
      file_path: Type.Optional(
        Type.String({
          description:
            "媒体目录内相对路径，{ file, fileName } 并按扩展名自动路由；与其它内容字段互斥",
        }),
      ),
      file_name: Type.Optional(
        Type.String({
          description:
            "与 file_path 或 url 合用：覆盖 fileName（须含扩展名，影响类型判定）",
        }),
      ),
      caption: Type.Optional(
        Type.String({ description: "图片 / 视频 / URL 等可选配文" }),
      ),
    }),
    execute: async (_toolCallId, params) => {
      const p = params as Record<string, unknown>;
      const caption = String(p.caption ?? "").trim() || undefined;
      const textRaw = String(p.text ?? "").trim();
      const url = String(p.url ?? "").trim();
      const imagePath = String(p.image_path ?? "").trim();
      const videoPath = String(p.video_path ?? "").trim();
      const filePath = String(p.file_path ?? "").trim();
      const fileNameOpt = String(p.file_name ?? "").trim();

      const modeCount = [
        textRaw,
        url,
        imagePath,
        videoPath,
        filePath,
      ].filter((s) => s.length > 0).length;
      if (modeCount !== 1) {
        throw new Error(
          "须且仅能指定一种：text、url、image_path、video_path、file_path",
        );
      }

      const limit = maxBytes();
      const readBoundedFile = (rel: string, label: string): Buffer => {
        const abs = resolvePathUnderUserWechatMediaRoot(ownerUserId, rel);
        if (!existsSync(abs)) {
          throw new Error(`${label} 不存在：${rel}`);
        }
        const st = statSync(abs);
        if (!st.isFile()) {
          throw new Error(`${label} 不是普通文件：${rel}`);
        }
        if (st.size > limit) {
          throw new Error(`文件过大（>${limit} 字节）：${rel}`);
        }
        return readFileSync(abs);
      };

      let content: SendContent;
      if (textRaw) {
        content = textRaw;
      } else if (url) {
        if (!/^https?:\/\//i.test(url)) {
          throw new Error("url 必须以 http:// 或 https:// 开头");
        }
        content = {
          url,
          caption,
          ...(fileNameOpt ? { fileName: fileNameOpt } : {}),
        };
      } else if (imagePath) {
        const buf = readBoundedFile(imagePath, "image_path");
        content = { image: buf, caption };
      } else if (videoPath) {
        const buf = readBoundedFile(videoPath, "video_path");
        content = { video: buf, caption };
      } else {
        const buf = readBoundedFile(filePath, "file_path");
        const displayName = fileNameOpt || path.basename(filePath);
        content = buildSendContentForLocalFile(buf, displayName, caption);
      }

      const explicitTarget = String(p.target_user_id ?? "").trim();
      const incoming = opts?.incomingWechatMessage;
      let delivery: { kind: "send"; peer: string };

      // 确定目标用户ID：优先使用显式指定的target，否则使用入站消息的发送者
      const targetUserId = explicitTarget || incoming?.userId;
      
      if (!targetUserId) {
        throw new Error(
          "需要 target_user_id；或在微信消息回调中调用；或提供默认接收方",
        );
      }
      
      // 统一使用 send 方法，确保 agent 明确知道目标用户ID
      await bot.send(targetUserId, content);
      delivery = { kind: "send", peer: targetUserId };

      return {
        content: [
          {
            type: "text",
            text: `已发送微信消息（${delivery.kind} → ${delivery.peer}）。`,
          },
        ],
        details: delivery,
      };
    },
  };

  return [listWechatUserMedia, wechatSend];
}

/** 与 `buildWechatMediaTools` 一致；合并工具列表时用于识别并替换 */
export const WECHAT_MEDIA_TOOL_NAMES = [
  "list_wechat_user_media",
  "wechat_send",
] as const;
