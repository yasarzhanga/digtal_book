import { randomInt } from "node:crypto";
import { z } from "zod";
import { isAnswerCorrect, type QuizAnswer } from "@/content-engine/utils/quiz";
import { asRow, asRows, getDb, withTransaction } from "@/server/db/client";
import { DEMO_BOOK_ID } from "@/server/db/ids";
import { id } from "@/server/db/ids";
import type { AttendanceSessionRow, CourseRow, LiveQuizRow, LiveSessionRow } from "@/server/db/types";
import { getCurrentSnapshot } from "@/server/services/books";
import { recordEvent } from "@/server/services/events";
import { findQuizNode } from "@/server/services/reader";

export const LiveLocationInputSchema = z.object({
  chapterId: z.string().min(1),
  nodeId: z.string().min(1)
});

export const LiveQuizStartInputSchema = z.object({
  quizNodeId: z.string().min(1),
  questionId: z.string().min(1)
});

export const LiveQuizResponseInputSchema = z.object({
  answer: z.union([z.string(), z.number(), z.boolean(), z.array(z.number())])
});

export const CourseCreateInputSchema = z.object({
  name: z.string().min(1).max(80),
  bookId: z.string().min(1).default(DEMO_BOOK_ID),
  classroomName: z.string().min(1).max(80).default("默认班级")
});

export const CourseUpdateInputSchema = z.object({
  name: z.string().min(1).max(80)
});

export const ClassroomCreateInputSchema = z.object({
  name: z.string().min(1).max(80)
});

export const ClassroomUpdateInputSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  joinCode: z.string().min(4).max(12).regex(/^[A-Z0-9]+$/).optional()
}).refine((value) => value.name !== undefined || value.joinCode !== undefined, "CLASSROOM_UPDATE_EMPTY");

export const AttendanceStartInputSchema = z.object({
  requireLocation: z.boolean().default(false),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  radiusMeters: z.number().int().min(20).max(5000).default(300)
}).superRefine((value, context) => {
  if (value.requireLocation && (value.latitude === undefined || value.longitude === undefined)) {
    context.addIssue({ code: "custom", message: "ATTENDANCE_LOCATION_REQUIRED", path: ["latitude"] });
  }
});

export const AttendanceSignInputSchema = z.object({
  code: z.string().min(4).max(12),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  accuracyMeters: z.number().nonnegative().max(10000).optional()
});

export interface ClassAnalytics {
  studentCount: number;
  averageProgress: number;
  averageActiveSeconds: number;
  audioCompletionRate: number;
  videoCompletionRate: number;
  simulationParticipationRate: number;
  modelPanoramaParticipants: number;
  averageQuizAccuracy: number;
  noteCount: number;
  recordingCount: number;
  trend: { day: string; count: number }[];
  liveQuiz?: LiveQuizResults;
}

export interface LiveQuizResults {
  liveQuizId: string;
  status: string;
  answeredCount: number;
  correctCount: number;
  distribution: { label: string; count: number }[];
}

export interface ResourceLearningSummary {
  key: string;
  title: string;
  kind: string;
  category: string;
  openCount: number;
  studentCount: number;
  lastOpenedAt: string;
}

export interface ResourceLearningEvent {
  studentId: string;
  studentName: string;
  eventType: string;
  title: string;
  kind: string;
  category: string;
  resourceId: string;
  assetId: string;
  chapterId: string | null;
  nodeId: string | null;
  occurredAt: string;
}

export interface ResourceLearningDetails {
  summaries: ResourceLearningSummary[];
  events: ResourceLearningEvent[];
}

export function listTeacherCourses(teacherId: string): { id: string; name: string; bookId: string; classroomId: string; classroomName: string; joinCode: string }[] {
  const rows = asRows<{ id: string; name: string; bookId: string; classroomId: string; classroomName: string; joinCode: string }>(
    getDb().prepare(`
      SELECT Course.id, Course.name, Course.bookId, Classroom.id AS classroomId, Classroom.name AS classroomName, Classroom.joinCode
      FROM Course JOIN Classroom ON Classroom.courseId = Course.id
      WHERE Course.teacherId = ?
      ORDER BY Course.createdAt DESC
    `).all(teacherId)
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    bookId: row.bookId,
    classroomId: row.classroomId,
    classroomName: row.classroomName,
    joinCode: row.joinCode
  }));
}

