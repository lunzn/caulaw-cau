#!/usr/bin/env python3
"""
Diet analysis tool: fetches cafeteria transactions for a student and outputs
a formatted summary highlighting high-fat/high-calorie eating patterns.
Usage: python3 analyze-diet.py <studentId>
"""
import json, sys, os
from urllib.request import urlopen
from urllib.error import URLError
from collections import Counter
import datetime

student_id = sys.argv[1] if len(sys.argv) > 1 else ""
if not student_id:
    print("用法: python3 analyze-diet.py <studentId>")
    sys.exit(1)

base = os.environ.get("SCHOOL_SERVER_URL", "http://school-server:3002")

try:
    with urlopen(f"{base}/api/cafeteria/transactions/{student_id}?limit=93") as r:
        resp = json.loads(r.read())
except URLError as e:
    print(f"API调用失败: {e}")
    sys.exit(1)

if not resp.get("success"):
    print(f"API错误: {resp}")
    sys.exit(1)

txs = resp["data"]
if not txs:
    print("近30天无消费记录")
    sys.exit(0)

# Group by calendar day
days = {}
for tx in txs:
    ts = tx["transaction_time"]
    day = datetime.datetime.fromtimestamp(ts).strftime("%Y-%m-%d")
    if day not in days:
        days[day] = {"calories": 0, "items": []}
    days[day]["calories"] += tx["calories"]
    days[day]["items"].append(tx["item_name"])

total_days = len(days)
total_cals = sum(d["calories"] for d in days.values())
avg_daily = total_cals / max(total_days, 1)
ref_cal = 2000  # kcal/day reference for moderately active young adult
excess = max(0, avg_daily - ref_cal)

# High-fat items (>=500 kcal per transaction)
high_fat_txs = [tx for tx in txs if tx["calories"] >= 500]
high_fat_names = Counter(tx["item_name"] for tx in high_fat_txs)

# Oil/meat category keywords
heavy_keywords = ["红烧肉", "排骨", "油条", "煎饼果子", "糖醋里脊", "鱼香肉丝", "宫保鸡丁", "花卷+红烧"]
heavy_txs = [tx for tx in txs if any(k in tx["item_name"] for k in heavy_keywords)]
heavy_names = Counter(tx["item_name"] for tx in heavy_txs)

# Days with 3 meals
three_meal_days = sum(1 for d in days.values() if len(d["items"]) >= 3)

print(f"【近{total_days}天智慧食堂消费分析】")
print(f"智慧食堂记录：{len(txs)} 次消费（部分餐次可能在非智慧食堂就餐，未被记录）")
print(f"有记录的天数：{total_days} 天，平均每天 {len(txs)/total_days:.1f} 餐")
print(f"三餐齐全天数：{three_meal_days} 天（共{total_days}个有记录的日期）")
print()
print(f"智慧食堂餐均热量：约 {avg_daily:.0f} kcal/天（仅计已记录餐次）")
if avg_daily > 2200:
    print(f"⚠ 热量摄入超出推荐范围（参考值 2000-2200 kcal），每日约超出 {avg_daily-2000:.0f} kcal")
elif avg_daily > 2000:
    print("⚠ 热量摄入接近推荐范围上限（2000-2200 kcal/天），注意控制")
elif avg_daily > 1400:
    print("热量摄入在合理范围内，但需关注饮食结构（重油重肉频次偏高）")
else:
    print("记录热量偏低，实际摄入需结合全部餐次评估；但已记录餐次中重油重肉占比较高")

print()
print(f"高热量餐食（≥500 kcal/次）：共 {len(high_fat_txs)} 次，占总消费 {len(high_fat_txs)*100//len(txs)}%")
if high_fat_names:
    print("出现最频繁的高热量项目：")
    for name, cnt in high_fat_names.most_common(5):
        print(f"  — {name}：{cnt} 次")

print()
if heavy_txs:
    print(f"重油重肉类食物：共 {len(heavy_txs)} 次（含：{', '.join(set(tx['item_name'] for tx in heavy_txs[:3]))}等）")
    print(f"占总消费 {len(heavy_txs)*100//len(txs)}%，建议减少此类食物频率")

print()
print("【改善建议】")
print("— 早餐改选：馒头+鸡蛋+豆浆（约360 kcal），替代油条/煎饼果子套餐")
print("— 午餐改选：米饭+番茄炒蛋+蒜蓉菠菜（约410 kcal），替代红烧肉/排骨套餐")
print("— 晚餐改选：米饭+清炒白菜+麻婆豆腐（约380 kcal），减少大荤频率")
print("— 控制饮食同时，配合规律运动效果更佳")
