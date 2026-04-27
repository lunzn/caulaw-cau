# CAU-CLAW 运维操作文档

> 本文档涵盖本地开发、服务器部署、Docker 操作、环境变量配置。
>
> **维护要求**：每次修改部署流程、环境变量、Docker 配置时，检查本文档是否需要同步更新。

---

## 目录

1. [本地开发](#1-本地开发)
2. [环境变量速查](#2-环境变量速查)
3. [Docker 服务说明](#3-docker-服务说明)
4. [第一次部署（全新服务器）](#4-第一次部署全新服务器)
5. [代码更新后重新部署](#5-代码更新后重新部署)
6. [当前生产服务器操作流程](#6-当前生产服务器操作流程)
7. [Skill 热更新](#7-skill-热更新)
8. [网络受限时的构建方法](#8-网络受限时的构建方法)
9. [数据备份与迁移](#9-数据备份与迁移)
10. [常用运维命令](#10-常用运维命令)

---

## 1. 本地开发

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

## 2. 环境变量速查

`.env.example` 只有 6 个必填变量，其余均有默认值。

**必填变量**：

```bash
PUBLIC_URL=http://你的服务器IP:3000   # 对外公网地址，派生其他 URL
POSTGRES_PASSWORD=强密码
BETTER_AUTH_SECRET=                   # openssl rand -base64 32
OPENAI_API_BASE_URL=https://...       # 如 https://api.openai.com/v1
OPENAI_API_MODEL=...                  # 如 gpt-4o
OPENAI_API_KEY=sk-...
```

**完整变量表**：

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
| `SKILLS_CACHE_DIR` | work-server | `/app/.cache/skills` | 爬虫缓存目录（三处必须一致，见架构文档） |
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

---

## 3. Docker 服务说明

### Dockerfile 各 Stage

| Stage | 基础镜像 | 产物 | 说明 |
|-------|---------|------|------|
| `base` | oven/bun:1.3.8 | — | Bun 运行时，workdir /app |
| `deps` | base | node_modules | `bun install --frozen-lockfile` |
| `migrate` | base + deps | — | `drizzle-kit migrate`，一次性任务 |
| `gateway-builder` | base + deps | .next/standalone | Next.js 静态编译 |
| `gateway` | oven/bun:1.3.8-slim | server.js | port 3000 |
| `school-server` | base + deps | — | 直接运行 src/index.ts，port 3002 |
| `work-server-builder` | base + deps | /app/work-server | `bun build --compile` → 单二进制 |
| `work-server` | python:3.13-slim | 二进制 + Python 环境 | pip 装 requirements.txt，port 3100 |

### 服务与 Volume

| 服务 | 对外端口 | Volumes |
|------|---------|---------|
| `postgres` | 内部5432 | `postgres_data:/var/lib/postgresql/data` |
| `db-migrate` | — | 一次性运行后退出（Exited 0 是正常的） |
| `school-server` | 内部3002 | `school_data:/data`（SQLite 文件） |
| `work-server` | 内部3100 | `~/.wechatbot`（微信凭据）、`./packages/work-server/.data`（对话历史）、`./packages/work-server/.pi`（skills 热挂载）、`skills_cache:/app/.cache`（爬虫缓存） |
| `gateway` | **对外3000** | — |

### 关键注意事项

1. **`~/.wechatbot` volume 绝对不能删**：WeChat 登录凭据在宿主机，删后需重新扫码登录
2. **`.pi/` volume 挂载**：Skills 改动约 60s 内自动生效，无需重建镜像
3. **`work-server` 是编译二进制**：修改 TypeScript 必须重新编译
4. **`assets/` 打入镜像**：修改 PNG 图片需重新编译 work-server
5. **`gateway` 构建时用 placeholder**：`DATABASE_URL=placeholder` 已写入 Dockerfile gateway-builder stage
6. **`school-server` healthcheck 用 bun**：无 curl/wget，用 `bun -e "fetch(...)"` 形式
7. **`SKILLS_CACHE_DIR` 必须三处一致**：docker-compose.yml、bash-tool.ts、news-warmer.ts 必须指向同一 volume

---

## 4. 第一次部署（全新服务器）

```bash
# 前置条件：安装 Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
docker compose version   # 确认 >= 2.x
sudo ufw allow 3000/tcp

# 1. 拉取代码
git clone https://github.com/lunzn/caulaw-cau.git caulaw-cau
cd caulaw-cau

# 2. 配置环境变量
cp .env.example .env
nano .env   # 填写上节中的6个必填变量

# 3. 构建并启动（首次约5-15分钟）
docker compose up -d --build

# 4. 确认状态
docker compose ps
# 期望：postgres Up, school-server Up(healthy), work-server Up, gateway Up
# db-migrate 显示 Exited(0) 是正常的
```

访问 `http://你的服务器IP:3000` → 出现绑定页面 → 完成。

---

## 5. 代码更新后重新部署

### 按改动类型选择最小构建范围

```bash
# 改了 TypeScript（work-server 核心，含 DEFAULT_SYSTEM）
docker compose up -d --build work-server

# 改了前端 UI（gateway）
docker compose up -d --build gateway

# 改了教务 API（school-server）
docker compose up -d --build school-server

# 改了 Skill（.pi/skills/ 下的 .md 或 .py）
# 无需重建，约 60s 内自动生效；要立即生效：
docker compose restart work-server

# 改了图片资源（assets/*.png）
docker compose up -d --build work-server

# 改了数据库 Schema（packages/db/drizzle/schema/）
docker compose up -d --build db-migrate work-server gateway

# 全量更新
docker compose up -d --build
```

---

## 6. 当前生产服务器操作流程

> 生产部署路径：`~/caulaw-new`
> 仓库：`https://github.com/lunzn/caulaw-cau`（public）

**⚠️ 服务器 git 有错误的镜像重写配置**（把 `https://github.com/` 重写成 `https://ghfast.top/https://github.com/`，导致 403）。

```bash
# 标准更新流程
cd ~/caulaw-new

# 拉取最新代码（绕过 ghfast.top 错误重写）
git -c url."https://ghfast.top/https://github.com/".insteadOf="https://github.com/" pull

# 按上节选择最小构建范围，例如：
docker compose up -d --build work-server
```

**永久修复 git 镜像问题**（执行一次即可）：
```bash
git config --global --unset url."https://ghfast.top/https://github.com/".insteadOf
# 之后可直接用 git pull，无需 -c 参数
```

**验证更新是否生效**：
```bash
docker compose ps
docker compose logs work-server --tail=20   # 看 Bot 是否上线
docker compose exec gateway env | grep BETTER_AUTH_URL
```

---

## 7. Skill 热更新

Skills 通过 volume 挂载（`.pi/` → `/app/.pi`），不打入 Docker 镜像：

```bash
git pull
# 约 60s 内 Agent 自动读取新内容（ResourceLoader TTL）
# 要立即生效：
docker compose restart work-server
```

---

## 8. 网络受限时的构建方法

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

---

## 9. 数据备份与迁移

### 备份

```bash
# PostgreSQL 数据
docker compose exec postgres pg_dump -U root postgres > backup.sql

# WeChat 登录凭据（重要！）
tar czf wechatbot-creds.tar.gz ~/.wechatbot/
```

### 迁移到新服务器

```bash
# 新服务器
git clone https://github.com/lunzn/caulaw-cau.git caulaw-cau && cd caulaw-cau
cp env-backup.env .env && nano .env   # 更新 PUBLIC_URL

# 启动 postgres 并恢复数据
docker compose up -d postgres && sleep 5
docker compose exec -T postgres psql -U root postgres < backup.sql

# 恢复 WeChat 凭据
tar xzf wechatbot-creds.tar.gz -C ~/

# 启动所有服务
docker compose up -d --build
```

### 停止服务（保留数据）

```bash
docker compose down
# ⚠️ 不要加 -v，加了会删数据库 volume
```

---

## 10. 常用运维命令

```bash
# 查看服务状态
docker compose ps

# 查看日志
docker compose logs -f                  # 所有服务
docker compose logs -f work-server      # Bot/Agent 日志
docker compose logs -f gateway          # Web 控制台日志
docker compose logs work-server --tail=30

# 重启单服务
docker compose restart work-server

# 进入容器
docker compose exec postgres psql -U root postgres
docker compose exec work-server sh

# 磁盘管理
docker system df
docker image prune -f                   # 清理未使用镜像
```
