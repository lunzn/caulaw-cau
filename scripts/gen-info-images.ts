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

mkdirSync(ASSETS_DIR, { recursive: true });

const FF = "'Microsoft YaHei', 'SimHei', Arial, sans-serif";

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

// ─── Card wrapper ─────────────────────────────────────────────────────────────
function card(W: number, H: number, header: string, body: string): string {
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>${header}</defs>
  ${body}
</svg>`;
}

// ─── Header band ──────────────────────────────────────────────────────────────
function headerBand(id: string, c1: string, c2: string, W: number, title: string): string {
  const H = 64;
  return `
  <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%" stop-color="${c1}"/>
    <stop offset="100%" stop-color="${c2}"/>
  </linearGradient>
  <rect width="${W}" height="${H}" fill="url(#${id})" rx="0"/>
  <rect x="0" y="${H - 3}" width="${W}" height="3" fill="${c2}22"/>
  <rect x="20" y="18" width="4" height="28" fill="white" rx="2" opacity="0.5"/>
  <text x="34" y="42" font-family="${FF}" font-size="22" font-weight="bold" fill="white">${title}</text>`;
}

// ─── Section label ────────────────────────────────────────────────────────────
function sectionLabel(x: number, y: number, text: string, color: string): string {
  return `
  <rect x="${x}" y="${y}" width="4" height="20" fill="${color}" rx="2"/>
  <text x="${x + 12}" y="${y + 15}" font-family="${FF}" font-size="16" font-weight="bold" fill="#1e293b">${text}</text>`;
}

// ─── 食堂时间 ────────────────────────────────────────────────────────────────
function genCafeteria() {
  const W = 640, H = 490;
  const c1 = "#0369a1", c2 = "#0891b2";

  const rows: string[] = [];
  rows.push(`<rect width="${W}" height="${H}" fill="#f0f9ff"/>`);
  rows.push(headerBand("hg", c1, c2, W, "食堂营业时间"));

  let y = 84;

  function addSection(
    title: string,
    tagColor: string,
    items: [string, string][],
    hours: [string, string][]
  ) {
    rows.push(sectionLabel(18, y, title, tagColor));
    y += 28;

    for (const [name, loc] of items) {
      rows.push(`<text x="32" y="${y + 14}" font-family="${FF}" font-size="14" font-weight="bold" fill="#334155">${name}</text>`);
      rows.push(`<text x="${32 + name.length * 14 + 4}" y="${y + 14}" font-family="${FF}" font-size="12" fill="#94a3b8">${loc}</text>`);
      y += 22;
    }
    y += 4;

    for (let i = 0; i < hours.length; i++) {
      const [meal, time] = hours[i];
      const bg = i % 2 === 0 ? "#e0f2fe" : "#f0f9ff";
      rows.push(`<rect x="22" y="${y}" width="${W - 44}" height="28" fill="${bg}" rx="4"/>`);
      rows.push(`<circle cx="42" cy="${y + 14}" r="4" fill="${tagColor}"/>`);
      rows.push(`<text x="54" y="${y + 18}" font-family="${FF}" font-size="14" fill="#475569">${meal}</text>`);
      rows.push(`<text x="160" y="${y + 18}" font-family="${FF}" font-size="14" font-weight="bold" fill="#0f172a">${time}</text>`);
      y += 30;
    }
    y += 10;

    rows.push(`<rect x="18" y="${y}" width="${W - 36}" height="1" fill="#bae6fd"/>`);
    y += 16;
  }

  addSection("东校区食堂", c1,
    [["公三食堂", "（公寓三区南侧）"], ["公四食堂", "（公寓四区南侧）"]],
    [["早 餐", "06:30 – 10:00"], ["午 餐", "10:30 – 13:30"], ["晚 餐", "16:30 – 19:30"]]
  );

  addSection("西校区食堂", "#059669",
    [["和二食堂", "（和园二区）"]],
    [["早 餐", "07:00 – 09:30"], ["午 餐", "11:00 – 13:30"], ["晚 餐", "17:00 – 19:30"]]
  );

  rows.push(`<text x="20" y="${H - 12}" font-family="${FF}" font-size="12" fill="#94a3b8">※ 节假日营业时间以现场公告为准</text>`);

  const defs = `<linearGradient id="hg" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%" stop-color="${c1}"/>
    <stop offset="100%" stop-color="${c2}"/>
  </linearGradient>`;

  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>${defs}</defs>
  <rect width="${W}" height="${H}" fill="#f0f9ff"/>
  <rect width="${W}" height="64" fill="url(#hg)"/>
  <rect x="0" y="61" width="${W}" height="3" fill="${c2}22"/>
  <rect x="20" y="18" width="4" height="28" fill="white" rx="2" opacity="0.5"/>
  <text x="34" y="42" font-family="${FF}" font-size="22" font-weight="bold" fill="white">食堂营业时间</text>
  ${rows.join("\n  ")}
</svg>`;
  save(svgToPng(svg), resolve(ASSETS_DIR, "cafeteria-hours.png"));
}