export function listStudentClassrooms(studentId: string): { id: string; name: string; joinCode: string; courseName: string; bookId: string }[] {
  return asRows<{ id: string; name: string; joinCode: string; courseName: string; bookId: string }>(
    getDb().prepare(`
      SELECT Classroom.id, Classroom.name, Classroom.joinCode, Course.name AS courseName, Course.bookId
      FROM Enrollment
      JOIN Classroom ON Classroom.id = Enrollment.classroomId
      JOIN Course ON Course.id = Classroom.courseId
      WHERE Enrollment.studentId = ?
      ORDER BY Classroom.createdAt DESC
    `).all(studentId)
  );
}

export function getStudentClassroomForBook(studentId: string, bookId: string): string | null {
  const row = asRow<{ id: string }>(
    getDb().prepare(`
      SELECT Classroom.id
      FROM Enrollment
      JOIN Classroom ON Classroom.id = Enrollment.classroomId
      JOIN Course ON Course.id = Classroom.courseId
      WHERE Enrollment.studentId = ? AND Course.bookId = ?
      ORDER BY Classroom.createdAt DESC
      LIMIT 1
    `).get(studentId, bookId)
  );
  return row?.id ?? null;
}

export function createCourseWithClassroom(teacherId: string, input: z.input<typeof CourseCreateInputSchema>): { id: string; classroomId: string; joinCode: string } {
  const parsed = CourseCreateInputSchema.parse(input);
  const now = new Date().toISOString();
  const courseId = id("course");
  const classroomId = id("class");
  const joinCode = uniqueJoinCode();
  withTransaction(() => {
    getDb().prepare("INSERT INTO Course (id, teacherId, bookId, name, createdAt) VALUES (?, ?, ?, ?, ?)").run(courseId, teacherId, parsed.bookId, parsed.name, now);
    getDb().prepare("INSERT INTO Classroom (id, courseId, name, joinCode, createdAt) VALUES (?, ?, ?, ?, ?)").run(classroomId, courseId, parsed.classroomName, joinCode, now);
  });
  return { id: courseId, classroomId, joinCode };
}

export function updateCourse(teacherId: string, courseId: string, input: z.input<typeof CourseUpdateInputSchema>): void {
  const parsed = CourseUpdateInputSchema.parse(input);
  ensureCourseTeacher(courseId, teacherId);
  getDb().prepare("UPDATE Course SET name = ? WHERE id = ?").run(parsed.name, courseId);
}

export function deleteCourse(teacherId: string, courseId: string): void {
  ensureCourseTeacher(courseId, teacherId);
  const classrooms = asRows<{ id: string }>(getDb().prepare("SELECT id FROM Classroom WHERE courseId = ?").all(courseId));
  withTransaction(() => {
    for (const classroom of classrooms) {
      deleteClassroomRows(classroom.id);
    }
    getDb().prepare("DELETE FROM CourseResource WHERE courseId = ?").run(courseId);
    getDb().prepare("DELETE FROM Course WHERE id = ?").run(courseId);
  });
}

export function createClassroomForCourse(teacherId: string, courseId: string, input: z.input<typeof ClassroomCreateInputSchema>): { id: string; joinCode: string } {
  const parsed = ClassroomCreateInputSchema.parse(input);
  ensureCourseTeacher(courseId, teacherId);
  const classroomId = id("class");
  const joinCode = uniqueJoinCode();
  getDb().prepare("INSERT INTO Classroom (id, courseId, name, joinCode, createdAt) VALUES (?, ?, ?, ?, ?)").run(classroomId, courseId, parsed.name, joinCode, new Date().toISOString());
  return { id: classroomId, joinCode };
}

export function updateClassroom(teacherId: string, classroomId: string, input: z.input<typeof ClassroomUpdateInputSchema>): void {
  const parsed = ClassroomUpdateInputSchema.parse(input);
  ensureClassroomTeacher(classroomId, teacherId);
  const updates: string[] = [];
  const values: string[] = [];
  if (parsed.name !== undefined) {
    updates.push("name = ?");
    values.push(parsed.name);
  }
  if (parsed.joinCode !== undefined) {
    const existing = asRow<{ id: string }>(getDb().prepare("SELECT id FROM Classroom WHERE joinCode = ? AND id <> ?").get(parsed.joinCode, classroomId));
    if (existing) throw new Error("JOIN_CODE_EXISTS");
    updates.push("joinCode = ?");
    values.push(parsed.joinCode);
  }
  getDb().prepare(`UPDATE Classroom SET ${updates.join(", ")} WHERE id = ?`).run(...values, classroomId);
}

export function deleteClassroom(teacherId: string, classroomId: string): void {
  ensureClassroomTeacher(classroomId, teacherId);
  withTransaction(() => deleteClassroomRows(classroomId));
}

