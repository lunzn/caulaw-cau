---
name: repair
description: 宿舍报修工单提交与查询。用户提到"报修"、"宿舍坏了"、"灯不亮"、"空调故障"、"网线"、"查工单进度"等关键词时触发。
version: 1.0.0
---

# 宿舍报修

使用 bash 工具通过 `curl` 访问 school-server。

```bash
BASE_URL="${SCHOOL_SERVER_URL:-http://school-server:3002}"
```

## 1) 查看我的工单

```bash
curl -sS "${BASE_URL}/api/repair/{studentId}"
```

返回该学生所有工单，含 `id`、`dorm_room`、`category`、`description`、`status`、`created_at`。

status 含义：`pending`=待处理、`in_progress`=处理中、`done`=已完成、`closed`=已关闭

## 2) 提交新工单

```bash
curl -sS -X POST "${BASE_URL}/api/repair" \
  -H "Content-Type: application/json" \
  -d '{
    "student_id": "{studentId}",
    "dorm_room": "东1-301",
    "category": "水电",
    "description": "卫生间灯泡坏了"
  }'
```

category 合法值：`水电`、`网络`、`家具`、`门窗`、`空调`、`其他`

## 3) 更新工单状态（管理员）

```bash
curl -sS -X PATCH "${BASE_URL}/api/repair/{ticketId}/status" \
  -H "Content-Type: application/json" \
  -d '{"status": "done"}'
```

## 对话策略

1. 提交前复述关键信息（宿舍号、类别、描述）并确认。
2. 缺少 `studentId` 时先查学生列表或让用户提供学号。
3. category 不在合法值内时提示用户选择。
4. 查询进度时将 status 翻译为中文状态展示。
