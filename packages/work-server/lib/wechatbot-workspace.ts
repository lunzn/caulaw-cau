import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

/**
 * 每个 WeChat Bot（dashboard 用户 `userId`）对应 **一个** pi-coding-agent 会话；
 * 其 **cwd / read / wechat_send 本地路径** 的根目录均为：
 *   `<项目根>/.data/wechatbot/<userId>/`
 *
 * 与 `WECHATBOT_STORAGE_DIR`（SDK 凭据，默认 ~/.wechatbot）互相独立。
 */
export function wechatbotAgentWorkspace(userId: string): string {
  const root = path.resolve(process.cwd(), ".data", "wechatbot", userId);
  if (!existsSync(root)) {
    mkdirSync(root, { recursive: true });
  }
  return root;
}
