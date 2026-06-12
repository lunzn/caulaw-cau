/**
 * Agent 沙箱策略冒烟测试（bash-tool / read-tool 的真实模块代码）。
 *
 * 依赖 POSIX 路径语义，必须以 packages/work-server 为 cwd 在 Linux/macOS 下运行：
 *
 *   本地：     cd packages/work-server && bun scripts/smoke-sandbox.ts
 *   服务器：   docker buildx build --target work-server-builder -t caulaw-work-builder .
 *             docker run --rm -w /app/packages/work-server caulaw-work-builder \
 *               bun scripts/smoke-sandbox.ts
 *
 * 全部通过输出 "ALL PASS" 并以 0 退出；任一失败以 1 退出。
 */
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { createUserScopedBashTool } from "../lib/agent/bash-tool";
import { createUserScopedReadTool, PI_SKILLS_ROOT } from "../lib/agent/read-tool";
import { wechatbotAgentWorkspace } from "../lib/wechatbot-workspace";

if (process.platform === "win32") {
  console.error("此脚本依赖 POSIX 路径语义（/dev、/etc），请在 Linux 容器中运行");
  process.exit(2);
}
if (!existsSync(PI_SKILLS_ROOT)) {
  console.error(`未找到 ${PI_SKILLS_ROOT}，请以 packages/work-server 为 cwd 运行`);
  process.exit(2);
}

const USER_ID = "smoke-sandbox-test";
const userRoot = wechatbotAgentWorkspace(USER_ID);
const bash = createUserScopedBashTool(USER_ID);
const read = createUserScopedReadTool(USER_ID);

const skillDir = readdirSync(PI_SKILLS_ROOT, { withFileTypes: true }).find(
  (d) => d.isDirectory() && existsSync(path.join(PI_SKILLS_ROOT, d.name, "SKILL.md")),
);
if (!skillDir) {
  console.error(`${PI_SKILLS_ROOT} 下没有含 SKILL.md 的 skill 目录`);
  process.exit(2);
}
const skillMd = path.join(PI_SKILLS_ROOT, skillDir.name, "SKILL.md");

let failures = 0;
let caseNo = 0;

/** 执行一个用例：expectError 为 null 表示应成功且输出含 expectText；否则应失败且错误含 expectError */
async function check(
  name: string,
  run: () => Promise<{ content: { type: string; text?: string }[] }>,
  expectText: string | null,
  expectError: string | null,
): Promise<void> {
  caseNo += 1;
  let text = "";
  let threw: string | null = null;
  try {
    const result = await run();
    text = result.content
      .map((c) => (c.type === "text" ? (c.text ?? "") : ""))
      .join("\n");
  } catch (err) {
    threw = err instanceof Error ? err.message : String(err);
  }
  const ok =
    expectError !== null
      ? threw !== null && threw.includes(expectError)
      : threw === null && (expectText === null || text.includes(expectText));
  if (!ok) failures += 1;
  console.log(
    `${ok ? "PASS" : "FAIL"}  [${caseNo}] ${name}` +
      (ok ? "" : `\n      threw=${JSON.stringify(threw)} text=${JSON.stringify(text.slice(0, 200))}`),
  );
}

const runBash = (command: string) => () =>
  bash.execute(`smoke-${caseNo}`, { command });
const runRead = (p: string) => () => read.execute(`smoke-${caseNo}`, { path: p });

// ── bash-tool ──────────────────────────────────────────────
// P1-2 修复目标：2>/dev/null 等无害设备写法不再被拦截
await check("bash: echo ok 2>/dev/null 放行", runBash("echo ok 2>/dev/null"), "ok", null);
await check(
  "bash: dd if=/dev/zero of=/dev/null 放行",
  runBash("dd if=/dev/zero of=/dev/null bs=16 count=1 2>/dev/null; echo dd-ok"),
  "dd-ok",
  null,
);
// P1-2 修复目标：skills 绝对路径 + 2>/dev/null 组合不再被误判为写操作
await check(
  "bash: cat skills/SKILL.md 2>/dev/null 放行",
  runBash(`head -c 50 ${skillMd} 2>/dev/null && echo SKILLS-READ-OK`),
  "SKILLS-READ-OK",
  null,
);
await check("bash: 用户目录读写放行", runBash("echo data > note.txt && cat note.txt"), "data", null);
// 原有封锁不回退
await check("bash: /etc 仍封锁", runBash("cat /etc/passwd"), null, "禁止访问系统路径");
await check(
  "bash: /dev/tcp 仍封锁",
  runBash("echo hi > /dev/tcp/127.0.0.1/9"),
  null,
  "禁止访问系统路径",
);
await check(
  "bash: 写 .pi/skills 仍封锁",
  runBash(`echo x > ${PI_SKILLS_ROOT}/hack.txt`),
  null,
  ".pi/skills 为只读目录",
);
await check(
  "bash: 项目其他路径仍封锁",
  runBash(`cat ${path.resolve(process.cwd(), "package.json")}`),
  null,
  "禁止访问项目路径",
);

// ── read-tool ──────────────────────────────────────────────
// P1-2 修复目标：read 直接读 skills 真实绝对路径（/app/.pi/skills/...）
await check("read: skills 真实绝对路径放行", runRead(skillMd), null, null);
// 回归：原有的 {userRoot}/.pi/skills 重映射仍工作
await check(
  "read: skills 相对路径重映射放行",
  runRead(path.join(userRoot, ".pi", "skills", skillDir.name, "SKILL.md")),
  null,
  null,
);
await check("read: 用户目录相对路径放行", runRead("note.txt"), "data", null);
// 原有封锁不回退
await check("read: /etc 仍封锁", runRead("/etc/hostname"), null, "仅允许访问当前用户目录");
await check(
  "read: 项目其他路径仍封锁",
  runRead(path.resolve(process.cwd(), "package.json")),
  null,
  "仅允许访问当前用户目录",
);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
