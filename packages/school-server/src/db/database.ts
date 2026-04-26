import { Database } from "bun:sqlite";
import path from "path";

const DB_PATH = process.env.SCHOOL_DB_PATH || path.join(process.cwd(), "data", "school.db");

let db: Database | null = null;

export function getDatabase(): Database {
  if (!db) {
    db = new Database(DB_PATH, { create: true });
    db.run("PRAGMA foreign_keys = ON");
  }
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

export function initDatabase(): void {
  const database = getDatabase();

  database.run(`
    CREATE TABLE IF NOT EXISTS teachers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      department TEXT NOT NULL,
      title TEXT NOT NULL,
      campus TEXT NOT NULL DEFAULT '东校区',
      research_areas TEXT,
      office TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);
  // Migrate existing DBs (no-op if column already exists)
  try { database.run(`ALTER TABLE teachers ADD COLUMN campus TEXT NOT NULL DEFAULT '东校区'`); } catch {}
  try { database.run(`ALTER TABLE teachers ADD COLUMN research_areas TEXT`); } catch {}
  try { database.run(`ALTER TABLE teachers ADD COLUMN office TEXT`); } catch {}

  // id = student_number，schoolId 绑定时直接对应
  database.run(`
    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      student_number TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL DEFAULT 'undergraduate',
      major TEXT NOT NULL,
      grade INTEGER NOT NULL,
      campus TEXT NOT NULL DEFAULT '东校区',
      dorm TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      description TEXT,
      teacher_id TEXT NOT NULL,
      semester TEXT NOT NULL,
      credit INTEGER NOT NULL DEFAULT 2,
      schedule TEXT,
      location TEXT,
      course_type TEXT NOT NULL DEFAULT 'undergraduate',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS course_students (
      course_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      joined_at INTEGER NOT NULL DEFAULT (unixepoch()),
      PRIMARY KEY (course_id, student_id),
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS assignments (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      deadline INTEGER NOT NULL,
      max_score INTEGER NOT NULL DEFAULT 100,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS submissions (
      id TEXT PRIMARY KEY,
      assignment_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      content TEXT,
      file_url TEXT,
      submitted_at INTEGER NOT NULL DEFAULT (unixepoch()),
      score INTEGER,
      feedback TEXT,
      FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
      UNIQUE(assignment_id, student_id)
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS library_seats (
      area_name TEXT PRIMARY KEY,
      total INTEGER NOT NULL,
      available INTEGER NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS library_reservations (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      area_name TEXT NOT NULL,
      date TEXT NOT NULL,
      time_slot TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
      FOREIGN KEY (area_name) REFERENCES library_seats(area_name) ON DELETE CASCADE
    )
  `);
  database.run(`CREATE INDEX IF NOT EXISTS idx_lib_res_student ON library_reservations(student_id)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_lib_res_area_date ON library_reservations(area_name, date, time_slot)`);

  database.run(`
    CREATE TABLE IF NOT EXISTS library_books (
      isbn TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      author TEXT NOT NULL,
      publisher TEXT,
      location TEXT NOT NULL,
      total INTEGER NOT NULL DEFAULT 1,
      available INTEGER NOT NULL DEFAULT 1
    )
  `);

  // hours 字段存 JSON：{breakfast,lunch,dinner} 各含 open/close
  database.run(`
    CREATE TABLE IF NOT EXISTS cafeterias (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      short_name TEXT,
      location TEXT NOT NULL,
      campus TEXT NOT NULL DEFAULT '东校区',
      hours TEXT NOT NULL DEFAULT '{}'
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS cafeteria_menu (
      id TEXT PRIMARY KEY,
      cafeteria_id TEXT NOT NULL,
      date TEXT NOT NULL,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      calories INTEGER,
      category TEXT NOT NULL,
      available INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (cafeteria_id) REFERENCES cafeterias(id) ON DELETE CASCADE
    )
  `);

  // 智慧食堂消费记录
  database.run(`
    CREATE TABLE IF NOT EXISTS cafeteria_transactions (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      cafeteria_id TEXT NOT NULL,
      item_name TEXT NOT NULL,
      price REAL NOT NULL,
      calories INTEGER,
      meal_type TEXT NOT NULL DEFAULT 'lunch',
      transaction_time INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
      FOREIGN KEY (cafeteria_id) REFERENCES cafeterias(id) ON DELETE CASCADE
    )
  `);
  database.run(`CREATE INDEX IF NOT EXISTS idx_tx_student ON cafeteria_transactions(student_id)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_tx_time ON cafeteria_transactions(transaction_time)`);

  // 教室 / 会议室
  database.run(`
    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'classroom',
      building TEXT NOT NULL,
      floor INTEGER NOT NULL DEFAULT 1,
      capacity INTEGER NOT NULL DEFAULT 50,
      address TEXT NOT NULL,
      campus TEXT NOT NULL DEFAULT '东校区',
      facilities TEXT
    )
  `);

  // 教室 / 会议室预约
  database.run(`
    CREATE TABLE IF NOT EXISTS room_reservations (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      room_id TEXT NOT NULL,
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      purpose TEXT,
      status TEXT NOT NULL DEFAULT 'confirmed',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
    )
  `);
  database.run(`CREATE INDEX IF NOT EXISTS idx_room_res_student ON room_reservations(student_id)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_room_res_room_date ON room_reservations(room_id, date)`);

  // schedule_type: 'semester'=学期内, 'holiday'=寒暑假及法定节假日
  // direction: 'both'=东西同时对开, 'east_to_west'=东→西, 'west_to_east'=西→东
  database.run(`
    CREATE TABLE IF NOT EXISTS bus_routes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS bus_stops (
      id TEXT PRIMARY KEY,
      route_id TEXT NOT NULL,
      stop_name TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      FOREIGN KEY (route_id) REFERENCES bus_routes(id) ON DELETE CASCADE
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS bus_schedules (
      id TEXT PRIMARY KEY,
      route_id TEXT NOT NULL,
      departure_time TEXT NOT NULL,
      days TEXT NOT NULL,
      direction TEXT NOT NULL DEFAULT 'both',
      schedule_type TEXT NOT NULL DEFAULT 'semester',
      FOREIGN KEY (route_id) REFERENCES bus_routes(id) ON DELETE CASCADE
    )
  `);

  // 校医院时刻表
  database.run(`
    CREATE TABLE IF NOT EXISTS clinic_schedule (
      id TEXT PRIMARY KEY,
      campus TEXT NOT NULL DEFAULT '东校区',
      department TEXT NOT NULL,
      day_type TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      location TEXT NOT NULL,
      notes TEXT
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS campus_cards (
      student_id TEXT PRIMARY KEY,
      balance REAL NOT NULL DEFAULT 0,
      net_balance REAL NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS repair_tickets (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      dorm_room TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    )
  `);

  // 教师论文
  database.run(`
    CREATE TABLE IF NOT EXISTS teacher_papers (
      id TEXT PRIMARY KEY,
      teacher_id TEXT NOT NULL,
      title TEXT NOT NULL,
      journal TEXT NOT NULL,
      year INTEGER NOT NULL,
      authors TEXT NOT NULL,
      keywords TEXT,
      region TEXT NOT NULL DEFAULT '国内',
      citation_count INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
    )
  `);
  database.run(`CREATE INDEX IF NOT EXISTS idx_papers_teacher ON teacher_papers(teacher_id)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_papers_year ON teacher_papers(year)`);

  // 教师知识产权（专利/软著）
  database.run(`
    CREATE TABLE IF NOT EXISTS teacher_patents (
      id TEXT PRIMARY KEY,
      teacher_id TEXT NOT NULL,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      cert_number TEXT,
      year INTEGER NOT NULL,
      region TEXT NOT NULL DEFAULT '国内',
      keywords TEXT,
      status TEXT NOT NULL DEFAULT '有效',
      FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
    )
  `);
  database.run(`CREATE INDEX IF NOT EXISTS idx_patents_teacher ON teacher_patents(teacher_id)`);

  // 开放项目/课题申报
  database.run(`
    CREATE TABLE IF NOT EXISTS open_projects (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      source TEXT NOT NULL,
      category TEXT NOT NULL,
      deadline TEXT NOT NULL,
      amount TEXT,
      description TEXT,
      requirements TEXT,
      contact TEXT,
      status TEXT NOT NULL DEFAULT 'open'
    )
  `);

  database.run(`CREATE INDEX IF NOT EXISTS idx_courses_teacher ON courses(teacher_id)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_courses_semester ON courses(semester)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_courses_code ON courses(code)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_course_students_course ON course_students(course_id)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_course_students_student ON course_students(student_id)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_assignments_course ON assignments(course_id)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_assignments_deadline ON assignments(deadline)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_submissions_assignment ON submissions(assignment_id)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_submissions_student ON submissions(student_id)`);
  // 补充缺失的高频查询索引
  database.run(`CREATE INDEX IF NOT EXISTS idx_students_number ON students(student_number)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_cafeteria_menu_date ON cafeteria_menu(date)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_cafeteria_menu_cafeteria ON cafeteria_menu(cafeteria_id)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_cafeteria_menu_date_cafeteria ON cafeteria_menu(cafeteria_id, date)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_transactions_student ON cafeteria_transactions(student_id)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_transactions_student_time ON cafeteria_transactions(student_id, transaction_time DESC)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_room_reservations_room_date ON room_reservations(room_id, date)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_room_reservations_student ON room_reservations(student_id)`);
}
