import ExcelJS from "exceljs";
import { z } from "zod";
import type { Asset } from "@/content-engine/schema/assets";
import { QuizQuestionSchema, type QuizQuestion } from "@/content-engine/schema/nodes";
import { formulaTemplates } from "@/content-engine/utils/formula-templates";
import {
  SimulationTemplateInputSchema,
  runSimulationTemplate,
  simulationTemplates,
  type SimulationTemplateResult
} from "@/content-engine/utils/simulation-templates";
import { scoreQuiz, type QuizAnswer } from "@/content-engine/utils/quiz";
import { asRow, asRows, getDb, withTransaction } from "@/server/db/client";
import { id } from "@/server/db/ids";
import { stringifyJson } from "@/server/db/json";
import type {
  AssetRow,
  AssignmentQuestionRow,
  AssignmentRow,
  AssignmentSubmissionRow,
  CourseResourceRow,
  CourseRow,
  QuestionBankItemRow,
  SimulationTemplateRunRow
} from "@/server/db/types";
import { getCurrentSnapshot } from "@/server/services/books";
import { recordTrustedInternalEvent } from "@/server/services/events";
import { getPersonalReport } from "@/server/services/reader";
import { getClassAnalytics, getClassroom, getResourceLearningDetails } from "@/server/services/teaching";
import { toAsset } from "@/server/services/assets";

const AnswerSchema = z.union([z.string(), z.number(), z.boolean(), z.array(z.number())]);

export const AssignmentSectionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  instructions: z.string().max(1000).default(""),
  questionIds: z.array(z.string().min(1)).default([])
});

export const AssignmentCreateInputSchema = z.object({
  title: z.string().min(1),
  instructions: z.string().min(1),
  dueAt: z.string().datetime().optional().or(z.literal("")),
  questions: z.array(QuizQuestionSchema).default([]),
  questionBankItemIds: z.array(z.string().min(1)).default([]),
  sections: z.array(AssignmentSectionSchema).default([])
}).superRefine((value, context) => {
  if (value.questions.length === 0 && value.questionBankItemIds.length === 0) {
    context.addIssue({ code: "custom", message: "ASSIGNMENT_REQUIRES_QUESTIONS", path: ["questions"] });
  }
});

export const AssignmentSubmitInputSchema = z.object({
  answers: z.record(z.string(), AnswerSchema),
  textAnswer: z.string().max(4000).default("")
});

export const AssignmentGradeInputSchema = z.object({
  score: z.number().min(0),
  feedback: z.string().min(1).max(2000)
});

export const CourseResourceCategorySchema = z.enum(["LESSON", "HOMEWORK", "MEDIA", "REFERENCE", "SCORM", "H5P"]);

export const CourseResourceCreateInputSchema = z.object({
  assetId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().max(1000).default(""),
  category: CourseResourceCategorySchema,
  visibility: z.enum(["TEACHER", "CLASS"]).default("CLASS")
});

export const SimulationTemplateRunInputSchema = SimulationTemplateInputSchema.extend({
  bookVersionId: z.string().min(1).optional(),
  classroomId: z.string().min(1).optional()
});

export const MindMapNodeSchema = z.object({
  id: z.string().min(1).max(120),
  label: z.string().min(1).max(80),
  kind: z.enum(["root", "chapter", "note", "concept", "question"]),
  weight: z.number().min(1).max(8),
  x: z.number().finite().optional(),
  y: z.number().finite().optional()
});

export const MindMapEdgeSchema = z.object({
  source: z.string().min(1).max(120),
  target: z.string().min(1).max(120),
  label: z.string().max(40).default("")
});

export const MindMapSchema = z.object({
  nodes: z.array(MindMapNodeSchema).min(1).max(80),
  edges: z.array(MindMapEdgeSchema).max(160)
}).superRefine((value, context) => {
  const ids = new Set(value.nodes.map((node) => node.id));
  if (!ids.has("root")) {
    context.addIssue({ code: "custom", message: "MINDMAP_ROOT_REQUIRED", path: ["nodes"] });
  }
  for (const edge of value.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) {
      context.addIssue({ code: "custom", message: "MINDMAP_EDGE_TARGET_MISSING", path: ["edges"] });
    }
  }
});

export interface AssignmentWithStats {
  id: string;
  classroomId: string;
  title: string;
  instructions: string;
  status: AssignmentRow["status"];
  dueAt: string | null;
  sections: AssignmentSection[];
  createdAt: string;
  publishedAt: string | null;
  questions: QuizQuestion[];
  submittedCount: number;
  gradedCount: number;
}

export interface StudentAssignment extends AssignmentWithStats {
  submission: AssignmentSubmission | null;
}

export interface AssignmentSubmission {
  id: string;
  assignmentId: string;
  studentId: string;
  studentName: string;
  answers: Record<string, QuizAnswer>;
  textAnswer: string;
  score: number | null;
  maxScore: number;
  feedback: string;
  status: AssignmentSubmissionRow["status"];
  submittedAt: string;
  gradedAt: string | null;
}

export interface QuestionBankItem {
  id: string;
  source: string;
  question: QuizQuestion;
  tags: string[];
  createdAt: string;
}

export interface QuestionBankImportResult {
  imported: number;
  errors: { row: number; message: string }[];
}

export type AssignmentSection = z.infer<typeof AssignmentSectionSchema>;

export interface CourseResource {
  id: string;
  courseId: string;
  title: string;
  description: string;
  category: z.infer<typeof CourseResourceCategorySchema>;
  visibility: "TEACHER" | "CLASS";
  createdAt: string;
  asset: Asset;
}

export interface MindMap {
  nodes: z.infer<typeof MindMapNodeSchema>[];
  edges: z.infer<typeof MindMapEdgeSchema>[];
}

export interface SimulationTemplateRun {
  id: string;
  templateKey: string;
  input: Record<string, number>;
  result: SimulationTemplateResult;
  createdAt: string;
}

export function listAssignmentsForTeacher(classroomId: string, teacherId: string): AssignmentWithStats[] {
  ensureClassroomTeacher(classroomId, teacherId);
  const rows = asRows<AssignmentRow>(getDb().prepare("SELECT * FROM Assignment WHERE classroomId = ? ORDER BY createdAt DESC").all(classroomId));
  return rows.map(toAssignmentWithStats);
}

