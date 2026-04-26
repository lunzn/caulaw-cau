---
name: school-http
description: 教务管理系统查询与操作技能。用户提到课程安排、作业、截止提醒、图书馆座位/馆藏、食堂菜单/消费、校车时刻、校园卡余额、教室预约、校医院时触发。注意：信电学院真实师资/研究方向/简介由 ciee-faculty-scraper 处理；农大新闻/公告由 cau-news-scraper 处理，本技能不负责这两类。通过 bash 执行 curl 调用 school-server HTTP API，不编造数据。
version: 1.1.0
---

# School Server HTTP Skill

> **职责边界**：本技能只操作教务管理系统（school-server）内的仿真数据，包括课程表、作业提交、图书馆、食堂、校车、校园卡、教室预约、校医院。
> **不适用**：① 查询信电学院真实师资信息 → 使用 `ciee-faculty-scraper`；② 查看农大/信电学院新闻公告 → 使用 `cau-news-scraper`。

使用 bash 工具通过 `curl` 访问 `school-server`。

⚠️ **服务地址（必须严格遵守）**：
- 环境变量 `SCHOOL_SERVER_URL` 已注入，**直接使用即可**
- 默认回退地址：`http://school-server:3002`（Docker 内部网络）
- **严禁**使用 localhost、127.0.0.1、localhost:8080、localhost:3000 或任何其他猜测地址
- API 前缀：`/api`

```bash
BASE="${SCHOOL_SERVER_URL:-http://school-server:3002}"
```

---

## 0) 健康检查（首步）

```bash
BASE="${SCHOOL_SERVER_URL:-http://school-server:3002}"
curl -sS "${BASE}/health"
```

失败则明确告知「school-server 当前不可达」，不编造结果。

---

## 1) 学生 / 教师 / 课程查询

```bash
# 学生详情
curl -sS "${BASE}/api/students/<studentId>"

# 按学号查（schoolId 绑定用）
curl -sS "${BASE}/api/students/by-number/<studentNumber>"

# 学生课程列表
curl -sS "${BASE}/api/students/<studentId>/courses"

# 未提交作业
curl -sS "${BASE}/api/assignments/unsubmitted/<studentId>"

# 学生提交记录
curl -sS "${BASE}/api/assignments/student-submissions/<studentId>"

# 教师列表
curl -sS "${BASE}/api/teachers"

# 教师详情
curl -sS "${BASE}/api/teachers/<teacherId>"

# 教师课程
curl -sS "${BASE}/api/courses/by-teacher/<teacherId>"

# 课程详情（含教师）
curl -sS "${BASE}/api/courses/<courseId>/detail"

# 课程作业
curl -sS "${BASE}/api/assignments/by-course/<courseId>"

# 未来 N 小时截止的作业
curl -sS "${BASE}/api/assignments/upcoming?hours=24"
```

---

## 2) 图书馆

```bash
# 各楼层座位余量
curl -sS "${BASE}/api/library/seats"

# 馆藏图书搜索
curl -sS "${BASE}/api/library/books?q=<关键词>"
```

---

## 3) 食堂菜单与营业时间

```bash
# 食堂列表（含营业时间）
curl -sS "${BASE}/api/cafeteria"

# 今日全部菜单
curl -sS "${BASE}/api/cafeteria/menu/today"

# 指定食堂菜单（可附 ?date=YYYY-MM-DD）
curl -sS "${BASE}/api/cafeteria/<cafeteriaId>/menu"
```

---

## 4) 校园卡 & 食堂消费记录

```bash
# 校园卡余额
curl -sS "${BASE}/api/campus-card/<studentId>"

# 近期消费记录（默认50条，最多200条）
curl -sS "${BASE}/api/cafeteria/transactions/<studentId>?limit=20"

# 消费汇总（按食堂分类）
curl -sS "${BASE}/api/cafeteria/transactions/<studentId>/summary"
```

---

## 5) 校车时刻表

```bash
# 路线列表
curl -sS "${BASE}/api/bus/routes"

# 全部班次（含学期/假期区分）
curl -sS "${BASE}/api/bus/schedules"
```

---

## 6) 教室 / 会议室预约

```bash
# 教室列表（可附 ?type=classroom 或 ?type=meeting_room）
curl -sS "${BASE}/api/rooms"

# 某日教室预约情况
curl -sS "${BASE}/api/rooms/<roomId>/reservations?date=YYYY-MM-DD"

# 学生已有预约
curl -sS "${BASE}/api/rooms/student/<studentId>"

# 新建预约（POST）
curl -sS -X POST "${BASE}/api/rooms/reserve" \
  -H "Content-Type: application/json" \
  -d '{
    "student_id": "<studentId>",
    "room_id": "<roomId>",
    "date": "YYYY-MM-DD",
    "start_time": "14:00",
    "end_time": "16:00",
    "purpose": "小组讨论"
  }'

# 取消预约
curl -sS -X DELETE "${BASE}/api/rooms/reservations/<reservationId>"
```

预约成功时 API 会返回 `message` 字段，内容形如：
「您的教室/会议室已预约成功，地址：xxx。时间：xxx，预约人：xxx。」
请将此 message 原文转述给用户。

---

## 7) 校医院时刻表

```bash
# 全部科室出诊时刻
curl -sS "${BASE}/api/clinic/schedule"

# 指定科室
curl -sS "${BASE}/api/clinic/schedule/<department>"
```

---

## 8) 作业提交 / 批改

```bash
# 学生提交
curl -sS -X POST "${BASE}/api/assignments/<assignmentId>/submit" \
  -H "Content-Type: application/json" \
  -d '{"student_id":"<studentId>","content":"说明","file_url":"https://..."}'

# 教师批改
curl -sS -X POST "${BASE}/api/assignments/submissions/<submissionId>/grade" \
  -H "Content-Type: application/json" \
  -d '{"score":90,"feedback":"完成度高"}'
```

---

## 9) 输出格式规范（微信文本适配）

微信消息框宽度有限，禁止使用 Markdown 表格（`| col |`）。遵循以下规则：

- 列表用 `序号.` 或 `—` 开头，每条单独一行
- 标题用纯文字加空行分隔，不用 `##`
- 课程表格式示例：
  ```
  【课程表】
  — 统计机器学习理论
    时间：周一 19:00-21:00  周三 19:00-21:00
    地点：第三教学楼501
  — 随机过程与排队论
    时间：周三 21:10-23:00
    地点：第三教学楼502
  ```
- 消费记录格式示例：
  ```
  【近期消费（公寓一食堂）】
  4/22 午 米饭+红烧肉  ¥10.5  638kcal
  4/21 晚 米饭+麻婆豆腐  ¥7.0  267kcal
  ```
- 教室预约成功：直接转述 API 返回的 message 原文
- 数据条目较多时只展示前 5-10 条，末尾加「共 N 条，如需更多请告知」

---

## 10) 对话策略

1. 先查再答：调用 API 取到真实数据后再输出摘要，不编造。
2. 缺少 ID 时，先查列表让用户选，或用 by-number 接口换取 ID。
3. API 返回 `success: false` 时原样转述错误信息。
4. 预约/提交等写操作前，先复述关键参数并征得确认。
5. 当前绑定身份的 studentId 已在系统提示中给出，无需再问用户。