export function getClassroom(classroomId: string): { id: string; name: string; joinCode: string; courseName: string; bookId: string; studentCount: number } {
  const row = asRow<{ id: string; name: string; joinCode: string; courseName: string; bookId: string }>(
    getDb().prepare(`
      SELECT Classroom.id, Classroom.name, Classroom.joinCode, Course.name AS courseName, Course.bookId
      FROM Classroom JOIN Course ON Course.id = Classroom.courseId
      WHERE Classroom.id = ?
    `).get(classroomId)
  );
  if (!row) {
    throw new Error("CLASSROOM_NOT_FOUND");
  }
  const countRow = asRow<{ value: number }>(getDb().prepare("SELECT COUNT(*) AS value FROM Enrollment WHERE classroomId = ?").get(classroomId));
  return { ...row, studentCount: countRow?.value ?? 0 };
}

export function joinClassroom(studentId: string, joinCode: string): string {
  const classroom = asRow<{ id: string }>(getDb().prepare("SELECT id FROM Classroom WHERE joinCode = ?").get(joinCode));
  if (!classroom) {
    throw new Error("CLASSROOM_NOT_FOUND");
  }
  getDb().prepare("INSERT OR IGNORE INTO Enrollment (id, classroomId, studentId) VALUES (?, ?, ?)").run(id("enroll"), classroom.id, studentId);
  return classroom.id;
}

export function startLiveSession(classroomId: string): LiveSessionRow {
  return withTransaction(() => {
    const active = getActiveLiveSession(classroomId);
    if (active) {
      return active;
    }
    const liveId = id("live");
    getDb().prepare("INSERT INTO LiveSession (id, classroomId, status, currentChapterId, currentNodeId, startedAt, endedAt) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
      liveId,
      classroomId,
      "ACTIVE",
      "chapter-observe",
      "chapter-observe-0-heading",
      new Date().toISOString(),
      null
    );
    const created = asRow<LiveSessionRow>(getDb().prepare("SELECT * FROM LiveSession WHERE id = ?").get(liveId));
    if (!created) {
      throw new Error("LIVE_START_FAILED");
    }
    return created;
  });
}

export function setLiveLocation(classroomId: string, input: z.infer<typeof LiveLocationInputSchema>): LiveSessionRow {
  const parsed = LiveLocationInputSchema.parse(input);
  const live = startLiveSession(classroomId);
  getDb().prepare("UPDATE LiveSession SET currentChapterId = ?, currentNodeId = ? WHERE id = ?").run(parsed.chapterId, parsed.nodeId, live.id);
  const updated = asRow<LiveSessionRow>(getDb().prepare("SELECT * FROM LiveSession WHERE id = ?").get(live.id));
  if (!updated) {
    throw new Error("LIVE_LOCATION_FAILED");
  }
  return updated;
}

export function endLiveSession(classroomId: string): void {
  const live = getActiveLiveSession(classroomId);
  if (live) {
    getDb().prepare("UPDATE LiveSession SET status = 'ENDED', endedAt = ? WHERE id = ?").run(new Date().toISOString(), live.id);
  }
}

export function getCurrentLive(classroomId: string): { live: LiveSessionRow | null; quiz: LiveQuizRow | null; attendance: AttendanceSessionRow | null } {
  const live = getActiveLiveSession(classroomId);
  const quiz = live ? asRow<LiveQuizRow>(getDb().prepare("SELECT * FROM LiveQuizSession WHERE liveSessionId = ? AND status = 'ACTIVE' ORDER BY startedAt DESC LIMIT 1").get(live.id)) : null;
  const attendance = asRow<AttendanceSessionRow>(getDb().prepare("SELECT * FROM AttendanceSession WHERE classroomId = ? AND status = 'ACTIVE' ORDER BY createdAt DESC LIMIT 1").get(classroomId));
  return { live, quiz, attendance };
}

export function startLiveQuiz(classroomId: string, input: z.infer<typeof LiveQuizStartInputSchema>): LiveQuizRow {
  const parsed = LiveQuizStartInputSchema.parse(input);
  const live = startLiveSession(classroomId);
  getDb().prepare("UPDATE LiveQuizSession SET status = 'ENDED', endedAt = ? WHERE liveSessionId = ? AND status = 'ACTIVE'").run(new Date().toISOString(), live.id);
  const liveQuizId = id("livequiz");
  getDb().prepare("INSERT INTO LiveQuizSession (id, liveSessionId, quizNodeId, questionId, status, startedAt, endedAt) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    liveQuizId,
    live.id,
    parsed.quizNodeId,
    parsed.questionId,
    "ACTIVE",
    new Date().toISOString(),
    null
  );
  const row = asRow<LiveQuizRow>(getDb().prepare("SELECT * FROM LiveQuizSession WHERE id = ?").get(liveQuizId));
  if (!row) {
    throw new Error("LIVE_QUIZ_START_FAILED");
  }
  return row;
}