export function listAssignmentsForStudent(classroomId: string, studentId: string): StudentAssignment[] {
  ensureStudentEnrollment(classroomId, studentId);
  const rows = asRows<AssignmentRow>(getDb().prepare("SELECT * FROM Assignment WHERE classroomId = ? AND status IN ('PUBLISHED','CLOSED') ORDER BY createdAt DESC").all(classroomId));
  return rows.map((row) => ({ ...toAssignmentWithStats(row), submission: getSubmissionForStudent(row.id, studentId) }));
}

export function createAssignment(teacherId: string, classroomId: string, input: z.input<typeof AssignmentCreateInputSchema>): AssignmentWithStats {
  const parsed = AssignmentCreateInputSchema.parse(input);
  ensureClassroomTeacher(classroomId, teacherId);
  const bankQuestions = parsed.questionBankItemIds.length > 0 ? getBankQuestions(teacherId, parsed.questionBankItemIds) : [];
  const questions = [...parsed.questions, ...bankQuestions].map((question) => QuizQuestionSchema.parse(question));
  if (questions.length === 0) {
    throw new Error("ASSIGNMENT_REQUIRES_QUESTIONS");
  }
  const sections = normalizeAssignmentSections(parsed.sections, questions);
  const sectionByQuestion = new Map(sections.flatMap((section) => section.questionIds.map((questionId) => [questionId, section.id] as const)));
  const sectionedQuestions = questions.map((question) => QuizQuestionSchema.parse({ ...question, sectionId: sectionByQuestion.get(question.id) ?? sections[0]?.id }));
  const assignmentId = id("assignment");
  const now = new Date().toISOString();
  withTransaction(() => {
    getDb().prepare("INSERT INTO Assignment (id, classroomId, teacherId, title, instructions, status, dueAt, sectionsJson, createdAt, publishedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
      assignmentId,
      classroomId,
      teacherId,
      parsed.title,
      parsed.instructions,
      "DRAFT",
      parsed.dueAt || null,
      stringifyJson(sections),
      now,
      null
    );
    const insertQuestion = getDb().prepare("INSERT INTO AssignmentQuestion (id, assignmentId, questionJson, sortOrder) VALUES (?, ?, ?, ?)");
    sectionedQuestions.forEach((question, index) => {
      insertQuestion.run(id("assignment_question"), assignmentId, stringifyJson(QuizQuestionSchema.parse(question)), index);
    });
  });
  return getAssignmentWithStats(assignmentId);
}

export function publishAssignment(teacherId: string, classroomId: string, assignmentId: string): AssignmentWithStats {
  ensureClassroomTeacher(classroomId, teacherId);
  const now = new Date().toISOString();
  getDb().prepare("UPDATE Assignment SET status = 'PUBLISHED', publishedAt = ? WHERE id = ? AND classroomId = ?").run(now, assignmentId, classroomId);
  return getAssignmentWithStats(assignmentId);
}

export function closeAssignment(teacherId: string, classroomId: string, assignmentId: string): AssignmentWithStats {
  ensureClassroomTeacher(classroomId, teacherId);
  getDb().prepare("UPDATE Assignment SET status = 'CLOSED' WHERE id = ? AND classroomId = ?").run(assignmentId, classroomId);
  return getAssignmentWithStats(assignmentId);
}

export function submitAssignment(studentId: string, assignmentId: string, input: z.input<typeof AssignmentSubmitInputSchema>): AssignmentSubmission {
  const parsed = AssignmentSubmitInputSchema.parse(input);
  const assignment = mustGetAssignment(assignmentId);
  if (assignment.status !== "PUBLISHED") {
    throw new Error("ASSIGNMENT_NOT_PUBLISHED");
  }
  ensureStudentEnrollment(assignment.classroomId, studentId);
  const questions = getAssignmentQuestions(assignmentId);
  const result = scoreQuiz(questions, parsed.answers as Record<string, QuizAnswer>);
  const now = new Date().toISOString();
  const existing = asRow<{ id: string }>(getDb().prepare("SELECT id FROM AssignmentSubmission WHERE assignmentId = ? AND studentId = ?").get(assignmentId, studentId));
  if (existing) {
    getDb().prepare("UPDATE AssignmentSubmission SET answersJson = ?, textAnswer = ?, score = ?, maxScore = ?, feedback = ?, status = 'SUBMITTED', submittedAt = ?, gradedAt = NULL WHERE id = ?").run(
      stringifyJson(parsed.answers),
      parsed.textAnswer,
      result.score,
      result.maxScore,
      "",
      now,
      existing.id
    );
  } else {
    getDb().prepare("INSERT INTO AssignmentSubmission (id, assignmentId, studentId, answersJson, textAnswer, score, maxScore, feedback, status, submittedAt, gradedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
      id("submission"),
      assignmentId,
      studentId,
      stringifyJson(parsed.answers),
      parsed.textAnswer,
      result.score,
      result.maxScore,
      "",
      "SUBMITTED",
      now,
      null
    );
  }
  recordTrustedInternalEvent(studentId, {
    classroomId: assignment.classroomId,
    eventType: "ASSIGNMENT_SUBMIT",
    progress: result.maxScore > 0 ? result.score / result.maxScore : 0,
    payload: { assignmentId, score: result.score, maxScore: result.maxScore }
  });
  const submission = getSubmissionForStudent(assignmentId, studentId);
  if (!submission) {
    throw new Error("ASSIGNMENT_SUBMIT_FAILED");
  }
  return submission;
}

export function gradeAssignmentSubmission(teacherId: string, classroomId: string, submissionId: string, input: z.input<typeof AssignmentGradeInputSchema>): AssignmentSubmission {
  const parsed = AssignmentGradeInputSchema.parse(input);
  ensureClassroomTeacher(classroomId, teacherId);
  const row = asRow<AssignmentSubmissionRow>(
    getDb().prepare(`
      SELECT AssignmentSubmission.*
      FROM AssignmentSubmission JOIN Assignment ON Assignment.id = AssignmentSubmission.assignmentId
      WHERE AssignmentSubmission.id = ? AND Assignment.classroomId = ?
    `).get(submissionId, classroomId)
  );
  if (!row) {
    throw new Error("SUBMISSION_NOT_FOUND");
  }
  if (parsed.score > row.maxScore) {
    throw new Error("GRADE_EXCEEDS_MAX_SCORE");
  }
  const now = new Date().toISOString();
  getDb().prepare("UPDATE AssignmentSubmission SET score = ?, feedback = ?, status = 'GRADED', gradedAt = ? WHERE id = ?").run(parsed.score, parsed.feedback, now, submissionId);
  recordTrustedInternalEvent(row.studentId, {
    classroomId,
    eventType: "ASSIGNMENT_GRADE",
    progress: row.maxScore > 0 ? parsed.score / row.maxScore : 0,
    payload: { assignmentId: row.assignmentId, submissionId, score: parsed.score }
  });
  const updated = getSubmissionById(submissionId);
  if (!updated) {
    throw new Error("GRADE_UPDATE_FAILED");
  }
  return updated;
}

