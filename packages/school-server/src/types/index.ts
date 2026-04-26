export interface Teacher {
  id: string;
  name: string;
  email: string;
  department: string;
  title: string;
  created_at: number;
}

export interface Student {
  id: string;
  name: string;
  email: string;
  student_number: string;
  type: "undergraduate" | "graduate";
  major: string;
  grade: number;
  campus: string;
  dorm: string | null;
  created_at: number;
}

export interface Course {
  id: string;
  name: string;
  code: string;
  description: string | null;
  teacher_id: string;
  semester: string;
  credit: number;
  schedule: string | null;
  location: string | null;
  course_type: "undergraduate" | "graduate";
  created_at: number;
}

export interface CourseStudent {
  course_id: string;
  student_id: string;
  joined_at: number;
}

export interface Assignment {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  deadline: number;
  max_score: number;
  created_at: number;
}

export interface Submission {
  id: string;
  assignment_id: string;
  student_id: string;
  content: string | null;
  file_url: string | null;
  submitted_at: number;
  score: number | null;
  feedback: string | null;
}

export interface LibrarySeat {
  area_name: string;
  total: number;
  available: number;
  updated_at: number;
}

export interface LibraryReservation {
  id: string;
  student_id: string;
  area_name: string;
  date: string;
  time_slot: string;
  status: "active" | "cancelled";
  created_at: number;
}

export interface LibraryBook {
  isbn: string;
  title: string;
  author: string;
  publisher: string | null;
  location: string;
  total: number;
  available: number;
}

export interface Cafeteria {
  id: string;
  name: string;
  short_name: string | null;
  location: string;
  campus: string;
  hours: string;
}

export interface CafeteriaMenuItem {
  id: string;
  cafeteria_id: string;
  date: string;
  name: string;
  price: number;
  calories: number | null;
  category: string;
  available: number;
}

export interface CafeteriaTransaction {
  id: string;
  student_id: string;
  cafeteria_id: string;
  item_name: string;
  price: number;
  calories: number | null;
  meal_type: string;
  transaction_time: number;
}

export interface Room {
  id: string;
  name: string;
  type: "classroom" | "meeting_room";
  building: string;
  floor: number;
  capacity: number;
  address: string;
  campus: string;
  facilities: string | null;
}

export interface RoomReservation {
  id: string;
  student_id: string;
  room_id: string;
  date: string;
  start_time: string;
  end_time: string;
  purpose: string | null;
  status: "confirmed" | "cancelled";
  created_at: number;
}

export interface BusRoute {
  id: string;
  name: string;
  description: string | null;
}

export interface BusStop {
  id: string;
  route_id: string;
  stop_name: string;
  sequence: number;
}

export interface BusSchedule {
  id: string;
  route_id: string;
  departure_time: string;
  days: string;
  direction: string;
  schedule_type: string;
}

export interface ClinicSchedule {
  id: string;
  department: string;
  day_type: string;
  start_time: string;
  end_time: string;
  location: string;
  notes: string | null;
}

export interface CampusCard {
  student_id: string;
  balance: number;
  net_balance: number;
  updated_at: number;
}

export interface RepairTicket {
  id: string;
  student_id: string;
  dorm_room: string;
  category: string;
  description: string;
  status: string;
  created_at: number;
  updated_at: number;
}

export interface CourseWithTeacher extends Course {
  teacher: Teacher;
}

export interface CourseWithStudents extends Course {
  students: Student[];
}

export interface AssignmentWithCourse extends Assignment {
  course: Course;
}

export interface SubmissionWithDetails extends Submission {
  assignment: Assignment;
  student: Student;
}
