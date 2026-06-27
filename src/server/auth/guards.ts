import { asRow, getDb } from "@/server/db/client";
import type { BookRow, CourseRow } from "@/server/db/types";
import { requireUser } from "@/server/auth/session";
import type { PublicUser, UserRole } from "@/server/services/auth";

export async function requireRole(role: UserRole | UserRole[]): Promise<PublicUser> {
  const user = await requireUser();
  const roles = Array.isArray(role) ? role : [role];
  if (!roles.includes(user.role)) {
    throw new Error(`${roles.join("_OR_")}_ROLE_REQUIRED_FORBIDDEN`);
  }
  return user;
}

export function requireEditor(): Promise<PublicUser> {
  return requireRole("EDITOR");
}

export function requireTeacher(): Promise<PublicUser> {
  return requireRole("TEACHER");
}

export function requireStudent(): Promise<PublicUser> {
  return requireRole("STUDENT");
}

export function ensureBookOwner(bookId: string, userId: string): BookRow {
  const book = asRow<BookRow>(getDb().prepare("SELECT * FROM Book WHERE id = ?").get(bookId));
  if (!book) {
    throw new Error("BOOK_NOT_FOUND");
  }
  if (book.ownerId !== userId) {
    throw new Error("BOOK_OWNER_FORBIDDEN");
  }
  return book;
}

export function ensureEditorBookOwner(bookId: string, user: PublicUser): BookRow {
  if (user.role !== "EDITOR") {
    throw new Error("EDITOR_ROLE_REQUIRED_FORBIDDEN");
  }
  return ensureBookOwner(bookId, user.id);
}

export function ensureChapterBookOwner(chapterId: string, userId: string): BookRow {
  const book = asRow<BookRow>(
    getDb().prepare("SELECT Book.* FROM Book JOIN Chapter ON Chapter.bookId = Book.id WHERE Chapter.id = ?").get(chapterId)
  );
  if (!book) {
    throw new Error("CHAPTER_NOT_FOUND");
  }
  if (book.ownerId !== userId) {
    throw new Error("BOOK_OWNER_FORBIDDEN");
  }
  return book;
}

export function ensureEditorChapterBookOwner(chapterId: string, user: PublicUser): BookRow {
  if (user.role !== "EDITOR") {
    throw new Error("EDITOR_ROLE_REQUIRED_FORBIDDEN");
  }
  return ensureChapterBookOwner(chapterId, user.id);
}

export function ensureAssetOwner(assetId: string, userId: string): void {
  const asset = asRow<{ ownerId: string }>(getDb().prepare("SELECT ownerId FROM Asset WHERE id = ?").get(assetId));
  if (!asset) {
    throw new Error("ASSET_NOT_FOUND");
  }
  if (asset.ownerId !== userId) {
    throw new Error("ASSET_OWNER_FORBIDDEN");
  }
}

export function ensureCourseTeacher(courseId: string, teacherId: string): CourseRow {
  const course = asRow<CourseRow>(getDb().prepare("SELECT * FROM Course WHERE id = ?").get(courseId));
  if (!course) {
    throw new Error("COURSE_NOT_FOUND");
  }
  if (course.teacherId !== teacherId) {
    throw new Error("COURSE_TEACHER_FORBIDDEN");
  }
  return course;
}

export function ensureClassroomTeacher(classroomId: string, teacherId: string): CourseRow {
  const course = asRow<CourseRow>(
    getDb().prepare("SELECT Course.* FROM Course JOIN Classroom ON Classroom.courseId = Course.id WHERE Classroom.id = ?").get(classroomId)
  );
  if (!course) {
    throw new Error("CLASSROOM_NOT_FOUND");
  }
  if (course.teacherId !== teacherId) {
    throw new Error("CLASSROOM_TEACHER_FORBIDDEN");
  }
  return course;
}

export function ensureTeacherClassroomAccess(classroomId: string, user: PublicUser): CourseRow {
  if (user.role !== "TEACHER") {
    throw new Error("TEACHER_ROLE_REQUIRED_FORBIDDEN");
  }
  return ensureClassroomTeacher(classroomId, user.id);
}

export function ensureStudentEnrolled(classroomId: string, studentId: string): void {
  const enrollment = asRow<{ id: string }>(
    getDb().prepare("SELECT id FROM Enrollment WHERE classroomId = ? AND studentId = ?").get(classroomId, studentId)
  );
  if (!enrollment) {
    throw new Error("STUDENT_CLASSROOM_FORBIDDEN");
  }
}

export function ensureStudentClassroomAccess(classroomId: string, user: PublicUser): void {
  if (user.role !== "STUDENT") {
    throw new Error("STUDENT_ROLE_REQUIRED_FORBIDDEN");
  }
  ensureStudentEnrolled(classroomId, user.id);
}

export function ensureLiveQuizStudent(liveQuizId: string, studentId: string): string {
  const row = asRow<{ classroomId: string }>(
    getDb().prepare(`
      SELECT LiveSession.classroomId
      FROM LiveQuizSession JOIN LiveSession ON LiveSession.id = LiveQuizSession.liveSessionId
      WHERE LiveQuizSession.id = ?
    `).get(liveQuizId)
  );
  if (!row) {
    throw new Error("LIVE_QUIZ_NOT_FOUND");
  }
  ensureStudentEnrolled(row.classroomId, studentId);
  return row.classroomId;
}

export function ensureLiveQuizTeacher(liveQuizId: string, teacherId: string): string {
  const row = asRow<{ classroomId: string }>(
    getDb().prepare(`
      SELECT LiveSession.classroomId
      FROM LiveQuizSession JOIN LiveSession ON LiveSession.id = LiveQuizSession.liveSessionId
      WHERE LiveQuizSession.id = ?
    `).get(liveQuizId)
  );
  if (!row) {
    throw new Error("LIVE_QUIZ_NOT_FOUND");
  }
  ensureClassroomTeacher(row.classroomId, teacherId);
  return row.classroomId;
}

export function ensureAttendanceStudent(attendanceId: string, studentId: string): string {
  const row = asRow<{ classroomId: string }>(
    getDb().prepare("SELECT classroomId FROM AttendanceSession WHERE id = ?").get(attendanceId)
  );
  if (!row) {
    throw new Error("ATTENDANCE_NOT_FOUND");
  }
  ensureStudentEnrolled(row.classroomId, studentId);
  return row.classroomId;
}

export function ensureAttendanceCodeMatches(attendanceId: string, code: string): void {
  const row = asRow<{ id: string }>(
    getDb().prepare("SELECT id FROM AttendanceSession WHERE id = ? AND code = ? AND status = 'ACTIVE'").get(attendanceId, code)
  );
  if (!row) {
    throw new Error("ATTENDANCE_CODE_MISMATCH_FORBIDDEN");
  }
}

export function ensureAttendanceTeacher(attendanceId: string, teacherId: string): string {
  const row = asRow<{ classroomId: string }>(
    getDb().prepare("SELECT classroomId FROM AttendanceSession WHERE id = ?").get(attendanceId)
  );
  if (!row) {
    throw new Error("ATTENDANCE_NOT_FOUND");
  }
  ensureClassroomTeacher(row.classroomId, teacherId);
  return row.classroomId;
}