export function listAssignmentSubmissions(teacherId: string, classroomId: string, assignmentId: string): AssignmentSubmission[] {
  ensureClassroomTeacher(classroomId, teacherId);
  const rows = asRows<AssignmentSubmissionRow>(
    getDb().prepare("SELECT AssignmentSubmission.* FROM AssignmentSubmission JOIN Assignment ON Assignment.id = AssignmentSubmission.assignmentId WHERE Assignment.id = ? AND Assignment.classroomId = ? ORDER BY submittedAt DESC").all(assignmentId, classroomId)
  );
  return rows.map(toSubmission);
}

export function listQuestionBank(teacherId: string): QuestionBankItem[] {
  return asRows<QuestionBankItemRow>(getDb().prepare("SELECT * FROM QuestionBankItem WHERE teacherId = ? ORDER BY createdAt DESC").all(teacherId)).map(toQuestionBankItem);
}

export async function importQuestionBankWorkbook(teacherId: string, source: string, buffer: Buffer): Promise<QuestionBankImportResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new Error("QUESTION_BANK_SHEET_MISSING");
  }
  const headers = headerIndexes(sheet.getRow(1));
  const imported: { question: QuizQuestion; tags: string[] }[] = [];
  const errors: { row: number; message: string }[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const hasText = ["type", "question", "correct"].some((field) => cellByHeader(row, headers, field));
    if (!hasText) return;
    try {
      imported.push(parseQuestionBankRow(row, headers));
    } catch (error) {
      errors.push({ row: rowNumber, message: error instanceof Error ? error.message : "UNKNOWN_IMPORT_ERROR" });
    }
  });
  if (imported.length > 0) {
    const now = new Date().toISOString();
    const insert = getDb().prepare("INSERT INTO QuestionBankItem (id, teacherId, source, questionJson, tagsJson, createdAt) VALUES (?, ?, ?, ?, ?, ?)");
    withTransaction(() => {
      for (const item of imported) {
        insert.run(id("bank_item"), teacherId, source, stringifyJson(item.question), stringifyJson(item.tags), now);
      }
    });
  }
  return { imported: imported.length, errors };
}

export async function buildQuestionBankTemplateWorkbook(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Digital Textbook Demo";
  const sheet = workbook.addWorksheet("题库导入模板");
  sheet.columns = [
    { header: "type", key: "type", width: 14 },
    { header: "question", key: "question", width: 34 },
    { header: "options", key: "options", width: 42 },
    { header: "leftItems", key: "leftItems", width: 28 },
    { header: "rightItems", key: "rightItems", width: 28 },
    { header: "correct", key: "correct", width: 18 },
    { header: "rubric", key: "rubric", width: 34 },
    { header: "sampleAnswer", key: "sampleAnswer", width: 42 },
    { header: "explanation", key: "explanation", width: 42 },
    { header: "score", key: "score", width: 10 },
    { header: "mediaAssetIds", key: "mediaAssetIds", width: 24 },
    { header: "section", key: "section", width: 20 },
    { header: "tags", key: "tags", width: 22 }
  ];
  sheet.addRow({ type: "single", question: "质量不变时，合力增大，加速度如何变化？", options: "增大|减小|不变", correct: "A", explanation: "a=F/m，质量一定时 a 与 F 成正比。", score: 5, section: "基础题", tags: "牛顿第二定律;基础" });
  sheet.addRow({ type: "multiple", question: "下列哪些会影响加速度？", options: "合力|质量|颜色|摩擦", correct: "A,B,D", explanation: "加速度由净力和质量共同决定。", score: 8, section: "基础题", tags: "受力分析" });
  sheet.addRow({ type: "boolean", question: "力是维持物体运动的原因。", correct: "false", explanation: "力改变运动状态，不是维持运动的原因。", score: 4, section: "基础题", tags: "概念辨析" });
  sheet.addRow({ type: "fill", question: "F=10N，m=4kg，则 a=____m/s²。", correct: "2.5|2.50", explanation: "a=F/m=2.5。", score: 5, section: "基础题", tags: "计算" });
  sheet.addRow({ type: "ordering", question: "按小车实验流程排序。", options: "连接传感器|施加恒定拉力|记录位移时间|计算加速度", correct: "A,B,C,D", explanation: "实验要先搭建测量，再施力、采集并计算。", score: 6, mediaAssetIds: "asset_forceDiagram", section: "实验题", tags: "实验流程" });
  sheet.addRow({ type: "matching", question: "将物理量与含义配对。", leftItems: "合力F|质量m|加速度a", rightItems: "运动状态改变快慢|单位kg|单位N", correct: "C,B,A", explanation: "F 的单位是 N，m 的单位是 kg，a 描述速度变化快慢。", score: 6, section: "实验题", tags: "概念配对" });
  sheet.addRow({ type: "shortAnswer", question: "解释为什么同样合力下重车加速度更小。", rubric: "写出 a=F/m|说明质量越大加速度越小|联系实验数据", sampleAnswer: "由 a=F/m 可知，合力相同且质量变大时，加速度会减小；小车实验中重车速度变化更慢。", explanation: "解答题由教师按 rubric 批改。", score: 10, mediaAssetIds: "asset_guide", section: "探究题", tags: "解答题" });
  styleWorksheet(sheet);
  return workbookToBuffer(workbook);
}

export function createCourseResource(teacherId: string, classroomId: string, input: z.input<typeof CourseResourceCreateInputSchema>): CourseResource {
  const parsed = CourseResourceCreateInputSchema.parse(input);
  const course = ensureClassroomTeacher(classroomId, teacherId);
  if (!getAsset(parsed.assetId)) {
    throw new Error("ASSET_NOT_FOUND");
  }
  const resourceId = id("course_resource");
  getDb().prepare("INSERT INTO CourseResource (id, courseId, assetId, title, description, category, visibility, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
    resourceId,
    course.id,
    parsed.assetId,
    parsed.title,
    parsed.description,
    parsed.category,
    parsed.visibility,
    new Date().toISOString()
  );
  return mustGetCourseResource(resourceId);
}

