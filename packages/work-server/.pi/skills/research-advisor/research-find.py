#!/usr/bin/env python3
"""
Find CIEE faculty matching a research direction.
Usage: python3 research-find.py <keyword1> [keyword2] [keyword3]
Searches AI/CS/DataSci/EE departments, filters by research direction keywords.
"""
import json, sys, os, re, subprocess

SCRIPT = os.path.join(os.path.dirname(__file__), "..", "ciee-faculty-scraper", "main.py")
KEYWORDS = sys.argv[1:] if len(sys.argv) > 1 else []

if not KEYWORDS:
    print("用法: python3 research-find.py <关键词1> [关键词2] ...")
    sys.exit(1)

# Core tech departments to search
DEPTS = ["col50404", "col50403", "col50405", "col50402"]

# Fields that should NOT contain keywords (to avoid false matches like "中国农业大学")
SKIP_FIELDS = ["毕业院校", "通讯地址", "部门", "办公地址", "学位"]

def extract_research_area(bio: str) -> str:
    """Extract the research direction field only (stops at next field)."""
    if not bio:
        return ""
    # Pattern: 主要研究方向：\nVALUE (possibly multiline until next field ending with ：)
    m = re.search(r'主要研究方向[：:]\s*\n(.*?)(?=\n\S+[：:]|\Z)', bio, re.DOTALL)
    if m:
        val = m.group(1).strip().replace('\n', '、')
        # Stop at first occurrence of a skip field
        for sf in SKIP_FIELDS:
            if sf in val:
                val = val[:val.index(sf)].strip('、 ')
        return val[:100]
    return ""

def extract_email(bio: str) -> str:
    if not bio:
        return ""
    # Email after 电子邮箱：\n line
    m = re.search(r'电子邮箱[：:]\s*\n\s*(\S+@\S+)', bio)
    if m:
        return m.group(1)
    m = re.search(r'([\w.+-]+@cau\.edu\.cn)', bio)
    return m.group(1) if m else ""

def extract_intro(bio: str) -> str:
    """Get 1-2 sentence personal intro."""
    if not bio:
        return ""
    m = re.search(r'个人简介\n(.*?)(?:\n近五年|\nNews|\n\[|\Z)', bio, re.DOTALL)
    if m:
        intro = m.group(1).strip()
        # Return first 120 chars
        return intro[:120].rstrip('，。；,. ')
    return ""

def matches_research(teacher: dict, keywords: list) -> bool:
    """Match only against research area and personal intro, not full bio."""
    bio = teacher.get("bio") or ""
    research = extract_research_area(bio).lower()
    intro = extract_intro(bio).lower()
    # Only search in research area + intro to avoid false matches
    text = research + " " + intro
    return any(kw.lower() in text for kw in keywords)

def get_teachers(dept: str, offset: int = 0, limit: int = 10):
    result = subprocess.run(
        ["python3", SCRIPT, "--dept", dept, "--limit", str(limit),
         "--offset", str(offset), "--pretty"],
        capture_output=True, text=True, timeout=60
    )
    if result.returncode != 0:
        return None
    try:
        return json.loads(result.stdout)
    except Exception:
        return None

# Collect matching teachers
found = []
seen_names = set()

for dept in DEPTS:
    offset = 0
    while True:
        data = get_teachers(dept, offset, 10)
        if not data or not data.get("success"):
            break
        for t in data.get("members", []):
            if t["name"] not in seen_names and matches_research(t, KEYWORDS):
                seen_names.add(t["name"])
                bio = t.get("bio") or ""
                t["_research"] = extract_research_area(bio) or "(详见个人主页)"
                t["_email"] = extract_email(bio)
                t["_intro"] = extract_intro(bio)
                found.append(t)
        if not data.get("has_more"):
            break
        offset = data.get("next_offset", offset + 10)
        if offset >= 60:
            break

if not found:
    print(f"在信电学院核心系所未找到研究方向涉及「{'、'.join(KEYWORDS)}」的教师")
    print("建议：尝试更宽泛的关键词，如「智能」「感知」「图像」「控制」等")
    sys.exit(0)

print(f"信电学院中与「{'、'.join(KEYWORDS)}」相关的教师（共{len(found)}位）：")
print()
for t in found[:6]:
    print(f"— {t['name']} {t['rank']}（{t['department']}）")
    print(f"  研究方向：{t['_research']}")
    if t["_intro"]:
        print(f"  简介：{t['_intro']}...")
    if t["_email"]:
        print(f"  邮箱：{t['_email']}")
    if t.get("profile_url") and not t["profile_url"].startswith("#"):
        print(f"  主页：{t['profile_url']}")
    print()

if len(found) > 6:
    print(f"（另有 {len(found)-6} 位，如需查看请告知）")
