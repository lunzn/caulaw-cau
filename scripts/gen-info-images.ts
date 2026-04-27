/**
 * 生成 CAU-CLAW 信息卡片图片（一次性运行，输出静态 PNG 文件）
 * bun run scripts/gen-info-images.ts
 */
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const ASSETS_DIR = resolve(ROOT, "packages/work-server/assets");
const PUBLIC_DIR = resolve(ROOT, "packages/gateway/public");

mkdirSync(ASSETS_DIR, { recursive: true });

const FONT_FAMILIES = "'Microsoft YaHei', 'SimHei', Arial, sans-serif";

function svgToPng(svgStr: string): Buffer {
  const resvg = new Resvg(svgStr, {
    font: { loadSystemFonts: true },
  });
  return Buffer.from(resvg.render().asPng());
}

function save(buf: Buffer, path: string) {
  writeFileSync(path, buf);
  console.log("✓", path);
}

// ─── Logo ────────────────────────────────────────────────────────────────────
function genLogo() {
  const W = 440, H = 120;
  // Simple wheat icon using rectangles and circles
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="#f0fdf4"/>
  <rect x="0" y="0" width="4" height="${H}" fill="#16a34a"/>

  <!-- Wheat icon: stalk + grains as simple shapes -->
  <rect x="34" y="28" width="3" height="65" fill="#16a34a" rx="1"/>
  <ellipse cx="27" cy="45" rx="5" ry="9" fill="#16a34a"/>
  <ellipse cx="43" cy="52" rx="5" ry="9" fill="#15803d"/>
  <ellipse cx="27" cy="62" rx="5" ry="9" fill="#16a34a"/>
  <ellipse cx="43" cy="69" rx="5" ry="9" fill="#15803d"/>
  <ellipse cx="35" cy="33" rx="4" ry="7" fill="#166534"/>

  <rect x="62" y="22" width="2" height="76" fill="#bbf7d0"/>

  <!-- CAU text -->
  <text x="78" y="76" font-family="${FONT_FAMILIES}" font-size="46" font-weight="bold" fill="#16a34a">CAU</text>
  <text x="210" y="76" font-family="${FONT_FAMILIES}" font-size="46" font-weight="bold" fill="#6b7280">-CLAW</text>
  <text x="78" y="102" font-family="${FONT_FAMILIES}" font-size="15" fill="#6b7280">中国农业大学一站式智能助手平台</text>
</svg>`;
  save(svgToPng(svg), resolve(PUBLIC_DIR, "logo.png"));
}

// ─── Header helper ────────────────────────────────────────────────────────────
function header(title: string, _emoji: string, color: string, W: number) {
  return `
  <rect width="${W}" height="58" fill="${color}"/>
  <rect x="0" y="58" width="${W}" height="1" fill="#e2e8f0"/>
  <text x="20" y="38" font-family="${FONT_FAMILIES}" font-size="24" font-weight="bold" fill="white">${title}</text>`;
}

// ─── 食堂时间 ────────────────────────────────────────────────────────────────
function genCafeteria() {
  const W = 620, H = 430;
  const color = "#0891b2";

  const rows: string[] = [];
  let y = 78;

  const addSection = (title: string, tag: string, tagColor: string, items: string[][], hours: string[][]) => {
    rows.push(`<rect x="18" y="${y}" width="4" height="22" fill="${tagColor}" rx="2"/>`);
    rows.push(`<text x="30" y="${y + 16}" font-family="${FONT_FAMILIES}" font-size="17" font-weight="bold" fill="#0f172a">${title}</text>`);
    y += 30;

    for (const [name, loc] of items) {
      rows.push(`<text x="30" y="${y}" font-family="${FONT_FAMILIES}" font-size="15" font-weight="bold" fill="#1e293b">${name}</text>`);
      rows.push(`<text x="${30 + name.length * 15 + 4}" y="${y}" font-family="${FONT_FAMILIES}" font-size="13" fill="#94a3b8">${loc}</text>`);
      y += 8;
    }

    hours.forEach(([meal, time], i) => {
      if (i % 2 === 0) rows.push(`<rect x="22" y="${y - 4}" width="${W - 44}" height="30" fill="#f8fafc" rx="4"/>`);
      rows.push(`<circle cx="38" cy="${y + 9}" r="4" fill="${tagColor}"/>`);
      rows.push(`<text x="52" y="${y + 14}" font-family="${FONT_FAMILIES}" font-size="15" fill="#334155">${meal}</text>`);
      rows.push(`<text x="180" y="${y + 14}" font-family="${FONT_FAMILIES}" font-size="15" font-weight="bold" fill="#0f172a">${time}</text>`);
      y += 30;
    });
    y += 12;

    rows.push(`<rect x="18" y="${y}" width="${W - 36}" height="1" fill="#e2e8f0"/>`);
    y += 16;
  };

  addSection("东校区食堂", "东校区", color,
    [["公三食堂", "（公寓三区南侧）"], ["公四食堂", "（公寓四区南侧）"]],
    [["早餐", "06:30 – 10:00"], ["午餐", "10:30 – 13:30"], ["晚餐", "16:30 – 19:30"]]);

  addSection("西校区食堂", "西校区", "#059669",
    [["和二食堂", "（和园二区）"]],
    [["早餐", "07:00 – 09:30"], ["午餐", "11:00 – 13:30"], ["晚餐", "17:00 – 19:30"]]);

  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="#f8fafc" rx="0"/>
  ${header("食堂营业时间", "🍽", color, W)}
  ${rows.join("\n  ")}
  <text x="20" y="${H - 14}" font-family="${FONT_FAMILIES}" font-size="13" fill="#94a3b8">※ 节假日营业时间以现场公告为准</text>
</svg>`;
  save(svgToPng(svg), resolve(ASSETS_DIR, "cafeteria-hours.png"));
}

