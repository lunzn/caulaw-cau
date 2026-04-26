---
name: bus
description: 校车路线与时刻查询。用户提到"校车"、"班车"、"几点发车"、"校内环线"、"校区快线"、"怎么去xxx"等关键词时触发。
version: 1.0.0
---

# 校车时刻查询

使用 bash 工具通过 `curl` 访问 school-server。

```bash
BASE_URL="${SCHOOL_SERVER_URL:-http://school-server:3002}"
```

## 1) 列出所有路线

```bash
curl -sS "${BASE_URL}/api/bus/routes"
```

## 2) 查询路线详情（含站点与今日时刻）

```bash
# 默认按当前系统周几过滤时刻（1=周一…7=周日）
curl -sS "${BASE_URL}/api/bus/routes/{routeId}"

# 指定周几
curl -sS "${BASE_URL}/api/bus/routes/{routeId}?weekday=3"
```

返回：
- `route`：路线名称和描述
- `stops`：按 sequence 排序的经停站点
- `schedules`：当天有效的发车时刻（`departure_time` HH:MM，`direction` outbound/inbound）

## 对话策略

1. 先列路线，用户指定后再查详情。
2. 对比当前时间与 `departure_time`，告知最近一班及剩余时间。
3. API 不可达时告知用户，不编造时刻。
