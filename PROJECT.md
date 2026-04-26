# CAU-CLAW 项目全景文档

> 本文档为新对话/新协作者提供完整的项目认知，读完后对项目的理解应与原开发对话等同。  
> 最后更新：2026-04-26

---

## 目录

1. [项目概述](#1-项目概述)
2. [技术栈总览](#2-技术栈总览)
3. [架构图](#3-架构图)
4. [目录结构](#4-目录结构)
5. [服务器部署（完整步骤）](#5-服务器部署完整步骤)
6. [Docker 部署补充说明](#6-docker-部署补充说明)
7. [本地开发](#7-本地开发)
8. [packages/db — 共享数据库 Schema](#8-packagesdb--共享数据库-schema)
9. [packages/gateway — Web 控制台](#9-packagesgateway--web-控制台)
10. [packages/school-server — 教务仿真服务](#10-packagesschool-server--教务仿真服务)
11. [packages/work-server — Bot + Agent 核心](#11-packageswork-server--bot--agent-核心)
12. [Agent Skills（`.pi/skills/`）](#12-agent-skillspiskills)
13. [关键设计决策与坑](#13-关键设计决策与坑)
14. [常见改动指引](#14-常见改动指引)
15. [环境变量速查](#15-环境变量速查)

---

## 1. 项目概述

**CAU-CLAW** 是中国农业大学校园一站式智能助手平台，核心功能：

- 用户通过 Web 控制台绑定手机号（账号）和校园卡号（学生/教师身份）
- 绑定后将自己的微信号接入 Bot，Bot 由 AI Agent（Claude/OpenAI 兼容模型）驱动
- 用户在微信里发消息，Agent 调用各类校园 API（教务系统、图书馆、食堂、班车……）、爬虫（农大新闻、信电学院师资）来回答
- 支持周期性定时任务（Cron）和一次性提醒（Reminder）
- 教务数据来自本项目内嵌的仿真 school-server（SQLite + 种子数据）
- 演示账号：学生 S20253082026（赵鑫宇）、教师 T009（林晓东教授）

---

## 2. 技术栈总览

| 层 | 技术 |
|----|------|
| 包管理器 / 运行时 | **Bun 1.3.8**（monorepo workspace） |
| Web 框架（后端） | **Elysia 1.4**（work-server、school-server） |
| Web 框架（前端） | **Next.js 16**（App Router，`output: standalone`） |
| 数据库（主） | **PostgreSQL 15**（Drizzle ORM，drizzle-kit 迁移） |
| 数据库（教务） | **SQLite**（Bun 原生 `bun:sqlite`，无 ORM） |
| 认证 | **Better Auth 1.6**（username + email/password，nextCookies 插件） |
| AI Agent | **@mariozechner/pi-coding-agent**（skills、bash tool、read tool） |
| WeChat SDK | **@wechatbot/wechatbot 2.1**（个人号网页协议） |
| 定时任务 | **croner**（时区：Asia/Shanghai） |
| UI 组件 | Radix UI + Tailwind CSS 4 + shadcn 风格 |
| 容器 | Docker multi-stage build + Docker Compose |
| Python（Skills） | Python 3.13-slim（requests、beautifulsoup4、python-docx） |

---

## 3. 架构图

```
用户微信 ←──────────────────────────────────────┐
                                               │
用户浏览器 → [gateway :3000 Next.js]            │
                │  ↕ 代理 /api/bot /api/cron    │
                ↓                              │
        [work-server :3100 Elysia]             │
         │   │   │   │                         │
         │   │   │   └── WeChatBot SDK ────────┘
         │   │   │         (个人号协议)
         │   │   │
         │   │   └── AgentService
         │   │         └── pi-coding-agent
         │   │               ├── bash tool (安全沙箱)
         │   │               ├── read tool (用户目录)
         │   │               ├── wechat media tools
         │   │               ├── cron tools
         │   │               └── .pi/skills/
         │   │                     ├── school-http
         │   │                     ├── cau-news-scraper (Python, 30分钟缓存)
         │   │                     ├── ciee-faculty-scraper (Python)
         │   │                     ├── teacher-portal (Python, 5个脚本)
         │   │                     ├── decision-assistant (Python, 3个脚本)
         │   │                     ├── research-advisor (Python)
         │   │                     └── library / cafeteria / bus / ...
         │   │
         │   └── CronService + ReminderService
         │   │     (croner + PostgreSQL)
         │   │
         │   └── NewsWarmer（服务端定时预热新闻缓存，每25分钟）
         │
         └── [school-server :3002 Elysia]
               └── SQLite (.data/school.db)
                     (教师/学生/课程/作业/论文/专利/项目...)

[PostgreSQL :5432]
  ├── better-auth 表 (user, session, account, verification)
  └── 应用表 (scheduled_tasks, reminders, wechat_bot_autostart,
              wechat_known_contacts, user_school_bindings)
```

### 请求路径（微信消息）

```
用户发消息 → WeChatBot.onMessage
  → bot/service.ts: agentService.prompt(userId, text)
  → agent/service.ts: schoolWorkflow.preparePromptInput (注入身份上下文)
  → pi-coding-agent session.prompt(inputText)
  → Agent 决定调用哪个 skill / tool
  → 结果 stripMarkdown → bot.reply(msg, reply)
```

### 请求路径（浏览器 → work-server）

```
浏览器 → GET /api/bot/status
  → gateway/app/api/bot/[...path]/route.ts
  → proxyToElysia(request, "bot/status")
    (读取 session cookie → 转换为 X-User-Id 头)
  → work-server /internal/bot/status
```

---

## 4. 目录结构

```
caulaw-cau/
├── packages/
│   ├── db/                         # 共享 Schema（Drizzle + PG）
│   │   ├── drizzle/
│   │   │   ├── schema/
│   │   │   │   ├── auth.ts         # Better Auth 表（user/session/account）
│   │   │   │   ├── app.ts          # 业务表（见第8节）
│   │   │   │   └── index.ts
│   │   │   └── migrations/         # SQL 迁移文件（drizzle-kit generate 生成）
│   │   └── drizzle.config.ts
│   │
│   ├── gateway/                    # Next.js 16 Web 控制台
│   │   ├── app/
│   │   │   ├── page.tsx            # 首页（检测 session）
│   │   │   ├── login-view.tsx      # 登录/绑定表单
│   │   │   ├── dashboard/
│   │   │   │   ├── page.tsx        # Server Component
│   │   │   │   └── dashboard-view.tsx  # Client Component（Bot + Cron + 身份 UI）
│   │   │   └── api/
│   │   │       ├── auth/[...all]/route.ts
│   │   │       ├── bot/[...path]/route.ts    # 代理 → work-server
│   │   │       ├── cron/[...path]/route.ts   # 代理 → work-server
│   │   │       ├── me/identity/route.ts
│   │   │       └── school/me/route.ts
│   │   └── lib/
│   │       ├── auth.ts / auth-client.ts
│   │       ├── api-session.ts
│   │       ├── proxy-elysia.ts     # session cookie → X-User-Id → 转发
│   │       └── user-identity.ts / school-server.ts / utils.ts
│   │
│   ├── school-server/              # 教务仿真 API（Elysia + SQLite）
│   │   └── src/
│   │       ├── index.ts            # 入口（port 3002）
│   │       ├── types/index.ts      # 所有领域类型
│   │       ├── db/
│   │       │   ├── database.ts     # SQLite 初始化 + 建表（含教师门户表）
│   │       │   ├── teachers.ts  students.ts  courses.ts
│   │       │   ├── assignments.ts  library.ts  cafeteria.ts
│   │       │   ├── bus.ts  rooms.ts  campus-card.ts  repair.ts
│   │       │   ├── teacher-portal.ts   # getTeacherPapers / getTeacherPatents / getOpenProjects
│   │       │   └── index.ts
│   │       ├── routes/
│   │       │   ├── index.ts
│   │       │   ├── teachers.ts  students.ts  courses.ts  ...
│   │       │   └── teacher-portal.ts   # GET /teachers/:id/papers|patents, /projects/open
│   │       └── seed/index.ts       # 种子数据（SEED=true 时运行）
│   │
│   └── work-server/                # Bot + Agent 核心（编译成单一二进制）
│       ├── elysia.ts               # 入口（port 3100）
│       ├── internal-routes.ts      # /internal/* Elysia 路由
│       ├── modules/
│       │   ├── agent/service.ts    # AgentService + DEFAULT_SYSTEM（最核心文件）
│       │   ├── bot/service.ts      # BotService
│       │   ├── cron/service.ts     # CronService
│       │   ├── reminder/service.ts # ReminderService
│       │   └── init-background.ts  # 启动：恢复 bot + 启动新闻预热 cron
│       ├── lib/
│       │   ├── agent/
│       │   │   ├── bash-tool.ts         # 安全沙箱 bash（注入 SKILLS_CACHE_DIR）
│       │   │   ├── school-workflow.ts   # 作业提交/发布工作流
│       │   │   ├── cron-tools.ts        # Agent 可调用的 cron/reminder 工具
│       │   │   ├── read-tool.ts         # 用户目录 sandboxed read
│       │   │   └── wechat-media-tools.ts
│       │   ├── bot/service.ts / types.ts
│       │   ├── news-warmer.ts           # 服务端新闻缓存预热（每25分钟）
│       │   ├── db.ts / model.ts
│       │   ├── wechat-jsonl-session.ts
│       │   ├── wechatbot-workspace.ts
│       │   ├── wechat-storage.ts / wechat-contacts.ts
│       │   └── cron-reminder-agent-bridge.ts
│       └── .pi/
│           └── skills/             # Agent 技能（volume 挂载，热更新）
│               ├── school-http/SKILL.md
│               ├── cau-news-scraper/   # main.py + _cache.py + sites/（真实爬取CAU官网）
│               ├── ciee-faculty-scraper/  # main.py + computer_faculty.json（已爬取缓存）
│               ├── teacher-portal/     # 教师门户（5个Python脚本）
│               │   ├── SKILL.md
│               │   ├── fetch-papers.py     # 查询教师论文（支持--recent=N年）
│               │   ├── fetch-patents.py    # 查询知识产权
│               │   ├── fetch-projects.py   # 查询可申报课题
│               │   ├── find-collaborator.py  # 寻找合作者
│               │   └── export-summary.py   # 导出 Word 科研汇总报告
│               ├── decision-assistant/    # 综合决策（3个Python脚本）
│               │   ├── SKILL.md
│               │   ├── analyze-diet.py    # 分析消费记录给饮食建议
│               │   ├── schedule-check.py  # 交叉课表与出诊时间
│               │   └── find-rooms.py      # 查询可用教室/会议室
│               ├── research-advisor/      # 科研方向顾问
│               │   ├── SKILL.md
│               │   └── research-find.py   # 匹配校内教师研究方向
│               ├── library / cafeteria / bus / campus-card / repair / （各有SKILL.md）
│               └── requirements.txt    # Python 依赖（requests, bs4, python-docx）
│
├── Dockerfile                      # Multi-stage（8个 target）
├── docker-compose.yml              # 生产编排（5个服务）
├── .env.example                    # 配置模板（只需填6个变量）
└── PROJECT.md                      # 本文档
```

---

## 5. 服务器部署（完整步骤）

> **代码仓库**：`https://github.com/lunzn/caulaw-cau`（私有仓库）  
> **整体流程**：拉代码 → 配置 .env → docker compose up --build

---

### 5.1 服务器前置条件

```bash
# 安装 Docker（Ubuntu/Debian）
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
docker compose version   # 确认 >= 2.x

# 开放防火墙端口
sudo ufw allow 3000/tcp
```

---

### 5.2 第一次部署（全新服务器）

```bash
# 1. 拉取代码
git clone https://github.com/lunzn/caulaw-cau.git caulaw-cau
cd caulaw-cau

# 2. 配置环境变量
cp .env.example .env
nano .env
```

**只需要改这 6 个变量**：

```bash
PUBLIC_URL=http://你的服务器IP:3000   # 唯一需要改的地址
POSTGRES_PASSWORD=强密码
BETTER_AUTH_SECRET=                   # openssl rand -base64 32
OPENAI_API_BASE_URL=https://...
OPENAI_API_MODEL=...
OPENAI_API_KEY=sk-...
```

```bash
# 3. 构建并启动（首次约5-15分钟）
docker compose up -d --build

# 4. 确认状态
docker compose ps
# 期望：postgres Up, school-server Up(healthy), work-server Up, gateway Up
# db-migrate 显示 Exited(0) 是正常的（一次性迁移任务）
```

访问 `http://你的服务器IP:3000` → 出现绑定页面 → 完成。

---

### 5.3 代码更新后重新部署

```bash
cd caulaw-cau
git pull
docker compose up -d --build
```

**自动处理**：重新编译变更服务、运行新迁移、data volume 不丢失。

---

### 5.4 停止旧版本（切换部署时）

```bash
# 只停容器，保留所有数据 volume
docker compose down

# 然后拉新代码重新构建
git pull && docker compose up -d --build
```

> ⚠️ **不要加 `-v`**，加了会删数据库。

---

### 5.5 只更新 Skill（SKILL.md / Python 文件）

Skills 目录 volume 挂载，**不打入 Docker 镜像**：

```bash
git pull
# Agent 约 60s 内自动读取新内容（ResourceLoader TTL），无需重建
# 若要立即生效：
docker compose restart work-server
```

---

### 5.6 只更新 TypeScript 代码（work-server）

`work-server` 编译为单一二进制，必须重新编译：

```bash
git pull
docker compose up -d --build work-server
```

网络受限时用二进制热替换（见 §6.3）。

---

### 5.7 迁移到新服务器

```bash
# 旧服务器：备份
docker compose exec postgres pg_dump -U root postgres > backup.sql
tar czf wechatbot-creds.tar.gz ~/.wechatbot/

# 新服务器：恢复
git clone https://github.com/lunzn/caulaw-cau.git caulaw-cau && cd caulaw-cau
cp env-backup.env .env && nano .env   # 更新 PUBLIC_URL
docker compose up -d postgres && sleep 5
docker compose exec -T postgres psql -U root postgres < backup.sql
tar xzf wechatbot-creds.tar.gz -C ~/
docker compose up -d --build
```

---

### 5.8 常用运维命令

```bash
docker compose ps
docker compose logs -f                  # 所有服务
docker compose logs -f work-server      # Bot/Agent 日志
docker compose logs -f gateway          # Web 控制台日志
docker compose restart work-server      # 重启单服务
docker compose down                     # 停止（数据不丢）
docker compose exec postgres psql -U root postgres
docker system df                        # 磁盘使用
docker image prune -f                   # 清理未使用镜像
```

---

### 5.9 当前生产服务器更新流程

> 当前生产部署路径：`~/caulaw-new`  
> 仓库：`https://github.com/lunzn/caulaw-cau`（public）

**⚠️ 服务器 git 有错误的镜像重写配置**（会把 `https://github.com/` 重写成 `https://ghfast.top/https://github.com/`，导致 403）。每次 git 操作需要加 `-c` 参数绕开：

```bash
# 标准更新流程（每次改代码后执行）
cd ~/caulaw-new

# 拉取最新代码（绕过 ghfast.top 错误重写）
git -c url."https://ghfast.top/https://github.com/".insteadOf="https://github.com/" pull

# 重新构建并重启（只重建有变化的服务）
docker compose up -d --build
```

**按改动类型选择最小构建范围**：

```bash
# 只改了 TypeScript（work-server、gateway、school-server）
docker compose up -d --build work-server    # Agent 行为 / DEFAULT_SYSTEM
docker compose up -d --build gateway        # 前端 UI
docker compose up -d --build school-server  # 教务 API

# 只改了 Skill（.pi/skills/ 下的 .md 或 .py）
# 无需重建，约 60s 内自动生效；要立即生效：
docker compose restart work-server

# 改了数据库 Schema（packages/db/drizzle/schema/）
docker compose up -d --build db-migrate work-server gateway
```

**永久修复 git 镜像问题**（执行一次即可）：

```bash
git config --global --unset url."https://ghfast.top/https://github.com/".insteadOf
# 之后可直接用 git pull，无需 -c 参数
```

**验证更新是否生效**：

```bash
docker compose ps                          # 确认所有容器状态
docker compose logs work-server --tail=20  # 看 Bot 是否上线
docker compose exec gateway env | grep BETTER_AUTH_URL  # 确认配置正确
```

---

## 6. Docker 部署补充说明

### 6.1 Dockerfile 各 Stage

| Stage | 基础镜像 | 产物 | 说明 |
|-------|---------|------|------|
| `base` | oven/bun:1.3.8 | — | Bun 运行时，workdir /app |
| `deps` | base | node_modules | `bun install --frozen-lockfile` |
| `migrate` | base + deps | — | `drizzle-kit migrate`，一次性任务 |
| `gateway-builder` | base + deps | .next/standalone | Next.js 静态编译 |
| `gateway` | oven/bun:1.3.8-slim | server.js | port 3000 |
| `school-server` | base + deps | — | 直接运行 src/index.ts，port 3002 |
| `work-server-builder` | base + deps | /app/work-server | `bun build --compile` → 单二进制 |
| `work-server` | python:3.13-slim | 二进制 + Python | pip 装 requirements.txt，port 3100 |

### 6.2 服务与 Volume

| 服务 | 对外端口 | Volumes |
|------|---------|---------|
| `postgres` | 内部5432 | `postgres_data:/var/lib/postgresql/data` |
| `db-migrate` | — | 一次性运行后退出 |
| `school-server` | 内部3002 | `school_data:/data`（SQLite 文件） |
| `work-server` | 内部3100 | `~/.wechatbot`（微信凭据）、`./packages/work-server/.data`（对话历史）、`./packages/work-server/.pi`（skills热挂载）、`skills_cache:/app/.cache`（爬虫缓存） |
| `gateway` | **对外3000** | — |

**关键**：`skills_cache` volume 存放爬虫的 30 分钟 TTL 缓存。服务端 `news-warmer` 每 25 分钟自动预热，用户查新闻时 < 3s 返回（无需现场爬取）。

### 6.3 网络受限时的构建

```bash
# 绕过 TLS 超时
docker buildx build --network=host -f Dockerfile --target gateway .

# work-server 二进制热替换（不需要拉 Python 基础镜像）
docker buildx build --network=host -f Dockerfile --target work-server-builder -t caulaw-work-builder .
docker create --name tmpbuilder caulaw-work-builder
docker cp tmpbuilder:/app/work-server /tmp/work-server-new
docker rm tmpbuilder
docker compose stop work-server
docker cp /tmp/work-server-new caulaw-cau-work-server-1:/app/work-server
docker compose start work-server
```

### 6.4 关键注意事项

1. **`~/.wechatbot` volume 绝对不能删**：WeChat 登录凭据在宿主机，删后需重新扫码。
2. **`.pi/` volume 挂载**：skills 改动约 60s 内生效，无需重建镜像。
3. **work-server 是编译二进制**：改 TypeScript（尤其 DEFAULT_SYSTEM）必须重新编译。
4. **gateway 构建时用 placeholder**：`DATABASE_URL=placeholder` 已写入 Dockerfile gateway-builder stage。
5. **school-server healthcheck 用 bun**：无 curl/wget，用 `bun -e "fetch(...)"` 形式。
6. **`SKILLS_CACHE_DIR` 必须一致**：docker-compose.yml 里 work-server 设置了 `SKILLS_CACHE_DIR: /app/.cache/skills`，bash-tool.ts 也注入了同路径，两者必须指向同一 volume（`skills_cache:/app/.cache`）。

---

## 7. 本地开发

```bash
bun install
cp .env.example packages/gateway/.env.local
# 填写 DATABASE_URL, BETTER_AUTH_SECRET, OPENAI_* 等

bun run db:migrate

# 并行启动所有服务
bun run dev
# 或分别启动：
bun run --cwd packages/school-server dev   # :3002
bun run --cwd packages/work-server dev     # :3100
bun run --cwd packages/gateway dev         # :3000
```

---

## 8. packages/db — 共享数据库 Schema

### 业务表（PostgreSQL，Drizzle ORM）

```typescript
scheduledTasks    // 周期性微信定时任务（cronExpr + prompt + targetUserId）
reminders         // 一次性提醒（runAt + prompt，status: "pending"|"sent"）
wechatBotAutostart  // 进程重启后自动重连的 Bot（userId → user.id）
wechatKnownContacts // Bot 曾联系过的用户（重连后发欢迎语）
userSchoolBindings  // 用户 ↔ 教务身份绑定（role, schoolId，唯一约束）
```

**关键约束**：`userSchoolBindings` 的 `(role, school_id)` 联合唯一约束。同一学号重复绑定触发 PG 23505，路由层 catch 返回 409。

---

## 9. packages/gateway — Web 控制台

### 认证流程

1. 访问 `/` → Server Component 读 session → 无则渲染 `LoginView`
2. 填写手机号 + 密码 + 校园卡号 + 身份
3. `ensureSignedIn`：先 `signIn.username`，失败则 `signUp.email`，**注册成功后再显式 `signIn.username`**（保证 cookie 写入，否则下一步 PUT 会 401）
4. `PUT /api/me/identity` 绑定教务身份
5. 跳转 `/dashboard?autostart=1` → 自动触发 Bot 连接 → QR 码

### API 路由

| 路由 | 说明 |
|------|------|
| `/api/auth/[...all]` | Better Auth handler |
| `/api/me/identity` GET/PUT/DELETE | 教务身份绑定 |
| `/api/bot/[...path]` | 代理 → work-server `/internal/bot/*` |
| `/api/cron/[...path]` | 代理 → work-server `/internal/cron/*` |
| `/api/school/me` | 代理 → school-server（拉取教务信息） |

---

## 10. packages/school-server — 教务仿真服务

### 概述

- **完全独立**，与其他 package 代码零耦合，仅暴露 HTTP
- **SQLite**（Bun 原生 `bun:sqlite`，**无 ORM**，全部裸 SQL）
- `SEED=true` 时启动自动生成种子数据（幂等）

### 数据模型

```
teachers ──── courses ──┬── course_students ──── students
                        └── assignments ──── submissions

teacher_papers          # 教师论文（title, journal, year, region, citation_count）
teacher_patents         # 知识产权（type: 发明专利/实用新型/软件著作权, cert_number, region）
open_projects           # 可申报课题（source, category, deadline, amount, requirements）

library_seats / library_books / library_reservations
cafeteria / cafeteria_menu / cafeteria_transactions
rooms / room_reservations
bus_routes / bus_stops / bus_schedules
clinic_schedules
campus_cards
repair_tickets
```

### 种子数据（src/seed/index.ts）

- **教师**：9 名（T001-T009，信电学院各系 + 理学院）
  - T009 林晓东（演示教师账号）：计算机视觉/智慧农业/具身智能/农业机器人，信电楼216
- **学生**：10 名（本科生4名 Y前缀，研究生6名 S前缀）
  - S20253082026 赵鑫宇（演示学生账号）：信息与电气工程，2025级研一，东校区研3-506
- **课程**：14 门本科 + 8 门研究生（含 T009 的 GT01/GT02/GT03）
- **论文**：T009 的 86 篇论文（含 14 篇港澳合作、8 篇指定香港合作论文）
- **知识产权**：T009 的 36 项（发明专利18/实用新型5/软件著作权13，含2项港澳专利）
- **可申报课题**：6 条（校级→部级→省市→国家级→重点实验室，截止日期均在演示日 2026-04-27 之后）

### 关键接口

```
GET  /health
GET  /api/students/by-number/:studentNumber
GET  /api/students/:id/courses
GET  /api/assignments/unsubmitted/:studentId
POST /api/assignments/:id/submit
GET  /api/assignments/upcoming?hours=24
GET  /api/teachers/:id/papers?year=N&year_from=N&region=港澳&limit=N
GET  /api/teachers/:id/patents?type=发明专利&region=港澳
GET  /api/projects/open?category=国家级&status=open
GET  /api/library/seats
GET  /api/cafeteria/menu/today
GET  /api/campus-card/:studentId
GET  /api/bus/schedules
GET  /api/rooms
POST /api/rooms/reserve
GET  /api/clinic/schedule
```

---

## 11. packages/work-server — Bot + Agent 核心

### 启动流程

```
elysia.ts
  → init-background.ts
    → BotService.restorePersistedBots()  # 从 DB + 凭据文件恢复 bot
    → CronService.init()                  # 恢复调度定时任务
    → ReminderService.init()              # 恢复 pending 提醒
    → startNewsWarmup()                   # 立即预热新闻缓存，每25分钟定时重跑
  → Elysia 监听 :3100
```

### modules/agent/service.ts（最核心文件）

**DEFAULT_SYSTEM** 采用**分层静态缓存策略**：

| 数据类别 | 策略 | 说明 |
|---------|------|------|
| 班车/食堂/校医院 | 写死提示词 | 真实数据，极少变化 |
| 教师基本信息（T009 林晓东） | 写死提示词 | 模拟数据，包含完整课表、论文/专利概览、课题列表、合作者推荐 |
| 学生个人数据（S20253082026） | 写死提示词 | 模拟数据，课表/作业/校园卡余额/基本信息 |
| 可申报课题（6条） | 写死提示词 | 模拟数据，截止日期均在演示日之后，直接输出无需调脚本 |
| 代表性知识产权（6项发明+3项软著） | 写死提示词 | 常见问题直接回答，完整列表走 fetch-patents.py |
| 新闻/公告 | 脚本读30分钟缓存 | cau-news-scraper + news-warmer 预热，< 3s 返回 |
| 完整论文/专利列表 | on-demand 脚本 | teacher-portal 的 Python 脚本按需调用 |

**DEFAULT_SYSTEM 关键规则**：
1. 纯文本输出，不使用 Markdown
2. 隐私保护：绝对禁止向用户透露 schoolId（仅供 API 调用）
3. 数字快捷 1-9：直接执行对应功能，无需追问
4. 教师模式（teacher:T009）：第一条消息就给出合作者推荐，不让用户等待
5. 新闻查询：用 `--no-fetch-content` 快速列表，用户要正文再加 `--fetch-content`

**数字快捷指令**（1-9）：
- 1 = 课程表 + 近期作业截止
- 2 = 图书馆空余座位
- 3 = 今日食堂菜单
- 4 = 东西校区班车时刻
- 5 = 可预约教室/会议室
- 6 = 校医院今日出诊
- 7 = 校园卡余额 + 最近10条消费
- 8 = 询问查哪位老师
- 9 = 农大新闻 + 信电学院公告（各5条，读缓存 < 3s）

### lib/news-warmer.ts

服务端新闻缓存预热器：
- 服务启动时立即执行一次（异步，不阻塞启动）
- 之后每 25 分钟定时执行（低于 30 分钟的 Python 缓存 TTL）
- 调用 `python3 .pi/skills/cau-news-scraper/main.py --sites cau_news ciee --no-fetch-content --limit 10`
- 写入 `SKILLS_CACHE_DIR`（`/app/.cache/skills`），与 agent 调用 scraper 共用同一目录

### lib/agent/bash-tool.ts（安全沙箱）

**路径权限**：

| 路径 | 权限 |
|------|------|
| `.data/wechatbot/{当前用户Id}/` | 读写 |
| `.pi/skills/` | 只读 |
| `/etc`, `/root`, `/sys` 等系统路径 | ❌ 封锁 |
| 其他用户的 `.data/wechatbot/` | ❌ 跨用户封锁 |

**spawnHook 注入的环境变量**：
```typescript
HOME: userRoot,
PI_SKILLS_ROOT: ".pi/skills",
SCHOOL_SERVER_URL: process.env.SCHOOL_SERVER_URL ?? "http://school-server:3002",
SKILLS_CACHE_DIR: path.resolve(PROJECT_ROOT, ".cache", "skills"),
```

⚠️ `SKILLS_CACHE_DIR` 必须与 news-warmer.ts 和 docker-compose.yml 中一致，否则 agent 无法命中预热缓存。

### lib/agent/school-workflow.ts

每次 prompt 前调用 `preparePromptInput`：
1. 查 `userSchoolBindings` 得到 `{role, schoolId}`
2. 注入系统上下文：`系统上下文：当前用户已绑定身份 student:S20253082026`
3. 未绑定时注入限制上下文

**作业提交流程（学生）**：收到文件 → 检测身份 → 展示未提交作业列表 → 用户选编号 → 提交

**作业发布流程（教师）**：收到文件 → 展示课程列表 → 确认 → POST 发布 → 通知学生

---

## 12. Agent Skills（`.pi/skills/`）

Skills 通过 `DefaultResourceLoader` 注入。Agent 根据各 SKILL.md frontmatter 的 `description` 字段触发（TTL 60s 刷新）。

### 各 Skill 说明

| Skill | 触发场景 | 实现 |
|-------|---------|------|
| `school-http` | 课程、作业、图书馆、食堂、校车、校园卡、教室、校医院、报修 | bash + curl → school-server API |
| `cau-news-scraper` | 农大新闻、信电学院公告、就业通知 | Python，30分钟文件缓存（_cache.py），支持 --fetch-content |
| `ciee-faculty-scraper` | 信电学院教师、师资、研究方向、联系方式 | Python，`computer_faculty.json` 已含真实数据，支持分页 |
| `teacher-portal` | 教师查论文/专利/课题/合作者/导出Word | 5个Python脚本，调用 school-server teacher portal API |
| `decision-assistant` | 综合决策（饮食/就医安排/会议室预约） | 3个Python脚本，交叉分析多源数据 |
| `research-advisor` | 科研方向、找导师、竞赛选题 | Python，查 school-server 教师 research_areas |
| `library/cafeteria/bus/campus-card/repair` | 各单项查询（fallback） | bash + curl |

### teacher-portal skill 详解

**5个脚本，均通过 `SCHOOL_SERVER_URL` 连接 school-server**：

```bash
# 查论文（支持地区/年份/近N年/Top N 筛选）
python $PI_SKILLS_ROOT/teacher-portal/fetch-papers.py T009 [--region=港澳] [--year=2024] [--recent=5] [--top=10]

# 查知识产权
python $PI_SKILLS_ROOT/teacher-portal/fetch-patents.py T009 [--type=发明专利|实用新型|软件著作权] [--region=港澳]

# 查可申报课题（模拟数据已写入 DEFAULT_SYSTEM，一般直接输出；此脚本备用）
python $PI_SKILLS_ROOT/teacher-portal/fetch-projects.py [--category=国家级基金]

# 寻找合作者（同时搜索 school-server DB 和 ciee-faculty-scraper 缓存）
python $PI_SKILLS_ROOT/teacher-portal/find-collaborator.py <关键词> [excludeTeacherId]

# 导出 Word 科研汇总报告（含论文/专利/合作者，打印 FILE:/tmp/xxx.docx 路径）
python $PI_SKILLS_ROOT/teacher-portal/export-summary.py T009 [--type=all|papers|patents|collab] [--region=港澳]
```

**Word 导出后**：agent 从输出里找 `FILE:/tmp/...` 路径，用 `wechat_send` 发送文件。

### cau-news-scraper 缓存机制

```
news-warmer（服务端，每25分钟） → 调 main.py → 写 SKILLS_CACHE_DIR
用户问新闻 → agent 调 main.py → run_key 命中缓存（30min TTL）→ < 3s 返回
```

**输出格式规范**（微信）：标题一行 + 裸 URL 下一行，条目间空行。

### ciee-faculty-scraper 分页（必须遵守）

全院 + 简介输出约 90KB，超出 bash tool 输出限制，必须分页（每次 ≤10 人）：
```bash
python $PI_SKILLS_ROOT/ciee-faculty-scraper/main.py \
  --dept col50403 --fetch-bio --limit 10 --offset 0 --pretty
# 若 has_more=true，继续增加 --offset，直到 has_more=false
```

### Skills 热更新

`.pi/` 通过 volume 挂载，**不打入 Docker 镜像**：
- 改 SKILL.md / Python 文件 → 约 60s 内自动生效
- 无需重启、无需重建镜像

---

## 13. 关键设计决策与坑

### 1. DEFAULT_SYSTEM 静态缓存策略

模拟数据（学生课表/作业、教师课程/论文概览/专利/课题）直接写入 DEFAULT_SYSTEM，避免 HTTP 请求延迟：
- 优点：常见问题 0 延迟，无 API 开销
- 缺点：token 数增加（每次对话都随 prompt 发送）；修改后必须重新编译 work-server
- 新闻/公告不写死（每天更新），改为预热缓存文件方案

### 2. work-server 是编译单二进制

`bun build --compile` 将全部 TypeScript 打包成一个可执行文件。**修改 TS 代码必须重新编译**，用二进制热替换（见 §6.3）。

例外：`.pi/skills/` 通过 volume 挂载，改 SKILL.md 无需编译。

### 3. SCHOOL_SERVER_URL 必须显式注入 bash 子进程

bash 子进程不继承父进程 env。`bash-tool.ts` 的 `spawnHook` 必须显式注入：
```typescript
SCHOOL_SERVER_URL: process.env.SCHOOL_SERVER_URL ?? "http://school-server:3002"
```

### 4. SKILLS_CACHE_DIR 三处必须一致

`docker-compose.yml`（work-server env）、`bash-tool.ts`（spawnHook env）、`news-warmer.ts` 三处都必须指向同一目录（容器内 `/app/.cache/skills`），否则预热缓存对 agent 无效。

### 5. Better Auth 注册后立即调 API 的时序问题

`signUp.email` 成功后 cookie 不一定可用，必须**再显式 `signIn.username`** 才能保证 cookie 写入（见 gateway/login-view.tsx `ensureSignedIn`）。

### 6. userSchoolBindings 唯一约束导致 500

同一 schoolId 重复绑定 → PG 23505 → 路由层 catch 返回 409。  
清理孤儿绑定：
```sql
DELETE FROM user_school_bindings WHERE user_id NOT IN (SELECT id FROM "user");
```

### 7. React try/finally 无 catch → silent fail

事件 handler 必须有完整 `try/catch/finally`，否则异常变成 unhandled rejection。

### 8. gateway 构建需 placeholder 环境变量

Dockerfile gateway-builder stage 设置 `ENV DATABASE_URL=placeholder`，Next.js 构建阶段不需要真实 DB。

### 9. 微信网页协议链接渲染差异

少数账号/设备裸 URL 不渲染为可点链接，这是微信平台行为，无法修复。

### 10. ciee-faculty-scraper `research_areas` 字段

`computer_faculty.json` 的教师 `research_areas` 字段需要从官网手动爬取并填写（bio 字段为 null）。find-collaborator.py 同时检索 `research_areas` 和 `bio` 字段。

---

## 14. 常见改动指引

### 修改 Agent 行为 / 系统提示

文件：`packages/work-server/modules/agent/service.ts`  
改后**必须重新编译 work-server**（见 §6.3 二进制热替换）。

### 修改 Skill

文件：`packages/work-server/.pi/skills/<skill>/SKILL.md` 或 `.py`  
**无需重建，约 60s 内自动生效**。修改 `description` 时检查与其他 skill 的关键词冲突。

### 新增教务 API

1. `school-server/src/db/<模块>.ts`：DB 函数（裸 SQL）
2. `school-server/src/routes/<模块>.ts`：Elysia 路由
3. 在 `db/index.ts` 和 `routes/index.ts` 注册
4. 更新 `school-http/SKILL.md`

改后重建 school-server：
```bash
docker compose up -d --build school-server
```

### 修改前端 UI

文件：`packages/gateway/app/`  
改后重建 gateway：
```bash
docker compose up -d --build gateway
```

### 修改数据库 Schema（PostgreSQL）

```bash
# 1. 编辑 packages/db/drizzle/schema/app.ts
# 2. 生成迁移
bun run db:generate
# 3. 提交迁移文件，重新部署时 db-migrate 自动应用
```

### 修改教师门户 Skill 的数据缓存

T009 的论文/专利/课题概览写在 `DEFAULT_SYSTEM`（service.ts），修改后需重编译。  
完整列表由 Python 脚本按需从 school-server 拉取，修改 seed/index.ts 后需重启 school-server（SEED=true 重新生成）。

---

## 15. 环境变量速查

`.env.example` 只有 6 个必填变量，其余均有默认值：

```bash
# 必填
PUBLIC_URL=http://localhost:3000       # 对外公网地址（唯一需要改的地址配置）
POSTGRES_PASSWORD=强密码
BETTER_AUTH_SECRET=                    # openssl rand -base64 32
OPENAI_API_BASE_URL=                   # 如 https://api.openai.com/v1
OPENAI_API_MODEL=                      # 如 gpt-4o
OPENAI_API_KEY=                        # sk-...
```

| 变量 | 使用方 | 默认值 | 说明 |
|------|--------|--------|------|
| `PUBLIC_URL` | gateway | — | 派生 BETTER_AUTH_URL / NEXT_PUBLIC_APP_URL |
| `POSTGRES_USER` | postgres | root | |
| `POSTGRES_PASSWORD` | postgres | — | **必填** |
| `POSTGRES_DB` | postgres | postgres | |
| `DATABASE_URL` | gateway, work-server | compose 派生 | `postgresql://{USER}:{PASS}@postgres:5432/{DB}` |
| `BETTER_AUTH_SECRET` | gateway | — | **必填** |
| `OPENAI_API_BASE_URL` | work-server | — | **必填** |
| `OPENAI_API_MODEL` | work-server | — | **必填** |
| `OPENAI_API_KEY` | work-server | — | **必填** |
| `OPENAI_SYSTEM_PROMPT` | work-server | 代码内 DEFAULT_SYSTEM | 覆盖默认系统提示（一般不用） |
| `SCHOOL_SERVER_URL` | work-server | `http://school-server:3002` | bash 子进程需显式注入 |
| `SKILLS_CACHE_DIR` | work-server | `/app/.cache/skills` | 爬虫缓存目录，三处必须一致 |
| `PI_SKILLS_ROOT` | work-server | `/app/.pi/skills` | Skills 根目录 |
| `WORK_SERVER_URL` | gateway | compose 派生 | `http://work-server:3100` |
| `CAU_MANUAL_PDF_URL` | work-server | 空 | 欢迎语附带的手册链接（可选） |
| `GATEWAY_PORT` | gateway | 3000 | 对外暴露端口 |
| `AGENT_SESSION_IDLE_MINUTES` | work-server | 30 | 空闲会话回收时间；0=禁用 |
| `AGENT_MAX_MESSAGES` | work-server | 80 | 加载历史对话最大条数 |
| `WORKER_INTERNAL_TOKEN` | work-server, gateway | 空（不校验） | 内部 API Bearer token |
| `SCHOOL_DB_PATH` | school-server | /data/school.db | SQLite 路径 |
| `SEED` | school-server | false | `true` 时自动生成种子数据 |
| `NODE_TLS_REJECT_UNAUTHORIZED` | work-server | — | 设为 "0" 可绕过 TLS 验证（开发用） |