export function respondLiveQuiz(studentId: string, liveQuizId: string, input: z.infer<typeof LiveQuizResponseInputSchema>): { isCorrect: boolean } {
  const parsed = LiveQuizResponseInputSchema.parse(input);
  const liveQuiz = asRow<LiveQuizRow>(getDb().prepare("SELECT * FROM LiveQuizSession WHERE id = ?").get(liveQuizId));
  if (!liveQuiz || liveQuiz.status !== "ACTIVE") {
    throw new Error("LIVE_QUIZ_NOT_ACTIVE");
  }
  const question = findQuizNode(getCurrentSnapshot(DEMO_BOOK_ID)).questions.find((item) => item.id === liveQuiz.questionId);
  if (!question) {
    throw new Error("LIVE_QUIZ_QUESTION_NOT_FOUND");
  }
  const isCorrect = isAnswerCorrect(question, parsed.answer as QuizAnswer);
  getDb().prepare("INSERT OR REPLACE INTO LiveQuizResponse (id, liveQuizSessionId, studentId, answerJson, isCorrect, submittedAt) VALUES (?, ?, ?, ?, ?, ?)").run(
    id("liveanswer"),
    liveQuizId,
    studentId,
    JSON.stringify(parsed.answer),
    isCorrect ? 1 : 0,
    new Date().toISOString()
  );
  recordEvent(studentId, {
    classroomId: getClassroomIdForLiveQuiz(liveQuizId),
    eventType: "LIVE_QUIZ_SUBMIT",
    nodeId: liveQuiz.quizNodeId,
    payload: { questionId: liveQuiz.questionId, isCorrect }
  });
  return { isCorrect };
}

export function endLiveQuiz(liveQuizId: string): void {
  getDb().prepare("UPDATE LiveQuizSession SET status = 'ENDED', endedAt = ? WHERE id = ?").run(new Date().toISOString(), liveQuizId);
}

export function getLiveQuizResults(liveQuizId: string): LiveQuizResults {
  const liveQuiz = asRow<LiveQuizRow>(getDb().prepare("SELECT * FROM LiveQuizSession WHERE id = ?").get(liveQuizId));
  if (!liveQuiz) {
    throw new Error("LIVE_QUIZ_NOT_FOUND");
  }
  const rows = asRows<{ answerJson: string; isCorrect: number }>(getDb().prepare("SELECT answerJson, isCorrect FROM LiveQuizResponse WHERE liveQuizSessionId = ?").all(liveQuizId));
  const distributionMap = new Map<string, number>();
  for (const row of rows) {
    const label = JSON.stringify(JSON.parse(row.answerJson) as unknown);
    distributionMap.set(label, (distributionMap.get(label) ?? 0) + 1);
  }
  return {
    liveQuizId,
    status: liveQuiz.status,
    answeredCount: rows.length,
    correctCount: rows.filter((row) => row.isCorrect === 1).length,
    distribution: [...distributionMap.entries()].map(([label, count]) => ({ label, count }))
  };
}

