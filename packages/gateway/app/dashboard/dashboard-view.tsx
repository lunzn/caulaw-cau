"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/ui/field";
import { Input } from "@/ui/input";
import { Textarea } from "@/ui/textarea";
import { cn } from "@/lib/utils";
import type { UserSchoolIdentity } from "@/lib/user-identity";

type BotStatus = "idle" | "waiting_scan" | "online" | "error";

export type BotPayload = {
  status: BotStatus;
  qrUrl?: string;
  accountId?: string;
  error?: string;
  /** 与后端「自动恢复」一致：曾成功登录并写入库表后，重启会尝试自动连 */
  autostart: boolean;
};

function isQrImageUrl(url: string): boolean {
  return (
    url.startsWith("data:image") ||
    /^https?:\/\/.+\.(png|jpe?g|gif|webp)(\?|#|$)/i.test(url)
  );
}

/** 图片在弹层内展示；网页类仅提示（页面已自动新开标签） */
function QrDialogBody({
  url,
  onOpenInNewTab,
}: {
  url: string;
  onOpenInNewTab: () => void;
}) {
  if (isQrImageUrl(url)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt="微信登录二维码"
        className="mx-auto max-h-[min(20rem,50vh)] w-full max-w-64 object-contain"
      />
    );
  }
  return (
    <div className="flex flex-col items-stretch gap-3">
      <p className="text-muted-foreground text-center text-sm">
        已在新的浏览器标签页打开微信登录页；若被拦截未弹出，请点击下方按钮。
      </p>
      <Button type="button" onClick={onOpenInNewTab}>
        在新标签页打开
      </Button>
    </div>
  );
}

export type CronTaskRow = {
  id: number;
  user_id: string;
  cron_expr: string;
  prompt: string;
  target_user_id: string;
  enabled: number;
  created_at: string;
};

