#!/usr/bin/env python3
"""
Fetch open grant projects / research calls from school server.
Usage: python3 fetch-projects.py [--category=国家级基金]
"""
import json, sys, os
from urllib.request import urlopen
from urllib.error import URLError
from urllib.parse import urlencode
from datetime import datetime

category_filter = ""
for arg in sys.argv[1:]:
    if arg.startswith("--category="): category_filter = arg[11:]

base = os.environ.get("SCHOOL_SERVER_URL", "http://school-server:3002")

def fetch(url):
    with urlopen(url) as r:
        return json.loads(r.read())

try:
    params = {"status": "open"}
    if category_filter: params["category"] = category_filter
    qs = "?" + urlencode(params)
    resp = fetch(f"{base}/api/projects/open{qs}")
except URLError as e:
    print(f"API调用失败: {e}")
    sys.exit(1)

projects = resp.get("data", [])
now_str  = datetime.now().strftime("%Y-%m-%d")

if not projects:
    print("当前无开放课题/项目申报信息" + (f"（类别：{category_filter}）" if category_filter else ""))
    sys.exit(0)

filter_note = f"（类别筛选：{category_filter}）" if category_filter else ""
print(f"【当前开放课题/项目申报{filter_note}】")
print(f"共 {len(projects)} 项（查询日期：{now_str}）")
print()

for i, p in enumerate(projects, 1):
    # 计算剩余天数
    try:
        dl   = datetime.strptime(p["deadline"], "%Y-%m-%d")
        now  = datetime.strptime(now_str, "%Y-%m-%d")
        days = (dl - now).days
        days_str = f"（还有 {days} 天）" if days > 0 else "（已截止）"
    except Exception:
        days_str = ""

    print(f"{'='*50}")
    print(f"【{i}】{p['title']}")
    print(f"   来源：{p['source']}   类别：{p['category']}")
    print(f"   截止日期：{p['deadline']} {days_str}   资助规模：{p.get('amount', '待定')}")
    print()
    if p.get("description"):
        print(f"   项目说明：")
        for line in p["description"].split("。"):
            line = line.strip()
            if line:
                print(f"   {line}。")
    print()
    if p.get("requirements"):
        print(f"   申报要求：{p['requirements']}")
    if p.get("contact"):
        print(f"   联系方式：{p['contact']}")
    print()

print("提示：如需了解某项目详情或帮助准备申报材料，请告诉我项目编号。")
