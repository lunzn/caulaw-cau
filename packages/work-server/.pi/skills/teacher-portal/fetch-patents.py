#!/usr/bin/env python3
"""
Fetch and summarize teacher patents/IP from school server.
Usage: python3 fetch-patents.py <teacherId> [--type=发明专利|实用新型|软件著作权] [--region=港澳]
"""
import json, sys, os
from urllib.request import urlopen
from urllib.error import URLError
from urllib.parse import urlencode
from collections import Counter

teacher_id = sys.argv[1] if len(sys.argv) > 1 else ""
if not teacher_id:
    print("用法: python3 fetch-patents.py <teacherId> [--type=发明专利] [--region=港澳]")
    sys.exit(1)

type_filter   = ""
region_filter = ""
for arg in sys.argv[2:]:
    if arg.startswith("--type="):   type_filter   = arg[7:]
    if arg.startswith("--region="): region_filter = arg[9:]

base = os.environ.get("SCHOOL_SERVER_URL", "http://school-server:3002")

def fetch(url):
    with urlopen(url) as r:
        return json.loads(r.read())

try:
    params = {}
    if type_filter:   params["type"]   = type_filter
    if region_filter: params["region"] = region_filter
    qs = "?" + urlencode(params) if params else ""
    resp         = fetch(f"{base}/api/teachers/{teacher_id}/patents{qs}")
    teacher_resp = fetch(f"{base}/api/teachers/{teacher_id}")
except URLError as e:
    print(f"API调用失败: {e}")
    sys.exit(1)

patents = resp.get("data", [])
teacher = teacher_resp.get("data", {})
name    = teacher.get("name", teacher_id)
title_s = teacher.get("title", "")

if not patents:
    print("暂无知识产权记录")
    sys.exit(0)

types   = Counter(p["type"] for p in patents)
regions = Counter(p["region"].split("（")[0] for p in patents)
years   = Counter(p["year"] for p in patents)

filter_note = ""
if type_filter or region_filter:
    parts = []
    if type_filter:   parts.append(type_filter)
    if region_filter: parts.append(f"地区含「{region_filter}」")
    filter_note = f"（筛选：{', '.join(parts)}）"

print(f"【{name} {title_s} 知识产权报告{filter_note}】")
print(f"共 {len(patents)} 项")
print()

print("▌按类型")
for t, cnt in types.most_common():
    print(f"  {t}: {cnt} 项")
print()

print("▌按地区")
for reg, cnt in regions.most_common():
    print(f"  {reg}: {cnt} 项")
print()

# Group by type for listing
grouped: dict[str, list] = {}
for p in patents:
    t = p["type"]
    grouped.setdefault(t, []).append(p)

type_order = ["发明专利", "实用新型", "软件著作权"]
for t in type_order:
    items = grouped.get(t, [])
    if not items:
        continue
    items_sorted = sorted(items, key=lambda x: x["year"], reverse=True)
    print(f"▌{t}（{len(items)} 项）")
    for i, p in enumerate(items_sorted, 1):
        cert_str = f"  证书号：{p['cert_number']}" if p.get("cert_number") else ""
        reg_str  = f"  [{p['region']}]" if "港澳" in p.get("region", "") else ""
        print(f"  {i:2d}. {p['title']}（{p['year']}年）{cert_str}{reg_str}")
    print()