export function DashboardView({
  username,
  userId,
  identity,
  initialDataFromServer,
  initialBot,
  initialTasks,
}: {
  username: string;
  userId: string;
  identity: UserSchoolIdentity | null;
  /** 服务端已成功请求 Elysia 时 true，避免客户端挂载再拉一遍（减少 dev 下重复请求） */
  initialDataFromServer: boolean;
  initialBot: BotPayload | null;
  initialTasks: CronTaskRow[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [bot, setBot] = useState<BotPayload | null>(initialBot);
  const [tasks, setTasks] = useState<CronTaskRow[]>(initialTasks);
  const [tasksLoading, setTasksLoading] = useState(!initialDataFromServer);
  /** 用户在等待扫码时手动关过弹层，同一张码不再骚扰；换码或上线后重置 */
  const [qrDismissed, setQrDismissed] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);
  const [taskBusyId, setTaskBusyId] = useState<number | null>(null);
  const [cronOpen, setCronOpen] = useState(false);
  const [botLoading, setBotLoading] = useState(!initialDataFromServer);
  const [refreshingBot, setRefreshingBot] = useState(false);

  const fetchBotStatus =
    useCallback(async (): Promise<BotPayload | null> => {
      const res = await fetch("/api/bot/status", { credentials: "include" });
      if (!res.ok) return null;
      const raw = (await res.json()) as Partial<BotPayload> &
        Pick<BotPayload, "status">;
      let next: BotPayload | null = null;
      setBot((prev) => {
        const accountId =
          raw.accountId ??
          (raw.status === "online" ? prev?.accountId : undefined);
        const data: BotPayload = {
          status: raw.status,
          qrUrl: raw.qrUrl,
          accountId,
          error: raw.error,
          autostart: raw.autostart ?? false,
        };
        if (prev?.status === "waiting_scan" && data.status === "online") {
          toast.success("微信已连接");
        }
        next = data;
        return data;
      });
      return next;
    }, []);

  const fetchTasks = useCallback(async () => {
    const res = await fetch("/api/cron/tasks", { credentials: "include" });
    if (!res.ok) return;
    const data = (await res.json()) as { tasks: CronTaskRow[] };
    setTasks(data.tasks);
  }, []);

  useEffect(() => {
    if (initialDataFromServer) return;
    setTasksLoading(true);
    setBotLoading(true);
    void (async () => {
      try {
        await Promise.all([fetchTasks(), fetchBotStatus()]);
      } finally {
        setTasksLoading(false);
        setBotLoading(false);
      }
    })();
  }, [initialDataFromServer, fetchTasks, fetchBotStatus]);

  // 绑定后自动连接：URL 含 ?autostart=1 且 bot 空闲时自动发起连接
  const autoStartFiredRef = useRef(false);
  useEffect(() => {
    if (autoStartFiredRef.current) return;
    if (searchParams.get("autostart") !== "1") return;
    if (botLoading) return; // 等待初始状态加载完成
    const status = bot?.status ?? "idle";
    if (status !== "idle") return; // 已在连接中或已上线，不重复触发
    autoStartFiredRef.current = true;
    // 清除 URL 参数，避免刷新重复触发
    router.replace("/dashboard");
    void startBot();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botLoading, bot?.status, searchParams]);

  const lastQrUrl = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (bot?.status !== "waiting_scan") {
      lastQrUrl.current = undefined;
    }
  }, [bot?.status]);
  /** 仅当二维码 URL 变化时重新自动弹出（避免重复刷新把已关掉的弹层又打开） */
  useEffect(() => {
    if (bot?.status !== "waiting_scan" || !bot.qrUrl) return;
    if (bot.qrUrl !== lastQrUrl.current) {
      lastQrUrl.current = bot.qrUrl;
      setQrDismissed(false);
    }
  }, [bot?.qrUrl, bot?.status]);

  /** 本页打开的微信登录标签，便于登录结束或流程结束时 close */
  const qrLoginTabRef = useRef<Window | null>(null);

  const autoOpenedTabForUrl = useRef<string | undefined>(undefined);

  function openQrTab(url: string): Window | null {
    try {
      qrLoginTabRef.current?.close();
    } catch {
      /* ignore */
    }
    qrLoginTabRef.current = null;
    // 不能用 noopener：否则多数浏览器不返回 Window，后续无法 close
    const w = window.open(url, "_blank");
    if (w) {
      try {
        w.opener = null;
      } catch {
        /* ignore */
      }
      qrLoginTabRef.current = w;
    }
    return w;
  }

  useEffect(() => {
    if (bot?.status !== "waiting_scan" || !bot.qrUrl) return;
    if (isQrImageUrl(bot.qrUrl)) return;
    if (autoOpenedTabForUrl.current === bot.qrUrl) return;
    autoOpenedTabForUrl.current = bot.qrUrl;
    const w = openQrTab(bot.qrUrl);
    if (!w || w.closed) {
      toast.message("新标签页可能被浏览器拦截，请在弹窗内点击「在新标签页打开」");
    }
  }, [bot?.status, bot?.qrUrl]);

  useEffect(() => {
    if (bot?.status !== "waiting_scan") {
      autoOpenedTabForUrl.current = undefined;
    }
  }, [bot?.status]);

  /** 二维码阶段结束（含登录成功、出错、断开）时关闭自动打开的标签 */
  useEffect(() => {
    if (bot?.status === "waiting_scan") return;
    try {
      qrLoginTabRef.current?.close();
    } catch {
      /* ignore */
    }
    qrLoginTabRef.current = null;
  }, [bot?.status]);

  const showQrDialog =
    bot?.status === "waiting_scan" && Boolean(bot.qrUrl) && !qrDismissed;

  function openQrInNewTab() {
    if (!bot?.qrUrl) return;
    const w = openQrTab(bot.qrUrl);
    if (!w || w.closed) {
      toast.message("未能打开新标签页，请检查浏览器弹窗设置");
    }
  }

  async function logout() {
    await authClient.signOut();
    router.push("/");
    router.refresh();
  }

  async function startBot() {
    setConnecting(true);
    try {
      const res = await fetch("/api/bot/start", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        toast.error("发起连接失败");
        return;
      }
      setQrDismissed(false);
      toast.message("正在连接微信…");
      // start 在服务端异步产出二维码，单拉一次经常仍是 idle，需轮询直到出现 qr 或终态
      const deadline = Date.now() + 45_000;
      const intervalMs = 400;
      while (Date.now() < deadline) {
        const b = await fetchBotStatus();
        if (!b) break;
        if (b.status === "waiting_scan" && b.qrUrl) return;
        if (b.status === "online" || b.status === "error") return;
        await new Promise((r) => setTimeout(r, intervalMs));
      }
      const last = await fetchBotStatus();
      if (last?.status === "idle") {
        toast.message("若未弹出二维码，请点击「刷新状态」");
      }
    } finally {
      setConnecting(false);
    }
  }

  async function refreshBotStatus() {
    setRefreshingBot(true);
    try {
      await fetchBotStatus();
    } finally {
      setRefreshingBot(false);
    }
  }

  async function stopBot() {
    if (!confirm("将删除本地凭据并清空定时任务、提醒与对话上下文，确定？")) return;
    setStopping(true);
    try {
      const res = await fetch("/api/bot/stop", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        toast.error("停止失败");
        return;
      }
      toast.success("已断开并清理");
      setQrDismissed(true);
      setTasksLoading(true);
      await fetchBotStatus();
      await fetchTasks();
    } finally {
      setStopping(false);
      setTasksLoading(false);
    }
  }

  async function onCreateTask(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const cronExpr = String(fd.get("cronExpr") ?? "").trim();
    const prompt = String(fd.get("prompt") ?? "").trim();
    const targetUserId = String(fd.get("targetUserId") ?? "").trim();
    setCreatingTask(true);
    try {
      const res = await fetch("/api/cron/tasks", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cronExpr, prompt, targetUserId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "创建失败");
        return;
      }
      toast.success("任务已创建");
      e.currentTarget.reset();
      await fetchTasks();
    } finally {
      setCreatingTask(false);
    }
  }

  const statusLabel: Record<BotStatus, string> = {
    idle: "未连接",
    waiting_scan: "等待扫码",
    online: "在线",
    error: "错误",
  };

  const badgeVariant =
    bot?.status === "online"
      ? "default"
      : bot?.status === "error"
        ? "destructive"
        : bot?.status === "waiting_scan"
          ? "accent"
          : "secondary";

  const botDescription = (() => {
    if (botLoading && !bot) {
      return "连接用于接收消息并由助手回复。";
    }
    if (!bot) {
      return "连接用于接收消息并由助手回复。";
    }
    switch (bot.status) {
      case "idle":
        return "连接用于接收消息并由助手回复。";
      case "waiting_scan":
        return "请使用微信扫码；在手机上确认后，点「刷新状态」查看是否已上线。";
      case "online":
        return "已连接，可接收消息并由助手回复。";
      case "error":
        return "连接异常，可尝试重新连接或删除后重新扫码。";
      default:
        return "连接用于接收消息并由助手回复；首次需扫码，扫码后在手机上确认，再点「刷新状态」。";
    }
  })();

  return (
    <div className="flex min-h-svh flex-col">
      <header
        className="cau-enter border-b border-border/35 bg-background/80 backdrop-blur"
        aria-label="控制台顶栏"
      >
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <h1 className="text-xl font-semibold tracking-tight">
            <span className="text-primary">CAU</span>
            <span className="text-muted-foreground">-CLAW</span>
          </h1>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-muted-foreground text-sm">{username}</span>
            <span className="cau-numeric text-muted-foreground font-mono text-xs">
              {userId.slice(0, 8)}…
            </span>
            <Button variant="outline" size="sm" onClick={() => void logout()}>
              退出
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 sm:p-6">
        {/* 教务身份卡片 */}
        <Card className="cau-enter">
          <CardHeader>
            <CardTitle>教务身份</CardTitle>
            <CardDescription>
              {identity
                ? "已绑定校园账号，助手可查询你的课程、作业等教务信息。"
                : "尚未绑定校园账号，助手无法获取你的教务信息。"}
            </CardDescription>
          </CardHeader>
          {identity ? (
            <CardContent>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                <dt className="text-muted-foreground">身份</dt>
                <dd className="font-medium">
                  {identity.role === "student" ? "学生" : "教师"}
                </dd>
                <dt className="text-muted-foreground">校园卡号</dt>
                <dd className="cau-numeric font-mono font-medium">{identity.schoolId}</dd>
              </dl>
            </CardContent>
          ) : (
            <CardContent>
              <a
                href="/"
                className="text-primary text-sm underline underline-offset-4 hover:opacity-80"
              >
                前往绑定
              </a>
            </CardContent>
          )}
        </Card>

        <Card id="card-bot" className="cau-enter">
          <CardHeader>
            <CardTitle>微信 Bot</CardTitle>
            <CardDescription>{botDescription}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div
              className="flex flex-wrap items-center gap-x-3 gap-y-1"
              aria-live="polite"
              aria-busy={botLoading}
            >
              <Badge variant={badgeVariant}>
                {botLoading ? "加载中" : bot ? statusLabel[bot.status] : "—"}
              </Badge>
              {bot?.accountId ? (
                <span className="text-sm font-medium">
                  {bot.accountId}
                </span>
              ) : null}
              {bot?.autostart && bot.status !== "online" ? (
                <span className="text-xs text-muted-foreground">
                  · 自动恢复已登记
                </span>
              ) : null}
              {bot?.qrUrl && bot.status !== "waiting_scan" ? (
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0"
                  onClick={() => {
                    if (!bot.qrUrl) return;
                    openQrTab(bot.qrUrl);
                  }}
                >
                  打开二维码页
                </Button>
              ) : null}
              {bot?.status === "waiting_scan" && bot.qrUrl && qrDismissed ? (
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0"
                  onClick={() => setQrDismissed(false)}
                >
                  重新显示二维码
                </Button>
              ) : null}
            </div>
            {bot?.error ? (
              <p className="text-destructive text-sm">{bot.error}</p>
            ) : null}
            {bot?.status === "online" ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={stopping}
                  onClick={() => void stopBot()}
                >
                  {stopping ? "处理中…" : "断开并删除"}
                </Button>
              </div>
            ) : null}
            {((!bot && !botLoading) || bot?.status === "idle") ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={connecting || stopping || botLoading}
                  onClick={() => void startBot()}
                >
                  {connecting ? "连接中…" : bot?.autostart ? "重新连接" : "连接"}
                </Button>
              </div>
            ) : null}
            {bot?.status === "waiting_scan" ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={botLoading || refreshingBot}
                  onClick={() => void refreshBotStatus()}
                >
                  {refreshingBot ? "刷新中…" : "刷新状态"}
                </Button>
              </div>
            ) : null}
            {bot?.status === "error" ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={botLoading || refreshingBot}
                  onClick={() => void refreshBotStatus()}
                >
                  {refreshingBot ? "刷新中…" : "刷新状态"}
                </Button>
                <Button
                  size="sm"
                  disabled={connecting || stopping || botLoading}
                  onClick={() => void startBot()}
                >
                  {connecting ? "连接中…" : "重新连接"}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={connecting || stopping || botLoading}
                  onClick={() => void stopBot()}
                >
                  {stopping ? "处理中…" : "删除 Bot"}
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="cau-enter cau-enter-delay-md">
          <CardHeader className="pb-2">
            <button
              type="button"
              className="group -m-1 flex w-full items-start justify-between gap-3 rounded-lg p-1 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              onClick={() => setCronOpen((o) => !o)}
              aria-expanded={cronOpen}
              aria-controls="cron-section"
            >
              <div className="min-w-0 flex-1 space-y-1.5">
                <CardTitle className="pr-1">定时任务</CardTitle>
                <CardDescription>
                  使用五段式 Cron，到点由助手生成内容并发送至指定微信联系人。
                </CardDescription>
              </div>
              <ChevronDown
                className={cn(
                  "mt-1 size-5 shrink-0 text-muted-foreground transition-transform duration-200 ease-out",
                  cronOpen && "rotate-180",
                )}
                aria-hidden
              />
            </button>
          </CardHeader>
          <CardContent
            id="cron-section"
            className="flex flex-col gap-6"
            hidden={!cronOpen}
          >
            <ul className="flex flex-col gap-3">
              {tasksLoading ? (
                <li className="text-muted-foreground text-center text-sm">
                  加载任务中…
                </li>
              ) : tasks.length === 0 ? (
                <li className="text-muted-foreground rounded-lg bg-muted/35 px-3 py-6 text-center text-sm ring-1 ring-inset ring-border/30 dark:ring-white/[0.05]">
                  暂无定时任务。填写下方表单即可在指定时间自动发消息。
                </li>
              ) : (
                tasks.map((t) => (
                  <li
                    key={t.id}
                    className="flex flex-col gap-1 rounded-xl bg-muted/45 p-3 text-sm ring-1 ring-inset ring-border/40 dark:bg-muted/25 dark:ring-white/[0.06]"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="cau-numeric font-medium">#{t.id}</span>
                      <Badge variant={t.enabled ? "default" : "secondary"}>
                        {t.enabled ? "启用" : "关闭"}
                      </Badge>
                    </div>
                    <code className="cau-numeric font-mono text-xs">{t.cron_expr}</code>
                    <p className="text-muted-foreground line-clamp-2 leading-relaxed">
                      {t.prompt}
                    </p>
                    <p className="break-all font-mono text-xs leading-normal text-muted-foreground">
                      {t.target_user_id}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={taskBusyId === t.id}
                        onClick={async () => {
                          setTaskBusyId(t.id);
                          try {
                            const res = await fetch(`/api/cron/tasks/${t.id}`, {
                              method: "PATCH",
                              credentials: "include",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ enabled: !t.enabled }),
                            });
                            if (!res.ok) toast.error("更新失败");
                            else await fetchTasks();
                          } finally {
                            setTaskBusyId(null);
                          }
                        }}
                      >
                        {taskBusyId === t.id ? "…" : t.enabled ? "关闭" : "启用"}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={taskBusyId === t.id}
                        onClick={async () => {
                          if (!confirm("删除此任务？")) return;
                          setTaskBusyId(t.id);
                          try {
                            const res = await fetch(`/api/cron/tasks/${t.id}`, {
                              method: "DELETE",
                              credentials: "include",
                            });
                            if (!res.ok) toast.error("删除失败");
                            else await fetchTasks();
                          } finally {
                            setTaskBusyId(null);
                          }
                        }}
                      >
                        {taskBusyId === t.id ? "…" : "删除"}
                      </Button>
                    </div>
                  </li>
                ))
              )}
            </ul>

            <form onSubmit={onCreateTask} className="flex flex-col gap-4 border-t border-border/35 pt-4">
              <p className="text-sm font-semibold tracking-tight">新建任务</p>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="cronExpr">Cron 表达式</FieldLabel>
                  <Input
                    id="cronExpr"
                    name="cronExpr"
                    placeholder="如 0 8 * * *"
                    required
                    disabled={creatingTask}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="prompt">提示词</FieldLabel>
                  <Textarea
                    id="prompt"
                    name="prompt"
                    placeholder="到点时希望助手遵循的说明"
                    required
                    disabled={creatingTask}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="targetUserId">目标微信 userId</FieldLabel>
                  <Input
                    id="targetUserId"
                    name="targetUserId"
                    placeholder="xxx@im.wechat"
                    required
                    disabled={creatingTask}
                  />
                </Field>
              </FieldGroup>
              <Button type="submit" size="sm" disabled={creatingTask}>
                {creatingTask ? "创建中…" : "创建"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="cau-enter cau-enter-delay-lg text-muted-foreground text-center text-xs">
          账号操作请使用页面右上角「退出」。
        </p>
      </main>

      <Dialog
        open={showQrDialog}
        onOpenChange={(open) => {
          if (!open) setQrDismissed(true);
        }}
      >
        <DialogContent className="gap-4 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>微信扫码登录</DialogTitle>
            <DialogDescription>
              {bot?.qrUrl && isQrImageUrl(bot.qrUrl)
                ? "请使用作为机器人的微信扫描下方二维码，并在手机上确认。登录成功后本弹窗会自动关闭。"
                : "请在已打开的新标签页中完成微信登录；完成后本弹窗将自动关闭。"}
            </DialogDescription>
          </DialogHeader>
          {bot?.qrUrl ? (
            <QrDialogBody url={bot.qrUrl} onOpenInNewTab={openQrInNewTab} />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