export function listCourseResourcesForClassroom(classroomId: string, userRole: "EDITOR" | "TEACHER" | "STUDENT"): CourseResource[] {
  const course = getCourseForClassroom(classroomId);
  const visibilityFilter = userRole === "STUDENT" ? "AND visibility = 'CLASS'" : "";
  const rows = asRows<CourseResourceRow>(getDb().prepare(`SELECT * FROM CourseResource WHERE courseId = ? ${visibilityFilter} ORDER BY createdAt DESC`).all(course.id));
  return rows.map(toCourseResource);
}

export function buildNotesMindMap(userId: string, bookId: string): MindMap {
  const snapshot = getCurrentSnapshot(bookId);
  const saved = asRow<{ mapJson: string }>(
    getDb().prepare("SELECT mapJson FROM MindMapState WHERE userId = ? AND bookVersionId = ?").get(userId, snapshot.versionId)
  );
  if (saved) {
    return MindMapSchema.parse(JSON.parse(saved.mapJson));
  }
  const rows = asRows<{ id: string; chapterId: string; quote: string; note: string; color: string }>(
    getDb().prepare("SELECT id, chapterId, quote, note, color FROM Annotation WHERE userId = ? AND bookVersionId = ? ORDER BY createdAt ASC").all(userId, snapshot.versionId)
  );
  const nodes: MindMap["nodes"] = [{ id: "root", label: "学习笔记", kind: "root", weight: Math.max(1, rows.length) }];
  const edges: MindMap["edges"] = [];
  const chapters = new Set<string>();
  const concepts = new Set<string>();
  for (const row of rows) {
    if (!chapters.has(row.chapterId)) {
      const chapter = snapshot.chapters.find((item) => item.id === row.chapterId);
      nodes.push({ id: `chapter:${row.chapterId}`, label: chapter?.title ?? row.chapterId, kind: "chapter", weight: 2 });
      edges.push({ source: "root", target: `chapter:${row.chapterId}`, label: "包含" });
      chapters.add(row.chapterId);
    }
    const noteId = `note:${row.id}`;
    nodes.push({ id: noteId, label: compactText(row.note || row.quote, 18), kind: "note", weight: row.note ? 2 : 1 });
    edges.push({ source: `chapter:${row.chapterId}`, target: noteId, label: row.color });
    for (const concept of extractConcepts(`${row.quote} ${row.note}`)) {
      if (!concepts.has(concept)) {
        nodes.push({ id: `concept:${concept}`, label: concept, kind: "concept", weight: 3 });
        concepts.add(concept);
      }
      edges.push({ source: noteId, target: `concept:${concept}`, label: "关联" });
    }
  }
  if (rows.length === 0) {
    nodes.push({ id: "empty", label: "暂无笔记", kind: "note", weight: 1 });
    edges.push({ source: "root", target: "empty", label: "等待生成" });
  }
  return { nodes, edges };
}

export function saveNotesMindMap(userId: string, bookId: string, input: z.input<typeof MindMapSchema>): MindMap {
  const snapshot = getCurrentSnapshot(bookId);
  const parsed = MindMapSchema.parse(input);
  const existing = asRow<{ id: string }>(
    getDb().prepare("SELECT id FROM MindMapState WHERE userId = ? AND bookVersionId = ?").get(userId, snapshot.versionId)
  );
  const now = new Date().toISOString();
  if (existing) {
    getDb().prepare("UPDATE MindMapState SET mapJson = ?, updatedAt = ? WHERE id = ?").run(stringifyJson(parsed), now, existing.id);
  } else {
    getDb().prepare("INSERT INTO MindMapState (id, userId, bookVersionId, mapJson, updatedAt) VALUES (?, ?, ?, ?, ?)").run(
      id("mindmap"),
      userId,
      snapshot.versionId,
      stringifyJson(parsed),
      now
    );
  }
  recordTrustedInternalEvent(userId, {
    bookVersionId: snapshot.versionId,
    eventType: "MINDMAP_EDIT",
    payload: { nodes: parsed.nodes.length, edges: parsed.edges.length }
  });
  return parsed;
}

export function getFormulaTemplates() {
  return formulaTemplates;
}

export function getSimulationTemplates() {
  return simulationTemplates;
}

export function runAndSaveSimulationTemplate(userId: string, input: z.input<typeof SimulationTemplateRunInputSchema>): SimulationTemplateRun {
  const parsed = SimulationTemplateRunInputSchema.parse(input);
  const result = runSimulationTemplate(parsed);
  const runId = id("simrun");
  const now = new Date().toISOString();
  getDb().prepare("INSERT INTO SimulationTemplateRun (id, userId, templateKey, inputJson, resultJson, createdAt) VALUES (?, ?, ?, ?, ?, ?)").run(
    runId,
    userId,
    parsed.templateKey,
    stringifyJson(parsed.values),
    stringifyJson(result),
    now
  );
  recordTrustedInternalEvent(userId, {
    bookVersionId: parsed.bookVersionId,
    classroomId: parsed.classroomId,
    eventType: "SIMULATION_SAVE",
    payload: { templateKey: parsed.templateKey, metrics: result.metrics }
  });
  return { id: runId, templateKey: parsed.templateKey, input: parsed.values, result, createdAt: now };
}

export function listSimulationTemplateRuns(userId: string): SimulationTemplateRun[] {
  return asRows<SimulationTemplateRunRow>(
    getDb().prepare("SELECT * FROM SimulationTemplateRun WHERE userId = ? ORDER BY createdAt DESC LIMIT 20").all(userId)
  ).map((row) => ({
    id: row.id,
    templateKey: row.templateKey,
    input: JSON.parse(row.inputJson) as Record<string, number>,
    result: JSON.parse(row.resultJson) as SimulationTemplateResult,
    createdAt: row.createdAt
  }));
}

