#!/usr/bin/env python3
"""
Fetch and summarize teacher papers from school server.
Usage: python3 fetch-papers.py <teacherId> [--region=港澳] [--year=2024] [--recent=5] [--top=10]
  --recent=N   查询最近 N 年的论文（例如 --recent=5 表示2021-2025年）
"""
import json, sys, os
from datetime import datetime
from urllib.request import urlopen
from urllib.error import URLError
from urllib.parse import urlencode
from collections import Counter

teacher_id = sys.argv[1] if len(sys.argv) > 1 else ""
if not teacher_id:
    print("用法: python3 fetch-papers.py <teacherId> [--region=港澳] [--year=2024] [--recent=5] [--top=10]")
    sys.exit(1)

region_filter = ""
year_filter = 0
recent_n = 0
top_n = 10
for arg in sys.argv[2:]:
    if arg.startswith("--region="):
        region_filter = arg[9:]
    elif arg.startswith("--year="):
        year_filter = int(arg[7:])
    elif arg.startswith("--recent="):
        recent_n = int(arg[9:])
    elif arg.startswith("--top="):
        top_n = int(arg[6:])

# Compute year_from from --recent=N
year_from = 0
if recent_n:
    year_from = datetime.now().year - recent_n + 1

base = os.environ.get("SCHOOL_SERVER_URL", "http://school-server:3002")

def fetch(url):
    with urlopen(url) as r:
        return json.loads(r.read())

try:
    params = {}
    if region_filter: params["region"]     = region_filter
    if year_filter:   params["year"]       = str(year_filter)
    if year_from:     params["year_from"]  = str(year_from)
    qs = "?" + urlencode(params) if params else ""
    resp         = fetch(f"{base}/api/teachers/{teacher_id}/papers{qs}")
    teacher_resp = fetch(f"{base}/api/teachers/{teacher_id}")
except URLError as e:
    print(f"API调用失败: {e}")
    sys.exit(1)

papers  = resp.get("data", [])
teacher = teacher_resp.get("data", {})

if not papers:
    cond = region_filter or str(year_filter) if year_filter else (f"近{recent_n}年" if year_from else "")
    print("暂无论文记录" + (f"（{cond}）" if cond else ""))
    sys.exit(0)

total          = len(papers)
years          = Counter(p["year"] for p in papers)
regions        = Counter(p["region"].split("（")[0] for p in papers)
total_citations = sum(p["citation_count"] for p in papers)
avg_citations  = total_citations / max(total, 1)

name     = teacher.get("name", teacher_id)
dept     = teacher.get("department", "")
title_s  = teacher.get("title", "")

filter_note = ""
if region_filter or year_filter or year_from:
    parts = []
    if region_filter: parts.append(f"地区含「{region_filter}」")
    if year_filter:   parts.append(f"{year_filter}年")
    if year_from:     parts.append(f"近{recent_n}年（{year_from}-{datetime.now().year}）")
    filter_note = f"（筛选条件：{', '.join(parts)}）"

print(f"【{name} {title_s} 论文检索报告{filter_note}】")
print(f"院系：{dept}")
print(f"论文总数：{total} 篇  总被引：{total_citations} 次  均被引：{avg_citations:.1f} 次")
print()

print("▌年份分布")
for y in sorted(years.keys(), reverse=True):
    bar = "█" * min(years[y], 12)
    print(f"  {y}年: {years[y]:2d}篇  {bar}")
print()

print("▌发表地区分布")
for reg, cnt in regions.most_common():
    print(f"  {reg}: {cnt}篇")
print()

top_papers = sorted(papers, key=lambda p: p["citation_count"], reverse=True)[:top_n]
print(f"▌被引最高 Top {top_n}")
for i, p in enumerate(top_papers, 1):
    kw_str = f"  [{p['keywords']}]" if p.get("keywords") else ""
    reg_str = f"  ({p['region']})" if "港澳" in p.get("region", "") or "国际" in p.get("region", "") else ""
    print(f"{i:2d}. {p['title']}")
    print(f"    {p['journal']}，{p['year']}年，被引 {p['citation_count']} 次{reg_str}")
    if p.get("keywords"):
        print(f"    关键词：{p['keywords']}")
    print()

if not (region_filter or year_filter or year_from) and total > top_n:
    recent_list = sorted(papers, key=lambda p: p["year"], reverse=True)[:5]
    print("▌最新发表（近期5篇）")
    for p in recent_list:
        print(f"  — {p['title']}（{p['journal']}，{p['year']}年）")
    print()