export function startAttendance(classroomId: string, input: z.input<typeof AttendanceStartInputSchema> = {}): AttendanceSessionRow {
  const parsed = AttendanceStartInputSchema.parse(input);
  const code = String(randomInt(100000, 999999));
  const now = new Date();
  const sessionId = id("attendance");
  withTransaction(() => {
    getDb().prepare("UPDATE AttendanceSession SET status = 'ENDED' WHERE classroomId = ? AND status = 'ACTIVE'").run(classroomId);
    getDb().prepare("INSERT INTO AttendanceSession (id, classroomId, code, status, requireLocation, latitude, longitude, radiusMeters, expiresAt, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
      sessionId,
      classroomId,
      code,
      "ACTIVE",
      parsed.requireLocation ? 1 : 0,
      parsed.latitude ?? null,
      parsed.longitude ?? null,
      parsed.requireLocation ? parsed.radiusMeters : 0,
      new Date(now.getTime() + 5 * 60_000).toISOString(),
      now.toISOString()
    );
    const students = asRows<{ studentId: string }>(getDb().prepare("SELECT studentId FROM Enrollment WHERE classroomId = ?").all(classroomId));
    const insert = getDb().prepare("INSERT INTO AttendanceRecord (id, attendanceSessionId, studentId, status, source, latitude, longitude, distanceMeters, signedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
    for (const student of students) {
      insert.run(id("attendrec"), sessionId, student.studentId, "PENDING", "system", null, null, null, null);
    }
  });
  const row = asRow<AttendanceSessionRow>(getDb().prepare("SELECT * FROM AttendanceSession WHERE id = ?").get(sessionId));
  if (!row) {
    throw new Error("ATTENDANCE_START_FAILED");
  }
  return row;
}

export function signAttendance(studentId: string, input: z.infer<typeof AttendanceSignInputSchema>): void {
  const parsed = AttendanceSignInputSchema.parse(input);
  const session = asRow<AttendanceSessionRow>(getDb().prepare("SELECT * FROM AttendanceSession WHERE code = ? AND status = 'ACTIVE' ORDER BY createdAt DESC LIMIT 1").get(parsed.code));
  if (!session) {
    throw new Error("ATTENDANCE_NOT_FOUND");
  }
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    throw new Error("ATTENDANCE_EXPIRED");
  }
  const distanceMeters = session.requireLocation
    ? distanceInMeters(session.latitude ?? 0, session.longitude ?? 0, parsed.latitude, parsed.longitude)
    : null;
  if (session.requireLocation && distanceMeters === null) {
    throw new Error("ATTENDANCE_LOCATION_REQUIRED");
  }
  const allowedDistance = session.radiusMeters + (parsed.accuracyMeters ?? 0);
  if (distanceMeters !== null && distanceMeters > allowedDistance) {
    throw new Error("ATTENDANCE_OUT_OF_RANGE");
  }
  getDb().prepare("UPDATE AttendanceRecord SET status = 'PRESENT', source = ?, latitude = ?, longitude = ?, distanceMeters = ?, signedAt = ? WHERE attendanceSessionId = ? AND studentId = ?").run(
    distanceMeters !== null ? "student-geo" : "student",
    parsed.latitude ?? null,
    parsed.longitude ?? null,
    distanceMeters,
    new Date().toISOString(),
    session.id,
    studentId
  );
  recordEvent(studentId, {
    classroomId: session.classroomId,
    eventType: "ATTENDANCE_SIGN",
    payload: { code: parsed.code, requireLocation: Boolean(session.requireLocation), distanceMeters }
  });
}

export function updateAttendanceRecord(attendanceId: string, studentId: string, status: "PRESENT" | "LEAVE" | "ABSENT"): void {
  getDb().prepare("UPDATE AttendanceRecord SET status = ?, source = 'teacher', latitude = NULL, longitude = NULL, distanceMeters = NULL, signedAt = ? WHERE attendanceSessionId = ? AND studentId = ?").run(
    status,
    new Date().toISOString(),
    attendanceId,
    studentId
  );
}

export function getAttendanceRows(attendanceId: string): { studentId: string; name: string; status: string; source: string; latitude: number | null; longitude: number | null; distanceMeters: number | null; signedAt: string | null }[] {
  return asRows<{ studentId: string; name: string; status: string; source: string; latitude: number | null; longitude: number | null; distanceMeters: number | null; signedAt: string | null }>(
    getDb().prepare(`
      SELECT AttendanceRecord.studentId, User.name, AttendanceRecord.status, AttendanceRecord.source, AttendanceRecord.latitude, AttendanceRecord.longitude, AttendanceRecord.distanceMeters, AttendanceRecord.signedAt
      FROM AttendanceRecord JOIN User ON User.id = AttendanceRecord.studentId
      WHERE AttendanceRecord.attendanceSessionId = ?
      ORDER BY User.name
    `).all(attendanceId)
  );
}

export function getResourceLearningDetails(classroomId: string): ResourceLearningDetails {
  const studentIds = asRows<{ studentId: string }>(getDb().prepare("SELECT studentId FROM Enrollment WHERE classroomId = ?").all(classroomId)).map((row) => row.studentId);
  if (studentIds.length === 0) {
    return { summaries: [], events: [] };
  }
  const rows = asRows<{ userId: string; studentName: string; eventType: string; chapterId: string | null; nodeId: string | null; payloadJson: string; occurredAt: string }>(
    getDb().prepare(`
      SELECT ActivityEvent.userId, User.name AS studentName, ActivityEvent.eventType, ActivityEvent.chapterId, ActivityEvent.nodeId, ActivityEvent.payloadJson, ActivityEvent.occurredAt
      FROM ActivityEvent JOIN User ON User.id = ActivityEvent.userId
      WHERE ActivityEvent.userId IN (${studentIds.map(() => "?").join(",")})
        AND ActivityEvent.eventType IN ('RESOURCE_OPEN', 'ATTACHMENT_OPEN')
      ORDER BY ActivityEvent.occurredAt DESC
    `).all(...studentIds)
  );
  const events = rows.map((row) => toResourceLearningEvent(row));
  const summaries = new Map<string, ResourceLearningSummary & { students: Set<string> }>();
  for (const event of events) {
    const key = event.resourceId || event.assetId || event.nodeId || event.title;
    const current = summaries.get(key) ?? {
      key,
      title: event.title,
      kind: event.kind,
      category: event.category,
      openCount: 0,
      studentCount: 0,
      lastOpenedAt: event.occurredAt,
      students: new Set<string>()
    };
    current.openCount += 1;
    current.students.add(event.studentId);
    current.studentCount = current.students.size;
    if (event.occurredAt > current.lastOpenedAt) {
      current.lastOpenedAt = event.occurredAt;
    }
    summaries.set(key, current);
  }
  return {
    events,
    summaries: [...summaries.values()].map(({ students: _students, ...summary }) => summary).sort((left, right) => right.openCount - left.openCount)
  };
}