export async function buildPersonalReportWorkbook(userId: string, bookId: string): Promise<Buffer> {
  const snapshot = getCurrentSnapshot(bookId);
  const report = getPersonalReport(userId, snapshot.versionId);
  const assignments = listAssignmentSubmissionsForStudent(userId);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Digital Textbook Demo";
  const overview = workbook.addWorksheet("个人概览");
  overview.columns = [
    { header: "指标", key: "metric", width: 24 },
    { header: "数值", key: "value", width: 24 }
  ];
  overview.addRows([
    { metric: "有效阅读分钟", value: Math.round(report.activeSeconds / 60) },
    { metric: "已访问章节", value: report.visitedChapters },
    { metric: "媒体完成率", value: `${Math.round(report.mediaCompletionRate * 100)}%` },
    { metric: "仿真次数", value: report.simulationRuns },
    { metric: "笔记数量", value: report.noteCount },
    { metric: "录音提交", value: report.recordingCount },
    { metric: "作业提交", value: assignments.length },
    { metric: "作业已批改", value: assignments.filter((item) => item.status === "GRADED").length }
  ]);
  styleWorksheet(overview);

  const events = workbook.addWorksheet("学习轨迹");
  events.columns = [
    { header: "时间", key: "time", width: 28 },
    { header: "事件", key: "event", width: 24 },
    { header: "章节", key: "chapter", width: 24 },
    { header: "节点", key: "node", width: 34 }
  ];
  events.addRows(report.recentActivities.map((item) => ({ time: item.occurredAt, event: item.eventType, chapter: item.chapterId ?? "", node: item.nodeId ?? "" })));
  styleWorksheet(events);

  const assignmentSheet = workbook.addWorksheet("作业");
  assignmentSheet.columns = [
    { header: "作业", key: "assignment", width: 28 },
    { header: "状态", key: "status", width: 14 },
    { header: "分数", key: "score", width: 12 },
    { header: "满分", key: "maxScore", width: 12 },
    { header: "反馈", key: "feedback", width: 42 }
  ];
  assignmentSheet.addRows(assignments.map((item) => ({ assignment: item.assignmentTitle, status: item.status, score: item.score ?? "", maxScore: item.maxScore, feedback: item.feedback })));
  styleWorksheet(assignmentSheet);
  return workbookToBuffer(workbook);
}

export async function buildClassReportWorkbook(classroomId: string): Promise<Buffer> {
  const classroom = getClassroom(classroomId);
  const analytics = getClassAnalytics(classroomId);
  const assignmentStats = getClassAssignmentStats(classroomId);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Digital Textbook Demo";
  const overview = workbook.addWorksheet("班级概览");
  overview.columns = [
    { header: "指标", key: "metric", width: 28 },
    { header: "数值", key: "value", width: 24 }
  ];
  overview.addRows([
    { metric: "班级", value: classroom.name },
    { metric: "学生人数", value: analytics.studentCount },
    { metric: "平均进度", value: `${Math.round(analytics.averageProgress * 100)}%` },
    { metric: "平均学习分钟", value: Math.round(analytics.averageActiveSeconds / 60) },
    { metric: "平均正确率", value: `${Math.round(analytics.averageQuizAccuracy * 100)}%` },
    { metric: "仿真参与率", value: `${Math.round(analytics.simulationParticipationRate * 100)}%` },
    { metric: "作业发布数", value: assignmentStats.length }
  ]);
  styleWorksheet(overview);

  const assignments = workbook.addWorksheet("作业统计");
  assignments.columns = [
    { header: "作业", key: "title", width: 28 },
    { header: "状态", key: "status", width: 16 },
    { header: "提交人数", key: "submitted", width: 14 },
    { header: "批改人数", key: "graded", width: 14 },
    { header: "平均分", key: "averageScore", width: 14 },
    { header: "满分", key: "maxScore", width: 14 }
  ];
  assignments.addRows(assignmentStats);
  styleWorksheet(assignments);

  const trend = workbook.addWorksheet("活动趋势");
  trend.columns = [
    { header: "日期", key: "day", width: 20 },
    { header: "事件数", key: "count", width: 16 }
  ];
  trend.addRows(analytics.trend);
  styleWorksheet(trend);
  return workbookToBuffer(workbook);
}

export async function buildResourceLearningWorkbook(classroomId: string): Promise<Buffer> {
  const classroom = getClassroom(classroomId);
  const details = getResourceLearningDetails(classroomId);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Digital Textbook Demo";
  const summary = workbook.addWorksheet("资源学习汇总");
  summary.columns = [
    { header: "资源", key: "title", width: 34 },
    { header: "类型", key: "kind", width: 16 },
    { header: "分类", key: "category", width: 18 },
    { header: "打开次数", key: "openCount", width: 12 },
    { header: "学习人数", key: "studentCount", width: 12 },
    { header: "最近打开", key: "lastOpenedAt", width: 24 }
  ];
  summary.addRow({ title: classroom.name, kind: "班级", category: "资源学习明细", openCount: "", studentCount: "", lastOpenedAt: "" });
  summary.addRows(details.summaries);
  styleWorksheet(summary);

  const events = workbook.addWorksheet("打开明细");
  events.columns = [
    { header: "学生", key: "studentName", width: 18 },
    { header: "事件", key: "eventType", width: 18 },
    { header: "资源", key: "title", width: 34 },
    { header: "类型", key: "kind", width: 16 },
    { header: "分类", key: "category", width: 18 },
    { header: "资源ID", key: "resourceId", width: 24 },
    { header: "素材ID", key: "assetId", width: 24 },
    { header: "章节", key: "chapterId", width: 22 },
    { header: "节点", key: "nodeId", width: 28 },
    { header: "时间", key: "occurredAt", width: 24 }
  ];
  events.addRows(details.events);
  styleWorksheet(events);
  return workbookToBuffer(workbook);
}

export function buildPersonalReportSvg(userId: string, bookId: string): string {
  const snapshot = getCurrentSnapshot(bookId);
  const report = getPersonalReport(userId, snapshot.versionId);
  const bars = [
    { label: "阅读", value: Math.min(100, Math.round(report.activeSeconds / 12)) },
    { label: "媒体", value: Math.round(report.mediaCompletionRate * 100) },
    { label: "仿真", value: Math.min(100, report.simulationRuns * 12) },
    { label: "笔记", value: Math.min(100, report.noteCount * 20) }
  ];
  return barSvg("个人学习报告", bars);
}

export function buildClassReportSvg(classroomId: string): string {
  const analytics = getClassAnalytics(classroomId);
  const bars = [
    { label: "进度", value: Math.round(analytics.averageProgress * 100) },
    { label: "音频", value: Math.round(analytics.audioCompletionRate * 100) },
    { label: "视频", value: Math.round(analytics.videoCompletionRate * 100) },
    { label: "仿真", value: Math.round(analytics.simulationParticipationRate * 100) },
    { label: "正确率", value: Math.round(analytics.averageQuizAccuracy * 100) }
  ];
  return barSvg("班级学习报告", bars);
}

function toAssignmentWithStats(row: AssignmentRow): AssignmentWithStats {
  const questions = getAssignmentQuestions(row.id);
  return {
    id: row.id,
    classroomId: row.classroomId,
    title: row.title,
    instructions: row.instructions,
    status: row.status,
    dueAt: row.dueAt,
    sections: parseAssignmentSections(row.sectionsJson, questions),
    createdAt: row.createdAt,
    publishedAt: row.publishedAt,
    questions,
    submittedCount: countWhere("AssignmentSubmission", "assignmentId = ?", [row.id]),
    gradedCount: countWhere("AssignmentSubmission", "assignmentId = ? AND status = 'GRADED'", [row.id])
  };
}

