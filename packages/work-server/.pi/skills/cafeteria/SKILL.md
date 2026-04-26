---
name: cafeteria
description: 食堂菜单查询。用户提到"今天吃什么"、"食堂有什么菜"、"菜单"、"哪个食堂"、"多少钱"等关键词时触发。
version: 1.0.0
---

# 食堂菜单查询

使用 bash 工具通过 `curl` 访问 school-server。

```bash
BASE_URL="${SCHOOL_SERVER_URL:-http://school-server:3002}"
```

## 1) 列出所有食堂

```bash
curl -sS "${BASE_URL}/api/cafeteria"
```

返回食堂列表（id、名称、位置）。

## 2) 今日全部食堂菜单（推荐）

```bash
# 默认取当天，也可传 date=YYYY-MM-DD
curl -sS "${BASE_URL}/api/cafeteria/menu/today"
curl -sS "${BASE_URL}/api/cafeteria/menu/today?date=2026-04-17"
```

返回所有食堂的菜品，含 `cafeteria_name`、`category`、`name`、`price`、`available`。

## 3) 指定食堂菜单

```bash
curl -sS "${BASE_URL}/api/cafeteria/{cafeteriaId}/menu?date=2026-04-17"
```

## 对话策略

1. 先调 API 再答，不编造菜单。
2. `available=0` 的菜品标注已售罄。
3. 回复时按食堂分组，每道菜附上价格，方便用户选择。
4. 用户问某食堂时先从列表里找 id，再查该食堂菜单。
