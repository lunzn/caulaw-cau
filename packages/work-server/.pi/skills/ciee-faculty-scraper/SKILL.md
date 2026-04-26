---
name: ciee-faculty-scraper
description: 信息与电气工程学院教师信息查询。需要查询信电学院教师、某系教师名单、教授副教授信息、查找具体教师的研究方向/联系方式/简介时触发。用户说"信电学院有哪些教授"、"计算机系的老师"、"查一下人工智能系教师"、"陈雷老师的研究方向"、"王晨是哪个系的"、"信电学院师资"等关键词时使用。
version: 1.2.0
---

# CIEE 教师信息爬取

**工具位置：** `$PI_SKILLS_ROOT/ciee-faculty-scraper/main.py`

所有查询通过终端 CLI 完成，无需 cd，直接用完整路径调用，无需额外配置。

**⚠️ 重要标志说明：**
- 默认行为：**自动抓取每位老师的详细简介（bio）**
- `--no-fetch-bio`：跳过简介抓取，只返回姓名/职称/院系（速度快，bio=null）
- `--search 姓名`：按**老师姓名**关键词过滤（不是按研究方向）
- **不存在 `--fetch-bio` 参数**，不要使用它

---

## ⚡ 快速决策：用哪个命令？

| 用户问题类型 | 使用命令 |
|------------|---------|
| **查某位老师的详细信息**（研究方向/简介/联系方式） | `python3 $SKILL --search 姓名 --pretty` |
| 某系有哪些老师（只要名单，速度快） | `python3 $SKILL --dept col50403 --no-fetch-bio --pretty` |
| 某系含详细简介（**分页，每次10人**） | `python3 $SKILL --dept col50403 --limit 10 --offset 0 --pretty` |
| 全院师资名单（无简介） | `python3 $SKILL --no-fetch-bio --pretty` |
| 全院含简介（**分页，每次10人**） | `python3 $SKILL --limit 10 --offset 0 --pretty`，循环至 `has_more=false` |

---

## 📄 分页说明（避免输出截断）

带简介的大批量查询输出可能超限。**必须使用 `--limit` + `--offset` 分批，每批不超过 10 人。**

返回 JSON 中包含分页信息：
```json
{
  "total": 42,
  "offset": 0,
  "limit": 10,
  "has_more": true,
  "next_offset": 10,
  "members": [...]
}
```

**分页循环规则（必须严格遵守）：**
1. 每次调用取 `--limit 10`，从 `--offset 0` 开始
2. 展示当前批次所有老师信息
3. 检查 `has_more`：若为 `true`，用 `next_offset` 继续
4. 重复直到 `has_more=false`
5. 用户主动说"不用了"才可停止

---

## 院系 ID 对照

```
col50401: 电气工程系       col50402: 电子工程系
col50403: 计算机工程系     col50404: 人工智能系
col50405: 数据科学与工程系  col50406: 计算机图学研究室
col50407: 工程实践创新中心  col50408: 计算中心
col50409: 离退休教职工（名单来自本地 HTML，无简介）
```

---

## 常用命令

```bash
SKILL=$PI_SKILLS_ROOT/ciee-faculty-scraper/main.py

# 查某位老师的详细信息（按姓名搜索，自动抓简介）
python3 $SKILL --search 陈雷 --pretty

# 查特定系教师名单（无简介，快速）
python3 $SKILL --dept col50403 --no-fetch-bio --pretty

# 查特定系含详细简介（分页，每次10人）
python3 $SKILL --dept col50403 --limit 10 --offset 0 --pretty
# 若 has_more=true，继续：
python3 $SKILL --dept col50403 --limit 10 --offset 10 --pretty

# 查所有院系名单（无简介）
python3 $SKILL --no-fetch-bio --pretty

# 全院含简介（分页）
python3 $SKILL --limit 10 --offset 0 --pretty

# 列出院系 ID
python3 $SKILL --list
```

---

## ⚠️ 注意事项

### 1. 查单个教师必须用 `--search 姓名`
`--search` 按姓名关键词搜索，自动只抓匹配教师的简介，速度快（3-5秒）。

**输出大小对比：**
| 命令 | 输出大小 | 结论 |
|------|---------|------|
| `--search 陈雷 --pretty` | ~6KB | ✅ 直接输出 |
| `--dept col50403 --limit 10 --offset 0 --pretty` | ~15KB/批 | ✅ 分页输出 |
| `--dept col50403 --pretty`（无分页） | ~90KB | ❌ 会截断，**禁止** |

### 2. `--search` 只匹配教师姓名，不匹配研究方向
若要按研究方向找老师，需用 `--dept` 获取相关系所有教师（含bio），再从bio中筛选。

### 3. 部分教师简介无法获取（网站问题）
以下教师 `profile_url` 有服务器问题，`--search` 会返回空 bio：
王耀君（计算机工程系，403）、王鹏新（数科系，404）、程新荣（数科系，404）、叶林（电气工程系，超时）

### 4. 职称字段
主系：教授/副教授/讲师/博士后/青年研究员
工程实践创新中心、计算中心：`rank="（网站未设）"`

---

## 返回 JSON 结构

```json
{
  "success": true,
  "total": 1,
  "members": [
    {
      "name": "陈雷",
      "rank": "副教授",
      "department": "计算机工程系",
      "dept_id": "col50403",
      "profile_url": "https://faculty.cau.edu.cn/cl101/",
      "bio": "部门：信息与电气工程学院\n专业技术职务：副教授\n主要研究方向：计算机网络与智能信息处理\n电子邮箱：...\n..."
    }
  ]
}
```

从 `bio` 字段提取：主要研究方向（搜"主要研究方向："）、邮箱（搜"电子邮箱："）

---

## 典型场景

### 查陈雷老师的详细信息
```bash
python3 $PI_SKILLS_ROOT/ciee-faculty-scraper/main.py --search 陈雷 --pretty
```

### 查人工智能系所有教授的研究方向（含bio，分页）
```bash
python3 $PI_SKILLS_ROOT/ciee-faculty-scraper/main.py --dept col50404 --limit 10 --offset 0 --pretty
```

### 全院快速名单（无简介）
```bash
python3 $PI_SKILLS_ROOT/ciee-faculty-scraper/main.py --no-fetch-bio --pretty
```