// ─── 校医院时间 ──────────────────────────────────────────────────────────────
function genClinic() {
  const W = 620, H = 400;
  const color = "#dc2626";

  const rows: string[] = [];
  let y = 76;

  const addHospital = (name: string, tag: string, tagColor: string, phone: string,
    hours: [string, string][], depts: string) => {
    rows.push(`<rect x="18" y="${y}" width="4" height="22" fill="${tagColor}" rx="2"/>`);
    rows.push(`<text x="30" y="${y + 16}" font-family="${FONT_FAMILIES}" font-size="17" font-weight="bold" fill="#0f172a">${name}</text>`);
    const nameW = name.length * 17 + 30;
    rows.push(`<rect x="${nameW + 14}" y="${y + 2}" width="80" height="20" fill="${tagColor}22" rx="4"/>`);
    rows.push(`<text x="${nameW + 22}" y="${y + 15}" font-family="${FONT_FAMILIES}" font-size="12" fill="${tagColor}">${tag}</text>`);
    y += 30;

    hours.forEach(([label, time], i) => {
      if (i % 2 === 0) rows.push(`<rect x="22" y="${y - 4}" width="${W - 44}" height="26" fill="#f8fafc" rx="3"/>`);
      rows.push(`<text x="36" y="${y + 13}" font-family="${FONT_FAMILIES}" font-size="15" fill="#64748b">${label}</text>`);
      const tc = time === "24小时" ? "#dc2626" : "#0f172a";
      rows.push(`<text x="190" y="${y + 13}" font-family="${FONT_FAMILIES}" font-size="15" font-weight="bold" fill="${tc}">${time}</text>`);
      y += 26;
    });

    rows.push(`<text x="30" y="${y + 13}" font-family="${FONT_FAMILIES}" font-size="13" fill="#64748b">Tel: ${phone}</text>`);
    y += 26;
    rows.push(`<text x="30" y="${y + 13}" font-family="${FONT_FAMILIES}" font-size="13" fill="#94a3b8">${depts}</text>`);
    y += 26;

    rows.push(`<rect x="18" y="${y}" width="${W - 36}" height="1" fill="#e2e8f0"/>`);
    y += 16;
  };

  addHospital("东区校医院", "东校区", "#dc2626",
    "急诊 62736761  办公 62737568",
    [["上午门诊", "08:00 – 11:30"], ["下午门诊", "13:30 – 17:00"], ["急诊", "24小时"]],
    "内科 · 外科 · 妇科 · 五官科 · 中医科 · 皮肤科 · 口腔科 · 检验科 · 放射科 · 急诊室");

  addHospital("西区校医院", "西校区", "#2563eb",
    "急诊 62732549  办公 62732550",
    [["上午门诊", "08:00 – 11:30"], ["下午门诊", "13:30 – 17:00"], ["急诊", "24小时"]],
    "内科 · 外科 · 妇科 · 五官科 · 中医科 · 皮肤科 · 口腔科 · 检验科 · 放射科 · 急诊室");

  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  ${header("校医院出诊时间", "🏥", color, W)}
  ${rows.join("\n  ")}
</svg>`;
  save(svgToPng(svg), resolve(ASSETS_DIR, "clinic-hours.png"));
}

// ─── 班车时间 ────────────────────────────────────────────────────────────────
function genBus() {
  const W = 620, H = 430;
  const color = "#7c3aed";

  const rows: string[] = [];
  let y = 74;

  rows.push(`<text x="20" y="${y}" font-family="${FONT_FAMILIES}" font-size="14" fill="#64748b">停靠站：东校区 ↔ 西校区（全程约10分钟）</text>`);
  y += 28;

  rows.push(`<rect x="18" y="${y}" width="4" height="20" fill="${color}" rx="2"/>`);
  rows.push(`<text x="30" y="${y + 15}" font-family="${FONT_FAMILIES}" font-size="16" font-weight="bold" fill="#0f172a">工作日班次（双向对开）</text>`);
  y += 28;

  const workTimes = ["07:10", "08:20", "09:20", "10:20", "11:20", "12:20",
                     "13:20", "14:20", "15:20", "16:20", "17:40", "18:20"];
  const COLS = 4;
  const colW = (W - 60) / COLS;

  workTimes.forEach((t, i) => {
    const row = Math.floor(i / COLS);
    const col = i % COLS;
    const rx = 28 + col * colW;
    const ry = y + row * 34;
    if (col === 0 && row % 2 === 0) {
      rows.push(`<rect x="22" y="${ry - 5}" width="${W - 44}" height="32" fill="#f5f3ff" rx="4"/>`);
    }
    rows.push(`<circle cx="${rx + 6}" cy="${ry + 10}" r="5" fill="${color}"/>`);
    rows.push(`<text x="${rx + 18}" y="${ry + 16}" font-family="${FONT_FAMILIES}" font-size="16" font-weight="bold" fill="#1e293b">${t}</text>`);
  });
  y += Math.ceil(workTimes.length / COLS) * 34 + 10;

  rows.push(`<rect x="18" y="${y}" width="${W - 36}" height="1" fill="#e2e8f0"/>`);
  y += 14;

  rows.push(`<text x="20" y="${y + 13}" font-family="${FONT_FAMILIES}" font-size="14" font-weight="bold" fill="#dc2626">末班特殊班次</text>`);
  y += 26;
  const specials = [["22:00", "东校区 → 西校区（单向末班）"], ["22:30", "西校区 → 东校区（单向末班）"]];
  for (const [t, desc] of specials) {
    rows.push(`<text x="28" y="${y + 13}" font-family="${FONT_FAMILIES}" font-size="15" font-weight="bold" fill="#0f172a">${t}</text>`);
    rows.push(`<text x="105" y="${y + 13}" font-family="${FONT_FAMILIES}" font-size="14" fill="#64748b">${desc}</text>`);
    y += 26;
  }

  rows.push(`<rect x="18" y="${y + 4}" width="${W - 36}" height="1" fill="#e2e8f0"/>`);
  y += 18;

  rows.push(`<rect x="18" y="${y}" width="4" height="20" fill="#f59e0b" rx="2"/>`);
  rows.push(`<text x="30" y="${y + 15}" font-family="${FONT_FAMILIES}" font-size="16" font-weight="bold" fill="#0f172a">节假日 / 周末（双向对开）</text>`);
  y += 28;

  const holidayTimes = ["08:00", "11:30", "13:00", "17:00"];
  holidayTimes.forEach((t, i) => {
    const rx = 28 + i * colW;
    rows.push(`<rect x="${rx - 5}" y="${y - 5}" width="${colW - 5}" height="32" fill="#fffbeb" rx="4"/>`);
    rows.push(`<circle cx="${rx + 6}" cy="${y + 10}" r="5" fill="#f59e0b"/>`);
    rows.push(`<text x="${rx + 18}" y="${y + 16}" font-family="${FONT_FAMILIES}" font-size="16" font-weight="bold" fill="#1e293b">${t}</text>`);
  });
  y += 40;

  rows.push(`<text x="20" y="${H - 14}" font-family="${FONT_FAMILIES}" font-size="13" fill="#94a3b8">※ 遇重大活动或天气原因班次可能调整，请关注校园通知</text>`);

  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  ${header("东西校区班车时刻", "🚌", color, W)}
  ${rows.join("\n  ")}
</svg>`;
  save(svgToPng(svg), resolve(ASSETS_DIR, "bus-schedule.png"));
}