// ─── 校医院时间 ──────────────────────────────────────────────────────────────
function genClinic() {
  const W = 640, H = 420;
  const c1 = "#b91c1c", c2 = "#dc2626";

  const rows: string[] = [];
  let y = 84;

  function addHospital(
    name: string,
    tag: string,
    tagColor: string,
    phone: string,
    hours: [string, string][],
    depts: string
  ) {
    rows.push(sectionLabel(18, y, name, tagColor));
    const tagX = 20 + name.length * 16 + 14;
    rows.push(`<rect x="${tagX}" y="${y + 1}" width="${tag.length * 13 + 14}" height="20" fill="${tagColor}22" rx="4"/>`);
    rows.push(`<text x="${tagX + 7}" y="${y + 15}" font-family="${FF}" font-size="12" fill="${tagColor}">${tag}</text>`);
    y += 28;

    for (let i = 0; i < hours.length; i++) {
      const [label, time] = hours[i];
      const bg = i % 2 === 0 ? "#fee2e2" : "#fef2f2";
      const isBg = bg;
      rows.push(`<rect x="22" y="${y}" width="${W - 44}" height="26" fill="${isBg}" rx="3"/>`);
      rows.push(`<text x="38" y="${y + 17}" font-family="${FF}" font-size="14" fill="#64748b">${label}</text>`);
      const tc = time === "24小时" ? c2 : "#0f172a";
      rows.push(`<text x="185" y="${y + 17}" font-family="${FF}" font-size="14" font-weight="bold" fill="${tc}">${time}</text>`);
      y += 28;
    }

    rows.push(`<text x="30" y="${y + 14}" font-family="${FF}" font-size="12" fill="#64748b">Tel: ${phone}</text>`);
    y += 22;
    rows.push(`<text x="30" y="${y + 12}" font-family="${FF}" font-size="12" fill="#94a3b8">${depts}</text>`);
    y += 22;

    rows.push(`<rect x="18" y="${y}" width="${W - 36}" height="1" fill="#fecaca"/>`);
    y += 16;
  }

  addHospital("东区校医院", "东校区", c2,
    "急诊 62736761  办公 62737568",
    [["上午门诊", "08:00 – 11:30"], ["下午门诊", "13:30 – 17:00"], ["急  诊", "24小时"]],
    "内科 · 外科 · 妇科 · 五官科 · 中医科 · 口腔科 · 检验科 · 放射科"
  );

  addHospital("西区校医院", "西校区", "#2563eb",
    "急诊 62732549  办公 62732550",
    [["上午门诊", "08:00 – 11:30"], ["下午门诊", "13:30 – 17:00"], ["急  诊", "24小时"]],
    "内科 · 外科 · 妇科 · 五官科 · 中医科 · 口腔科 · 检验科 · 放射科"
  );

  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="hg" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${c1}"/>
      <stop offset="100%" stop-color="${c2}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#fff5f5"/>
  <rect width="${W}" height="64" fill="url(#hg)"/>
  <rect x="0" y="61" width="${W}" height="3" fill="${c2}22"/>
  <rect x="20" y="18" width="4" height="28" fill="white" rx="2" opacity="0.5"/>
  <text x="34" y="42" font-family="${FF}" font-size="22" font-weight="bold" fill="white">校医院出诊时间</text>
  ${rows.join("\n  ")}
</svg>`;
  save(svgToPng(svg), resolve(ASSETS_DIR, "clinic-hours.png"));
}

// ─── 班车时间 ────────────────────────────────────────────────────────────────
function genBus() {
  const W = 640, H = 440;
  const c1 = "#5b21b6", c2 = "#7c3aed";

  const rows: string[] = [];
  let y = 80;

  rows.push(`<rect x="18" y="${y}" width="${W - 36}" height="24" fill="#ede9fe" rx="4"/>`);
  rows.push(`<text x="30" y="${y + 16}" font-family="${FF}" font-size="13" fill="#6d28d9">停靠站：东校区 ↔ 西校区（全程约10分钟）</text>`);
  y += 32;

  rows.push(sectionLabel(18, y, "工作日班次（双向对开）", c2));
  y += 30;

  const workTimes = ["07:10", "08:20", "09:20", "10:20", "11:20", "12:20",
                     "13:20", "14:20", "15:20", "16:20", "17:40", "18:20"];
  const COLS = 4;
  const colW = (W - 60) / COLS;

  workTimes.forEach((t, i) => {
    const row = Math.floor(i / COLS);
    const col = i % COLS;
    const rx = 28 + col * colW;
    const ry = y + row * 34;
    if (col === 0) {
      const bg = row % 2 === 0 ? "#ede9fe" : "#f5f3ff";
      rows.push(`<rect x="22" y="${ry - 4}" width="${W - 44}" height="30" fill="${bg}" rx="4"/>`);
    }
    rows.push(`<circle cx="${rx + 6}" cy="${ry + 11}" r="4" fill="${c2}"/>`);
    rows.push(`<text x="${rx + 17}" y="${ry + 17}" font-family="${FF}" font-size="15" font-weight="bold" fill="#1e293b">${t}</text>`);
  });
  y += Math.ceil(workTimes.length / COLS) * 34 + 8;

  rows.push(`<rect x="18" y="${y}" width="${W - 36}" height="1" fill="#ddd6fe"/>`);
  y += 14;

  rows.push(`<text x="20" y="${y + 14}" font-family="${FF}" font-size="13" font-weight="bold" fill="#dc2626">末班特殊班次</text>`);
  y += 26;
  const specials: [string, string][] = [
    ["22:00", "东校区 → 西校区（单向末班）"],
    ["22:30", "西校区 → 东校区（单向末班）"]
  ];
  for (const [t, desc] of specials) {
    rows.push(`<rect x="22" y="${y - 3}" width="${W - 44}" height="24" fill="#fee2e2" rx="3"/>`);
    rows.push(`<text x="32" y="${y + 13}" font-family="${FF}" font-size="14" font-weight="bold" fill="#0f172a">${t}</text>`);
    rows.push(`<text x="105" y="${y + 13}" font-family="${FF}" font-size="13" fill="#64748b">${desc}</text>`);
    y += 26;
  }

  rows.push(`<rect x="18" y="${y + 4}" width="${W - 36}" height="1" fill="#ddd6fe"/>`);
  y += 16;

  rows.push(sectionLabel(18, y, "节假日 / 周末（双向对开）", "#d97706"));
  y += 30;

  const holidayTimes = ["08:00", "11:30", "13:00", "17:00"];
  holidayTimes.forEach((t, i) => {
    const rx = 28 + i * colW;
    rows.push(`<rect x="${rx - 4}" y="${y - 4}" width="${colW - 6}" height="30" fill="#fef3c7" rx="4"/>`);
    rows.push(`<circle cx="${rx + 6}" cy="${y + 11}" r="4" fill="#d97706"/>`);
    rows.push(`<text x="${rx + 17}" y="${y + 17}" font-family="${FF}" font-size="15" font-weight="bold" fill="#1e293b">${t}</text>`);
  });
  y += 36;

  rows.push(`<text x="20" y="${H - 12}" font-family="${FF}" font-size="12" fill="#94a3b8">※ 遇重大活动或天气原因班次可能调整，请关注校园通知</text>`);

  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="hg" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${c1}"/>
      <stop offset="100%" stop-color="${c2}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#faf5ff"/>
  <rect width="${W}" height="64" fill="url(#hg)"/>
  <rect x="0" y="61" width="${W}" height="3" fill="${c2}22"/>
  <rect x="20" y="18" width="4" height="28" fill="white" rx="2" opacity="0.5"/>
  <text x="34" y="42" font-family="${FF}" font-size="22" font-weight="bold" fill="white">东西校区班车时刻</text>
  ${rows.join("\n  ")}
</svg>`;
  save(svgToPng(svg), resolve(ASSETS_DIR, "bus-schedule.png"));
}

