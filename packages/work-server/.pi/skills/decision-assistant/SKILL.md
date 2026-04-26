---
name: decision-assistant
description: 生活决策与个人规划助手。用户提到健康/减肥/饮食分析、想去校医院但不想耽误课、预约会议室或教室、规划锻炼计划、时间安排建议、结合个人数据做决策时触发。关键词：减肥、胖了、饮食建议、热量、吃的太油、健康分析、什么时候去医院、不想耽误上课、帮我预约、预订会议室、锻炼计划、运动提醒、早起提醒、帮我安排、合适的时间。
version: 2.0.0
---

# 生活决策助手

**⚠️ 核心原则：先运行脚本取真实数据，再回答。禁止凭经验空口建议。**

脚本路径：`$PI_SKILLS_ROOT/decision-assistant/`
基础 URL：`BASE="${SCHOOL_SERVER_URL:-http://school-server:3002}"`
当前用户 studentId 已在系统上下文中给出，直接使用。

---

## 场景一：健康 / 饮食分析（减肥、胖了、吃太油、热量控制）

**触发**：减肥、胖了、饮食、热量、吃太油、控制体重、健康饮食、我最近吃的

**必须执行（第一步，不能跳过）**：
```bash
SCHOOL_SERVER_URL="${SCHOOL_SERVER_URL:-http://school-server:3002}"
python3 $PI_SKILLS_ROOT/decision-assistant/analyze-diet.py <studentId>
```

脚本输出分析结果后，**完整呈现给用户**，然后：
1. 结合今日菜单推荐低热量选项：
   ```bash
   curl -sS "${BASE}/api/cafeteria/menu/today" | python3 -c "
   import json,sys
   d=json.load(sys.stdin)
   items=[(x['name'],x['calories'],x['cafeteria_name']) for x in d.get('data',[]) if x['calories']<300 and x['available']]
   items.sort(key=lambda x:x[1])
   print('今日低热量推荐（<300kcal）：')
   for name,cal,cf in items[:5]:
       print(f'  — {name}（{cal}kcal，{cf}）')
   "
   ```
2. 结尾询问：**"是否需要我帮你制定每日早起锻炼提醒？"**（若用户同意，使用 cron-tools 创建周期提醒）

**输出结构**：
```
【近XX天饮食分析】
（analyze-diet.py 的完整输出）

今日低热量菜单推荐：
— [来自今日菜单的3-5个低卡选项]

要减重，饮食控制是第一步。以上分析显示您近期重油重肉类占比偏高。
是否需要我同时帮您制定每日锻炼提醒计划？
```

---

## 场景二：就医时间安排（不想耽误课、什么时候去、身体不舒服）

**触发**：去医院、看病、身体不舒服、去校医院、挂号、什么时候去、不想耽误课

**识别科室**：胃/肚子/消化→内科；牙→口腔科；眼耳鼻喉→眼耳鼻喉科；外伤→外科

**必须执行（第一步，不能跳过）**：
```bash
SCHOOL_SERVER_URL="${SCHOOL_SERVER_URL:-http://school-server:3002}"
python3 $PI_SKILLS_ROOT/decision-assistant/schedule-check.py <studentId> <科室名>
```
例如：胃不舒服 → `python3 ... schedule-check.py S20253082026 内科`

**完整呈现脚本输出**，然后补充：
- 若 notes 里有医生信息，再次强调推荐时间段和医生姓名
- 提醒"提前在校医院App挂号"

---

## 场景三：会议室 / 教室预约

**触发**：预约会议室、预订教室、订场地、找地方讨论、信电楼会议室、研讨室

**Step 1：调用查询脚本**
```bash
SCHOOL_SERVER_URL="${SCHOOL_SERVER_URL:-http://school-server:3002}"
# 参数：<楼栋关键词> <最少人数> <日期YYYY-MM-DD> <开始时间> <结束时间>
python3 $PI_SKILLS_ROOT/decision-assistant/find-rooms.py "信息与电气工程学院" 5 2026-04-25 19:00 21:00
```
- "信电楼" → 楼栋关键词用 `信息与电气工程学院`
- "下午7点后" → start_time=`19:00`
- 若未指定日期，用本周内最近的工作日

**Step 2：复述结果，询问确认**
列出可用会议室后：
```
以上 X 间会议室均满足您的需求，是否需要我帮您预约？
请告知选择哪间（如"561会议室"）以及具体时段。
```

**Step 3：用户确认后立即预约**
```bash
curl -sS -X POST "${BASE}/api/rooms/reserve" \
  -H "Content-Type: application/json" \
  -d '{
    "student_id": "<studentId>",
    "room_id": "<roomId>",
    "date": "YYYY-MM-DD",
    "start_time": "19:00",
    "end_time": "21:00",
    "purpose": "小组讨论"
  }'
```
原文转述 API 返回的 `message` 字段。

---

## 场景四：锻炼 / 运动计划

**触发**：锻炼计划、运动提醒、每天跑步、健身、早起、每天锻炼、规律运动

1. 确认目标时间（如"每天早上7点"）
2. 查课程表确认提醒时间不冲突：
   ```bash
   curl -sS "${BASE}/api/students/<studentId>/courses"
   ```
3. 使用 cron-tools 创建周期提醒（如工作日每天早7点：`0 7 * * 1-5`）
4. 告知提醒规则和如何取消

---

## 场景五：综合时间规划

**触发**：帮我安排、这周怎么安排、什么时候合适、我的空闲时间

```bash
curl -sS "${BASE}/api/students/<studentId>/courses"
```
解析课程表，整理本周空闲时段，结合用户需求给出规划建议。

---

## 通用规则

- **必须先运行脚本/API**，不允许凭经验直接回答
- 多个建议时只推荐 2-3 个最优方案，附理由
- 写操作（预约、设置提醒）前先复述关键信息请用户确认
- 数字计算脚本已处理，不要在回复中重复计算原始数据
