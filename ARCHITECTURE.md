# CAU-CLAW 项目架构文档

> 本文档供新对话/新协作者快速掌握项目全貌。读完后应能独立理解代码结构、做出正确改动判断。
>
> **维护要求**：每次修改项目后，检查本文档是否需要同步更新（架构变动、新增模块、数据模型调整、行为规则变化等）。

---

## 目录

1. [项目概述](#1-项目概述)
2. [技术栈总览](#2-技术栈总览)
3. [架构图](#3-架构图)
4. [目录结构](#4-目录结构)
5. [packages/db — 共享数据库 Schema](#5-packagesdb--共享数据库-schema)
6. [packages/gateway — Web 控制台](#6-packagesgateway--web-控制台)
7. [packages/school-server — 教务仿真服务](#7-packagesschool-server--教务仿真服务)
8. [packages/work-server — Bot + Agent 核心](#8-packageswork-server--bot--agent-核心)
9. [Agent Skills（`.pi/skills/`）](#9-agent-skillspiskills)
10. [关键设计决策与坑](#10-关键设计决策与坑)
11. [常见改动指引](#11-常见改动指引)

---

## 1. 项目概述

**CAU-CLAW** 是中国农业大学校园一站式智能助手平台，核心功能：

- 用户通过 Web 控制台绑定手机号（账号）和校园卡号（学生/教师身份）
- 绑定后将自己的微信号接入 Bot，Bot 由 AI Agent（Claude/OpenAI 兼容模型）驱动
- 用户在微信里发消息，Agent 调用各类校园 API（教务系统、图书馆、食堂、班车……）和爬虫（农大新闻、信电学院师资）来回答
- 支持周期性定时任务（Cron）和一次性提醒（Reminder）
- 教务数据来自本项目内嵌的仿真 school-server（SQLite + 种子数据）

**演示账号**：
- 学生：S20253082026（赵鑫宇，信电院研一，东校区）
- 教师 T001/T005：林晓东（信电院计算机工程系教授，计算机视觉/具身智能/智慧农业）
- 教师 T002：陈静怡（经管院农业经济系教授，数字农业/农村金融）
- 教师 T003：黄建国（农学院作物学系副教授，分子育种/CRISPR）
- 教师 T004：刘兰馨（资环院土地资源管理系副教授，农业碳汇/碳减排）
- T001 和 T005 是同一个人（林晓东）的两个演示账号，共用同一套科研数据

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
         │   │         ├── 快速拦截层（quickVipReply / quickNewsReply / quickImageReply）
         │   │         └── pi-coding-agent session
         │   │               ├── bash tool（安全沙箱）
         │   │               ├── read tool（用户目录）
         │   │               ├── wechat media tools
         │   │               ├── cron tools
         │   │               └── .pi/skills/
         │   │                     ├── school-http
         │   │                     ├── cau-news-scraper（Python，30分钟缓存）
         │   │                     ├── ciee-faculty-scraper（Python，真实师资数据）
         │   │                     ├── teacher-portal（Python，5个脚本）
         │   │                     ├── decision-assistant（Python，3个脚本）
         │   │                     ├── research-advisor（Python）
         │   │                     └── library / cafeteria / bus / ...
         │   │
         │   └── CronService + ReminderService
         │         （croner + PostgreSQL）
         │
         └── NewsWarmer（每25分钟预热新闻缓存）
         │
         └── [school-server :3002 Elysia]
               └── SQLite（.data/school.db）
                     （教师/学生/课程/作业/论文/专利/项目...）

[PostgreSQL :5432]
  ├── better-auth 表（user, session, account, verification）
  └── 应用表（scheduled_tasks, reminders, wechat_bot_autostart,
              wechat_known_contacts, user_school_bindings）
```

### 微信消息请求路径

```
用户发消息 → WeChatBot.onMessage
  → bot/service.ts: agentService.prompt(userId, text)
  → agent/service.ts: handleWechatMessage
      ├── [1] quickVipReply   → 姓名匹配（林万龙/任金政）→ 直接回复档案，return
      ├── [2] quickNewsReply  → 新闻/公告/就业关键词   → 读缓存文件，return
      ├── [3] 教师查课表指令注入（text 前插系统指令）
      ├── [4] quickImageReply → 班车/食堂/校医院/课程表 → 发 PNG，return
      └── [5] pi-coding-agent session.prompt(text)
                → 身份上下文注入（school-workflow）
                → Agent 决定调用哪个 skill / tool
                → 结果 stripMarkdown → bot.reply(msg, reply)
```

### 浏览器 → work-server 路径

```
浏览器 → GET /api/bot/status
  → gateway/app/api/bot/[...path]/route.ts
  → proxyToElysia（session cookie → X-User-Id 头）
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
│   │   │   │   ├── app.ts          # 业务表（见第5节）
│   │   │   │   └── index.ts
│   │   │   └── migrations/         # SQL 迁移文件（drizzle-kit generate 生成）
│   │   └── drizzle.config.ts
│   │
│   ├── gateway/                    # Next.js 16 Web 控制台
│   │   ├── app/
│   │   │   ├── page.tsx            # 首页（检测 session）
│   │   │   ├── login-view.tsx      # 登录/注册/绑定表单
│   │   │   ├── dashboard/
│   │   │   │   ├── page.tsx        # Server Component
│   │   │   │   └── dashboard-view.tsx  # Client Component（Bot + Cron + 身份 UI）
│   │   │   └── api/
│   │   │       ├── auth/[...all]/route.ts
│   │   │       ├── bot/[...path]/route.ts    # 代理 → work-server
│   │   │       ├── cron/[...path]/route.ts   # 代理 → work-server
│   │   │       ├── me/identity/route.ts      # 教务身份绑定
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
│   │       │   ├── database.ts     # SQLite 初始化 + 建表
│   │       │   ├── teachers.ts  students.ts  courses.ts
│   │       │   ├── assignments.ts  library.ts  cafeteria.ts
│   │       │   ├── bus.ts  rooms.ts  campus-card.ts  repair.ts
│   │       │   ├── teacher-portal.ts   # getTeacherPapers / getTeacherPatents / getOpenProjects
│   │       │   └── index.ts
│   │       ├── routes/
│   │       │   ├── index.ts
│   │       │   ├── teachers.ts  students.ts  courses.ts  ...
│   │       │   └── teacher-portal.ts   # GET /teachers/:id/papers|patents, /projects/open
│   │       └── seed/index.ts       # 种子数据（SEED=true 时运行，幂等）
│   │
│   └── work-server/                # Bot + Agent 核心（编译为单一二进制）
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
│       │   │   ├── bash-tool.ts          # 安全沙箱 bash（注入 SKILLS_CACHE_DIR 等）
│       │   │   ├── school-workflow.ts    # 作业提交/发布工作流 + loadUserSchoolIdentity
│       │   │   ├── cron-tools.ts         # Agent 可调用的 cron/reminder 工具
│       │   │   ├── read-tool.ts          # 用户目录 sandboxed read
│       │   │   ├── wechat-media-tools.ts
│       │   │   ├── quick-vip-reply.ts    # VIP 档案快速回复（林万龙/任金政）
│       │   │   ├── quick-news-reply.ts   # 新闻缓存快速回复（读 news-snapshot.json）
│       │   │   └── quick-image-reply.ts  # 图片快速回复（班车/食堂/校医院/课程表 PNG）
│       │   ├── bot/service.ts / types.ts
│       │   ├── news-warmer.ts            # 服务端新闻缓存预热（每25分钟）
│       │   ├── db.ts / model.ts
│       │   ├── wechat-jsonl-session.ts
│       │   ├── wechatbot-workspace.ts
│       │   ├── wechat-storage.ts / wechat-contacts.ts
│       │   └── cron-reminder-agent-bridge.ts
│       ├── assets/                       # 预构建图片资源（打入 Docker 镜像）
│       │   ├── bus-schedule.png
│       │   ├── cafeteria-hours.png
│       │   ├── clinic-hours.png
│       │   └── course-schedule.png
│       └── .pi/
│           └── skills/             # Agent 技能（volume 挂载，热更新）
│               ├── school-http/SKILL.md
│               ├── cau-news-scraper/   # main.py + _cache.py + sites/
│               ├── ciee-faculty-scraper/  # main.py + computer_faculty.json
│               ├── teacher-portal/     # 5个Python脚本
│               │   ├── SKILL.md
│               │   ├── fetch-papers.py
│               │   ├── fetch-patents.py
│               │   ├── fetch-projects.py
│               │   ├── find-collaborator.py
│               │   └── export-summary.py
│               ├── decision-assistant/ # 3个Python脚本
│               │   ├── SKILL.md
│               │   ├── analyze-diet.py
│               │   ├── schedule-check.py
│               │   └── find-rooms.py
│               ├── research-advisor/
│               │   ├── SKILL.md
│               │   └── research-find.py
│               ├── library / cafeteria / bus / campus-card / repair /
│               └── requirements.txt    # Python 依赖

├── Dockerfile                      # Multi-stage（8个 target）
├── docker-compose.yml              # 生产编排（5个服务）
├── .env.example                    # 配置模板
├── ARCHITECTURE.md                 # 本文档（项目架构）
├── OPERATIONS.md                   # 部署运维文档
└── PROJECT.md                      # 文档索引
```

---

## 5. packages/db — 共享数据库 Schema

### 业务表（PostgreSQL，Drizzle ORM）

```typescript
scheduledTasks      // 周期性微信定时任务（cronExpr + prompt + targetUserId）
reminders           // 一次性提醒（runAt + prompt，status: "pending"|"sent"）
wechatBotAutostart  // 进程重启后自动重连的 Bot（userId → user.id）
wechatKnownContacts // Bot 曾联系过的用户（重连后发欢迎语）
userSchoolBindings  // 用户 ↔ 教务身份绑定（role, schoolId，唯一约束）
```

**关键约束**：`userSchoolBindings` 的 `(role, school_id)` 联合唯一约束。同一学号重复绑定触发 PG 23505，路由层 catch 返回 409。

清理孤儿绑定：
```sql
DELETE FROM user_school_bindings WHERE user_id NOT IN (SELECT id FROM "user");
```

---

## 6. packages/gateway — Web 控制台

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

## 7. packages/school-server — 教务仿真服务

### 概述

- **完全独立**，与其他 package 代码零耦合，仅暴露 HTTP
- **SQLite**（Bun 原生 `bun:sqlite`，**无 ORM**，全部裸 SQL）
- `SEED=true` 时启动自动生成种子数据（幂等）

### 数据模型

```
teachers ──── courses ──┬── course_students ──── students
                        └── assignments ──── submissions

teacher_papers          # 论文（title, journal, year, region, citation_count）
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

**演示教师（T001-T005）**：

| ID | 姓名 | 院系 | 职称 | 校区 | 特点 |
|----|------|------|------|------|------|
| T001 | 林晓东 | 信电院计算机工程系 | 教授 | 东校区 | 计算机视觉/具身智能，86篇论文含14篇港澳合作，36项知识产权，有 --region=港澳 数据 |
| T002 | 陈静怡 | 经管院农业经济系 | 教授 | 西校区 | 数字农业/农村金融，82篇SSCI/CSSCI，**无港澳合作论文** |
| T003 | 黄建国 | 农学院作物学系 | 副教授 | 西校区 | 分子育种/CRISPR，48篇SCI/CSCD，**无港澳合作论文** |
| T004 | 刘兰馨 | 资环院土地资源管理系 | 副教授 | 西校区 | 农业碳汇，37篇SCIE/CSSCI，**无港澳合作论文** |
| T005 | 林晓东 | 信电院计算机工程系 | 教授 | 东校区 | 与T001同人，原T009迁移，共用同一套科研数据 |

**⚠️ 重要**：T002/T003/T004 无港澳合作论文，`export-summary.py` **不能加 `--region=港澳`**（会返回空文档）。

**演示学生**：S20253082026 赵鑫宇，信电院研一，东校区研3-506。

**课程**：T001 → GT11/GT12/GT13；T005 → GT01/GT02/GT03；T002 → GT04-GT06；T003 → GT07/GT08；T004 → GT09/GT10。

**可申报课题**：6条，截止日期均在 2026-04-30 之后（演示日为 2026-04-27）。

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

## 8. packages/work-server — Bot + Agent 核心

### 启动流程

```
elysia.ts
  → init-background.ts
    → BotService.restorePersistedBots()  # 从 DB + 凭据文件恢复 bot
    → CronService.init()                  # 恢复调度定时任务
    → ReminderService.init()              # 恢复 pending 提醒
    → startNewsWarmup()                   # 立即预热新闻，每25分钟定时重跑
  → Elysia 监听 :3100
```

### 快速拦截层（modules/agent/service.ts）

每条微信文本消息在进入 AI 之前先经过三道快速拦截，命中即返回，不走 pi-coding-agent：

| 顺序 | 函数 | 触发条件 | 响应 |
|------|------|---------|------|
| 1 | `quickVipReply` | 消息含"林万龙"或"任金政" | 直接发送预缓存的完整档案文字 |
| 2 | `quickNewsReply` | 含新闻/头条/公告/就业关键词 | 读 `news-snapshot.json`，格式化输出最新10条 |
| 3 | `quickImageReply` | 班车/食堂/校医院/课程表简单查询 | 发 `assets/` 目录下对应 PNG |

**quickImageReply 的两个例外**：
- 教师身份查课程表 → 跳过图片，在步骤3之前已注入系统指令，让 AI 输出文字课表
- 复杂决策查询（消息 >20字 且含"什么时候/该去/耽误/最好/沙龙"等决策词）→ 跳过图片，交 AI + schedule-check.py 处理

### modules/agent/service.ts（最核心文件，1300+ 行）

**DEFAULT_SYSTEM 分层缓存策略**：

| 数据类别 | 策略 | 原因 |
|---------|------|------|
| 班车/食堂/校医院真实时刻 | 写死 | 真实数据，极少变化 |
| 学生静态数据（S20253082026） | 写死 | 模拟，常见问题0延迟 |
| T001-T005 教师数据（课表/论文概览/专利/课题） | 写死（按身份条件隔离） | 模拟，常见问题0延迟 |
| VIP档案（林万龙/任金政） | 写死在 quick-vip-reply.ts | 需要极速响应 |
| 新闻/公告/就业 | 服务端每25分钟预热→文件缓存 | 每天更新，不能写死 |
| 完整论文/专利列表 | 按需调 Python 脚本 | 数据量大，只在需要时拉取 |

**DEFAULT_SYSTEM 关键规则**：
1. 纯文本输出，不使用 Markdown
2. 隐私保护：绝对禁止向用户透露 schoolId
3. 数字快捷 1-9：直接执行对应功能，无需追问
4. 演示教师数据隔离：T001-T005 的数据只在该账号的 session 内使用，不能混入 ciee-faculty-scraper 搜索结果
5. 教师模式：合作者推荐在第一条消息就给出，不让用户等待
6. 复杂决策（就医安排/饮食分析/场地预约）：必须先调对应 skill 脚本，不允许凭常识直接回答

**数字快捷指令（1-9）**：

| 数字 | 功能 |
|------|------|
| 1 | 课程表 + 近期作业截止 |
| 2 | 图书馆空余座位 |
| 3 | 今日食堂菜单 |
| 4 | 东西校区班车时刻 |
| 5 | 可预约教室/会议室 |
| 6 | 校医院今日出诊 |
| 7 | 校园卡余额 + 最近10条消费 |
| 8 | 询问查哪位老师 |
| 9 | 农大新闻 + 信电学院公告（各5条，读缓存 < 3s） |

### lib/news-warmer.ts

- 服务启动时立即执行一次（异步，不阻塞启动）
- 之后每 25 分钟执行（低于 Python 缓存 30 分钟 TTL）
- 写入 `SNAPSHOT_PATH`（`.cache/news-snapshot.json`）：结构为 `{updated_at, cau_news[], cau_headline[], employment[]}`
- quick-news-reply.ts 读此文件，35分钟内有效；过期则回落到 AI 调 scraper

**爬虫返回格式**：`{"success": true, "total": N, "items": [...]}`（不是裸数组，解析时需取 `.items`）

### lib/agent/bash-tool.ts（安全沙箱）

**路径权限**：

| 路径 | 权限 |
|------|------|
| `.data/wechatbot/{当前用户Id}/` | 读写 |
| `.pi/skills/` | 只读 |
| `/etc`, `/root`, `/sys` 等系统路径 | 封锁 |
| 其他用户的 `.data/wechatbot/` | 封锁（跨用户隔离） |

**spawnHook 注入的环境变量**：
```typescript
HOME: userRoot,
PI_SKILLS_ROOT: ".pi/skills",
SCHOOL_SERVER_URL: process.env.SCHOOL_SERVER_URL ?? "http://school-server:3002",
SKILLS_CACHE_DIR: path.resolve(PROJECT_ROOT, ".cache", "skills"),
```

### lib/agent/school-workflow.ts

每次 prompt 前调用 `preparePromptInput`，注入身份上下文（`系统上下文：当前用户已绑定身份 student:S20253082026`）。`loadUserSchoolIdentity` 也被快速拦截层调用以区分教师/学生。

**作业提交（学生）**：收到文件 → 检测身份 → 展示未提交作业列表 → 用户选编号 → 提交

**作业发布（教师）**：收到文件 → 展示课程列表 → 确认 → POST 发布 → 通知学生

---

## 9. Agent Skills（`.pi/skills/`）

Skills 通过 `DefaultResourceLoader` 注入。Agent 根据各 SKILL.md frontmatter 的 `description` 字段触发（TTL 60s 刷新）。`.pi/` 通过 volume 挂载，**不打入 Docker 镜像，改动约 60s 内自动生效**。

### 各 Skill 说明

| Skill | 触发场景 | 实现 |
|-------|---------|------|
| `school-http` | 课程、作业、图书馆、食堂、校车、校园卡、教室、校医院、报修 | bash + curl → school-server API |
| `cau-news-scraper` | 农大新闻、信电学院公告、就业通知 | Python，30分钟文件缓存，支持 --fetch-content |
| `ciee-faculty-scraper` | 信电学院教师、师资、研究方向、联系方式 | Python，computer_faculty.json 含真实数据，支持分页 |
| `teacher-portal` | 教师查论文/专利/课题/合作者/导出Word | 5个Python脚本，调用 school-server teacher portal API |
| `decision-assistant` | 综合决策（饮食/就医安排/会议室预约） | 3个Python脚本，交叉分析多源数据 |
| `research-advisor` | 科研方向、找导师、竞赛选题 | Python，查 school-server 教师 research_areas |
| `library/cafeteria/bus/campus-card/repair` | 各单项查询（fallback） | bash + curl |

### teacher-portal skill 详解

```bash
# 查论文（支持地区/年份/近N年/Top N 筛选）
python $PI_SKILLS_ROOT/teacher-portal/fetch-papers.py T005 [--region=港澳] [--year=2024] [--recent=5] [--top=10]

# 查知识产权
python $PI_SKILLS_ROOT/teacher-portal/fetch-patents.py T005 [--type=发明专利|实用新型|软件著作权] [--region=港澳]

# 查可申报课题（模拟数据已写入 DEFAULT_SYSTEM，一般直接输出；此脚本备用）
python $PI_SKILLS_ROOT/teacher-portal/fetch-projects.py [--category=国家级基金]

# 寻找合作者（同时搜索 school-server DB 和 ciee-faculty-scraper 缓存）
python $PI_SKILLS_ROOT/teacher-portal/find-collaborator.py <关键词> [excludeTeacherId]

# 导出 Word 科研汇总报告（输出 FILE:/tmp/xxx.docx 路径）
python $PI_SKILLS_ROOT/teacher-portal/export-summary.py T005 [--type=all|papers|patents|collab] [--region=港澳]
```

**⚠️ Word 导出注意**：
- `--region=港澳` 只对 T001/T005（林晓东）有效（有真实港澳合作论文数据）
- T002/T003/T004 **不能加 `--region=港澳`**（会导致返回空文档），应使用全量导出

**Word 导出后**：agent 从输出找 `FILE:/tmp/...` 路径，用 `wechat_send` 发送文件。

### ciee-faculty-scraper 分页（必须遵守）

全院 + 简介输出约 90KB，超出 bash tool 输出限制，必须分页（每次 ≤10 人）：
```bash
python $PI_SKILLS_ROOT/ciee-faculty-scraper/main.py \
  --dept col50403 --fetch-bio --limit 10 --offset 0 --pretty
# 若 has_more=true，继续增加 --offset，直到 has_more=false
```

### cau-news-scraper 缓存机制

```
news-warmer（服务端，每25分钟） → 调 main.py → 写 .cache/news-snapshot.json
用户问新闻 → quick-news-reply.ts 读 snapshot（< 1s）
           → 若过期（>35min）→ agent 调 main.py → 命中 30min Python 缓存（< 3s）
```

**输出格式规范**（微信）：标题一行 + 裸 URL 下一行，条目间空行。最多显示 10 条（`LIMIT = 10`）。

---

## 10. 关键设计决策与坑

### 1. DEFAULT_SYSTEM 静态缓存策略

模拟数据直接写入 DEFAULT_SYSTEM，常见问题 0 延迟，无 API 开销。代价：token 数大（每次对话随 prompt 发送）；**修改后必须重新编译 work-server**。

### 2. work-server 是编译单二进制

`bun build --compile` 打包为单一可执行文件。**改 TypeScript（尤其 DEFAULT_SYSTEM）必须重新编译**。例外：`.pi/skills/` 通过 volume 挂载，改 SKILL.md 无需编译。

### 3. DEFAULT_SYSTEM 里的模板字面量转义

DEFAULT_SYSTEM 是反引号字符串，里面的 `\${当前teacherId}` 是给 AI 读的文字，**必须加反斜杠转义**，不能写成 `${当前teacherId}`（否则会被 JS 当变量插值，变成 `undefined`）。

### 4. SCHOOL_SERVER_URL 必须显式注入 bash 子进程

bash 子进程不继承父进程 env，`bash-tool.ts` 的 `spawnHook` 必须显式注入 `SCHOOL_SERVER_URL`。

### 5. SKILLS_CACHE_DIR 三处必须一致

`docker-compose.yml`（work-server env）、`bash-tool.ts`（spawnHook env）、`news-warmer.ts` 三处都必须指向同一目录（容器内 `/app/.cache/skills`），否则预热缓存对 agent 无效。

### 6. 图片资源打入 Docker 镜像

`assets/` 目录（PNG 图片）**打入 Docker 镜像**（Dockerfile 有 `COPY packages/work-server/assets/ ./assets/`），与 `.pi/skills/`（volume 挂载）不同。修改图片后需重新编译 work-server 镜像。

### 7. Better Auth 注册后立即调 API 的时序问题

`signUp.email` 成功后 cookie 不一定可用，必须再显式 `signIn.username` 才能保证 cookie 写入。

### 8. gateway 构建需 placeholder 环境变量

Dockerfile gateway-builder stage 设置 `ENV DATABASE_URL=placeholder`，Next.js 构建阶段不需要真实 DB。

### 9. 微信网页协议链接渲染差异

少数账号/设备裸 URL 不渲染为可点链接，这是微信平台行为，无法修复。

### 10. ciee-faculty-scraper research_areas 字段

`computer_faculty.json` 的 `research_areas` 字段需从官网手动爬取填写，`bio` 字段为 null。`find-collaborator.py` 同时检索两个字段。

### 11. quickImageReply 与 schedule-check.py 的冲突防护

COMPLEX_RE 检测（消息 >20 字且含决策词）让复杂就医/沙龙查询跳过图片拦截，进入 AI + `schedule-check.py` 流程。新增课表/医院/食堂/班车的图片规则时，务必检查是否会和决策类问题冲突。

---

## 11. 常见改动指引

### 修改 Agent 行为 / 系统提示

文件：`packages/work-server/modules/agent/service.ts`

**必须重新编译 work-server**：
```bash
docker compose up -d --build work-server
```

### 修改 Skill（SKILL.md 或 Python 脚本）

文件：`packages/work-server/.pi/skills/<skill>/`

**无需重建，约 60s 内自动生效**。修改 `description` 时检查与其他 skill 的关键词冲突。

### 修改图片资源（assets/）

文件：`packages/work-server/assets/*.png`

**必须重新编译 work-server**（assets 打入镜像）。

### 修改 VIP 档案（林万龙/任金政）

文件：`packages/work-server/lib/agent/quick-vip-reply.ts`

**必须重新编译 work-server**。

### 新增快速图片回复规则

文件：`packages/work-server/lib/agent/quick-image-reply.ts`

新增 RULES 条目时注意：
1. 检查新模式是否会和现有决策类查询冲突（COMPLEX_RE）
2. 对应 PNG 放入 `assets/`，并在 Dockerfile 的 COPY 覆盖范围内
3. **必须重新编译 work-server**

### 新增演示教师账号

1. `school-server/src/seed/index.ts`：添加教师记录、课程、论文、专利、课题
2. `work-server/modules/agent/service.ts`：在 DEFAULT_SYSTEM 中添加对应静态缓存块（包括隔离规则、Word 导出说明）
3. 两处都改后：重建 school-server + work-server

### 新增教务 API

1. `school-server/src/db/<模块>.ts`：DB 函数（裸 SQL）
2. `school-server/src/routes/<模块>.ts`：Elysia 路由
3. 在 `db/index.ts` 和 `routes/index.ts` 注册
4. 更新 `school-http/SKILL.md`
5. 重建 school-server：`docker compose up -d --build school-server`

### 修改前端 UI

文件：`packages/gateway/app/`

重建 gateway：`docker compose up -d --build gateway`

### 修改数据库 Schema（PostgreSQL）

```bash
# 1. 编辑 packages/db/drizzle/schema/app.ts
# 2. 生成迁移
bun run db:generate
# 3. 提交迁移文件，重新部署时 db-migrate 自动应用
docker compose up -d --build db-migrate work-server gateway
```
