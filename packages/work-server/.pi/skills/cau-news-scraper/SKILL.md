---
name: cau-news-scraper
description: 中国农业大学新闻公告爬取。需要查询农大新闻、信电学院公告、就业网通知时触发。用户说"查农大新闻"、"信电学院有什么公告"、"最新招聘信息"、"看就业通知"等关键词时使用。
version: 1.0.0
---

# CAU 新闻爬取

**工具位置：** `$PI_SKILLS_ROOT/cau-news-scraper/main.py`

所有查询通过终端 CLI 完成，无需 cd，直接用完整路径调用，无需额外配置。

---

## 第一步：确认可用站点与频道

任何查询前先确认频道 ID（特别是 ciee、scc 的 ID 不是固定字符串）：

```bash
python $PI_SKILLS_ROOT/cau-news-scraper/main.py --list
```

输出示例：
```
[cau_news] 中国农业大学新闻网
  - ttgznew: 头条关注
  - zhxwnew: 综合新闻
  - kxyj: 科学研究
  ...

[ciee] 信息与电气工程学院
  - col50389: 新闻动态
  - col50390: 学院公告
  ...

[scc] 中国农业大学学生就业服务网
  - 6ebab28e...: 就业公告
  ...
```

---

## 常用命令

```bash
SKILL=$PI_SKILLS_ROOT/cau-news-scraper/main.py

# 所有站点最新 10 条（只有标题+日期+链接，无正文）
python $SKILL --pretty

# 查特定站点
python $SKILL --sites ciee --pretty
python $SKILL --sites cau_news scc --limit 5 --pretty

# 查特定频道（ID 从 --list 获取）
python $SKILL --sites ciee --channels col50389 col50390 --limit 10 --pretty

# 需要完整正文（慢，每篇需发 HTTP 请求）
python $SKILL --sites ciee --limit 5 --fetch-content --pretty

# 保存到文件（相对路径写到当前用户目录）
python $SKILL --sites cau_news --limit 20 --fetch-content --output cau_news.json
```

---

## ⚠️ 关键注意事项

### 1. 不传 `--fetch-content` 则无正文
默认只返回标题、日期、URL，`content` 字段为 `null`。  
需要读取文章内容必须加 `--fetch-content`：
- 不加：速度快（2–5 秒），适合判断有无相关新闻
- 加上：速度慢（10–30 秒），适合摘要或全文阅读

### 2. ciee（信电学院）没有列表页摘要
ciee 所有频道的 `summary` 始终为 `null`，不是 bug。需要内容必须用 `--fetch-content`。

### 3. 外部链接抓不到正文
微信公众号、微博等外链即使加 `--fetch-content` 也返回 `null`，通过 `url` 字段中 `mp.weixin.qq.com` 等识别。

### 4. 耗时估算（`--fetch-content` 时）
| 条数 | 预计耗时 |
|------|---------|
| 15 条（limit=1） | 5–10 秒 |
| 150 条（limit=10） | 30–60 秒 |
| 750 条（limit=50） | 3–5 分钟 |

---

## 返回 JSON 结构

```json
{
  "success": true,
  "total": 42,
  "items": [
    {
      "title": "信电学院赵景博副教授课题组取得重要进展",
      "url": "https://ciee.cau.edu.cn/art/2026/4/9/art_50389_1106729.html",
      "date": "2026-04-09",
      "source": "ciee",
      "source_name": "信息与电气工程学院",
      "channel": "col50389",
      "channel_name": "新闻动态",
      "summary": null,
      "content": "完整正文（--fetch-content 时填充，否则 null）"
    }
  ],
  "errors": []
}
```

---

## 典型场景

### 查询信电学院最新公告
```bash
python $PI_SKILLS_ROOT/cau-news-scraper/main.py --sites ciee --channels col50390 --limit 10 --fetch-content --pretty
```

### 查农大头条新闻（有摘要，不需正文）
```bash
python $PI_SKILLS_ROOT/cau-news-scraper/main.py --sites cau_news --channels ttgznew --limit 5 --pretty
```

### 查就业网最新招聘公告
```bash
# 先确认频道 ID
python $PI_SKILLS_ROOT/cau-news-scraper/main.py --list
# 再用 UUID 查询
python $PI_SKILLS_ROOT/cau-news-scraper/main.py --sites scc --channels 6ebab28e72ba46da99a0f2c372b129d7 --limit 10 --pretty
```

### 全站扫描（摘要版，快速了解近况）
```bash
python $PI_SKILLS_ROOT/cau-news-scraper/main.py --limit 5 --pretty
```

---

## 📱 微信输出格式规范（必须严格遵守）

**每条新闻必须同时展示标题和链接**，格式：标题一行，链接紧跟下一行，条目间空一行。

示例：
```
【农大新闻】最新 5 条

1. 信电学院赵景博副教授课题组取得重要进展
https://ciee.cau.edu.cn/art/2026/4/9/art_50389_1106729.html

2. 中国农业大学召开2026年春季教学工作会议
https://news.cau.edu.cn/art/2026/4/8/art_8057_1106500.html

3. ...

共 42 条，如需更多请告知。
```

规则：
- **链接必须直接输出裸 URL**，不加"原文链接："等任何前缀
- 链接与标题不在同一行；标题行 → 换行 → 裸 URL → 空行 → 下一条
- 微信移动端会自动将裸 URL 渲染为可点击链接
- 外链（微信公众号 `mp.weixin.qq.com` 等）同样输出 URL，用户可自行打开
- 默认展示 5 条，末尾注明总数；用户要更多时继续取