function getAssignmentWithStats(assignmentId: string): AssignmentWithStats {
  return toAssignmentWithStats(mustGetAssignment(assignmentId));
}

function mustGetAssignment(assignmentId: string): AssignmentRow {
  const row = asRow<AssignmentRow>(getDb().prepare("SELECT * FROM Assignment WHERE id = ?").get(assignmentId));
  if (!row) {
    throw new Error("ASSIGNMENT_NOT_FOUND");
  }
  return row;
}

function getAssignmentQuestions(assignmentId: string): QuizQuestion[] {
  return asRows<AssignmentQuestionRow>(getDb().prepare("SELECT * FROM AssignmentQuestion WHERE assignmentId = ? ORDER BY sortOrder ASC").all(assignmentId))
    .map((row) => QuizQuestionSchema.parse(JSON.parse(row.questionJson) as unknown));
}

function getBankQuestions(teacherId: string, itemIds: string[]): QuizQuestion[] {
  const rows = asRows<QuestionBankItemRow>(
    getDb().prepare(`SELECT * FROM QuestionBankItem WHERE teacherId = ? AND id IN (${itemIds.map(() => "?").join(",")})`).all(teacherId, ...itemIds)
  );
  const byId = new Map(rows.map((row) => [row.id, QuizQuestionSchema.parse(JSON.parse(row.questionJson) as unknown)]));
  return itemIds.map((itemId) => byId.get(itemId)).filter((question): question is QuizQuestion => Boolean(question));
}

function normalizeAssignmentSections(sections: AssignmentSection[], questions: QuizQuestion[]): AssignmentSection[] {
  const validQuestionIds = new Set(questions.map((question) => question.id));
  const used = new Set<string>();
  const normalized = sections.map((section, index) => AssignmentSectionSchema.parse({
    id: section.id || `section-${index + 1}`,
    title: section.title || `第 ${index + 1} 大题`,
    instructions: section.instructions ?? "",
    questionIds: section.questionIds.filter((questionId) => validQuestionIds.has(questionId) && !used.has(questionId))
  })).map((section) => {
    section.questionIds.forEach((questionId) => used.add(questionId));
    return section;
  }).filter((section) => section.questionIds.length > 0 || sections.length <= 1);

  const unassigned = questions.map((question) => question.id).filter((questionId) => !used.has(questionId));
  if (normalized.length === 0) {
    return [AssignmentSectionSchema.parse({
      id: "section-core",
      title: "综合练习",
      instructions: "按顺序完成本组题目。",
      questionIds: questions.map((question) => question.id)
    })];
  }
  if (unassigned.length > 0) {
    normalized[0] = AssignmentSectionSchema.parse({ ...normalized[0], questionIds: [...normalized[0].questionIds, ...unassigned] });
  }
  return normalized;
}

function parseAssignmentSections(value: string, questions: QuizQuestion[]): AssignmentSection[] {
  try {
    const parsed = z.array(AssignmentSectionSchema).parse(JSON.parse(value) as unknown);
    return normalizeAssignmentSections(parsed, questions);
  } catch {
    return normalizeAssignmentSections([], questions);
  }
}

function getSubmissionForStudent(assignmentId: string, studentId: string): AssignmentSubmission | null {
  const row = asRow<AssignmentSubmissionRow>(getDb().prepare("SELECT * FROM AssignmentSubmission WHERE assignmentId = ? AND studentId = ?").get(assignmentId, studentId));
  return row ? toSubmission(row) : null;
}

function getSubmissionById(submissionId: string): AssignmentSubmission | null {
  const row = asRow<AssignmentSubmissionRow>(getDb().prepare("SELECT * FROM AssignmentSubmission WHERE id = ?").get(submissionId));
  return row ? toSubmission(row) : null;
}

function toSubmission(row: AssignmentSubmissionRow): AssignmentSubmission {
  return {
    id: row.id,
    assignmentId: row.assignmentId,
    studentId: row.studentId,
    studentName: getUserName(row.studentId),
    answers: JSON.parse(row.answersJson) as Record<string, QuizAnswer>,
    textAnswer: row.textAnswer,
    score: row.score,
    maxScore: row.maxScore,
    feedback: row.feedback,
    status: row.status,
    submittedAt: row.submittedAt,
    gradedAt: row.gradedAt
  };
}

function toQuestionBankItem(row: QuestionBankItemRow): QuestionBankItem {
  return {
    id: row.id,
    source: row.source,
    question: QuizQuestionSchema.parse(JSON.parse(row.questionJson) as unknown),
    tags: JSON.parse(row.tagsJson) as string[],
    createdAt: row.createdAt
  };
}

function parseQuestionBankRow(row: ExcelJS.Row, headers: Map<string, number>): { question: QuizQuestion; tags: string[] } {
  const type = normalizeQuestionType(cellByHeader(row, headers, "type"));
  const question = cellByHeader(row, headers, "question");
  const options = splitList(cellByHeader(row, headers, "options")).map(stripOptionPrefix).filter(Boolean);
  const correctText = cellByHeader(row, headers, "correct");
  const explanation = cellByHeader(row, headers, "explanation") || "已导入题库，待教师补充解析。";
  const score = Number(cellByHeader(row, headers, "score") || "5");
  const tags = splitList(cellByHeader(row, headers, "tags"));
  const sectionId = slugSection(cellByHeader(row, headers, "section"));
  const media = parseQuestionMedia(cellByHeader(row, headers, "mediaAssetIds"));
  const base = { id: id("question"), question, explanation, score, media, sectionId: sectionId || undefined };
  if (!question) {
    throw new Error("QUESTION_TEXT_REQUIRED");
  }
  if (!Number.isFinite(score) || score <= 0) {
    throw new Error("QUESTION_SCORE_INVALID");
  }
  if (type === "single" || type === "multiple") {
    const correct = parseCorrectIndexes(correctText, options);
    return {
      question: QuizQuestionSchema.parse({ ...base, type, options, correct }),
      tags
    };
  }
  if (type === "boolean") {
    return {
      question: QuizQuestionSchema.parse({ ...base, type, correct: parseBoolean(correctText) }),
      tags
    };
  }
  if (type === "fill") {
    return {
      question: QuizQuestionSchema.parse({ ...base, type, acceptedAnswers: splitList(correctText) }),
      tags
    };
  }
  if (type === "ordering") {
    return {
      question: QuizQuestionSchema.parse({ ...base, type, items: options, correct: parseCorrectIndexes(correctText || options.map((_, index) => String(index + 1)).join(","), options) }),
      tags
    };
  }
  if (type === "matching") {
    const parsedPairs = parseMatchingPairs(cellByHeader(row, headers, "options"));
    const leftItems = splitList(cellByHeader(row, headers, "leftItems")).map(stripOptionPrefix).filter(Boolean);
    const rightItems = splitList(cellByHeader(row, headers, "rightItems")).map(stripOptionPrefix).filter(Boolean);
    const left = leftItems.length ? leftItems : parsedPairs.map((pair) => pair.left);
    const right = rightItems.length ? rightItems : parsedPairs.map((pair) => pair.right);
    const correct = correctText ? parseCorrectIndexes(correctText, right) : parsedPairs.map((_, index) => index);
    return {
      question: QuizQuestionSchema.parse({ ...base, type, leftItems: left, rightItems: right, correct }),
      tags
    };
  }
  return {
    question: QuizQuestionSchema.parse({
      ...base,
      type,
      rubric: splitList(cellByHeader(row, headers, "rubric") || correctText || "科学性|逻辑完整"),
      sampleAnswer: cellByHeader(row, headers, "sampleAnswer") || explanation
    }),
    tags
  };
}

