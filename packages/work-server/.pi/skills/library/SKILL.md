---
name: library
description: 图书馆座位查询与预约、图书馆藏查询。用户提到"图书馆有没有座位"、"预约座位"、"取消预约"、"我的预约"、"借书"、"查图书"、"能借到xxx吗"等关键词时触发。
version: 1.1.0
---

# 图书馆查询与座位预约

使用 bash 工具通过 `curl` 访问 school-server。

```bash
BASE_URL="${SCHOOL_SERVER_URL:-http://school-server:3002}"
```

可预约时间段：`08:00-10:00`、`10:00-12:00`、`14:00-16:00`、`16:00-18:00`、`19:00-21:00`

---

## 1) 查询各区域各时段剩余座位

```bash
# 不传 date 默认今天
curl -sS "${BASE_URL}/api/library/seats/availability?date=2026-04-16"
```

返回每个区域 × 每个时间段的 `reserved`（已预约）和 `available`（剩余可约）。

## 2) 预约座位

```bash
curl -sS -X POST "${BASE_URL}/api/library/reservations" \
  -H "Content-Type: application/json" \
  -d '{
    "student_id": "{studentId}",
    "area_name": "一楼自习区",
    "date": "2026-04-16",
    "time_slot": "14:00-16:00"
  }'
```

同一学生同日同时段只能预约一次。`available=0` 时报"座位已满"。

## 3) 查看我的预约

```bash
curl -sS "${BASE_URL}/api/library/reservations/{studentId}"
```

返回该学生所有预约，含 `status`（active=有效 / cancelled=已取消）。

## 4) 取消预约

```bash
curl -sS -X DELETE "${BASE_URL}/api/library/reservations/{reservationId}" \
  -H "Content-Type: application/json" \
  -d '{"student_id": "{studentId}"}'
```

## 5) 搜索图书

```bash
curl -sS "${BASE_URL}/api/library/books?q=算法"
curl -sS "${BASE_URL}/api/library/books/9787111640585"
```

---

## 对话策略

1. 预约前先查 availability，确认该时段还有空位再提交。
2. 预约前复述区域、日期、时间段，征得用户确认。
3. 缺少 `studentId` 时先查学生列表或让用户提供学号。
4. `available=0` 时主动推荐同一区域其他时段或其他区域。
5. API 不可达时明确告知，不编造数据。
