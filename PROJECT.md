# CAU-CLAW

中国农业大学校园智能助手平台。WeChat Bot + AI Agent，覆盖课程表、新闻公告、教室预约、班车、校医院、就业等场景。

---

## 文档导航

| 文档 | 内容 |
|------|------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 项目架构、模块说明、设计决策、常见改动指引 |
| [OPERATIONS.md](./OPERATIONS.md) | 本地开发、Docker 部署、环境变量、运维命令 |

**新接手项目？** 先读 ARCHITECTURE.md §1–§3（概述 + 架构图 + 目录结构），再按需查对应模块章节。

**只是要更新部署？** 直接看 OPERATIONS.md §5（代码更新后重新部署）。

---

## Changelog（摘要）

| 日期 | 内容 |
|------|------|
| 2026-04-28 | quickProfessorReply（林万龙/任金政即时档案）；news 10 条；公告关键词；教师身份修复；router.refresh() bug 修复；林万龙/任金政 DEFAULT_SYSTEM 静态缓存 |
| 2026-04-27 | 快速图片回复（课程表/食堂/班车/校医院）；新闻/就业缓存直读；登录页 logo；教师 ID 字段；T001-T009 演示教师账号 |
| 2026-04-26 | 生产服务器部署初始化 |