function headerIndexes(row: ExcelJS.Row): Map<string, number> {
  const aliases = new Map<string, string>([
    ["type", "type"],
    ["题型", "type"],
    ["类型", "type"],
    ["question", "question"],
    ["题干", "question"],
    ["题目", "question"],
    ["options", "options"],
    ["选项", "options"],
    ["leftitems", "leftItems"],
    ["left", "leftItems"],
    ["左项", "leftItems"],
    ["左侧", "leftItems"],
    ["rightitems", "rightItems"],
    ["right", "rightItems"],
    ["右项", "rightItems"],
    ["右侧", "rightItems"],
    ["correct", "correct"],
    ["答案", "correct"],
    ["answer", "correct"],
    ["rubric", "rubric"],
    ["评分标准", "rubric"],
    ["sampleanswer", "sampleAnswer"],
    ["参考答案", "sampleAnswer"],
    ["explanation", "explanation"],
    ["解析", "explanation"],
    ["score", "score"],
    ["分值", "score"],
    ["mediaassetids", "mediaAssetIds"],
    ["media", "mediaAssetIds"],
    ["媒体资源", "mediaAssetIds"],
    ["素材", "mediaAssetIds"],
    ["section", "section"],
    ["大题", "section"],
    ["题组", "section"],
    ["tags", "tags"],
    ["标签", "tags"]
  ]);
  const indexes = new Map<string, number>();
  for (let index = 1; index <= row.cellCount; index += 1) {
    const key = aliases.get(cellToText(row.getCell(index).value).trim().toLowerCase());
    if (key) {
      indexes.set(key, index);
    }
  }
  return indexes;
}

function cellByHeader(row: ExcelJS.Row, headers: Map<string, number>, field: string): string {
  const index = headers.get(field);
  return index ? cellToText(row.getCell(index).value).trim() : "";
}

function cellToText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  const record = objectRecord(value);
  if (typeof record.text === "string") return record.text;
  if (Array.isArray(record.richText)) {
    return record.richText.map((item) => objectRecord(item).text).filter((item): item is string => typeof item === "string").join("");
  }
  if ("result" in record) {
    return cellToText(record.result as ExcelJS.CellValue);
  }
  return "";
}

function normalizeQuestionType(value: string): QuizQuestion["type"] {
  const normalized = value.trim().toLowerCase();
  if (["single", "单选", "单选题"].includes(normalized)) return "single";
  if (["multiple", "多选", "多选题"].includes(normalized)) return "multiple";
  if (["boolean", "判断", "判断题", "truefalse"].includes(normalized)) return "boolean";
  if (["fill", "填空", "填空题"].includes(normalized)) return "fill";
  if (["ordering", "order", "sort", "排序", "排序题"].includes(normalized)) return "ordering";
  if (["matching", "match", "pair", "配对", "配对题"].includes(normalized)) return "matching";
  if (["shortanswer", "short_answer", "essay", "解答", "解答题", "问答题"].includes(normalized)) return "shortAnswer";
  throw new Error("QUESTION_TYPE_INVALID");
}

function splitList(value: string): string[] {
  return value.split(/[|,，;；\n]/).map((item) => item.trim()).filter(Boolean);
}

function parseQuestionMedia(value: string): QuizQuestion["media"] {
  return splitList(value).map((assetId) => ({
    assetId,
    title: assetId,
    kind: guessQuestionMediaKind(assetId),
    caption: "题内参考素材"
  }));
}

function guessQuestionMediaKind(assetId: string): QuizQuestion["media"][number]["kind"] {
  const normalized = assetId.toLowerCase();
  if (normalized.includes("image") || normalized.includes("diagram") || normalized.includes("force")) return "IMAGE";
  if (normalized.includes("audio")) return "AUDIO";
  if (normalized.includes("video")) return "VIDEO";
  if (normalized.includes("pdf") || normalized.includes("guide")) return "PDF";
  if (normalized.includes("doc")) return "DOCX";
  if (normalized.includes("scorm")) return "SCORM";
  if (normalized.includes("h5p")) return "H5P";
  return "OTHER";
}

function parseMatchingPairs(value: string): { left: string; right: string }[] {
  return splitList(value).map((item) => {
    const [left, right] = item.split(/=>|->|=|：|:/).map((part) => stripOptionPrefix(part).trim());
    return left && right ? { left, right } : null;
  }).filter((item): item is { left: string; right: string } => Boolean(item));
}

function slugSection(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return `section-${trimmed.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-").replace(/^-+|-+$/g, "")}`;
}

function stripOptionPrefix(value: string): string {
  return value.replace(/^[A-Ha-h][\.、:：]\s*/, "").trim();
}

function parseCorrectIndexes(value: string, options: string[]): number[] {
  const tokens = splitList(value);
  const indexes = tokens.map((token) => {
    const upper = token.toUpperCase();
    if (/^[A-H]$/.test(upper)) return upper.charCodeAt(0) - 65;
    const numeric = Number(token);
    if (Number.isInteger(numeric)) return numeric === 0 ? 0 : numeric - 1;
    return options.findIndex((option) => option === stripOptionPrefix(token));
  }).filter((index) => index >= 0 && index < options.length);
  if (indexes.length === 0) {
    throw new Error("QUESTION_CORRECT_INVALID");
  }
  return [...new Set(indexes)];
}