// ─── 课程表 (for S20253082026) ────────────────────────────────────────────────
function genSchedule() {
  const W = 640, H = 450;
  const c1 = "#0c4a6e", c2 = "#0369a1";

  const rows: string[] = [];
  let y = 82;

  rows.push(`<rect x="18" y="${y}" width="${W - 36}" height="22" fill="#e0f2fe" rx="4"/>`);
  rows.push(`<text x="28" y="${y + 15}" font-family="${FF}" font-size="13" fill="#0369a1">赵鑫宇  信息与电气工程  2025级研一  东校区</text>`);
  y += 30;

  const courses: { name: string; color: string; sessions: [string, string, string][] }[] = [
    {
      name: "最优化理论与方法", color: "#0369a1",
      sessions: [["周一", "08:00 – 10:00", "第一教学楼502"], ["周四", "19:00 – 21:00", "第一教学楼502"]],
    },
    {
      name: "统计机器学习理论", color: "#059669",
      sessions: [["周一", "19:00 – 21:00", "第三教学楼501"], ["周三", "19:00 – 21:00", "第三教学楼501"]],
    },
    {
      name: "随机过程与马尔可夫链", color: "#7c3aed",
      sessions: [["周三", "14:00 – 16:00", "第三教学楼502"]],
    },
    {
      name: "深度学习理论与工程实践", color: "#c2410c",
      sessions: [["周五", "14:00 – 18:00", "第三教学楼503"]],
    },
  ];

  for (const c of courses) {
    rows.push(`<rect x="18" y="${y}" width="${W - 36}" height="28" fill="${c.color}18" rx="4"/>`);
    rows.push(`<rect x="18" y="${y}" width="4" height="28" fill="${c.color}" rx="2"/>`);
    rows.push(`<text x="30" y="${y + 19}" font-family="${FF}" font-size="15" font-weight="bold" fill="#0f172a">${c.name}</text>`);
    y += 32;

    for (const [day, time, room] of c.sessions) {
      rows.push(`<rect x="34" y="${y + 1}" width="42" height="20" fill="${c.color}28" rx="3"/>`);
      rows.push(`<text x="42" y="${y + 15}" font-family="${FF}" font-size="13" font-weight="bold" fill="${c.color}">${day}</text>`);
      rows.push(`<text x="84" y="${y + 15}" font-family="${FF}" font-size="13" font-weight="bold" fill="#1e293b">${time}</text>`);
      rows.push(`<text x="215" y="${y + 15}" font-family="${FF}" font-size="13" fill="#64748b">${room}</text>`);
      y += 26;
    }
    y += 8;
  }

  rows.push(`<text x="20" y="${H - 12}" font-family="${FF}" font-size="12" fill="#94a3b8">本学期课表 · 如有调课请以教务系统通知为准</text>`);

  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="hg" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${c1}"/>
      <stop offset="100%" stop-color="${c2}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#f0f9ff"/>
  <rect width="${W}" height="64" fill="url(#hg)"/>
  <rect x="0" y="61" width="${W}" height="3" fill="${c2}22"/>
  <rect x="20" y="18" width="4" height="28" fill="white" rx="2" opacity="0.5"/>
  <text x="34" y="42" font-family="${FF}" font-size="22" font-weight="bold" fill="white">本学期课程表</text>
  ${rows.join("\n  ")}
</svg>`;
  save(svgToPng(svg), resolve(ASSETS_DIR, "course-schedule.png"));
}

// Run
genCafeteria();
genClinic();
genBus();
genSchedule();
console.log("\n All images generated!");
