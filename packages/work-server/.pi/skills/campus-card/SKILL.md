---
name: campus-card
description: 校园卡余额与网费查询。用户提到"校园卡"、"余额"、"网费"、"还剩多少钱"、"充值"等关键词时触发。
version: 1.0.0
---

# 校园卡查询

使用 bash 工具通过 `curl` 访问 school-server。

```bash
BASE_URL="${SCHOOL_SERVER_URL:-http://school-server:3002}"
```

## 查询余额

```bash
curl -sS "${BASE_URL}/api/campus-card/{studentId}"
```

返回：
- `balance`：校园卡餐饮/消费余额（元）
- `net_balance`：网络费余额（元）
- `updated_at`：最后更新时间（Unix 时间戳）

## 对话策略

1. 需要 `studentId`；不知道时先查学生列表或让用户提供学号。
2. 余额不足时可提示用户去自助机或 APP 充值（仅提示，本系统无充值功能）。
3. API 返回 `success: false` 时原样转述错误，不编造数据。