export function getClassAnalytics(classroomId: string): ClassAnalytics {
  const studentIds = asRows<{ studentId: string }>(getDb().prepare("SELECT studentId FROM Enrollment WHERE classroomId = ?").all(classroomId)).map((row) => row.studentId);
  const studentCount = studentIds.length || 1;
  const placeholders = studentIds.map(() => "?").join(",");
  const activeRows = studentIds.length
    ? asRows<{ activeSeconds: number; visitedChapterIdsJson: string }>(getDb().prepare(`SELECT activeSeconds, visitedChapterIdsJson FROM ReadingState WHERE userId IN (${placeholders})`).all(...studentIds))
    : [];
  const averageActiveSeconds = activeRows.length ? activeRows.reduce((sum, row) => sum + row.activeSeconds, 0) / activeRows.length : 0;
  const averageProgress = activeRows.length ? activeRows.reduce((sum, row) => sum + (JSON.parse(row.visitedChapterIdsJson) as string[]).length / 3, 0) / activeRows.length : 0;
  const audioCompletionRate = averageEventProgress(studentIds, "AUDIO");
  const videoCompletionRate = averageEventProgress(studentIds, "VIDEO");
  const simulationParticipants = distinctParticipantCount(studentIds, "SIMULATION_SAVE");
  const modelPanoramaParticipants = new Set([
    ...participants(studentIds, "MODEL3D_INTERACT"),
    ...participants(studentIds, "PANORAMA_OPEN")
  ]).size;
  const quizRows = studentIds.length
    ? asRows<{ score: number; maxScore: number }>(getDb().prepare(`SELECT score, maxScore FROM QuizAttempt WHERE userId IN (${placeholders})`).all(...studentIds))
    : [];
  const averageQuizAccuracy = quizRows.length ? quizRows.reduce((sum, row) => sum + row.score / row.maxScore, 0) / quizRows.length : 0;
  const noteCount = countForStudents("Annotation", studentIds);
  const recordingCount = countForStudents("RecordingSubmission", studentIds);
  const trend = studentIds.length
    ? asRows<{ day: string; count: number }>(getDb().prepare(`SELECT substr(occurredAt, 1, 10) AS day, COUNT(*) AS count FROM ActivityEvent WHERE userId IN (${placeholders}) GROUP BY day ORDER BY day DESC LIMIT 7`).all(...studentIds))
    : [];
  const activeQuiz = getCurrentLive(classroomId).quiz;
  return {
    studentCount,
    averageProgress,
    averageActiveSeconds,
    audioCompletionRate,
    videoCompletionRate,
    simulationParticipationRate: simulationParticipants / studentCount,
    modelPanoramaParticipants,
    averageQuizAccuracy,
    noteCount,
    recordingCount,
    trend,
    liveQuiz: activeQuiz ? getLiveQuizResults(activeQuiz.id) : undefined
  };
}

export function getStudentReport(classroomId: string, studentId: string): { name: string; activeSeconds: number; quizAccuracy: number; experimentCount: number; noteCount: number; recordingCount: number; events: { eventType: string; occurredAt: string }[] } {
  const enrolled = asRow<{ name: string }>(getDb().prepare("SELECT User.name FROM Enrollment JOIN User ON User.id = Enrollment.studentId WHERE Enrollment.classroomId = ? AND Enrollment.studentId = ?").get(classroomId, studentId));
  if (!enrolled) {
    throw new Error("STUDENT_NOT_IN_CLASS");
  }
  const state = asRow<{ activeSeconds: number }>(getDb().prepare("SELECT activeSeconds FROM ReadingState WHERE userId = ? ORDER BY updatedAt DESC LIMIT 1").get(studentId));
  const quizzes = asRows<{ score: number; maxScore: number }>(getDb().prepare("SELECT score, maxScore FROM QuizAttempt WHERE userId = ?").all(studentId));
  const experimentCount = countWhere("ExperimentRun", "userId = ?", [studentId]);
  const noteCount = countWhere("Annotation", "userId = ?", [studentId]);
  const recordingCount = countWhere("RecordingSubmission", "userId = ?", [studentId]);
  const events = asRows<{ eventType: string; occurredAt: string }>(getDb().prepare("SELECT eventType, occurredAt FROM ActivityEvent WHERE userId = ? ORDER BY occurredAt DESC LIMIT 30").all(studentId));
  return {
    name: enrolled.name,
    activeSeconds: state?.activeSeconds ?? 0,
    quizAccuracy: quizzes.length ? quizzes.reduce((sum, row) => sum + row.score / row.maxScore, 0) / quizzes.length : 0,
    experimentCount,
    noteCount,
    recordingCount,
    events
  };
}

