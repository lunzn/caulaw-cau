import { initDatabase, getDatabase } from "../db/database";
import { insertTransaction } from "../db/transactions";

function id(): string {
  return crypto.randomUUID();
}

function daysAgo(n: number): number {
  return Math.floor(Date.now() / 1000) - n * 86400;
}
function daysFromNow(n: number): number {
  return Math.floor(Date.now() / 1000) + n * 86400;
}
function hoursFromNow(n: number): number {
  return Math.floor(Date.now() / 1000) + n * 3600;
}

export function seedDatabase(): void {
  console.log("开始生成中国农业大学模拟数据...");
  initDatabase();
  const db = getDatabase();

  // ── 清空 ──────────────────────────────────────────────────────────────────
  const tables = [
    "clinic_schedule","room_reservations","rooms",
    "cafeteria_transactions","cafeteria_menu","cafeterias",
    "bus_schedules","bus_stops","bus_routes",
    "campus_cards","repair_tickets","submissions","assignments",
    "course_students","courses","students","teachers",
    "library_reservations","library_seats","library_books",
    "teacher_papers","teacher_patents","open_projects",
  ];
  for (const t of tables) db.run(`DELETE FROM ${t}`);
  console.log("已清空数据");

  // ── 教师 ──────────────────────────────────────────────────────────────────
  const teachers = [
    { id: "T001", name: "张志远", email: "zhangzy@cau.edu.cn", department: "信息与电气工程学院", title: "教授",  campus: "东校区", research_areas: "智能控制,机器人系统,强化学习", office: "信电楼312" },
    { id: "T002", name: "李敏华", email: "limh@cau.edu.cn",    department: "信息与电气工程学院", title: "副教授", campus: "东校区", research_areas: "嵌入式系统,物联网,边缘计算", office: "信电楼315" },
    { id: "T003", name: "王建国", email: "wangjg@cau.edu.cn",  department: "信息与电气工程学院", title: "讲师",  campus: "东校区", research_areas: "程序设计,软件工程,系统开发", office: "信电楼218" },
    { id: "T004", name: "赵明远", email: "zhaomy@cau.edu.cn",  department: "理学院",            title: "教授",  campus: "东校区", research_areas: "数值分析,优化算法,数学建模", office: "理学院205" },
    { id: "T005", name: "刘芳芳", email: "liuff@cau.edu.cn",   department: "信息与电气工程学院", title: "副教授", campus: "东校区", research_areas: "计算机视觉,图像处理,模式识别", office: "信电楼214" },
    { id: "T006", name: "陈伟达", email: "chenwd@cau.edu.cn",  department: "信息与电气工程学院", title: "讲师",  campus: "东校区", research_areas: "计算机网络,分布式系统,云计算", office: "信电楼220" },
    { id: "T007", name: "周海涛", email: "zhouht@cau.edu.cn",  department: "信息与电气工程学院", title: "教授",  campus: "东校区", research_areas: "深度学习,具身智能,机器人控制,强化学习", office: "信电楼310" },
    { id: "T008", name: "吴国平", email: "wugp@cau.edu.cn",    department: "信息与电气工程学院", title: "副教授", campus: "东校区", research_areas: "随机过程,统计学习,数据分析", office: "信电楼316" },
    // 演示教师账号
    { id: "T009", name: "林晓东", email: "linxd@cau.edu.cn",   department: "信息与电气工程学院计算机工程系", title: "教授",
      campus: "东校区", research_areas: "计算机视觉,智慧农业,具身智能,农业机器人", office: "信电楼216" },
  ];
  for (const t of teachers) {
    db.run(`INSERT INTO teachers (id,name,email,department,title,campus,research_areas,office) VALUES (?,?,?,?,?,?,?,?)`,
      [t.id, t.name, t.email, t.department, t.title, t.campus, t.research_areas, t.office]);
  }
  console.log(`教师: ${teachers.length} 人`);

  // ── 学生 (id = student_number) ────────────────────────────────────────────
  // 研究生前缀 S（硕/博）；本科生前缀 Y
  const students = [
    // 研究生 (graduate)，S 前缀
    { id: "S20213082001", student_number: "S20213082001", name: "王明阳", email: "wangmy@cau.edu.cn",  type: "graduate", major: "信息与电气工程", grade: 4, campus: "东校区", dorm: "研1-301" },
    { id: "S20223082002", student_number: "S20223082002", name: "李晓雪", email: "lixs@cau.edu.cn",   type: "graduate", major: "电子信息工程",   grade: 3, campus: "东校区", dorm: "研1-215" },
    { id: "S20233082003", student_number: "S20233082003", name: "张博文", email: "zhangbw@cau.edu.cn", type: "graduate", major: "计算机科学与技术", grade: 2, campus: "东校区", dorm: "研2-418" },
    { id: "S20243082004", student_number: "S20243082004", name: "陈雨薇", email: "chenyw@cau.edu.cn",  type: "graduate", major: "人工智能", grade: 1, campus: "东校区", dorm: "研2-102" },
    { id: "S20253082026", student_number: "S20253082026", name: "赵鑫宇", email: "zhaoxy26@cau.edu.cn",type: "graduate", major: "信息与电气工程", grade: 1, campus: "东校区", dorm: "研3-506" },
    { id: "S20213082006", student_number: "S20213082006", name: "刘思远", email: "liusy@cau.edu.cn",   type: "graduate", major: "机器学习",   grade: 4, campus: "东校区", dorm: "研1-302" },
    // 本科生 (undergraduate)，Y 前缀
    { id: "Y20221082001", student_number: "Y20221082001", name: "吴雅婷", email: "wuyt@cau.edu.cn",    type: "undergraduate", major: "信息与电气工程",  grade: 3, campus: "东校区", dorm: "东1-201" },
    { id: "Y20241082002", student_number: "Y20241082002", name: "孙昊然", email: "sunhr@cau.edu.cn",   type: "undergraduate", major: "电子信息工程",    grade: 1, campus: "东校区", dorm: "东2-102" },
    { id: "Y20231082003", student_number: "Y20231082003", name: "周文静", email: "zhouwj@cau.edu.cn",  type: "undergraduate", major: "计算机科学与技术", grade: 2, campus: "东校区", dorm: "东3-203" },
    { id: "Y20221082004", student_number: "Y20221082004", name: "郑浩宇", email: "zhenghy@cau.edu.cn", type: "undergraduate", major: "电子信息工程",    grade: 3, campus: "东校区", dorm: "东1-205" },
  ];
  for (const s of students) {
    db.run(`INSERT INTO students (id,name,email,student_number,type,major,grade,campus,dorm) VALUES (?,?,?,?,?,?,?,?,?)`,
      [s.id, s.name, s.email, s.student_number, s.type, s.major, s.grade, s.campus, s.dorm]);
  }
  console.log(`学生: ${students.length} 人（本科 6 人，研究生 4 人）`);

  // ── 课程 ──────────────────────────────────────────────────────────────────
  // 时间槽：8:00-10:00 / 10:10-12:00 / 14:00-16:00 / 16:10-18:00 / 19:00-21:00 / 21:10-23:00
  // 连上两节：8:00-12:00 / 14:00-18:00 / 19:00-23:00（合并显示）
  const sem = "2025-2026秋季";
  const ugCourses = [
    // ── 大一（grade 1）─────────────────────────────────────────────────────
    // 周一/三/五 上午 + 周二/四 各有课，存在多课并排和空闲日
    { id: "C001", name: "高等数学A(一)",              code: "MATH1001", teacher: "T004", credit: 3,
      schedule: "周一 8:00-10:00  周三 8:00-10:00  周五 8:00-10:00", location: "第一教学楼101", course_type: "undergraduate" },
    { id: "C002", name: "大学英语（综合训练）",        code: "ENG1001",  teacher: "T003", credit: 3,
      schedule: "周二 10:10-12:00  周四 14:00-16:00", location: "第二教学楼203", course_type: "undergraduate" },
    { id: "C003", name: "大学物理（力学与热学）",      code: "PHY1001",  teacher: "T004", credit: 3,
      schedule: "周二 8:00-10:00  周四 8:00-10:00", location: "第一教学楼102", course_type: "undergraduate" },
    { id: "C004", name: "习近平新时代中国特色社会主义思想概论", code: "IDE1001", teacher: "T006", credit: 3,
      schedule: "周五 14:00-16:00", location: "第三教学楼301", course_type: "undergraduate" },
    // ── 大二（grade 2）─────────────────────────────────────────────────────
    { id: "C005", name: "线性代数与空间解析几何",      code: "MATH2001", teacher: "T004", credit: 3,
      schedule: "周一 10:10-12:00  周三 10:10-12:00", location: "第一教学楼201", course_type: "undergraduate" },
    { id: "C006", name: "程序设计基础（C/C++）",       code: "CS2001",   teacher: "T003", credit: 3,
      schedule: "周二 14:00-18:00  周五 14:00-16:00", location: "第二教学楼机房A", course_type: "undergraduate" },
    { id: "C007", name: "电路分析基础",                code: "EE2001",   teacher: "T002", credit: 3,
      schedule: "周一 14:00-16:00  周三 14:00-16:00", location: "第一教学楼301", course_type: "undergraduate" },
    { id: "C008", name: "信号与线性系统",              code: "EE2002",   teacher: "T001", credit: 3,
      schedule: "周四 10:10-12:00", location: "第二教学楼302", course_type: "undergraduate" },
    // ── 大三（grade 3）─────────────────────────────────────────────────────
    { id: "C009", name: "数据结构与算法分析",          code: "CS3001",   teacher: "T001", credit: 3,
      schedule: "周一 8:00-10:00  周三 8:00-12:00", location: "第三教学楼401", course_type: "undergraduate" },
    { id: "C010", name: "计算机网络原理",              code: "CS3002",   teacher: "T006", credit: 3,
      schedule: "周二 10:10-12:00  周四 10:10-12:00", location: "第三教学楼402", course_type: "undergraduate" },
    { id: "C011", name: "数字图像处理与机器视觉",      code: "CS3003",   teacher: "T005", credit: 3,
      schedule: "周三 16:10-18:00  周五 14:00-18:00", location: "第三教学楼403", course_type: "undergraduate" },
    { id: "C012", name: "操作系统原理与实践",          code: "CS3004",   teacher: "T002", credit: 3,
      schedule: "周四 8:00-10:00", location: "第三教学楼404", course_type: "undergraduate" },
    // ── 大四（grade 4）─────────────────────────────────────────────────────
    { id: "C013", name: "软件工程方法与实践",          code: "CS4001",   teacher: "T005", credit: 3,
      schedule: "周二 8:00-10:00  周四 8:00-10:00", location: "第二教学楼401", course_type: "undergraduate" },
    { id: "C014", name: "嵌入式系统与物联网设计",      code: "EE4001",   teacher: "T002", credit: 3,
      schedule: "周一 16:10-18:00  周三 14:00-18:00", location: "第二教学楼实验室B", course_type: "undergraduate" },
  ];
  // ── 研究生课程（白天+晚间，学分 2-4，按周一→周五排列）──────────────────────
  const gradCourses = [
    { id: "G001", name: "数值分析与科学计算",            code: "GM001", teacher: "T004", credit: 3,
      schedule: "周二 14:00-16:00", location: "第一教学楼501", course_type: "graduate" },
    { id: "G002", name: "最优化理论与方法",               code: "GM002", teacher: "T007", credit: 3,
      schedule: "周一 8:00-10:00  周四 19:00-21:00", location: "第一教学楼502", course_type: "graduate" },
    { id: "G003", name: "统计机器学习理论",               code: "GM003", teacher: "T008", credit: 3,
      schedule: "周一 19:00-21:00  周三 19:00-21:00", location: "第三教学楼501", course_type: "graduate" },
    { id: "G004", name: "随机过程与马尔可夫链",           code: "GM004", teacher: "T008", credit: 2,
      schedule: "周三 14:00-16:00", location: "第三教学楼502", course_type: "graduate" },
    { id: "G005", name: "深度学习理论与工程实践",         code: "GM005", teacher: "T007", credit: 3,
      schedule: "周五 14:00-18:00", location: "第三教学楼503", course_type: "graduate" },
    // T009 林晓东 教师演示课程（东校区，周一/二/三）
    { id: "GT01", name: "计算机视觉与图像识别",  code: "CS6001", teacher: "T009", credit: 3,
      schedule: "周一 10:00-12:00", location: "信电楼201", course_type: "graduate" },
    { id: "GT02", name: "智慧农业与机器感知",    code: "CS6002", teacher: "T009", credit: 3,
      schedule: "周二 08:00-10:00", location: "信电楼201", course_type: "graduate" },
    { id: "GT03", name: "具身智能与机器人系统",  code: "CS6003", teacher: "T009", credit: 3,
      schedule: "周三 14:00-16:00", location: "信电楼201", course_type: "graduate" },
  ];

  const allCourses = [...ugCourses, ...gradCourses];
  for (const c of allCourses) {
    db.run(`INSERT INTO courses (id,name,code,teacher_id,semester,credit,schedule,location,course_type) VALUES (?,?,?,?,?,?,?,?,?)`,
      [c.id, c.name, c.code, c.teacher, sem, c.credit, c.schedule, c.location, c.course_type]);
  }

  // 选课：按年级分配
  const grade1CourseIds = ["C001","C002","C003","C004"];
  const grade2CourseIds = ["C005","C006","C007","C008"];
  const grade3CourseIds = ["C009","C010","C011","C012"];
  const grade4CourseIds = ["C013","C014"];
  const gradCourseIds   = ["G001","G002","G003","G004","G005"];

  function enroll(studentId: string, courseIds: string[]) {
    for (const cid of courseIds) {
      db.run(`INSERT OR IGNORE INTO course_students (course_id,student_id) VALUES (?,?)`, [cid, studentId]);
    }
  }

  // 本科生按年级（Y 前缀）
  enroll("Y20241082002", grade1CourseIds);  // 孙昊然 大一
  enroll("Y20231082003", grade2CourseIds);  // 周文静 大二
  enroll("Y20221082001", grade3CourseIds);  // 吴雅婷 大三
  enroll("Y20221082004", grade3CourseIds);  // 郑浩宇 大三
  // 研究生（S 前缀）
  enroll("S20253082026", ["G002","G003","G004","G005"]);  // 赵鑫宇 一年级（周二无课，周一/三/四/五有课，周一三各2节）
  enroll("S20243082004", ["G001","G002","G003"]);                // 陈雨薇 一年级
  enroll("S20233082003", ["G001","G003","G005"]);                // 张博文 二年级
  enroll("S20223082002", ["G002","G004","G005"]);                // 李晓雪 三年级
  enroll("S20213082001", ["G003","G005"]);                       // 王明阳 四年级（博士）
  enroll("S20213082006", ["G002","G004"]);                       // 刘思远 四年级（博士）

  console.log(`课程: ${allCourses.length} 门（本科 ${ugCourses.length}，研究生 ${gradCourses.length}）`);

  // ── 作业 ──────────────────────────────────────────────────────────────────
  const assignmentTemplates: Record<string, { title: string; desc: string; offset: number }[]> = {
    "C001": [
      { title: "第一章习题", desc: "完成高等数学A第一章课后题1-20题，手写拍照提交", offset: -14 },
      { title: "极限与连续性作业", desc: "完成第二章极限概念与运算课后题，要求过程完整", offset: 2 },
      { title: "导数综合练习", desc: "完成导数与微分综合练习册第3套，提交扫描件", offset: 8 },
    ],
    "C002": [
      { title: "Unit 1 阅读报告", desc: "阅读大学英语教材Unit 1，完成课后阅读理解并写100字总结", offset: -7 },
      { title: "写作练习：自我介绍", desc: "用英文写一篇150-200词的自我介绍，格式规范", offset: 1 },
      { title: "Unit 2 听力作业", desc: "完成Unit 2配套听力练习，提交答题卡截图", offset: 6 },
    ],
    "C005": [
      { title: "矩阵运算作业", desc: "线性代数第一章矩阵加法与乘法课后题1-15", offset: -10 },
      { title: "行列式计算练习", desc: "完成行列式计算专项练习，提交手写解题过程", offset: 3 },
      { title: "线性方程组求解", desc: "用高斯消元法求解第三章线性方程组练习题", offset: 9 },
    ],
    "C006": [
      { title: "Hello World 程序设计", desc: "编写第一个C语言程序，实现控制台输入输出", offset: -5 },
      { title: "循环与数组综合题", desc: "完成循环结构+数组综合编程题5道，提交.c源文件", offset: 2 },
      { title: "函数与指针小项目", desc: "用函数和指针实现一个简单的学生成绩管理程序", offset: 12 },
    ],
    "C009": [
      { title: "线性表实验报告", desc: "基于链表实现学生信息管理系统，提交源码和报告", offset: -3 },
      { title: "二叉树遍历作业", desc: "实现二叉树前中后序遍历并分析时间复杂度", offset: 4 },
      { title: "图算法设计", desc: "用Dijkstra算法求最短路径，提交代码+分析报告", offset: 10 },
    ],
    "C013": [
      { title: "需求分析文档", desc: "以团队形式完成软件需求分析文档（SRS），至少15页", offset: -2 },
      { title: "系统设计报告", desc: "基于需求分析进行系统总体设计，绘制UML图", offset: 7 },
      { title: "测试计划书", desc: "编写软件测试计划书，包含测试用例设计", offset: 14 },
    ],
    "G003": [
      { title: "线性回归推导作业", desc: "手推线性回归梯度下降公式并证明收敛性", offset: -4 },
      { title: "SVM核函数分析", desc: "分析RBF、多项式核函数性质，提交LaTeX文档", offset: 5 },
      { title: "深度学习文献综述", desc: "阅读3篇顶会论文，写1500字综述报告", offset: 11 },
    ],
    "G004": [
      { title: "马尔可夫链习题", desc: "完成随机过程第二章马尔可夫链课后题1-8", offset: -6 },
      { title: "泊松过程分析", desc: "分析泊松过程在排队论中的应用，提交分析报告", offset: 4 },
    ],
  };

  let aCount = 0;
  for (const [courseId, tmps] of Object.entries(assignmentTemplates)) {
    for (const t of tmps) {
      const aId = id();
      db.run(`INSERT INTO assignments (id,course_id,title,description,deadline,max_score) VALUES (?,?,?,?,?,100)`,
        [aId, courseId, t.title, t.desc, t.offset < 0 ? daysAgo(-t.offset) : daysFromNow(t.offset)]);
      aCount++;
    }
  }
  // 其余课程生成通用作业
  const coveredCourses = new Set(Object.keys(assignmentTemplates));
  for (const c of allCourses) {
    if (coveredCourses.has(c.id)) continue;
    const aId = id();
    db.run(`INSERT INTO assignments (id,course_id,title,description,deadline,max_score) VALUES (?,?,?,?,?,100)`,
      [aId, c.id, `${c.name} 第一次作业`, `完成${c.name}教材第一章课后习题`, daysFromNow(5)]);
    aCount++;
  }
  console.log(`作业: ${aCount} 个`);

  // ── 图书馆 ────────────────────────────────────────────────────────────────
  const seats = [
    { area_name: "一楼大厅自习区",   total: 150, available: 62 },
    { area_name: "二楼安静阅览区",   total: 100, available: 18 },
    { area_name: "三楼个人研讨区",   total: 60,  available: 24 },
    { area_name: "四楼小组研讨室",   total: 48,  available: 11 },
    { area_name: "五楼通宵自习区",   total: 80,  available: 47 },
  ];
  for (const s of seats) db.run(`INSERT INTO library_seats VALUES (?,?,?,unixepoch())`, [s.area_name, s.total, s.available]);

  const books = [
    { isbn: "9787111213826", title: "算法导论（第3版）",    author: "Thomas H. Cormen", publisher: "机械工业出版社", location: "A区3排", total: 3, available: 1 },
    { isbn: "9787111349297", title: "深入理解计算机系统",   author: "Randal E. Bryant", publisher: "机械工业出版社", location: "A区4排", total: 4, available: 2 },
    { isbn: "9787302257694", title: "操作系统概念（第9版）",author: "Abraham Silberschatz", publisher: "清华大学出版社", location: "B区2排", total: 2, available: 0 },
    { isbn: "9787121362199", title: "Python机器学习",       author: "Sebastian Raschka", publisher: "电子工业出版社", location: "C区1排", total: 3, available: 3 },
    { isbn: "9787115545381", title: "深度学习",             author: "Goodfellow et al.", publisher: "人民邮电出版社", location: "C区2排", total: 2, available: 1 },
    { isbn: "9787301310175", title: "高等数学（第七版）上册", author: "同济大学数学系", publisher: "高等教育出版社", location: "D区1排", total: 10, available: 7 },
    { isbn: "9787115488048", title: "数据库系统概论",       author: "王珊 萨师煊",       publisher: "高等教育出版社", location: "B区3排", total: 5, available: 3 },
    { isbn: "9787111640776", title: "计算机网络（第7版）",  author: "谢希仁",           publisher: "机械工业出版社", location: "B区4排", total: 4, available: 2 },
  ];
  for (const b of books) {
    db.run(`INSERT INTO library_books (isbn,title,author,publisher,location,total,available) VALUES (?,?,?,?,?,?,?)`,
      [b.isbn, b.title, b.author, b.publisher, b.location, b.total, b.available]);
  }
  console.log(`图书馆: ${seats.length} 区域, ${books.length} 册图书`);

  // ── 食堂（仅保留已接入智慧餐厅系统的三个食堂）────────────────────────────
  // 东校区：公三、公四；西校区：和二（跨校区同餐次不分配同一学生）
  const cafeterias = [
    { id: "CF03", name: "公三食堂", short_name: "公三", location: "东校区公寓三区南侧", campus: "东校区",
      hours: JSON.stringify({ breakfast: { open: "6:30", close: "10:00" }, lunch: { open: "10:30", close: "13:30" }, dinner: { open: "16:30", close: "19:30" } }) },
    { id: "CF04", name: "公四食堂", short_name: "公四", location: "东校区公寓四区南侧", campus: "东校区",
      hours: JSON.stringify({ breakfast: { open: "6:30", close: "10:00" }, lunch: { open: "10:30", close: "13:30" }, dinner: { open: "16:30", close: "19:30" } }) },
    { id: "CFHE2", name: "和二食堂", short_name: "和二", location: "西校区和园二区", campus: "西校区",
      hours: JSON.stringify({ breakfast: { open: "7:00", close: "9:30"  }, lunch: { open: "11:00", close: "13:30" }, dinner: { open: "17:00", close: "19:30" } }) },
  ];
  for (const c of cafeterias) {
    db.run(`INSERT INTO cafeterias (id,name,short_name,location,campus,hours) VALUES (?,?,?,?,?,?)`,
      [c.id, c.name, c.short_name, c.location, c.campus, c.hours]);
  }

  // 菜单（4天）
  const menuItems = [
    // 主食
    { name: "米饭",           price: 0.5,  calories: 116, category: "主食" },
    { name: "馒头",           price: 0.5,  calories: 231, category: "主食" },
    { name: "花卷",           price: 0.6,  calories: 210, category: "主食" },
    { name: "油条",           price: 1.0,  calories: 388, category: "主食" },
    { name: "小米粥",         price: 1.0,  calories: 46,  category: "主食" },
    // 荤菜
    { name: "红烧肉",         price: 8.0,  calories: 472, category: "荤菜" },
    { name: "糖醋里脊",       price: 9.0,  calories: 340, category: "荤菜" },
    { name: "宫保鸡丁",       price: 7.5,  calories: 285, category: "荤菜" },
    { name: "鱼香肉丝",       price: 6.5,  calories: 260, category: "荤菜" },
    { name: "番茄炒蛋",       price: 5.0,  calories: 150, category: "荤菜" },
    { name: "麻婆豆腐",       price: 4.5,  calories: 120, category: "荤菜" },
    { name: "红烧排骨",       price: 10.0, calories: 520, category: "荤菜" },
    { name: "清蒸鲈鱼",       price: 12.0, calories: 180, category: "荤菜" },
    // 素菜
    { name: "清炒白菜",       price: 2.5,  calories: 60,  category: "素菜" },
    { name: "蒜蓉菠菜",       price: 3.0,  calories: 50,  category: "素菜" },
    { name: "炒土豆丝",       price: 2.5,  calories: 95,  category: "素菜" },
    { name: "凉拌黄瓜",       price: 2.0,  calories: 35,  category: "素菜" },
    { name: "地三鲜",         price: 4.0,  calories: 130, category: "素菜" },
    // 汤/饮料
    { name: "紫菜蛋花汤",     price: 2.0,  calories: 48,  category: "汤" },
    { name: "酸辣汤",         price: 2.5,  calories: 65,  category: "汤" },
    { name: "豆浆",           price: 1.5,  calories: 54,  category: "饮料" },
    // 早餐
    { name: "鸡蛋",           price: 1.0,  calories: 78,  category: "早餐" },
    { name: "煎饼果子",       price: 4.0,  calories: 320, category: "早餐" },
    { name: "蒸饺（8个）",    price: 5.0,  calories: 360, category: "早餐" },
  ];
  let menuCount = 0;
  for (let d = 0; d < 4; d++) {
    const date = new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
    for (const cf of cafeterias) {
      const shuffled = [...menuItems].sort(() => Math.random() - 0.5).slice(0, 15);
      for (const item of shuffled) {
        db.run(`INSERT INTO cafeteria_menu (id,cafeteria_id,date,name,price,calories,category) VALUES (?,?,?,?,?,?,?)`,
          [id(), cf.id, date, item.name, item.price, item.calories, item.category]);
        menuCount++;
      }
    }
  }
  console.log(`食堂: ${cafeterias.length} 个，菜单: ${menuCount} 条`);

  // ── 智慧食堂消费记录 ──────────────────────────────────────────────────────
  const mealTypes = ["breakfast", "lunch", "dinner"];
  const txItems = [
    { name: "米饭+红烧肉+汤", price: 10.5, calories: 638, meal: "lunch" },
    { name: "米饭+宫保鸡丁+菠菜", price: 10.0, calories: 451, meal: "lunch" },
    { name: "米饭+番茄炒蛋+白菜", price: 7.5, calories: 326, meal: "lunch" },
    { name: "米饭+鱼香肉丝+汤", price: 9.0, calories: 422, meal: "lunch" },
    { name: "米饭+红烧排骨", price: 10.5, calories: 636, meal: "lunch" },
    { name: "煎饼果子+豆浆", price: 5.5, calories: 374, meal: "breakfast" },
    { name: "蒸饺+小米粥", price: 6.0, calories: 406, meal: "breakfast" },
    { name: "馒头+鸡蛋+豆浆", price: 3.0, calories: 363, meal: "breakfast" },
    { name: "米饭+地三鲜+蒜蓉菠菜", price: 8.0, calories: 296, meal: "dinner" },
    { name: "米饭+麻婆豆腐+黄瓜", price: 7.0, calories: 267, meal: "dinner" },
    { name: "花卷+红烧肉", price: 8.5, calories: 682, meal: "dinner" },
    { name: "糖醋里脊套餐", price: 9.5, calories: 456, meal: "dinner" },
  ];

  // S20253082026 专用高脂食物（近一个月重油重脂偏好，用于减肥分析演示）
  const highFatItems = {
    breakfast: [
      { name: "油条+鸡蛋+豆浆", price: 4.0, calories: 524 },
      { name: "煎饼果子+豆浆", price: 5.5, calories: 374 },
      { name: "油条+小米粥", price: 2.0, calories: 434 },
      { name: "蒸饺+煎蛋", price: 6.0, calories: 438 },
      { name: "煎饼果子+鸡蛋", price: 5.0, calories: 398 },
    ],
    lunch: [
      { name: "米饭+红烧肉+油条", price: 11.5, calories: 754 },
      { name: "米饭+红烧排骨+汤", price: 11.0, calories: 684 },
      { name: "米饭+红烧肉+汤", price: 10.5, calories: 638 },
      { name: "米饭+糖醋里脊+白菜", price: 11.5, calories: 551 },
      { name: "米饭+红烧排骨+地三鲜", price: 12.5, calories: 746 },
    ],
    dinner: [
      { name: "花卷+红烧肉+汤", price: 9.0, calories: 730 },
      { name: "米饭+红烧排骨+土豆丝", price: 12.0, calories: 711 },
      { name: "糖醋里脊套餐", price: 9.5, calories: 456 },
      { name: "花卷+红烧肉+地三鲜", price: 12.5, calories: 812 },
      { name: "米饭+红烧肉+炒土豆丝", price: 11.0, calories: 829 },
    ],
  };

  // 东/西校区食堂分组（同一天内只在同一校区用餐，避免跨校区冲突）
  const eastCafeterias  = cafeterias.filter(c => c.campus === "东校区");
  const westCafeterias  = cafeterias.filter(c => c.campus === "西校区");

  let txCount = 0;
  for (const s of students) {
    const isHighFatDemo = s.id === "S20253082026";
    for (let day = 30; day >= 0; day--) {
      // 每天选一个校区：S20253082026 以东校区为主（70%），其他学生随机
      const useEast = isHighFatDemo ? Math.random() < 0.7 : Math.random() < 0.5;
      const dayCafeterias = useEast ? eastCafeterias : westCafeterias;

      let mealsToday: number;
      let mealOrder: string[];
      if (isHighFatDemo) {
        mealsToday = day <= 3 ? 2 : 3;
        mealOrder = ["breakfast", "lunch", "dinner"].slice(0, mealsToday);
      } else {
        mealsToday = Math.random() < 0.85 ? Math.floor(Math.random() * 2) + 2 : Math.floor(Math.random() * 2);
        mealOrder = [...mealTypes].sort(() => Math.random() - 0.5).slice(0, mealsToday);
      }
      for (const meal of mealOrder) {
        // S20253082026 有约55%概率在智慧食堂刷卡（其余在外就餐或非智慧食堂）
        if (isHighFatDemo && Math.random() > 0.55) continue;

        let item: { name: string; price: number; calories: number };
        if (isHighFatDemo) {
          const pool = highFatItems[meal as keyof typeof highFatItems];
          item = Math.random() < 0.80
            ? pool[day % pool.length]
            : (() => { const m = txItems.filter(i => i.meal === meal); return m[day % m.length]; })();
        } else {
          const matchingItems = txItems.filter(i => i.meal === meal);
          if (matchingItems.length === 0) continue;
          item = matchingItems[Math.floor(Math.random() * matchingItems.length)];
        }
        // 同一天内随机在该校区的食堂之一用餐
        const cf = dayCafeterias[Math.floor(Math.random() * dayCafeterias.length)];
        const baseTime = daysAgo(day);
        const offset = meal === "breakfast" ? 7 * 3600 : meal === "lunch" ? 12 * 3600 : 18 * 3600;
        insertTransaction({
          student_id: s.id, cafeteria_id: cf.id,
          item_name: item.name, price: item.price, calories: item.calories,
          meal_type: meal, transaction_time: baseTime + offset + Math.floor(Math.random() * 1800),
        });
        txCount++;
      }
    }
  }
  console.log(`食堂消费记录: ${txCount} 条`);

  // ── 教室 / 会议室 ─────────────────────────────────────────────────────────
  const rooms = [
    // 第一教学楼教室
    { id: "R101", name: "101教室",  type: "classroom", building: "第一教学楼", floor: 1, capacity: 120, address: "东校区第一教学楼101室", campus: "东校区", facilities: "投影仪,空调,麦克风" },
    { id: "R102", name: "102教室",  type: "classroom", building: "第一教学楼", floor: 1, capacity: 120, address: "东校区第一教学楼102室", campus: "东校区", facilities: "投影仪,空调" },
    { id: "R201", name: "201教室",  type: "classroom", building: "第一教学楼", floor: 2, capacity: 80,  address: "东校区第一教学楼201室", campus: "东校区", facilities: "投影仪,空调" },
    { id: "R301", name: "301教室",  type: "classroom", building: "第一教学楼", floor: 3, capacity: 60,  address: "东校区第一教学楼301室", campus: "东校区", facilities: "投影仪,空调" },
    { id: "R501", name: "501研讨室", type: "meeting_room", building: "第一教学楼", floor: 5, capacity: 20, address: "东校区第一教学楼501室", campus: "东校区", facilities: "投影仪,空调,白板" },
    { id: "R502", name: "502研讨室", type: "meeting_room", building: "第一教学楼", floor: 5, capacity: 20, address: "东校区第一教学楼502室", campus: "东校区", facilities: "投影仪,空调,白板" },
    // 第二教学楼教室
    { id: "R203", name: "203教室",  type: "classroom", building: "第二教学楼", floor: 2, capacity: 100, address: "东校区第二教学楼203室", campus: "东校区", facilities: "投影仪,空调" },
    { id: "R302", name: "302教室",  type: "classroom", building: "第二教学楼", floor: 3, capacity: 60,  address: "东校区第二教学楼302室", campus: "东校区", facilities: "投影仪,空调" },
    { id: "R401", name: "401教室",  type: "classroom", building: "第二教学楼", floor: 4, capacity: 80,  address: "东校区第二教学楼401室", campus: "东校区", facilities: "投影仪,空调" },
    { id: "RMA",  name: "机房A",    type: "classroom", building: "第二教学楼", floor: 2, capacity: 60,  address: "东校区第二教学楼机房A", campus: "东校区", facilities: "电脑,投影仪,空调" },
    { id: "RMB",  name: "实验室B",  type: "classroom", building: "第二教学楼", floor: 2, capacity: 40,  address: "东校区第二教学楼实验室B", campus: "东校区", facilities: "示波器,电脑,空调" },
    // 第三教学楼
    { id: "R3301",name: "301教室",  type: "classroom", building: "第三教学楼", floor: 3, capacity: 80,  address: "东校区第三教学楼301室", campus: "东校区", facilities: "投影仪,空调" },
    { id: "R3401",name: "401教室",  type: "classroom", building: "第三教学楼", floor: 4, capacity: 60,  address: "东校区第三教学楼401室", campus: "东校区", facilities: "投影仪,空调" },
    { id: "R3501",name: "501研讨室", type: "meeting_room", building: "第三教学楼", floor: 5, capacity: 15, address: "东校区第三教学楼501室", campus: "东校区", facilities: "投影仪,空调,视频会议" },
    { id: "R3502",name: "502研讨室", type: "meeting_room", building: "第三教学楼", floor: 5, capacity: 15, address: "东校区第三教学楼502室", campus: "东校区", facilities: "投影仪,空调,视频会议" },
    { id: "R3503",name: "503研讨室", type: "meeting_room", building: "第三教学楼", floor: 5, capacity: 12, address: "东校区第三教学楼503室", campus: "东校区", facilities: "投影仪,空调" },
    // 信息与电气工程学院楼（信电楼）
    { id: "IE201", name: "201研讨室", type: "meeting_room", building: "信息与电气工程学院楼", floor: 2, capacity: 20, address: "东校区信电楼201室", campus: "东校区", facilities: "投影仪,空调,视频会议,白板" },
    { id: "IE301", name: "301研讨室", type: "meeting_room", building: "信息与电气工程学院楼", floor: 3, capacity: 15, address: "东校区信电楼301室", campus: "东校区", facilities: "投影仪,空调,白板" },
    { id: "IE561", name: "561会议室", type: "meeting_room", building: "信息与电气工程学院楼", floor: 5, capacity: 12, address: "东校区信电楼561室", campus: "东校区", facilities: "投影仪,空调,白板" },
    { id: "IE562", name: "562会议室", type: "meeting_room", building: "信息与电气工程学院楼", floor: 5, capacity: 8,  address: "东校区信电楼562室", campus: "东校区", facilities: "投影仪,空调" },
    { id: "IE563", name: "563会议室", type: "meeting_room", building: "信息与电气工程学院楼", floor: 5, capacity: 8,  address: "东校区信电楼563室", campus: "东校区", facilities: "空调,白板" },
  ];
  for (const r of rooms) {
    db.run(`INSERT INTO rooms (id,name,type,building,floor,capacity,address,campus,facilities) VALUES (?,?,?,?,?,?,?,?,?)`,
      [r.id, r.name, r.type, r.building, r.floor, r.capacity, r.address, r.campus, r.facilities]);
  }

  // 示例预约
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const reservations = [
    { sid: "S20213082001", rid: "R501", date: today,     start: "14:00", end: "16:00", purpose: "毕业设计讨论" },
    { sid: "S20223082002", rid: "R302", date: tomorrow,  start: "10:10", end: "12:00", purpose: "小组作业" },
    { sid: "Y20221082001", rid: "R3501",date: today,     start: "19:00", end: "21:00", purpose: "小组讨论" },
    { sid: "S20253082026", rid: "R201", date: tomorrow,  start: "14:00", end: "16:00", purpose: "复习备考" },
  ];
  for (const rv of reservations) {
    const student = db.query("SELECT name FROM students WHERE id = ?").get(rv.sid) as { name: string } | null;
    const room = db.query("SELECT address,type FROM rooms WHERE id = ?").get(rv.rid) as { address: string; type: string } | null;
    if (!student || !room) continue;
    const rId = id();
    db.run(`INSERT INTO room_reservations (id,student_id,room_id,date,start_time,end_time,purpose,status) VALUES (?,?,?,?,?,?,?,'confirmed')`,
      [rId, rv.sid, rv.rid, rv.date, rv.start, rv.end, rv.purpose]);
  }
  console.log(`教室/会议室: ${rooms.length} 间，预约示例: ${reservations.length} 条`);

  // ── 校车 ──────────────────────────────────────────────────────────────────
  const routeId = id();
  db.run(`INSERT INTO bus_routes (id,name,description) VALUES (?,?,?)`,
    [routeId, "东西校区班车", "中国农业大学东西校区对开班车，班车除特殊说明外均为东西校区同时对开"]);
  db.run(`INSERT INTO bus_stops (id,route_id,stop_name,sequence) VALUES (?,?,?,?)`, [id(), routeId, "东校区", 1]);
  db.run(`INSERT INTO bus_stops (id,route_id,stop_name,sequence) VALUES (?,?,?,?)`, [id(), routeId, "西校区", 2]);

  // 学期内 周一至周五 双向班次（东西同时对开）
  const weekdayBoth  = ["7:10","8:20","9:20","10:20","11:20","12:20","13:20","14:20","15:20","16:20","17:40","18:20"];
  // 学期内 特殊单向
  const weekdayE2W   = ["22:00"]; // 东→西
  const weekdayW2E   = ["22:30"]; // 西→东
  // 学期内 周六、周日 双向
  const weekendBoth  = ["7:20","11:30","13:00","17:00"];
  // 寒暑假/法定节假日 双向
  const holidayBoth  = ["8:00","11:30","13:00","17:00"];

  for (const t of weekdayBoth)  db.run(`INSERT INTO bus_schedules (id,route_id,departure_time,days,direction,schedule_type) VALUES (?,?,?,'1,2,3,4,5','both','semester')`,   [id(),routeId,t]);
  for (const t of weekdayE2W)   db.run(`INSERT INTO bus_schedules (id,route_id,departure_time,days,direction,schedule_type) VALUES (?,?,?,'1,2,3,4,5','east_to_west','semester')`, [id(),routeId,t]);
  for (const t of weekdayW2E)   db.run(`INSERT INTO bus_schedules (id,route_id,departure_time,days,direction,schedule_type) VALUES (?,?,?,'1,2,3,4,5','west_to_east','semester')`, [id(),routeId,t]);
  for (const t of weekendBoth)  db.run(`INSERT INTO bus_schedules (id,route_id,departure_time,days,direction,schedule_type) VALUES (?,?,?,'6,7','both','semester')`,          [id(),routeId,t]);
  for (const t of holidayBoth)  db.run(`INSERT INTO bus_schedules (id,route_id,departure_time,days,direction,schedule_type) VALUES (?,?,?,'1,2,3,4,5,6,7','both','holiday')`, [id(),routeId,t]);
  console.log("校车时刻表: 东西校区班车已配置（学期+假期）");

  // ── 校医院时刻表（真实数据）─────────────────────────────────────────────────
  // 东区：中国农业大学东区社区卫生服务中心  急诊：62736761  办公室：62737568
  // 西区：中国农业大学西区社区卫生服务中心  急诊：62732549  办公室：62732550
  // 门诊时间：上午 8:00-11:30 / 下午 13:30-17:00   急诊：24小时
  type ClinicEntry = { id: string; campus: string; department: string; day_type: string; start_time: string; end_time: string; location: string; notes: string };
  function clinicRows(campus: string, loc: string, emergencyPhone: string): ClinicEntry[] {
    const p = campus === "东校区" ? "东区" : "西区";
    return [
      { id: id(), campus, department: "内科",     day_type: "weekday", start_time: "8:00",  end_time: "11:30", location: `${loc}内科诊室`,   notes: "上午 王大夫，下午（13:30-17:00）李大夫" },
      { id: id(), campus, department: "外科",     day_type: "weekday", start_time: "8:00",  end_time: "11:30", location: `${loc}外科诊室`,   notes: "上午 张大夫，下午（13:30-17:00）刘大夫" },
      { id: id(), campus, department: "妇科",     day_type: "weekday", start_time: "8:00",  end_time: "11:30", location: `${loc}妇科诊室`,   notes: "出诊医生：周大夫；仅限女生，需实名挂号" },
      { id: id(), campus, department: "五官科",   day_type: "weekday", start_time: "8:00",  end_time: "11:30", location: `${loc}五官科`,     notes: "眼耳鼻喉，出诊医生：陈大夫；下午（13:30-17:00）亦可就诊" },
      { id: id(), campus, department: "中医科",   day_type: "weekday", start_time: "8:00",  end_time: "11:30", location: `${loc}中医诊室`,   notes: "出诊医生：赵大夫；下午（13:30-17:00）出诊" },
      { id: id(), campus, department: "皮肤科",   day_type: "weekday", start_time: "8:00",  end_time: "11:30", location: `${loc}皮肤科诊室`, notes: "出诊医生：吴大夫；下午（13:30-17:00）出诊" },
      { id: id(), campus, department: "口腔科",   day_type: "weekday", start_time: "8:00",  end_time: "11:30", location: `${loc}口腔科`,     notes: "出诊医生：孙大夫；下午（13:30-17:00）出诊；建议提前预约" },
      { id: id(), campus, department: "儿科",     day_type: "weekday", start_time: "8:00",  end_time: "11:30", location: `${loc}儿科诊室`,   notes: "出诊医生：林大夫；下午（13:30-17:00）出诊" },
      { id: id(), campus, department: "预防保健科", day_type: "weekday", start_time: "8:00", end_time: "11:30", location: `${loc}预防保健科`, notes: "疫苗接种、健康证明等；下午（13:30-17:00）出诊" },
      { id: id(), campus, department: "药房",     day_type: "weekday", start_time: "8:00",  end_time: "17:00", location: `${loc}药房`,       notes: "凭处方取药，下午13:30-17:00持续营业" },
      { id: id(), campus, department: "检验科",   day_type: "weekday", start_time: "8:00",  end_time: "11:30", location: `${loc}检验科`,     notes: "抽血化验需空腹，下午（13:30-16:00）亦可取报告" },
      { id: id(), campus, department: "放射科",   day_type: "weekday", start_time: "8:00",  end_time: "11:30", location: `${loc}放射科`,     notes: "拍片需医生开具申请单；下午（13:30-17:00）出诊" },
      { id: id(), campus, department: "急诊室",   day_type: "always",  start_time: "00:00", end_time: "23:59", location: `${loc}急诊室`,     notes: `24小时开诊；急诊电话 ${emergencyPhone}；危重症转协和医院` },
    ];
  }
  const clinicSchedules: ClinicEntry[] = [
    ...clinicRows("东校区", "东区校医院（东区社区卫生服务中心）", "62736761"),
    ...clinicRows("西校区", "西区校医院（西区社区卫生服务中心）", "62732549"),
  ];
  for (const c of clinicSchedules) {
    db.run(`INSERT INTO clinic_schedule (id,campus,department,day_type,start_time,end_time,location,notes) VALUES (?,?,?,?,?,?,?,?)`,
      [c.id, c.campus, c.department, c.day_type, c.start_time, c.end_time, c.location, c.notes]);
  }
  console.log(`校医院时刻表: ${clinicSchedules.length} 条`);

  // ── 校园卡 ────────────────────────────────────────────────────────────────
  const balances: Record<string, [number, number]> = {
    "S20213082001": [128.50, 45.00],
    "S20223082002": [256.80, 32.00],
    "S20233082003": [89.30,  18.50],
    "S20243082004": [312.00, 60.00],
    "S20253082026": [485.20, 85.00],
    "S20213082006": [67.90,  12.00],
    "Y20221082001": [523.40, 90.00],
    "Y20241082002": [190.00, 35.00],
    "Y20231082003": [78.60,  15.00],
    "Y20221082004": [445.70, 78.00],
  };
  for (const s of students) {
    const [bal, net] = balances[s.id] ?? [200, 50];
    db.run(`INSERT INTO campus_cards (student_id,balance,net_balance) VALUES (?,?,?)`, [s.id, bal, net]);
  }
  console.log(`校园卡: ${students.length} 张`);

  // ── 报修工单 ──────────────────────────────────────────────────────────────
  const repairs = [
    { sid: "S20213082001", dorm: "研1-301", cat: "水电",  desc: "卫生间灯泡损坏，无法正常照明",     status: "done" },
    { sid: "S20223082002", dorm: "研1-215", cat: "网络",  desc: "网口松动，网络频繁掉线",            status: "in_progress" },
    { sid: "S20233082003", dorm: "研2-418", cat: "空调",  desc: "空调不制冷，已持续一周",            status: "pending" },
    { sid: "S20253082026", dorm: "研3-506", cat: "家具",  desc: "书桌椅腿松动，存在安全隐患",        status: "pending" },
    { sid: "Y20221082001", dorm: "东1-201", cat: "门窗",  desc: "宿舍窗户关不严，影响睡眠",          status: "pending" },
  ];
  for (const r of repairs) {
    db.run(`INSERT INTO repair_tickets (id,student_id,dorm_room,category,description,status) VALUES (?,?,?,?,?,?)`,
      [id(), r.sid, r.dorm, r.cat, r.desc, r.status]);
  }
  console.log(`报修工单: ${repairs.length} 条`);

  // ── 教师 T009 林晓东 科研数据 ─────────────────────────────────────────────
  const T009 = "T009";

  // 特色论文（关键演示用）
  type PaperRow = { title: string; journal: string; year: number; authors: string; keywords: string; region: string; cited: number };
  const keyPapers: PaperRow[] = [
    { title: "基于深度学习的小麦多病害实时检测方法", journal: "农业工程学报", year: 2024, authors: "林晓东,张宇,陈浩", keywords: "深度学习,病害检测,小麦,YOLO", region: "国内", cited: 82 },
    { title: "具身智能体在非结构化农业环境中的自主导航", journal: "自动化学报", year: 2024, authors: "林晓东,刘阳,孙明", keywords: "具身智能,农业机器人,导航", region: "国内", cited: 56 },
    { title: "Embodied AI for Agricultural Robot Navigation in Unstructured Environments", journal: "IEEE Robotics and Automation Letters", year: 2024, authors: "Lin X., Wang H., Chan T.L.", keywords: "embodied AI,agriculture,robot navigation", region: "港澳（香港科技大学合作）", cited: 89 },
    { title: "Vision Transformer在作物表型高通量分析中的应用综述", journal: "IEEE Transactions on Geoscience and Remote Sensing", year: 2023, authors: "林晓东,李晨,Zhao W.", keywords: "ViT,作物表型,遥感,综述", region: "港澳（香港中文大学合作）", cited: 143 },
    { title: "面向精准施药的多光谱图像分析与病害识别", journal: "Computers and Electronics in Agriculture", year: 2022, authors: "Lin X., Chen Y., Wang B.", keywords: "多光谱,精准施药,病害识别", region: "国际", cited: 201 },
    { title: "基于视觉SLAM的自主农机田间路径规划", journal: "农业机械学报", year: 2022, authors: "林晓东,周强,张磊", keywords: "视觉SLAM,路径规划,农机自动化", region: "国内", cited: 67 },
    { title: "YOLOv8改进模型在果实识别与分级中的应用", journal: "计算机工程与应用", year: 2023, authors: "林晓东,王涛,李磊", keywords: "YOLOv8,目标检测,果实识别", region: "国内", cited: 45 },
    { title: "深度强化学习驱动的植保无人机自主避障", journal: "航空学报", year: 2023, authors: "林晓东,孙飞,赵宇", keywords: "深度强化学习,无人机,避障", region: "国内", cited: 38 },
    { title: "多模态感知融合在智慧温室管理中的应用", journal: "智慧农业（中英文）", year: 2024, authors: "林晓东,陈明,刘芳", keywords: "多模态,温室管理,物联网", region: "国内", cited: 24 },
    { title: "基于图神经网络的农作物产量预测模型", journal: "计算机学报", year: 2023, authors: "林晓东,张博,王晨", keywords: "图神经网络,产量预测,农业AI", region: "国内", cited: 52 },
    { title: "轻量化卷积神经网络在边缘设备作物病害检测中的部署", journal: "软件学报", year: 2022, authors: "林晓东,赵磊,孙强", keywords: "轻量化CNN,边缘计算,病害检测", region: "国内", cited: 76 },
    { title: "Crop Disease Detection via Federated Learning on Edge Devices", journal: "IEEE Internet of Things Journal", year: 2022, authors: "Lin X., Zhang Y., Li H.", keywords: "federated learning,crop disease,edge AI", region: "港澳（香港大学合作）", cited: 115 },
    { title: "基于点云数据的果树三维重建与枝条识别", journal: "光学精密工程", year: 2021, authors: "林晓东,刘明,陈希", keywords: "点云,三维重建,果树修剪", region: "国内", cited: 41 },
    { title: "具身导航中的动态障碍物预测与规避", journal: "机器人", year: 2024, authors: "林晓东,周杰,余浩", keywords: "具身导航,障碍物预测,农业机器人", region: "国内", cited: 19 },
    { title: "多源遥感与地面视觉融合的农田信息提取", journal: "遥感学报", year: 2021, authors: "林晓东,王磊,高明", keywords: "遥感融合,农田信息,视觉感知", region: "国内", cited: 88 },
    { title: "Smart Greenhouse Automation Using Deep Vision and Multi-Sensor Fusion", journal: "IEEE Access", year: 2023, authors: "Lin X., Lam K.Y., Chen B.", keywords: "greenhouse,deep vision,automation", region: "港澳（香港理工大学合作）", cited: 67 },
    { title: "Precision Agriculture in South China: A Deep Learning Survey", journal: "Remote Sensing", year: 2022, authors: "Lin X., Wu J., Zhao W.", keywords: "precision agriculture,deep learning,survey", region: "港澳（香港中文大学合作）", cited: 93 },
    { title: "Field Robot Path Planning via Deep Reinforcement Learning", journal: "Robotics and Autonomous Systems", year: 2022, authors: "Lin X., Chan T., Liu Y.", keywords: "path planning,reinforcement learning,field robot", region: "港澳（香港科技大学合作）", cited: 78 },
    { title: "Transfer Learning for Cross-Region Crop Classification", journal: "ISPRS Journal of Photogrammetry and Remote Sensing", year: 2021, authors: "Lin X., Ng S., Wang Z.", keywords: "transfer learning,crop classification,remote sensing", region: "港澳（香港大学合作）", cited: 102 },
    { title: "边缘计算在智慧农业传感网络中的协同部署", journal: "通信学报", year: 2020, authors: "林晓东,黄飞,陈力", keywords: "边缘计算,传感网络,智慧农业", region: "港澳", cited: 45 },
  ];

  const genericJournals = [
    "农业工程学报","农业机械学报","中国农业科学","计算机学报","软件学报",
    "自动化学报","控制与决策","模式识别与人工智能","信息与控制","电子学报",
    "Computers and Electronics in Agriculture","Biosystems Engineering",
    "Precision Agriculture","Agricultural Systems","Remote Sensing",
    "IEEE Access","Sensors","Expert Systems with Applications",
  ];
  const genericTitleTemplates = [
    "基于{A}的{B}识别方法研究",
    "{A}在{B}中的应用与优化",
    "面向{A}的{B}算法设计",
    "{A}融合的智能农业{B}系统",
    "基于{A}的农业大数据{B}方法",
  ];
  const fillerA = ["注意力机制","Transformer","图神经网络","自监督学习","对比学习","知识蒸馏","神经架构搜索","扩散模型"];
  const fillerB = ["作物病害检测","产量预测","表型分析","田间导航","精准施肥","除草识别","病虫害预警","农机调度"];
  function pickR<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

  let pCount = 0;
  for (const p of keyPapers) {
    db.run(`INSERT INTO teacher_papers (id,teacher_id,title,journal,year,authors,keywords,region,citation_count) VALUES (?,?,?,?,?,?,?,?,?)`,
      [id(), T009, p.title, p.journal, p.year, p.authors, p.keywords, p.region, p.cited]);
    pCount++;
  }
  while (pCount < 86) {
    const tmpl = genericTitleTemplates[pCount % genericTitleTemplates.length];
    const title = tmpl.replace("{A}", pickR(fillerA)).replace("{B}", pickR(fillerB));
    const yr = 2020 + (pCount % 6);
    const isHK = pCount % 11 === 0;
    const region = isHK ? "港澳" : (pCount % 7 === 0 ? "国际" : "国内");
    const cited = Math.floor(10 + Math.random() * 60);
    db.run(`INSERT INTO teacher_papers (id,teacher_id,title,journal,year,authors,keywords,region,citation_count) VALUES (?,?,?,?,?,?,?,?,?)`,
      [id(), T009, title, pickR(genericJournals), yr, `林晓东,${pickR(["张伟","李明","王芳","陈强","刘洋"])}`, "计算机视觉,智慧农业", region, cited]);
    pCount++;
  }
  console.log(`T009 论文: ${pCount} 篇`);

  // ── T001-T008 其余教师论文（每人 5-6 篇，各含 ≥1 篇港澳合作）────────────────
  type OtherPaper = { teacher_id: string; title: string; journal: string; year: number; authors: string; keywords: string; region: string; cited: number };
  const otherPapers: OtherPaper[] = [
    // T001 张志远 — 智能控制,机器人系统,强化学习
    { teacher_id:"T001", title:"基于深度强化学习的工业机器人自适应控制方法",              journal:"自动化学报",          year:2024, authors:"张志远,李强,王明",     keywords:"深度强化学习,工业机器人,自适应控制", region:"国内",                        cited:47 },
    { teacher_id:"T001", title:"多智能体协同控制在智能制造中的应用",                      journal:"控制与决策",          year:2023, authors:"张志远,陈磊",          keywords:"多智能体,协同控制,智能制造",          region:"国内",                        cited:33 },
    { teacher_id:"T001", title:"Adaptive Reinforcement Learning for Robotic Arm Control in Unstructured Environments", journal:"IEEE Transactions on Industrial Electronics", year:2023, authors:"Zhang Z., Li Q., Chan W.K.", keywords:"reinforcement learning,robotic arm,adaptive control", region:"港澳（香港城市大学合作）", cited:68 },
    { teacher_id:"T001", title:"面向农业采摘的柔性机器人力觉感知与控制",                  journal:"机器人",              year:2022, authors:"张志远,孙辉,刘洋",     keywords:"柔性机器人,力觉感知,采摘",           region:"国内",                        cited:28 },
    { teacher_id:"T001", title:"强化学习在移动机器人路径规划中的研究进展",                journal:"控制理论与应用",      year:2022, authors:"张志远,王博",          keywords:"强化学习,移动机器人,路径规划",        region:"国内",                        cited:54 },
    { teacher_id:"T001", title:"多模态传感融合的机器人抓取策略研究",                      journal:"信息与控制",          year:2021, authors:"张志远,陈明,高飞",     keywords:"多模态,传感融合,机器人抓取",          region:"国内",                        cited:31 },

    // T002 李敏华 — 嵌入式系统,物联网,边缘计算
    { teacher_id:"T002", title:"基于异构边缘计算架构的物联网实时推断优化",                journal:"计算机学报",          year:2024, authors:"李敏华,张宇,孙强",     keywords:"边缘计算,物联网,实时推断",           region:"国内",                        cited:39 },
    { teacher_id:"T002", title:"Lightweight Neural Network Deployment on Resource-Constrained IoT Devices", journal:"IEEE Internet of Things Journal", year:2024, authors:"Li M., Cheung K.L., Zhang Y.", keywords:"IoT,edge inference,lightweight model", region:"港澳（澳门大学合作）",           cited:72 },
    { teacher_id:"T002", title:"面向智慧农业的低功耗传感器网络协议设计",                  journal:"电子学报",            year:2023, authors:"李敏华,王涛,陈鑫",     keywords:"低功耗,传感网络,智慧农业",           region:"国内",                        cited:26 },
    { teacher_id:"T002", title:"嵌入式FPGA在农业图像处理加速中的应用",                    journal:"计算机工程与应用",    year:2022, authors:"李敏华,刘旭",          keywords:"FPGA,嵌入式,图像处理加速",           region:"国内",                        cited:19 },
    { teacher_id:"T002", title:"Edge-Cloud Collaborative Framework for Smart Greenhouse Monitoring", journal:"IEEE Access",   year:2023, authors:"Li M., Wong T.Y., Sun Q.", keywords:"edge-cloud,greenhouse,IoT", region:"港澳（香港大学合作）",           cited:51 },
    { teacher_id:"T002", title:"物联网终端安全启动与可信执行环境研究",                    journal:"信息安全学报",        year:2021, authors:"李敏华,赵磊,周强",     keywords:"物联网安全,可信执行环境,嵌入式",      region:"国内",                        cited:22 },

    // T003 王建国 — 程序设计,软件工程,系统开发
    { teacher_id:"T003", title:"面向大规模分布式系统的微服务架构演化方法",                journal:"软件学报",            year:2024, authors:"王建国,李敏,张博",     keywords:"微服务,分布式系统,架构演化",          region:"国内",                        cited:43 },
    { teacher_id:"T003", title:"基于形式化方法的关键系统软件需求验证框架",                journal:"计算机学报",          year:2023, authors:"王建国,陈刚",          keywords:"形式化方法,需求验证,关键系统",        region:"国内",                        cited:29 },
    { teacher_id:"T003", title:"Automated Code Review Using Large Language Models: A Case Study", journal:"Journal of Systems and Software", year:2024, authors:"Wang J., Lam P.Y., Li M.", keywords:"LLM,code review,software engineering", region:"港澳（香港科技大学合作）",   cited:88 },
    { teacher_id:"T003", title:"DevSecOps实践：持续集成安全门禁机制研究",                journal:"计算机研究与发展",    year:2022, authors:"王建国,刘旭,孙强",     keywords:"DevSecOps,CI/CD,安全门禁",           region:"国内",                        cited:18 },
    { teacher_id:"T003", title:"Collaborative Software Development Practices in Remote Teams", journal:"Information and Software Technology", year:2023, authors:"Wang J., Chan C.H., Zhang B.", keywords:"remote development,collaboration,agile", region:"港澳（澳门科技大学合作）", cited:35 },
    { teacher_id:"T003", title:"面向农业管理信息系统的领域模型设计方法",                  journal:"农业机械学报",        year:2021, authors:"王建国,赵华,郑磊",     keywords:"农业信息系统,领域建模,系统设计",      region:"国内",                        cited:14 },

    // T004 赵明远 — 数值分析,优化算法,数学建模
    { teacher_id:"T004", title:"基于深度展开网络的迭代优化算法加速研究",                  journal:"计算数学",            year:2024, authors:"赵明远,张志,刘强",     keywords:"深度展开,迭代优化,算法加速",          region:"国内",                        cited:52 },
    { teacher_id:"T004", title:"大规模稀疏线性方程组的并行预处理方法",                    journal:"数值计算与计算机应用",year:2023, authors:"赵明远,王涛",          keywords:"稀疏线性系统,并行预处理,数值计算",    region:"国内",                        cited:31 },
    { teacher_id:"T004", title:"Convergence Analysis of Stochastic Gradient Descent Variants in Non-Convex Settings", journal:"Mathematics of Computation", year:2023, authors:"Zhao M., Li W., Wu G.", keywords:"SGD,convergence,non-convex optimization", region:"港澳（香港中文大学合作）", cited:97 },
    { teacher_id:"T004", title:"农业系统多目标优化模型与求解策略",                        journal:"中国农业科学",        year:2022, authors:"赵明远,陈浩,孙飞",     keywords:"多目标优化,农业系统,模型求解",        region:"国内",                        cited:24 },
    { teacher_id:"T004", title:"Numerical Methods for Partial Differential Equations in Agricultural Diffusion Models", journal:"Applied Mathematics and Computation", year:2022, authors:"Zhao M., Chan T.F., Liu Y.", keywords:"PDE,numerical methods,agricultural model", region:"港澳（香港理工大学合作）", cited:61 },
    { teacher_id:"T004", title:"自适应步长梯度法在大规模机器学习中的应用",                journal:"应用数学学报",        year:2021, authors:"赵明远,李磊,张强",     keywords:"自适应步长,梯度法,机器学习",          region:"国内",                        cited:38 },

    // T005 刘芳芳 — 计算机视觉,图像处理,模式识别
    { teacher_id:"T005", title:"面向遥感图像的小目标检测与分割方法",                      journal:"遥感学报",            year:2024, authors:"刘芳芳,陈博,李晨",     keywords:"遥感,小目标检测,图像分割",           region:"国内",                        cited:41 },
    { teacher_id:"T005", title:"基于Diffusion Model的医学图像增强研究",                   journal:"模式识别与人工智能",  year:2024, authors:"刘芳芳,王磊",          keywords:"扩散模型,医学图像,图像增强",          region:"国内",                        cited:56 },
    { teacher_id:"T005", title:"Multi-Scale Feature Fusion for Agricultural Pest Recognition", journal:"Computers and Electronics in Agriculture", year:2023, authors:"Liu F., Zhang W., Leung K.H.", keywords:"multi-scale,pest recognition,CNN", region:"港澳（香港城市大学合作）", cited:73 },
    { teacher_id:"T005", title:"视频目标跟踪中的遮挡处理策略综述",                        journal:"计算机学报",          year:2022, authors:"刘芳芳,赵鑫,孙宇",     keywords:"视频跟踪,遮挡处理,综述",             region:"国内",                        cited:47 },
    { teacher_id:"T005", title:"三维点云语义分割在农业场景中的应用",                      journal:"中国图象图形学报",    year:2022, authors:"刘芳芳,陈力,高明",     keywords:"点云,语义分割,农业场景",             region:"国内",                        cited:29 },

    // T006 陈伟达 — 计算机网络,分布式系统,云计算
    { teacher_id:"T006", title:"面向农业物联网的低延迟边缘网络调度策略",                  journal:"通信学报",            year:2024, authors:"陈伟达,李磊,张博",     keywords:"物联网,边缘网络,低延迟调度",          region:"国内",                        cited:35 },
    { teacher_id:"T006", title:"分布式存储系统的数据一致性协议优化",                      journal:"计算机研究与发展",    year:2023, authors:"陈伟达,孙强,刘涛",     keywords:"分布式存储,一致性协议,优化",          region:"国内",                        cited:28 },
    { teacher_id:"T006", title:"Cloud-Edge Resource Orchestration for Time-Sensitive Agricultural Applications", journal:"IEEE Transactions on Cloud Computing", year:2023, authors:"Chen W., Ng M.K., Li L.", keywords:"cloud-edge,resource orchestration,latency", region:"港澳（香港大学合作）", cited:59 },
    { teacher_id:"T006", title:"区块链在农产品溯源中的可信存储机制研究",                  journal:"软件学报",            year:2022, authors:"陈伟达,赵磊,王明",     keywords:"区块链,溯源,可信存储",               region:"国内",                        cited:42 },
    { teacher_id:"T006", title:"基于SDN的校园网络流量优化与安全管理",                     journal:"计算机工程",          year:2021, authors:"陈伟达,刘旭",          keywords:"SDN,校园网,流量优化",               region:"国内",                        cited:17 },

    // T007 周海涛 — 深度学习,具身智能,机器人控制,强化学习
    { teacher_id:"T007", title:"具身大模型在农业操作任务中的迁移能力评估",                journal:"自动化学报",          year:2024, authors:"周海涛,陈博,李晨",     keywords:"具身大模型,农业操作,迁移学习",        region:"国内",                        cited:63 },
    { teacher_id:"T007", title:"基于Transformer的机器人运动规划方法",                     journal:"机器人",              year:2024, authors:"周海涛,王磊,刘强",     keywords:"Transformer,机器人,运动规划",         region:"国内",                        cited:44 },
    { teacher_id:"T007", title:"Embodied Language Grounding for Agricultural Task Completion", journal:"IEEE Robotics and Automation Letters", year:2024, authors:"Zhou H., Chan T.L., Li C.", keywords:"embodied AI,language grounding,agriculture", region:"港澳（香港科技大学合作）", cited:91 },
    { teacher_id:"T007", title:"深度强化学习在连续动作空间机器人控制中的稳定性分析",      journal:"控制与决策",          year:2023, authors:"周海涛,孙飞,赵宇",     keywords:"深度强化学习,连续动作空间,稳定性",    region:"国内",                        cited:37 },
    { teacher_id:"T007", title:"Multi-Task Reinforcement Learning for Agro-Robotic Systems", journal:"Neural Networks",   year:2023, authors:"Zhou H., Wu G., Zhang Y.", keywords:"multi-task RL,agricultural robot,deep learning", region:"港澳（澳门大学合作）", cited:55 },
    { teacher_id:"T007", title:"视觉-语言-动作三模态融合的具身导航框架",                  journal:"软件学报",            year:2022, authors:"周海涛,林晓东,陈明",   keywords:"多模态融合,具身导航,视觉语言",        region:"国内",                        cited:48 },

    // T008 吴国平 — 随机过程,统计学习,数据分析
    { teacher_id:"T008", title:"高维时间序列的因果推断与变点检测方法",                    journal:"应用数学学报",        year:2024, authors:"吴国平,刘明,张磊",     keywords:"高维时间序列,因果推断,变点检测",      region:"国内",                        cited:45 },
    { teacher_id:"T008", title:"非参数贝叶斯方法在农业产量预测中的应用",                  journal:"中国农业科学",        year:2023, authors:"吴国平,陈浩,李晨",     keywords:"非参数贝叶斯,产量预测,统计学习",      region:"国内",                        cited:32 },
    { teacher_id:"T008", title:"Bayesian Nonparametric Methods for High-Dimensional Crop Data Analysis", journal:"The Annals of Applied Statistics", year:2023, authors:"Wu G., Zhao M., Lam K.W.", keywords:"Bayesian,high-dimensional,crop data", region:"港澳（香港中文大学合作）", cited:84 },
    { teacher_id:"T008", title:"基于马尔可夫链蒙特卡洛的复杂系统参数估计",                journal:"数理统计与管理",      year:2022, authors:"吴国平,孙强",          keywords:"MCMC,参数估计,复杂系统",             region:"国内",                        cited:27 },
    { teacher_id:"T008", title:"Spectral Methods for Hidden Markov Models in Agricultural Monitoring", journal:"Journal of the Royal Statistical Society", year:2022, authors:"Wu G., Chan H.Y., Liu Y.", keywords:"spectral methods,HMM,agricultural monitoring", region:"港澳（香港理工大学合作）", cited:67 },
    { teacher_id:"T008", title:"随机微分方程在农作物生长模型中的建模与分析",              journal:"生物数学学报",        year:2021, authors:"吴国平,赵明远,张博",   keywords:"随机微分方程,生长模型,农作物",        region:"国内",                        cited:21 },

  ];
  let otherPCount = 0;
  for (const p of otherPapers) {
    db.run(`INSERT INTO teacher_papers (id,teacher_id,title,journal,year,authors,keywords,region,citation_count) VALUES (?,?,?,?,?,?,?,?,?)`,
      [id(), p.teacher_id, p.title, p.journal, p.year, p.authors, p.keywords, p.region, p.cited]);
    otherPCount++;
  }
  console.log(`T001-T008 论文: ${otherPCount} 篇（每位含 ≥1 篇港澳合作）`);

  // ── T009 知识产权（发明专利18 + 实用新型5 + 软件著作权13 = 36）────────────
  type PatentRow = { title: string; type: string; cert: string | null; year: number; region: string; keywords: string; status: string };
  const keyPatents: PatentRow[] = [
    { title: "基于深度学习的农作物病害快速检测装置及方法", type: "发明专利", cert: "ZL202310234567.1", year: 2023, region: "国内", keywords: "病害检测,深度学习", status: "有效" },
    { title: "一种用于田间作业的具身智能农业机器人", type: "发明专利", cert: "ZL202410123456.8", year: 2024, region: "国内", keywords: "具身智能,农业机器人", status: "有效" },
    { title: "多光谱图像融合的精准施药决策系统及方法", type: "发明专利", cert: "ZL202210987654.3", year: 2022, region: "国内", keywords: "多光谱,精准施药", status: "有效" },
    { title: "基于视觉SLAM的农机自主导航装置", type: "发明专利", cert: "ZL202110654321.0", year: 2021, region: "国内", keywords: "SLAM,农机导航", status: "有效" },
    { title: "一种轻量化边缘计算病害识别芯片架构", type: "发明专利", cert: "ZL202210111222.5", year: 2022, region: "国内", keywords: "边缘计算,芯片设计", status: "有效" },
    { title: "Smart Crop Disease Detection System Based on Federated Learning", type: "发明专利", cert: "HK30045678A", year: 2022, region: "港澳（香港专利局）", keywords: "federated learning,crop disease", status: "有效" },
    { title: "具身智能农业导航方法及控制系统", type: "发明专利", cert: "ZL202410567890.2", year: 2024, region: "国内", keywords: "具身智能,导航控制", status: "有效" },
    { title: "果实智能分级识别装置及其控制方法", type: "发明专利", cert: "ZL202310789012.6", year: 2023, region: "国内", keywords: "果实分级,目标识别", status: "有效" },
    { title: "一种农田三维点云快速获取与处理方法", type: "发明专利", cert: "ZL202110345678.9", year: 2021, region: "国内", keywords: "点云处理,三维感知", status: "有效" },
    { title: "基于联邦学习的分布式农业AI模型训练方法", type: "发明专利", cert: "HK30056789B", year: 2023, region: "港澳（香港专利局）", keywords: "联邦学习,分布式AI", status: "有效" },
    { title: "果实智能采摘机器人末端执行器", type: "实用新型", cert: "ZL202320567890.X", year: 2023, region: "国内", keywords: "采摘机器人,末端执行器", status: "有效" },
    { title: "温室智慧巡检无人车底盘结构", type: "实用新型", cert: "ZL202220345678.4", year: 2022, region: "国内", keywords: "温室,巡检机器人", status: "有效" },
    { title: "多节点农田传感信息采集装置", type: "实用新型", cert: "ZL202120234567.2", year: 2021, region: "国内", keywords: "传感器,农田采集", status: "有效" },
    { title: "农业病害图像数据增强软件", type: "软件著作权", cert: "软著登字第2021SR234567号", year: 2021, region: "国内", keywords: "数据增强,病害图像", status: "有效" },
    { title: "智慧农业机器人仿真训练平台", type: "软件著作权", cert: "软著登字第2022SR345678号", year: 2022, region: "国内", keywords: "仿真平台,机器人训练", status: "有效" },
    { title: "作物表型高通量分析软件系统", type: "软件著作权", cert: "软著登字第2023SR456789号", year: 2023, region: "国内", keywords: "表型分析,高通量", status: "有效" },
    { title: "田间路径规划与自主导航管理系统", type: "软件著作权", cert: "软著登字第2022SR567890号", year: 2022, region: "港澳（香港专利局备案）", keywords: "路径规划,自主导航", status: "有效" },
    { title: "农业病虫害智能识别与预警平台", type: "软件著作权", cert: "软著登字第2021SR678901号", year: 2021, region: "国内", keywords: "病虫害,预警平台", status: "有效" },
  ];

  const ipNouns = ["视觉感知","多光谱","激光雷达","点云","语义分割","目标跟踪","异常检测","产量预测"];
  const ipVerbs = ["识别","检测","分析","预测","分类","定位","重建","规划"];
  function pickI<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

  let ipCount = 0;
  for (const p of keyPatents) {
    db.run(`INSERT INTO teacher_patents (id,teacher_id,title,type,cert_number,year,region,keywords,status) VALUES (?,?,?,?,?,?,?,?,?)`,
      [id(), T009, p.title, p.type, p.cert, p.year, p.region, p.keywords, p.status]);
    ipCount++;
  }
  // 补充发明专利至18项（已有10个）、实用新型至5项（已有3个）、软著至13项（已有5个）
  const ipFillSpec: { type: string; current: number; target: number }[] = [
    { type: "发明专利",   current: 10, target: 18 },
    { type: "实用新型",   current: 3,  target: 5  },
    { type: "软件著作权", current: 5,  target: 13 },
  ];
  for (const spec of ipFillSpec) {
    let cnt = spec.current;
    while (cnt < spec.target) {
      const title = spec.type === "发明专利"
        ? `基于${pickI(ipNouns)}的农业${pickI(ipVerbs)}方法及系统`
        : spec.type === "实用新型"
        ? `一种${pickI(ipNouns)}农业辅助装置`
        : `智慧农业${pickI(ipNouns)}${pickI(ipVerbs)}管理系统`;
      const yr = 2020 + (cnt % 5);
      db.run(`INSERT INTO teacher_patents (id,teacher_id,title,type,cert_number,year,region,keywords,status) VALUES (?,?,?,?,?,?,?,?,?)`,
        [id(), T009, title, spec.type, null, yr, "国内", "智慧农业,计算机视觉", "有效"]);
      cnt++; ipCount++;
    }
  }
  console.log(`T009 知识产权: ${ipCount} 项（发明专利 ${keyPatents.filter(p=>p.type==="发明专利").length}+${18-keyPatents.filter(p=>p.type==="发明专利").length}，实用新型 5，软著 13）`);

  // ── 开放课题/项目申报 ─────────────────────────────────────────────────────
  const openProjectsData = [
    {
      id: id(), title: "国家自然科学基金面上项目：基于具身大模型的农业机器人自主作业研究",
      source: "国家自然科学基金委员会", category: "国家级基金",
      deadline: "2026-09-20", amount: "60-80万元",
      description: "研究具身大模型在非结构化农业环境下的感知-决策-执行闭环机制，实现农业机器人的通用化自主作业能力。",
      requirements: "申请人须为副高级及以上职称，近五年有相关领域高水平论文。课题组需有农学或生命科学背景成员协同。",
      contact: "nsfc-agri@nsfc.gov.cn / 010-62317474",
    },
    {
      id: id(), title: "科技部重点研发计划：智慧农业视觉感知与精准作业关键技术研究",
      source: "科学技术部", category: "国家级重点研发",
      deadline: "2026-05-30", amount: "200-500万元",
      description: "面向粮食安全战略需求，突破智慧农业核心视觉感知技术，研发面向小麦/水稻/玉米的病虫害实时检测与精准施药系统。",
      requirements: "牵头单位须具备农业机械领域工程化能力，参与单位应覆盖高校、科研院所及涉农企业。",
      contact: "agri-rd@most.gov.cn",
    },
    {
      id: id(), title: "农业农村部现代农业产业技术体系：智能农机装备专项（信息与控制方向）",
      source: "农业农村部", category: "部级项目",
      deadline: "2026-06-15", amount: "30-50万元/年",
      description: "依托现代农业产业技术体系，开展智能农机信息采集、传输与控制算法研究，推进科技成果在主产区落地示范。",
      requirements: "申请人须为教授/研究员级别，具有与涉农企业或农业技术推广单位合作经历。",
      contact: "moa-tech@agri.gov.cn",
    },
    {
      id: id(), title: "北京市科技计划：城郊都市农业智慧管理平台建设与应用示范",
      source: "北京市科学技术委员会", category: "省市级项目",
      deadline: "2026-07-31", amount: "100-200万元",
      description: "面向北京城郊农业数字化转型需求，构建集多源感知、智能决策、可视化管理于一体的都市智慧农业管理平台。",
      requirements: "须在北京市具有主要研究基地，项目须设立北京市农业科学院等本市机构为参与单位。",
      contact: "bjst-agri@beijing.gov.cn",
    },
    {
      id: id(), title: "中国农业大学自主创新科研专项：具身智能农业应用基础研究",
      source: "中国农业大学科学技术发展研究院", category: "校级项目",
      deadline: "2026-04-30", amount: "10-20万元",
      description: "资助学校优势方向交叉融合研究，鼓励农业+人工智能+机器人领域的探索性基础研究工作。",
      requirements: "申请人须为中国农业大学在职教师，项目须有明确的跨学科合作方案。",
      contact: "科研院科研处 62736312 / research@cau.edu.cn",
    },
    {
      id: id(), title: "国家重点实验室开放课题：农业场景三维感知与具身导航研究",
      source: "农业信息化技术国家重点实验室", category: "重点实验室开放课题",
      deadline: "2026-08-15", amount: "5-15万元",
      description: "面向农业非结构化三维场景，研究点云感知、语义建图与具身导航算法，探索农业具身智能体的室外泛化能力。",
      requirements: "申请人为校外单位副高及以上，或校内青年教师均可；须提交2000字以上研究方案。",
      contact: "rlab@cau.edu.cn",
    },
  ];
  for (const p of openProjectsData) {
    db.run(`INSERT INTO open_projects (id,title,source,category,deadline,amount,description,requirements,contact,status) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [p.id, p.title, p.source, p.category, p.deadline, p.amount, p.description, p.requirements, p.contact, "open"]);
  }
  console.log(`开放课题/项目: ${openProjectsData.length} 条`);

  console.log("\n✅ 中国农业大学模拟数据生成完成");
  console.log(`学生 ID 格式：本科生 S + 年份 + 编号，研究生 Y + 年份 + 编号`);
  console.log(`示例学号 S20253082026 对应学生：赵鑫宇（信息与电气工程，2025级大一，东校区）`);
}

if (import.meta.main) {
  seedDatabase();
}
