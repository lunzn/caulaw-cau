#!/usr/bin/env python3
"""
Cross-reference student's course schedule with clinic schedules to suggest visit times.
Usage: python3 schedule-check.py <studentId> [department]
Example: python3 schedule-check.py S20253082026 内科
"""
import json, sys, os, re
from datetime import datetime, timedelta
from urllib.request import urlopen
from urllib.error import URLError

def fetch(url):
    with urlopen(url) as r:
        return json.loads(r.read())

student_id = sys.argv[1] if len(sys.argv) > 1 else ""
dept_filter = sys.argv[2] if len(sys.argv) > 2 else ""

if not student_id:
    print("用法: python3 schedule-check.py <studentId> [科室]")
    sys.exit(1)

base = os.environ.get("SCHOOL_SERVER_URL", "http://school-server:3002")

try:
    student_resp  = fetch(f"{base}/api/students/{student_id}")
    courses_resp  = fetch(f"{base}/api/students/{student_id}/courses")
    clinic_resp   = fetch(f"{base}/api/clinic/schedule")
except URLError as e:
    print(f"API调用失败: {e}")
    sys.exit(1)

# 学生所在校区，用于筛选对应校医院（东/西校区）
student_campus = (student_resp.get("data") or {}).get("campus", "东校区")

# Parse course schedule: build busy slots per weekday
busy = {"周一": [], "周二": [], "周三": [], "周四": [], "周五": []}
for c in courses_resp.get("data", []):
    for seg in c["schedule"].split("  "):
        seg = seg.strip()
        for day in busy:
            if seg.startswith(day):
                time_slot = seg[len(day):].strip()
                busy[day].append(time_slot)
                break

# Determine free slots (morning 8-12, afternoon 13:30-17)
MORNING   = ("08:00", "11:30")
AFTERNOON = ("13:30", "17:00")

def is_busy(slots, start, end):
    """Check if any course overlaps with start-end window."""
    def to_min(t):
        h, m = t.split(":")
        return int(h)*60 + int(m)
    s, e = to_min(start), to_min(end)
    for slot in slots:
        parts = slot.split("-")
        if len(parts) == 2:
            cs = to_min(parts[0].strip())
            ce = to_min(parts[1].strip())
            if not (ce <= s or cs >= e):
                return True
    return False

# Clinic schedule: 按学生校区过滤，再按科室过滤
clinics = [c for c in clinic_resp.get("data", [])
           if c["day_type"] in ("weekday", "always")
           and c.get("campus", "东校区") == student_campus
           and (not dept_filter or dept_filter in c["department"])]

if not clinics:
    print(f"未找到科室：{dept_filter or '（请指定科室）'}")
    sys.exit(0)

# Determine which weekdays are still available (today or future, within next 7 days)
now = datetime.now()
today_weekday = now.weekday()  # 0=Monday ... 4=Friday
current_hour_min = now.hour * 60 + now.minute

# Build ordered list of (day_name, days_from_now, date_str)
weekday_names = ["周一", "周二", "周三", "周四", "周五"]
upcoming_days = []
for offset in range(7):
    d = now + timedelta(days=offset)
    wd = d.weekday()
    if wd < 5:  # weekday only
        upcoming_days.append((weekday_names[wd], offset, d.strftime("%m月%d日")))

# Find free weekdays with clinic open
suggestions = []
weekdays = ["周一", "周二", "周三", "周四", "周五"]

