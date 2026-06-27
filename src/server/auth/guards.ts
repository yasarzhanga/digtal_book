import { asRow, getDb } from "@/server/db/client";
import { BookSnapshotSchema } from "@/content-engine/schema/document";
import type { ActivityEventInput } from "@/content-engine/tracking/events";
import type { BookRow, BookVersionRow, CourseRow } from "@/server/db/types";
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

export function ensureClassroomBookAccess(user: PublicUser, classroomId: string, bookId: string): CourseRow {
  const course = asRow<CourseRow>(
    getDb().prepare("SELECT Course.* FROM Course JOIN Classroom ON Classroom.courseId = Course.id WHERE Classroom.id = ?").get(classroomId)
  );
  if (!course) {
    throw new Error("CLASSROOM_NOT_FOUND");
  }
  if (course.bookId !== bookId) {
    throw new Error("CLASSROOM_BOOK_FORBIDDEN");
  }
  if (user.role === "TEACHER") {
    if (course.teacherId !== user.id) {
      throw new Error("CLASSROOM_TEACHER_FORBIDDEN");
    }
    return course;
  }
  if (user.role === "STUDENT") {
    ensureStudentEnrolled(classroomId, user.id);
    return course;
  }
  throw new Error("CLASSROOM_ACCESS_FORBIDDEN");
}

export function ensureBookReadable(user: PublicUser, bookId: string, classroomId?: string | null): BookRow {
  const book = asRow<BookRow>(getDb().prepare("SELECT * FROM Book WHERE id = ?").get(bookId));
  if (!book) {
    throw new Error("BOOK_NOT_FOUND");
  }
  if (!book.currentPublishedVersionId) {
    throw new Error("BOOK_NOT_PUBLISHED");
  }
  if (user.role === "EDITOR") {
    if (book.ownerId !== user.id) {
      throw new Error("BOOK_READ_FORBIDDEN");
    }
    return book;
  }
  if (classroomId) {
    ensureClassroomBookAccess(user, classroomId, bookId);
    return book;
  }
  if (user.role === "TEACHER") {
    const row = asRow<{ id: string }>(
      getDb().prepare("SELECT id FROM Course WHERE teacherId = ? AND bookId = ? LIMIT 1").get(user.id, bookId)
    );
    if (!row) {
      throw new Error("BOOK_READ_FORBIDDEN");
    }
    return book;
  }
  if (user.role === "STUDENT") {
    const row = asRow<{ id: string }>(
      getDb().prepare(`
        SELECT Classroom.id
        FROM Enrollment
        JOIN Classroom ON Classroom.id = Enrollment.classroomId
        JOIN Course ON Course.id = Classroom.courseId
        WHERE Enrollment.studentId = ? AND Course.bookId = ?
        LIMIT 1
      `).get(user.id, bookId)
    );
    if (!row) {
      throw new Error("BOOK_READ_FORBIDDEN");
    }
    return book;
  }
  throw new Error("BOOK_READ_FORBIDDEN");
}

export function ensureBookVersionReadable(user: PublicUser, bookVersionId: string, classroomId?: string | null): { bookId: string; version: BookVersionRow } {
  const version = asRow<BookVersionRow>(getDb().prepare("SELECT * FROM BookVersion WHERE id = ?").get(bookVersionId));
  if (!version) {
    throw new Error("VERSION_NOT_FOUND");
  }
  ensureBookReadable(user, version.bookId, classroomId);
  return { bookId: version.bookId, version };
}

export function ensureBookVersionWritable(user: PublicUser, bookId: string, bookVersionId: string, classroomId?: string | null): BookVersionRow {
  const book = ensureBookReadable(user, bookId, classroomId);
  if (book.currentPublishedVersionId !== bookVersionId) {
    throw new Error("BOOK_VERSION_WRITE_FORBIDDEN");
  }
  const version = asRow<BookVersionRow>(getDb().prepare("SELECT * FROM BookVersion WHERE id = ? AND bookId = ?").get(bookVersionId, bookId));
  if (!version) {
    throw new Error("VERSION_NOT_FOUND");
  }
  return version;
}

export function ensureVersionNode(bookVersionId: string, chapterId?: string | null, nodeId?: string | null): void {
  if (!chapterId && !nodeId) {
    return;
  }
  const version = asRow<BookVersionRow>(getDb().prepare("SELECT * FROM BookVersion WHERE id = ?").get(bookVersionId));
  if (!version) {
    throw new Error("VERSION_NOT_FOUND");
  }
  const snapshot = BookSnapshotSchema.parse(JSON.parse(version.snapshotJson) as unknown);
  const chapter = chapterId ? snapshot.chapters.find((item) => item.id === chapterId) : undefined;
  if (chapterId && !chapter) {
    throw new Error("CHAPTER_VERSION_FORBIDDEN");
  }
  if (nodeId && !snapshot.chapters.some((item) => item.document.nodes.some((node) => node.nodeId === nodeId))) {
    throw new Error("NODE_VERSION_FORBIDDEN");
  }
  if (chapter && nodeId && !chapter.document.nodes.some((node) => node.nodeId === nodeId)) {
    throw new Error("NODE_CHAPTER_FORBIDDEN");
  }
}

export function ensureActivityEventWritable(user: PublicUser, event: ActivityEventInput): void {
  let versionBookId: string | undefined;
  if (event.bookVersionId) {
    const { bookId } = ensureBookVersionReadable(user, event.bookVersionId, event.classroomId);
    versionBookId = bookId;
    ensureVersionNode(event.bookVersionId, event.chapterId, event.nodeId);
  }
  if (event.classroomId) {
    if (versionBookId) {
      ensureClassroomBookAccess(user, event.classroomId, versionBookId);
      return;
    }
    if (user.role === "TEACHER") {
      ensureClassroomTeacher(event.classroomId, user.id);
      return;
    }
    if (user.role === "STUDENT") {
      ensureStudentEnrolled(event.classroomId, user.id);
      return;
    }
    throw new Error("CLASSROOM_EVENT_FORBIDDEN");
  }
}
