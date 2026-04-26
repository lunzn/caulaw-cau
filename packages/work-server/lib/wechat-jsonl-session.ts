import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import path from "node:path";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { wechatbotAgentWorkspace } from "../lib/wechatbot-workspace";

/** 写入 jsonl 时截断大字符串（与原先 DB 持久化一致） */
function jsonReplacerForPersist(_key: string, value: unknown): unknown {
  if (typeof value === "string" && value.length > 4096) {
    return "";
  }
  return value;
}

const SESSION_END_TYPE = "session_end" as const;

type SessionEndLine = {
  type: typeof SESSION_END_TYPE;
  at: string;
  reason?: string;
};

function sessionsDir(userId: string): string {
  const dir = path.join(wechatbotAgentWorkspace(userId), "sessions");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/** 按时间可排序的文件名（ISO，去掉文件系统不友好字符） */
function newSessionJsonlFileName(): string {
  return `session-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`;
}

function listSessionJsonlFiles(userId: string): string[] {
  const dir = sessionsDir(userId);
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter((n) => n.endsWith(".jsonl"))
    .sort((a, b) => a.localeCompare(b));
}

export function getLatestSessionJsonlPath(userId: string): string | undefined {
  const files = listSessionJsonlFiles(userId);
  if (!files.length) return undefined;
  const dir = sessionsDir(userId);
  return path.join(dir, files[files.length - 1]!);
}

function isSessionEndLine(obj: unknown): obj is SessionEndLine {
  return (
    typeof obj === "object" &&
    obj !== null &&
    (obj as { type?: string }).type === SESSION_END_TYPE
  );
}

/** 从单个 jsonl 读出消息行（跳过 session_end 等控制行）。 */
function loadAgentMessagesFromJsonlFile(filePath: string): AgentMessage[] {
  if (!existsSync(filePath)) return [];
  const raw = readFileSync(filePath, "utf8");
  const lines = raw.split("\n").filter((l) => l.trim());
  const out: AgentMessage[] = [];
  for (const line of lines) {
    let obj: unknown;
    try {
      obj = JSON.parse(line) as unknown;
    } catch {
      continue;
    }
    if (isSessionEndLine(obj)) continue;
    out.push(obj as AgentMessage);
  }
  return out;
}

export function loadLatestSessionMessages(userId: string): AgentMessage[] {
  const p = getLatestSessionJsonlPath(userId);
  if (!p) return [];
  return loadAgentMessagesFromJsonlFile(p);
}

/**
 * 在当前「进行中的」会话文件末尾写入结束标记（/new 前调用）。
 * 若尚无任何会话文件则跳过。
 */
export function appendSessionEndMarker(
  userId: string,
  reason: string,
): void {
  const latest = getLatestSessionJsonlPath(userId);
  if (!latest || !existsSync(latest)) return;
  const line: SessionEndLine = {
    type: SESSION_END_TYPE,
    at: new Date().toISOString(),
    reason,
  };
  appendFileSync(latest, `${JSON.stringify(line)}\n`, "utf8");
}

/** 创建空的会话 jsonl，返回绝对路径 */
export function createNewSessionJsonlFile(userId: string): string {
  const dir = sessionsDir(userId);
  const full = path.join(dir, newSessionJsonlFileName());
  writeFileSync(full, "", "utf8");
  return full;
}

/**
 * 增量写入：仅在尾部追加新消息行；若发生截断（条数变少）则整文件重写为 capped。
 */
export function persistMessagesToJsonl(
  filePath: string,
  capped: AgentMessage[],
  prevMessageLinesOnDisk: number,
): number {
  if (capped.length < prevMessageLinesOnDisk) {
    const body =
      capped.length > 0
        ? `${capped
            .map((m) => JSON.stringify(m, jsonReplacerForPersist))
            .join("\n")}\n`
        : "";
    writeFileSync(filePath, body, "utf8");
    return capped.length;
  }
  if (capped.length > prevMessageLinesOnDisk) {
    const delta = capped.slice(prevMessageLinesOnDisk);
    const chunk = delta
      .map((m) => JSON.stringify(m, jsonReplacerForPersist))
      .join("\n");
    appendFileSync(filePath, `${chunk}\n`, "utf8");
  }
  return capped.length;
}

export function removeAllSessionJsonlFiles(userId: string): void {
  const dir = path.join(wechatbotAgentWorkspace(userId), "sessions");
  try {
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }
  } catch (e) {
    console.warn(`[agent] 删除 sessions 目录失败 ${dir}`, e);
  }
}
