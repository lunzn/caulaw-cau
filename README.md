# cau-claw

中国农业大学场景的微信 AI 助手，基于 Bun + Next.js + Elysia + PostgreSQL 构建，以 [wechatbot](https://github.com/nicobailon/wechatbot) 接入微信，以 [pi-coding-agent](https://github.com/nicobailon/pi-coding-agent) 驱动智能对话。

---

## 技术栈

| 层 | 技术 |
|----|------|
| 运行时 | [Bun](https://bun.sh) |
| Web 框架 | [Next.js](https://nextjs.org)（App Router） |
| 后台 API | [Elysia](https://elysiajs.com)（独立 Worker 进程） |
| 数据库 | PostgreSQL + [Drizzle ORM](https://orm.drizzle.team) |
| 认证 | [Better Auth](https://www.better-auth.com) |
| 微信接入 | `@wechatbot/wechatbot` |
| AI Agent | `@mariozechner/pi-coding-agent` |

---

## 架构概览

```
用户微信消息
    │
    ▼
wechatbot（server/modules/bot）
    │  收到消息 / 媒体
    ▼
AgentService（server/modules/agent）
    │  createUserSession — 每个微信账号对应一个 pi session
    │
    ├── read-tool.ts      用户目录 + .pi/skills 只读访问
    ├── bash-tool.ts      受限 shell（仅限用户目录）
    ├── wechat-media-tools.ts  wechat_send / list_wechat_user_media
    └── cron-tools.ts     定时任务 / 一次性提醒
    │
    ▼
pi-coding-agent（调用 OpenAI 兼容接口）
    │  可读取 .pi/skills/ 下的 SKILL.md，按需执行 bash
    ▼
回复微信用户
```

### 核心约定

- **每个微信账号 = 一个 pi session**，工作区为 `.data/wechatbot/{userId}/`
- Session 空闲超时后回收内存，下次消息时从最新 `.jsonl` 重建上下文
- 用户发 `/new` 开启新对话（旧 jsonl 末尾写入结束标记，新建文件）

---

## 目录结构

```
.
├── app/                    Next.js App Router 页面
├── server/
│   ├── elysia.ts           Elysia Worker 入口
│   ├── lib/                公共工具（会话持久化、模型、工作区路径）
│   └── modules/
│       ├── agent/          pi-coding-agent 集成（session、工具）
│       ├── bot/            wechatbot 收发消息
│       ├── cron/           定时任务持久化
│       └── reminder/       一次性提醒
├── .pi/
│   ├── mcp.json            MCP 服务器配置
│   └── skills/             Agent Skill（每个子目录一个技能）
│       └── cau-news-scraper/   示例：农大新闻爬取
└── .data/
    └── wechatbot/{userId}/
        └── sessions/       对话历史（jsonl，按时间命名）
```

---

## 快速开始

```bash
# 安装依赖
bun install

# 复制并填写环境变量
cp .env.example .env

# 初始化数据库
bun run db:push

# 启动 Next.js 前端
bun dev

# 启动后台 Worker（Elysia）
bun run worker
```

---

## 环境变量

见 `.env.example`，关键项：

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | PostgreSQL 连接串 |
| `BETTER_AUTH_SECRET` | 认证密钥（`openssl rand -base64 32`） |
| `OPENAI_API_BASE_URL` | OpenAI 兼容接口地址（pi agent 使用） |
| `OPENAI_API_MODEL` | 模型名 |

---

## 添加 Skill

在 `.pi/skills/` 下新建子目录，写 `SKILL.md`（frontmatter 含 `name` / `description`）。Agent 启动时自动发现，无需重启服务。

参考：`.pi/skills/cau-news-scraper/SKILL.md`

---

## Debug 对话历史

每个用户的对话以 jsonl 存储：

```
.data/wechatbot/{userId}/sessions/session-{timestamp}.jsonl
```

每行一条消息（user / assistant / toolResult），末尾可有结束标记。直接用文本编辑器或 `jq` 查看。
