#!/usr/bin/env python3
"""
Find potential collaborators with overlapping research interests.
Usage: python3 find-collaborator.py <keyword> [excludeTeacherId]
Example: python3 find-collaborator.py 机器视觉 T009
"""
import json, sys, os
from urllib.request import urlopen
from urllib.error import URLError

keyword      = sys.argv[1] if len(sys.argv) > 1 else ""
exclude_id   = sys.argv[2] if len(sys.argv) > 2 else ""

if not keyword:
    print("用法: python3 find-collaborator.py <关键词> [排除ID]")
    sys.exit(1)

base = os.environ.get("SCHOOL_SERVER_URL", "http://school-server:3002")

def fetch(url):
    with urlopen(url) as r:
        return json.loads(r.read())

# ── 1. 学校内部教师 ──────────────────────────────────────────────────────────
internal_matches = []
try:
    resp     = fetch(f"{base}/api/teachers")
    teachers = resp.get("data", [])
    for t in teachers:
        if t["id"] == exclude_id:
            continue
        areas = (t.get("research_areas") or "")
        dept  = t.get("department", "")
        # Match by research_areas or department, support multi-keyword (split by comma/space)
        search_text = areas + " " + dept
        # Try individual sub-keywords if main keyword doesn't match
        sub_kws = [keyword] + keyword.split(",") + keyword.split("、")
        for kw in sub_kws:
            kw = kw.strip()
            if kw and kw in search_text:
                internal_matches.append(t)
                break
except URLError as e:
    print(f"⚠ 无法连接学校服务器: {e}")

# ── 2. 信电学院官网抓取数据（如有缓存）────────────────────────────────────────
ciee_matches = []
skills_root  = os.environ.get("PI_SKILLS_ROOT", os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ciee_json    = os.path.join(skills_root, "ciee-faculty-scraper", "computer_faculty.json")
if os.path.exists(ciee_json):
    try:
        with open(ciee_json, "r", encoding="utf-8") as f:
            raw = json.load(f)
        # Support both list and {"members": [...]} formats
        faculty_list = raw if isinstance(raw, list) else raw.get("members", [])
        sub_kws = [keyword] + keyword.replace("，",",").replace("、",",").split(",")
        for person in faculty_list:
            name  = person.get("name", "")
            areas = (person.get("research_areas") or person.get("bio") or "")
            if not areas:
                continue
            for kw in sub_kws:
                kw = kw.strip()
                if kw and kw in areas:
                    ciee_matches.append(person)
                    break
    except Exception:
        pass

print(f"【潜在合作者搜索：\"{keyword}\"】")
print()

if internal_matches:
    print(f"▌校内数据库匹配（{len(internal_matches)} 位）")
    for t in internal_matches:
        areas_str = f"  研究方向：{t['research_areas']}" if t.get("research_areas") else ""
        office_str = f"  办公室：{t['office']}" if t.get("office") else ""
        print(f"  {t['name']} {t['title']}  — {t['department']}")
        if areas_str: print(areas_str)
        if office_str: print(office_str)
        print(f"  邮箱：{t.get('email', '—')}")
        print()
else:
    print("▌校内数据库：未找到直接匹配")
    print()

if ciee_matches:
    print(f"▌信电学院官网匹配（{len(ciee_matches)} 位）")
    for p in ciee_matches[:5]:
        name      = p.get("name", "未知")
        rank      = p.get("rank") or p.get("title") or ""
        dept      = p.get("department", "信息与电气工程学院")
        areas_str = (p.get("research_areas") or p.get("bio") or "").replace("；","/").replace(";","/")
        email_str = p.get("email") or "（见官网）"
        url_str   = p.get("profile_url") or p.get("url") or ""
        print(f"  {name} {rank}  — {dept}")
        if areas_str: print(f"  研究方向：{areas_str[:80]}")
        print(f"  邮箱：{email_str}")
        if url_str:   print(f"  主页：{url_str}")
        print()
elif os.path.exists(ciee_json):
    print("▌信电学院官网：未找到含该关键词的教师")
else:
    print("▌信电学院官网缓存不存在，如需更新请运行 ciee-faculty-scraper")

print()
print("如需进一步了解某位教师的详细信息，可告诉我姓名。")
print("导出合作建议报告请使用：python3 export-summary.py T009 --type=collab")