function ensureCourseTeacher(courseId: string, teacherId: string): CourseRow {
  const course = asRow<CourseRow>(getDb().prepare("SELECT * FROM Course WHERE id = ?").get(courseId));
  if (!course) {
    throw new Error("COURSE_NOT_FOUND");
  }
  if (course.teacherId !== teacherId) {
    throw new Error("FORBIDDEN");
  }
  return course;
}

function ensureClassroomTeacher(classroomId: string, teacherId: string): CourseRow {
  const course = asRow<CourseRow>(
    getDb().prepare("SELECT Course.* FROM Course JOIN Classroom ON Classroom.courseId = Course.id WHERE Classroom.id = ?").get(classroomId)
  );
  if (!course) {
    throw new Error("CLASSROOM_NOT_FOUND");
  }
  if (course.teacherId !== teacherId) {
    throw new Error("FORBIDDEN");
  }
  return course;
}

function deleteClassroomRows(classroomId: string): void {
  const attendanceIds = asRows<{ id: string }>(getDb().prepare("SELECT id FROM AttendanceSession WHERE classroomId = ?").all(classroomId)).map((row) => row.id);
  for (const attendanceId of attendanceIds) {
    getDb().prepare("DELETE FROM AttendanceRecord WHERE attendanceSessionId = ?").run(attendanceId);
  }
  getDb().prepare("DELETE FROM AttendanceSession WHERE classroomId = ?").run(classroomId);

  const liveIds = asRows<{ id: string }>(getDb().prepare("SELECT id FROM LiveSession WHERE classroomId = ?").all(classroomId)).map((row) => row.id);
  for (const liveId of liveIds) {
    const quizIds = asRows<{ id: string }>(getDb().prepare("SELECT id FROM LiveQuizSession WHERE liveSessionId = ?").all(liveId)).map((row) => row.id);
    for (const quizId of quizIds) {
      getDb().prepare("DELETE FROM LiveQuizResponse WHERE liveQuizSessionId = ?").run(quizId);
    }
    getDb().prepare("DELETE FROM LiveQuizSession WHERE liveSessionId = ?").run(liveId);
  }
  getDb().prepare("DELETE FROM LiveSession WHERE classroomId = ?").run(classroomId);

  const assignmentIds = asRows<{ id: string }>(getDb().prepare("SELECT id FROM Assignment WHERE classroomId = ?").all(classroomId)).map((row) => row.id);
  for (const assignmentId of assignmentIds) {
    getDb().prepare("DELETE FROM AssignmentSubmission WHERE assignmentId = ?").run(assignmentId);
    getDb().prepare("DELETE FROM AssignmentQuestion WHERE assignmentId = ?").run(assignmentId);
  }
  getDb().prepare("DELETE FROM Assignment WHERE classroomId = ?").run(classroomId);
  getDb().prepare("DELETE FROM Enrollment WHERE classroomId = ?").run(classroomId);
  getDb().prepare("DELETE FROM ActivityEvent WHERE classroomId = ?").run(classroomId);
  getDb().prepare("DELETE FROM Classroom WHERE id = ?").run(classroomId);
}

function uniqueJoinCode(): string {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = `C${randomInt(100000, 999999)}`;
    const existing = asRow<{ id: string }>(getDb().prepare("SELECT id FROM Classroom WHERE joinCode = ?").get(code));
    if (!existing) return code;
  }
  throw new Error("JOIN_CODE_GENERATION_FAILED");
}

