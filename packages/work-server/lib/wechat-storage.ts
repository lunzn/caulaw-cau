import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";

/**
 * 微信凭据根目录：默认用户主目录 `/.wechatbot`。
 * WECHATBOT_STORAGE_DIR 可为绝对路径；若以 ~/ 开头则展开为 home。
 */
export function wechatStorageBase(): string {
  const raw = process.env.WECHATBOT_STORAGE_DIR?.trim();
  if (raw) {
    if (raw === "~" || raw.startsWith("~/")) {
      return path.join(os.homedir(), raw.slice(1));
    }
    return path.resolve(raw);
  }
  return path.join(os.homedir(), ".wechatbot");
}

/** 本地是否存在可用的 credentials.json */
export function hasWechatCredentials(userId: string): boolean {
  return existsSync(
    path.join(wechatStorageBase(), userId, "credentials.json"),
  );
}
