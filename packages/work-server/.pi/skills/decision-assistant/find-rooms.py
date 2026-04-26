#!/usr/bin/env python3
"""
Find available meeting rooms/classrooms matching filters.
Usage: python3 find-rooms.py <building_keyword> <min_capacity> <date> <start_time> <end_time>
Example: python3 find-rooms.py 信电 5 2026-04-25 19:00 21:00
"""
import json, sys, os
from urllib.request import urlopen
from urllib.error import URLError

def fetch(url):
    with urlopen(url) as r:
        return json.loads(r.read())

building_kw = sys.argv[1] if len(sys.argv) > 1 else ""
min_cap = int(sys.argv[2]) if len(sys.argv) > 2 else 1
date = sys.argv[3] if len(sys.argv) > 3 else ""
start_t = sys.argv[4] if len(sys.argv) > 4 else "00:00"
end_t = sys.argv[5] if len(sys.argv) > 5 else "23:59"

base = os.environ.get("SCHOOL_SERVER_URL", "http://school-server:3002")

try:
    rooms_resp = fetch(f"{base}/api/rooms?type=meeting_room")
except URLError as e:
    print(f"API调用失败: {e}"); sys.exit(1)

rooms = rooms_resp.get("data", [])

# Filter by building/address and capacity
def matches_building(r, kw):
    if not kw: return True
    return kw in r.get("building", "") or kw in r.get("address", "")

candidates = [r for r in rooms
              if matches_building(r, building_kw)
              and r.get("capacity", 0) >= min_cap]

if not candidates:
    print(f"未找到满足条件的会议室（楼栋/地址含'{building_kw}'，容量>={min_cap}人）")
    sys.exit(0)

available = []
if date:
    for room in candidates:
        try:
            res_resp = fetch(f"{base}/api/rooms/{room['id']}/reservations?date={date}")
            existing = res_resp.get("data", [])
            # Check if any confirmed reservation overlaps
            conflict = False
            for res in existing:
                if res.get("status") != "confirmed":
                    continue
                # Overlap: not (res_end <= start OR res_start >= end)
                res_s, res_e = res["start_time"], res["end_time"]
                if not (res_e <= start_t or res_s >= end_t):
                    conflict = True
                    break
            if not conflict:
                available.append(room)
        except Exception:
            available.append(room)  # assume available on error
else:
    available = candidates

if not available:
    print(f"{building_kw}楼 {date} {start_t}-{end_t} 该时段所有会议室均已被预约")
    sys.exit(0)

print(f"【可用会议室】{building_kw}楼 {date or '任意日期'} {start_t}-{end_t}，容量≥{min_cap}人")
print()
for r in available:
    print(f"— {r['name']}（{r['building']} {r['floor']}楼，容量{r['capacity']}人）")
    print(f"  地址：{r['address']}")
    print(f"  设施：{r.get('facilities','')}")
    print(f"  房间ID：{r['id']}")
    print()

print(f"共 {len(available)} 间可用，均可满足 {min_cap} 人使用需求")
