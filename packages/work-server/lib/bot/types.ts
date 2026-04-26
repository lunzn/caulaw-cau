export type BotStatusPayload = {
  status: "idle" | "waiting_scan" | "online" | "error";
  qrUrl?: string;
  accountId?: string;
  error?: string;
  /** 曾成功登录并入库，重启后会尝试自动连接 */
  autostart: boolean;
};