for day, offset, date_label in upcoming_days:
    slots = busy.get(day, [])
    # For today: skip periods that have already passed (morning ends 12:00=720min, afternoon ends 17:00=1020min)
    morning_time_ok   = offset > 0 or current_hour_min < 720
    afternoon_time_ok = offset > 0 or current_hour_min < 1020

    morning_free   = morning_time_ok   and not is_busy(slots, "08:00", "12:00")
    afternoon_free = afternoon_time_ok and not is_busy(slots, "13:30", "17:00")

    for clinic in clinics:
        clinic_start = clinic["start_time"]
        clinic_end   = clinic["end_time"]
        if clinic_start in ("停诊", "00:00"):
            continue
        notes = clinic.get("notes") or ""

        # clinic is open in morning if its schedule overlaps with 08:00-12:00 window
        if morning_free and is_busy([f"{clinic_start}-{clinic_end}"], "08:00", "11:30"):
            doctor = ""
            if "上午" in notes:
                m = re.search(r'上午\s*([^\s，,。；;]+大夫)', notes)
                if m: doctor = m.group(1)
            if not doctor:  # 兜底：提取第一个出现的大夫名
                m = re.search(r'([^\s，,。；:：]+大夫)', notes)
                if m: doctor = m.group(1)
            suggestions.append({
                "day": day,
                "date_label": date_label,
                "offset": offset,
                "period": f"上午 {clinic_start}-11:30",
                "dept": clinic["department"],
                "doctor": doctor,
                "location": clinic["location"],
                "notes": notes,
            })

        # clinic open afternoon: either official schedule overlaps, OR notes mention 下午
        clinic_covers_afternoon = is_busy([f"{clinic_start}-{clinic_end}"], "13:30", "17:00") or "下午" in notes
        clinic_notes_afternoon  = True  # 所有科室下午13:30-17:00均出诊
        if afternoon_free and (clinic_covers_afternoon or clinic_notes_afternoon):
            doctor = ""
            if "下午" in notes:
                m = re.search(r'下午[（(][^）)]*[）)]\s*([^\s，,。；;]+大夫)', notes)
                if not m:
                    m = re.search(r'下午\s*.*?([^\s，,。；;]+大夫)', notes)
                if m: doctor = m.group(1)
            if not doctor:  # 兜底
                m = re.search(r'([^\s，,。；:：]+大夫)', notes)
                if m: doctor = m.group(1)
            suggestions.append({
                "day": day,
                "date_label": date_label,
                "offset": offset,
                "period": "下午 13:30-17:00",
                "dept": clinic["department"],
                "doctor": doctor,
                "location": clinic["location"],
                "notes": notes,
            })

# Deduplicate and sort by soonest date, then morning before afternoon
seen = set()
unique = []
for s in sorted(suggestions, key=lambda x: (x["offset"], 0 if "上午" in x["period"] else 1)):
    key = (s["day"], s["period"][:2], s["dept"])
    if key not in seen:
        seen.add(key)
        unique.append(s)

dept_label   = dept_filter or clinics[0]["department"]
campus_label = "东区校医院" if student_campus == "东校区" else "西区校医院"
emg_phone    = "62736761" if student_campus == "东校区" else "62732549"
print(f"根据您的课程安排，近期可去{campus_label}（{dept_label}）的时段：")
print(f"门诊时间：上午 8:00-11:30 / 下午 13:30-17:00  急诊24小时：{emg_phone}")
print(f"（当前时间：{now.strftime('%m月%d日 %H:%M')}，已过时段自动排除）")
print()

for i, s in enumerate(unique[:4], 1):
    doctor_str = f"，出诊医生：{s['doctor']}" if s['doctor'] else ""
    day_tag = "今天" if s["offset"] == 0 else ("明天" if s["offset"] == 1 else s["date_label"])
    print(f"建议{i}：{s['day']}（{day_tag}） {s['period']}")
    print(f"  科室：{s['dept']}{doctor_str}")
    print(f"  地点：{s['location']}")
    print()

if not unique:
    print("近期工作日课程与出诊时间均有冲突，建议周末前往")
    for c in clinics[:1]:
        wkend = next((x for x in clinic_resp["data"]
                      if x["department"]==c["department"] and x["day_type"]=="weekend"), None)
        if wkend:
            print(f"周末：{c['department']} {wkend['start_time']}-{wkend['end_time']} {wkend.get('notes','')}")

print("建议提前在校医院App或微信公众号完成挂号，避免现场等待。")