function parseBoolean(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (["true", "t", "1", "yes", "y", "对", "正确", "是"].includes(normalized)) return true;
  if (["false", "f", "0", "no", "n", "错", "错误", "否"].includes(normalized)) return false;
  throw new Error("QUESTION_BOOLEAN_INVALID");
}

function getCourseForClassroom(classroomId: string): CourseRow {
  const row = asRow<CourseRow>(
    getDb().prepare("SELECT Course.* FROM Course JOIN Classroom ON Classroom.courseId = Course.id WHERE Classroom.id = ?").get(classroomId)
  );
  if (!row) {
    throw new Error("CLASSROOM_NOT_FOUND");
  }
  return row;
}

function ensureClassroomTeacher(classroomId: string, teacherId: string): CourseRow {
  const course = getCourseForClassroom(classroomId);
  if (course.teacherId !== teacherId) {
    throw new Error("FORBIDDEN");
  }
  return course;
}

function ensureStudentEnrollment(classroomId: string, studentId: string): void {
  const row = asRow<{ id: string }>(getDb().prepare("SELECT id FROM Enrollment WHERE classroomId = ? AND studentId = ?").get(classroomId, studentId));
  if (!row) {
    throw new Error("STUDENT_NOT_IN_CLASS");
  }
}

function getAsset(assetId: string): Asset | null {
  const row = asRow<AssetRow>(getDb().prepare("SELECT * FROM Asset WHERE id = ?").get(assetId));
  return row ? toAsset(row) : null;
}

function mustGetCourseResource(resourceId: string): CourseResource {
  const row = asRow<CourseResourceRow>(getDb().prepare("SELECT * FROM CourseResource WHERE id = ?").get(resourceId));
  if (!row) {
    throw new Error("COURSE_RESOURCE_NOT_FOUND");
  }
  return toCourseResource(row);
}

function toCourseResource(row: CourseResourceRow): CourseResource {
  const asset = getAsset(row.assetId);
  if (!asset) {
    throw new Error("ASSET_NOT_FOUND");
  }
  return {
    id: row.id,
    courseId: row.courseId,
    title: row.title,
    description: row.description,
    category: CourseResourceCategorySchema.parse(row.category),
    visibility: row.visibility,
    createdAt: row.createdAt,
    asset
  };
}

function listAssignmentSubmissionsForStudent(studentId: string): (AssignmentSubmission & { assignmentTitle: string })[] {
  const rows = asRows<AssignmentSubmissionRow & { assignmentTitle: string }>(
    getDb().prepare("SELECT AssignmentSubmission.*, Assignment.title AS assignmentTitle FROM AssignmentSubmission JOIN Assignment ON Assignment.id = AssignmentSubmission.assignmentId WHERE AssignmentSubmission.studentId = ? ORDER BY submittedAt DESC").all(studentId)
  );
  return rows.map((row) => ({ ...toSubmission(row), assignmentTitle: row.assignmentTitle }));
}

function getClassAssignmentStats(classroomId: string): { title: string; status: string; submitted: number; graded: number; averageScore: number | string; maxScore: number | string }[] {
  const rows = asRows<AssignmentRow>(getDb().prepare("SELECT * FROM Assignment WHERE classroomId = ? ORDER BY createdAt DESC").all(classroomId));
  return rows.map((row) => {
    const submissions = asRows<AssignmentSubmissionRow>(getDb().prepare("SELECT * FROM AssignmentSubmission WHERE assignmentId = ?").all(row.id));
    const scored = submissions.filter((item) => item.score !== null);
    const maxScore = submissions[0]?.maxScore ?? getAssignmentQuestions(row.id).reduce((sum, question) => sum + question.score, 0);
    return {
      title: row.title,
      status: row.status,
      submitted: submissions.length,
      graded: submissions.filter((item) => item.status === "GRADED").length,
      averageScore: scored.length ? Math.round((scored.reduce((sum, item) => sum + (item.score ?? 0), 0) / scored.length) * 10) / 10 : "",
      maxScore
    };
  });
}

function getUserName(userId: string): string {
  const row = asRow<{ name: string }>(getDb().prepare("SELECT name FROM User WHERE id = ?").get(userId));
  return row?.name ?? userId;
}

function extractConcepts(text: string): string[] {
  const known = ["合力", "加速度", "质量", "惯性", "F=ma", "牛顿第二定律", "图像", "实验", "摩擦", "能量"];
  return known.filter((item) => text.includes(item));
}

function compactText(text: string, length: number): string {
  const compacted = text.replace(/\s+/g, " ").trim();
  return compacted.length > length ? `${compacted.slice(0, length)}...` : compacted || "未命名笔记";
}

function countWhere(table: string, where: string, params: (string | number)[]): number {
  const row = asRow<{ value: number }>(getDb().prepare(`SELECT COUNT(*) AS value FROM ${table} WHERE ${where}`).get(...params));
  return row?.value ?? 0;
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function styleWorksheet(sheet: ExcelJS.Worksheet): void {
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1B7F83" } };
  sheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
  sheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFD8DDD7" } },
        left: { style: "thin", color: { argb: "FFD8DDD7" } },
        bottom: { style: "thin", color: { argb: "FFD8DDD7" } },
        right: { style: "thin", color: { argb: "FFD8DDD7" } }
      };
      cell.alignment = { vertical: "top", wrapText: true };
    });
  });
}

async function workbookToBuffer(workbook: ExcelJS.Workbook): Promise<Buffer> {
  const data: unknown = await workbook.xlsx.writeBuffer();
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  throw new Error("WORKBOOK_EXPORT_FAILED");
}

function barSvg(title: string, bars: { label: string; value: number }[]): string {
  const width = 720;
  const height = 120 + bars.length * 62;
  const rows = bars.map((bar, index) => {
    const y = 86 + index * 62;
    const barWidth = Math.max(8, Math.min(100, bar.value) * 4.8);
    return `<text x="42" y="${y + 20}" font-size="18" fill="#17211d">${escapeXml(bar.label)}</text><rect x="150" y="${y}" width="480" height="28" rx="6" fill="#eef6f3"/><rect x="150" y="${y}" width="${barWidth}" height="28" rx="6" fill="#1b7f83"/><text x="650" y="${y + 20}" font-size="18" fill="#17211d">${Math.round(bar.value)}%</text>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#f7f5ee"/><text x="42" y="50" font-size="28" font-weight="700" fill="#17211d">${escapeXml(title)}</text>${rows}</svg>`;
}

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