function distanceInMeters(originLatitude: number, originLongitude: number, latitude?: number, longitude?: number): number | null {
  if (latitude === undefined || longitude === undefined) return null;
  const earthRadiusMeters = 6_371_000;
  const phi1 = toRadians(originLatitude);
  const phi2 = toRadians(latitude);
  const deltaPhi = toRadians(latitude - originLatitude);
  const deltaLambda = toRadians(longitude - originLongitude);
  const a = Math.sin(deltaPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
  return Math.round(earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function toRadians(value: number): number {
  return value * Math.PI / 180;
}

function toResourceLearningEvent(row: { userId: string; studentName: string; eventType: string; chapterId: string | null; nodeId: string | null; payloadJson: string; occurredAt: string }): ResourceLearningEvent {
  const payload = parsePayload(row.payloadJson);
  const assetIds = arrayOfStrings(payload.assetIds);
  const resourceId = stringField(payload.resourceId);
  const assetId = stringField(payload.assetId) || assetIds[0] || "";
  const resource = resourceId ? getCourseResourceDescriptor(resourceId) : null;
  const asset = assetId ? getAssetDescriptor(assetId) : null;
  return {
    studentId: row.userId,
    studentName: row.studentName,
    eventType: row.eventType,
    title: resource?.title ?? asset?.title ?? stringField(payload.title) ?? row.nodeId ?? "教材资源",
    kind: asset?.kind ?? stringField(payload.assetKind) ?? stringField(payload.type) ?? stringField(payload.adapter) ?? row.eventType,
    category: resource?.category ?? stringField(payload.category) ?? (row.eventType === "ATTACHMENT_OPEN" ? "ATTACHMENT" : "BOOK"),
    resourceId: resourceId ?? "",
    assetId,
    chapterId: row.chapterId,
    nodeId: row.nodeId,
    occurredAt: row.occurredAt
  };
}

function getCourseResourceDescriptor(resourceId: string): { title: string; category: string } | null {
  return asRow<{ title: string; category: string }>(getDb().prepare("SELECT title, category FROM CourseResource WHERE id = ?").get(resourceId));
}

function getAssetDescriptor(assetId: string): { title: string; originalName: string; kind: string } | null {
  return asRow<{ title: string; originalName: string; kind: string }>(getDb().prepare("SELECT title, originalName, kind FROM Asset WHERE id = ?").get(assetId));
}

function parsePayload(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function getActiveLiveSession(classroomId: string): LiveSessionRow | null {
  return asRow<LiveSessionRow>(getDb().prepare("SELECT * FROM LiveSession WHERE classroomId = ? AND status = 'ACTIVE' ORDER BY startedAt DESC LIMIT 1").get(classroomId));
}

function getClassroomIdForLiveQuiz(liveQuizId: string): string | undefined {
  const row = asRow<{ classroomId: string }>(
    getDb().prepare("SELECT LiveSession.classroomId FROM LiveQuizSession JOIN LiveSession ON LiveSession.id = LiveQuizSession.liveSessionId WHERE LiveQuizSession.id = ?").get(liveQuizId)
  );
  return row?.classroomId;
}

function participants(studentIds: string[], eventType: string): string[] {
  if (studentIds.length === 0) return [];
  const rows = asRows<{ userId: string }>(getDb().prepare(`SELECT DISTINCT userId FROM ActivityEvent WHERE userId IN (${studentIds.map(() => "?").join(",")}) AND eventType = ?`).all(...studentIds, eventType));
  return rows.map((row) => row.userId);
}

function distinctParticipantCount(studentIds: string[], eventType: string): number {
  return participants(studentIds, eventType).length;
}

function averageEventProgress(studentIds: string[], prefix: "AUDIO" | "VIDEO"): number {
  if (studentIds.length === 0) return 0;
  const rows = asRows<{ userId: string; nodeId: string | null; eventType: string; progress: number | null }>(
    getDb().prepare(`
      SELECT userId, nodeId, eventType, progress
      FROM ActivityEvent
      WHERE userId IN (${studentIds.map(() => "?").join(",")})
        AND eventType IN (?, ?)
    `).all(...studentIds, `${prefix}_PROGRESS`, `${prefix}_COMPLETE`)
  );
  const maxByStudentNode = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.userId}:${row.nodeId ?? `${prefix}:unknown`}`;
    const value = row.eventType.endsWith("COMPLETE") ? 1 : row.progress ?? 0;
    maxByStudentNode.set(key, Math.max(maxByStudentNode.get(key) ?? 0, value));
  }
  const values = [...maxByStudentNode.values()].filter((value) => value > 0);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function countForStudents(table: string, studentIds: string[]): number {
  if (studentIds.length === 0) return 0;
  return countWhere(table, `userId IN (${studentIds.map(() => "?").join(",")})`, studentIds);
}

function countWhere(table: string, where: string, params: (string | number)[]): number {
  const row = asRow<{ value: number }>(getDb().prepare(`SELECT COUNT(*) AS value FROM ${table} WHERE ${where}`).get(...params));
  return row?.value ?? 0;
}