// ─── 课程表 (for S20253082026) ───────────────────────────────────────────────
function genSchedule() {
  const W = 620, H = 470;
  const color = "#0369a1";

  const rows: string[] = [];
  let y = 76;

  rows.push(`<text x="20" y="${y}" font-family="${FONT_FAMILIES}" font-size="14" fill="#64748b">赵鑫宇  信息与电气工程  2025级研一  东校区</text>`);
  y += 28;

  const courses = [
    {
      name: "最优化理论与方法", color: "#0369a1",
      sessions: [["周一", "08:00–10:00", "第一教学楼502"], ["周四", "19:00–21:00", "第一教学楼502"]],
    },
    {
      name: "统计机器学习理论", color: "#059669",
      sessions: [["周一", "19:00–21:00", "第三教学楼501"], ["周三", "19:00–21:00", "第三教学楼501"]],
    },
    {
      name: "随机过程与马尔可夫链", color: "#7c3aed",
      sessions: [["周三", "14:00–16:00", "第三教学楼502"]],
    },
    {
      name: "深度学习理论与工程实践", color: "#c2410c",
      sessions: [["周五", "14:00–18:00", "第三教学楼503"]],
    },
  ];

  for (const c of courses) {
    rows.push(`<rect x="18" y="${y - 4}" width="${W - 36}" height="30" fill="${c.color}14" rx="4"/>`);
    rows.push(`<rect x="18" y="${y - 4}" width="4" height="30" fill="${c.color}" rx="2"/>`);
    rows.push(`<text x="30" y="${y + 15}" font-family="${FONT_FAMILIES}" font-size="15" font-weight="bold" fill="#0f172a">${c.name}</text>`);
    y += 32;

    for (const [day, time, room] of c.sessions) {
      rows.push(`<rect x="34" y="${y}" width="46" height="22" fill="${c.color}22" rx="4"/>`);
      rows.push(`<text x="44" y="${y + 15}" font-family="${FONT_FAMILIES}" font-size="13" font-weight="bold" fill="${c.color}">${day}</text>`);
      rows.push(`<text x="88" y="${y + 15}" font-family="${FONT_FAMILIES}" font-size="14" font-weight="bold" fill="#1e293b">${time}</text>`);
      rows.push(`<text x="210" y="${y + 15}" font-family="${FONT_FAMILIES}" font-size="13" fill="#64748b">${room}</text>`);
      y += 28;
    }
    y += 6;
  }

  rows.push(`<rect x="18" y="${y}" width="${W - 36}" height="1" fill="#e2e8f0"/>`);
  y += 14;

  rows.push(`<rect x="18" y="${y}" width="4" height="20" fill="#dc2626" rx="2"/>`);
  rows.push(`<text x="30" y="${y + 15}" font-family="${FONT_FAMILIES}" font-size="15" font-weight="bold" fill="#0f172a">近期作业截止</text>`);
  y += 28;

  const assignments = [
    { date: "04-29", tag: "紧急 2天", color: "#dc2626", text: "泊松过程分析（随机过程与马尔可夫链）" },
    { date: "04-30", tag: "3天", color: "#f59e0b", text: "SVM核函数分析 · 最优化作业1 · 深度学习作业1" },
    { date: "05-06", tag: "9天", color: "#64748b", text: "深度学习文献综述（统计机器学习理论）" },
  ];

  for (const a of assignments) {
    rows.push(`<rect x="22" y="${y - 3}" width="${W - 44}" height="26" fill="${a.color}12" rx="3"/>`);
    rows.push(`<text x="30" y="${y + 13}" font-family="${FONT_FAMILIES}" font-size="14" font-weight="bold" fill="${a.color}">${a.date}</text>`);
    rows.push(`<rect x="94" y="${y + 1}" width="${a.tag.length * 10 + 14}" height="18" fill="${a.color}28" rx="4"/>`);
    rows.push(`<text x="101" y="${y + 13}" font-family="${FONT_FAMILIES}" font-size="12" fill="${a.color}">${a.tag}</text>`);
    rows.push(`<text x="${94 + a.tag.length * 10 + 22}" y="${y + 13}" font-family="${FONT_FAMILIES}" font-size="13" fill="#334155">${a.text}</text>`);
    y += 28;
  }

  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  ${header("本学期课程表", "📅", color, W)}
  ${rows.join("\n  ")}
</svg>`;
  save(svgToPng(svg), resolve(ASSETS_DIR, "course-schedule.png"));
}

// Run
genLogo();
genCafeteria();
genClinic();
genBus();
genSchedule();
console.log("\n✅ All images generated!");
