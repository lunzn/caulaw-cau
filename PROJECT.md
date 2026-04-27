# CAU-CLAW 项目文档索引

> **给新对话/新协作者**：先读 ARCHITECTURE.md 掌握项目全貌，再看 OPERATIONS.md 了解如何运行和部署。
>
> **给 AI 协作者**：每次修改项目后，判断是否需要更新以下文档：
> - **架构变动**（新模块、数据模型、行为规则、新账号、新 Skill）→ 更新 [ARCHITECTURE.md](ARCHITECTURE.md)
> - **部署变动**（Docker 配置、环境变量、服务器操作流程）→ 更新 [OPERATIONS.md](OPERATIONS.md)

---

## 文档

| 文档 | 内容 |
|------|------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | 项目概述、技术栈、架构图、目录结构、各 package 详解、Agent/Skills 说明、关键设计决策、常见改动指引 |
| [OPERATIONS.md](OPERATIONS.md) | 本地开发、环境变量、Docker 服务说明、服务器部署、代码更新流程、运维命令 |

---

## 项目一句话

**CAU-CLAW** 是中国农业大学微信校园助手平台：用户绑定微信和校园卡号，之后在微信里向 AI Agent 查询课表、新闻、食堂、班车、教师信息等校园服务。

核心服务：`gateway`（Next.js Web 控制台）、`work-server`（Bot + Agent，Elysia + 编译二进制）、`school-server`（教务仿真 API，Elysia + SQLite）、`postgres`（用户数据）。
