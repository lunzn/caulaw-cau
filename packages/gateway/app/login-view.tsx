"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/ui/field";
import { Input } from "@/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/ui/tabs";

function syntheticEmail(phone: string): string {
  return `${phone.trim().toLowerCase()}@users.shennong-claw.invalid`;
}

async function ensureSignedIn(
  phone: string,
  password: string,
): Promise<{ error: string } | null> {
  // 先尝试登录
  const { error: signInErr } = await authClient.signIn.username({
    username: phone,
    password,
  });
  if (!signInErr) return null;

  // 登录失败 → 尝试注册新账号
  const { error: signUpErr } = await authClient.signUp.email({
    email: syntheticEmail(phone),
    name: phone,
    password,
    username: phone,
  });
  if (signUpErr) {
    // 用户名已被占用说明手机号已注册但密码错误
    const taken =
      signUpErr.message?.toLowerCase().includes("username") ||
      signUpErr.message?.toLowerCase().includes("already") ||
      signUpErr.status === 422;
    return {
      error: taken ? "手机号已注册，密码不正确" : (signUpErr.message ?? "操作失败"),
    };
  }

  // 注册成功后显式登录，确保 session cookie 已写入，再继续绑定教务身份
  const { error: signInAfterSignUpErr } = await authClient.signIn.username({
    username: phone,
    password,
  });
  if (signInAfterSignUpErr) {
    return { error: signInAfterSignUpErr.message ?? "注册成功但登录失败，请刷新后重试" };
  }

  return null;
}

export function LoginView() {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "bind" | "unbind">(null);
  const [role, setRole] = useState<"student" | "teacher">("student");
  const locked = busy !== null;

  async function onBind(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const role = String(fd.get("role") ?? "").trim();
    const schoolId = String(fd.get("schoolId") ?? "").trim();
    const phone = String(fd.get("phone") ?? "").trim();
    const password = String(fd.get("password") ?? "");

    if (!schoolId) { toast.error(role === "teacher" ? "请填写教师ID" : "请填写校园卡号"); return; }
    if (phone.length < 2) { toast.error("手机号格式不正确"); return; }
    if (password.length < 6) { toast.error("密码至少 6 位"); return; }

    setBusy("bind");
    try {
      const authErr = await ensureSignedIn(phone, password);
      if (authErr) { toast.error(authErr.error); return; }

      const res = await fetch("/api/me/identity", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, schoolId }),
      });
      if (!res.ok) {
        let errMsg = "教务身份绑定失败";
        try {
          const data = (await res.json()) as { error?: string };
          if (data.error) errMsg = data.error;
        } catch { /* 非 JSON 响应，使用默认提示 */ }
        toast.error(errMsg);
        return;
      }

      toast.success("绑定成功");
      router.push("/dashboard?autostart=1");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "操作失败，请重试");
    } finally {
      setBusy(null);
    }
  }

  async function onUnbind(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const phone = String(fd.get("phone") ?? "").trim();
    const password = String(fd.get("password") ?? "");

    if (phone.length < 2) { toast.error("手机号格式不正确"); return; }
    if (password.length < 6) { toast.error("密码至少 6 位"); return; }

    setBusy("unbind");
    try {
      const { error: signInErr } = await authClient.signIn.username({
        username: phone,
        password,
      });
      if (signInErr) {
        toast.error(signInErr.message ?? "手机号或密码错误");
        return;
      }

      // 删除教务身份绑定
      await fetch("/api/me/identity", {
        method: "DELETE",
        credentials: "include",
      });

      // 断开微信 Bot
      await fetch("/api/bot/stop", {
        method: "POST",
        credentials: "include",
      });

      await authClient.signOut();
      toast.success("已解绑并退出");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "操作失败，请重试");
    } finally {
      setBusy(null);
    }
  }

  const roleSelect = (
    <Field>
      <FieldLabel htmlFor="role">身份</FieldLabel>
      <select
        id="role"
        name="role"
        value={role}
        onChange={(e) => setRole(e.target.value as "student" | "teacher")}
        disabled={locked}
        className="border-input ring-offset-background focus-visible:ring-ring/50 flex h-9 w-full rounded-md border bg-background px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <option value="student">学生</option>
        <option value="teacher">教师</option>
      </select>
    </Field>
  );
  const schoolIdLabel = role === "teacher" ? "教师ID" : "校园卡号";
  const schoolIdPlaceholder = role === "teacher" ? "输入你的教师ID（如 T009）" : "输入你的校园卡号";

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 sm:p-8">
      <main className="flex w-full max-w-md flex-col items-center gap-6">
        <div className="cau-enter flex items-center justify-center">
          <Image
            src="/logo.png"
            alt="CAU-CLAW 中国农业大学一站式智能助手平台"
            width={1698}
            height={926}
            priority
            className="h-auto w-full max-w-xs"
          />
        </div>

        <Card className="cau-enter cau-enter-delay-sm w-full">
          <CardHeader>
            <CardTitle>账号</CardTitle>
            <CardDescription>绑定或解绑你的校园账号与机器人</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="bind">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="bind">绑定</TabsTrigger>
                <TabsTrigger value="unbind">解绑</TabsTrigger>
              </TabsList>

              <TabsContent value="bind" className="pt-4">
                <form onSubmit={onBind} className="flex flex-col gap-4">
                  <FieldGroup>
                    {roleSelect}
                    <Field>
                      <FieldLabel htmlFor="bind-schoolId">{schoolIdLabel}</FieldLabel>
                      <Input
                        id="bind-schoolId"
                        name="schoolId"
                        placeholder={schoolIdPlaceholder}
                        required
                        disabled={locked}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="bind-phone">手机号</FieldLabel>
                      <Input
                        id="bind-phone"
                        name="phone"
                        type="tel"
                        autoComplete="username"
                        placeholder="输入手机号"
                        required
                        disabled={locked}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="bind-pass">密码</FieldLabel>
                      <Input
                        id="bind-pass"
                        name="password"
                        type="password"
                        autoComplete="current-password"
                        placeholder="至少 6 位"
                        required
                        minLength={6}
                        disabled={locked}
                      />
                    </Field>
                  </FieldGroup>
                  <Button type="submit" disabled={locked}>
                    {busy === "bind" ? "提交中…" : "提交"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="unbind" className="pt-4">
                <form onSubmit={onUnbind} className="flex flex-col gap-4">
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="unbind-phone">手机号</FieldLabel>
                      <Input
                        id="unbind-phone"
                        name="phone"
                        type="tel"
                        autoComplete="username"
                        placeholder="输入手机号"
                        required
                        disabled={locked}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="unbind-pass">密码</FieldLabel>
                      <Input
                        id="unbind-pass"
                        name="password"
                        type="password"
                        autoComplete="current-password"
                        placeholder="至少 6 位"
                        required
                        minLength={6}
                        disabled={locked}
                      />
                    </Field>
                  </FieldGroup>
                  <Button type="submit" variant="destructive" disabled={locked}>
                    {busy === "unbind" ? "提交中…" : "提交"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <p className="cau-enter cau-enter-delay-md text-muted-foreground text-center text-xs">
          继续使用即表示你了解微信 Bot 与模型接入需自行配置环境变量。
        </p>
      </main>
    </div>
  );
}
