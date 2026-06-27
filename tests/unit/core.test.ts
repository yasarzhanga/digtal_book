import { beforeEach, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import fs from "node:fs";
import { DEMO_BOOK_ID, DEMO_CLASSROOM_ID, DEMO_COURSE_ID } from "@/server/db/ids";
import { closeDb, getDb } from "@/server/db/client";
import {
  ensureAttendanceStudent,
  ensureEditorBookOwner,
  ensureLiveQuizStudent,
  ensureStudentClassroomAccess,
  ensureTeacherClassroomAccess
} from "@/server/auth/guards";
import { demoLogin, type PublicUser } from "@/server/services/auth";
import { getEditorBook, importDocxUpload, publishBook, saveChapterDocument } from "@/server/services/books";
import { getCurrentSnapshot } from "@/server/services/books";
import { auditNoUnsupportedEventTypes, getPersonalReport, mediaCompletionRateForPrefix, saveExperiment, searchBook, submitQuiz, upsertReadingState } from "@/server/services/reader";
import {
  createClassroomForCourse,
  createCourseWithClassroom,
  deleteCourse,
  getAttendanceRows,
  getClassAnalytics,
  getLiveQuizResults,
  getResourceLearningDetails,
  joinClassroom,
  listStudentClassrooms,
  listTeacherCourses,
  respondLiveQuiz,
  signAttendance,
  startAttendance,
  startLiveQuiz,
  startLiveSession,
  updateClassroom,
  updateCourse
} from "@/server/services/teaching";
import {
  askAiQuestion,
  listAiConversations,
  suggestFormula
} from "@/server/services/ai";
import { importChartWorkbook } from "@/server/services/authoring";
import { detectPreviewAdapter, getAssetPreview } from "@/server/services/previews";
import {
  assignTenantRole,
  buildPostgresMigrationPlan,
  claimNextJob,
  completeJob,
  createDatabaseBackup,
  enqueueJob,
  getCloudReadiness,
  listBackups,
  listTenantsForUser,
  putObject
} from "@/server/services/cloud";
import {
  buildClassReportSvg,
  buildClassReportWorkbook,
  buildResourceLearningWorkbook,
  buildNotesMindMap,
  buildPersonalReportWorkbook,
  createAssignment,
  createCourseResource,
  getFormulaTemplates,
  importQuestionBankWorkbook,
  listAssignmentsForStudent,
  listAssignmentsForTeacher,
  listCourseResourcesForClassroom,
  listQuestionBank,
  publishAssignment,
  runAndSaveSimulationTemplate,
  saveNotesMindMap,
  submitAssignment,
  gradeAssignmentSubmission,
  listAssignmentSubmissions
} from "@/server/services/p1";
import { recordEvent } from "@/server/services/events";
import { collectAssetIdsFromDocument } from "@/content-engine/utils/assets";
import { applyAnnotationMarksToHtml } from "@/content-engine/utils/annotations";
import { buildPieSlices } from "@/content-engine/utils/chart";
import { acceleration, sampleMotion } from "@/content-engine/utils/simulation";
import { scoreQuiz } from "@/content-engine/utils/quiz";
import { resetDemoDatabase } from "../../scripts/db-reset";

async function resetDb(): Promise<void> {
  closeDb();
  await resetDemoDatabase();
}

beforeEach(async () => {
  await resetDb();
});

describe("content engine and publishing", () => {
  it("validates seeded nodes and collects reused asset references", () => {
    const snapshot = getCurrentSnapshot(DEMO_BOOK_ID);
    const nodeTypes = new Set(snapshot.chapters.flatMap((chapter) => chapter.document.nodes.map((node) => node.type)));
    expect(nodeTypes).toEqual(new Set([
      "heading",
      "richText",
      "callout",
      "imageInteractive",
      "gallery",
      "audio",
      "video",
      "extendedReading",
      "formulaBlock",
      "model3d",
      "panorama",
      "physicsSimulation",
      "chart",
      "quizSet",
      "recordingTask",
      "attachment",
      "knowledgeGraph"
    ]));
    const references = snapshot.chapters.flatMap((chapter) => collectAssetIdsFromDocument(chapter.document));
    expect(references).toContain("asset_video");
    expect(references).toContain("asset_cart3d");
  });

  it("increments immutable published versions transactionally", () => {
    const snapshot = publishBook(DEMO_BOOK_ID, "unit test publish");
    expect(snapshot.versionNumber).toBe(2);
    expect(getCurrentSnapshot(DEMO_BOOK_ID).versionId).toBe(snapshot.versionId);
  });

  it("rejects stale draft revisions", () => {
    const book = getEditorBook(DEMO_BOOK_ID);
    const chapter = book.chapters[0];
    const first = saveChapterDocument(chapter.id, { revision: chapter.revision, document: chapter.document });
    expect(first.revision).toBe(chapter.revision + 1);
    expect(() => saveChapterDocument(chapter.id, { revision: chapter.revision, document: chapter.document })).toThrow("REVISION_CONFLICT");
  });

  it("imports an uploaded docx buffer into a new editable chapter", async () => {
    const buffer = fs.readFileSync("starter-assets/imports/sample-physics.docx");
    const preview = await importDocxUpload(DEMO_BOOK_ID, "user_editor", { fileName: "unit-upload.docx", buffer, confirm: false });
    expect(preview.chapterCount).toBeGreaterThan(0);
    expect(preview.tableCount).toBeGreaterThan(0);
    const result = await importDocxUpload(DEMO_BOOK_ID, "user_editor", { fileName: "unit-upload.docx", buffer, confirm: true });
    expect(result.createdChapterIds?.length).toBe(result.chapterCount);
    const book = getEditorBook(DEMO_BOOK_ID);
    expect(book.chapters.some((chapter) => result.createdChapterIds?.includes(chapter.id) && chapter.document.nodes.some((node) => node.type === "richText" && node.html.includes("<table")))).toBe(true);
  });
});

describe("learning interactions", () => {
  it("calculates F=ma deterministically", () => {
    expect(acceleration(6, 2)).toBe(3);
    const samples = sampleMotion(6, 2, 2, 1);
    expect(samples.at(-1)).toEqual({ time: 2, velocity: 6, position: 6 });
  });

  it("scores seven question types and persists attempts", () => {
    const snapshot = getCurrentSnapshot(DEMO_BOOK_ID);
    const quizNode = snapshot.chapters.flatMap((chapter) => chapter.document.nodes).find((node) => node.type === "quizSet");
    expect(quizNode?.type).toBe("quizSet");
    if (quizNode?.type !== "quizSet") throw new Error("quiz missing");
    const score = scoreQuiz(quizNode.questions, { q1: 2, q2: [0, 1, 3], q3: false, q4: "2.5" });
    expect(score.score).toBe(score.maxScore);
    const submitted = submitQuiz("user_student", snapshot, {
      bookVersionId: snapshot.versionId,
      chapterId: "chapter-practice",
      nodeId: quizNode.nodeId,
      answers: { q1: 2, q2: [0, 1, 3], q3: false, q4: "2.5" },
      durationSeconds: 60
    });
    expect(submitted.score).toBe(submitted.maxScore);

    const advancedQuestions = listQuestionBank("user_teacher").map((item) => item.question).filter((question) => ["ordering", "matching", "shortAnswer"].includes(question.type));
    const advancedScore = scoreQuiz(advancedQuestions, {
      q_order_experiment: [0, 1, 2, 3],
      q_match_quantities: [2, 1, 0],
      q_short_reasoning: "由 a=F/m 可知质量越大加速度越小。"
    });
    expect(advancedScore.maxScore).toBe(22);
    expect(advancedScore.score).toBe(12);
  });

  it("saves simulation runs and reports them from the database", () => {
    const snapshot = getCurrentSnapshot(DEMO_BOOK_ID);
    const saved = saveExperiment("user_student", {
      bookVersionId: snapshot.versionId,
      chapterId: "chapter-operate",
      nodeId: "chapter-operate-5-physicsSimulation",
      force: 8,
      mass: 2
    });
    expect(saved.acceleration).toBe(4);
    const report = getPersonalReport("user_student", snapshot.versionId);
    expect(report.savedExperiments.some((item) => item.force === 8 && item.mass === 2)).toBe(true);
    expect(report.simulationRuns).toBeGreaterThan(0);
  });

  it("keeps activity event types inside the accepted matrix", () => {
    expect(auditNoUnsupportedEventTypes()).toBe(true);
    const report = getPersonalReport("user_student", getCurrentSnapshot(DEMO_BOOK_ID).versionId);
    expect(report.mediaCompletionRate).toBeGreaterThan(0);
  });

  it("renders annotation offsets back into rich text html", () => {
    const html = "<p>牛顿第二定律说明力改变运动。</p>";
    const marked = applyAnnotationMarksToHtml(html, [{
      id: "note_unit",
      quote: "第二定律",
      startOffset: 2,
      endOffset: 6,
      color: "blue",
      note: "重点"
    }]);
    expect(marked).toContain('<mark class="annotation-mark blue"');
    expect(marked).toContain(">第二定律</mark>");
  });

  it("aggregates active reading heartbeats and max media progress", () => {
    const snapshot = getCurrentSnapshot(DEMO_BOOK_ID);
    getDb().prepare("DELETE FROM ActivityEvent WHERE userId = ?").run("user_student_8");
    getDb().prepare("DELETE FROM ReadingState WHERE userId = ?").run("user_student_8");
    upsertReadingState("user_student_8", {
      bookVersionId: snapshot.versionId,
      lastChapterId: "chapter-observe",
      lastNodeId: "chapter-observe-1-richText",
      activeSecondsDelta: 10
    });
    upsertReadingState("user_student_8", {
      bookVersionId: snapshot.versionId,
      lastChapterId: "chapter-observe",
      lastNodeId: "chapter-observe-1-richText",
      activeSecondsDelta: 0
    });
    recordEvent("user_student_8", { bookVersionId: snapshot.versionId, eventType: "AUDIO_PROGRESS", nodeId: "audio_unit", progress: 0.25 });
    recordEvent("user_student_8", { bookVersionId: snapshot.versionId, eventType: "AUDIO_PROGRESS", nodeId: "audio_unit", progress: 0.8 });
    recordEvent("user_student_8", { bookVersionId: snapshot.versionId, eventType: "VIDEO_PROGRESS", nodeId: "video_unit", progress: 0.4 });
    recordEvent("user_student_8", { bookVersionId: snapshot.versionId, eventType: "VIDEO_PROGRESS", nodeId: "video_unit", progress: 0.3 });
    const report = getPersonalReport("user_student_8", snapshot.versionId);
    expect(report.activeSeconds).toBe(10);
    expect(mediaCompletionRateForPrefix("user_student_8", snapshot.versionId, "AUDIO")).toBe(0.8);
    expect(report.videoCompletionRate).toBe(0.4);
  });

  it("searches textbook resource file metadata as well as content text", () => {
    const results = searchBook(DEMO_BOOK_ID, "cart-experiment");
    expect(results.some((result) => result.source === "resource" && result.type.includes("VIDEO"))).toBe(true);
    const courseResources = listCourseResourcesForClassroom(DEMO_CLASSROOM_ID, "TEACHER");
    const docxResource = courseResources.find((resource) => resource.asset.id === "asset_docx");
    expect(String(docxResource?.asset.metadata.searchText ?? "")).toContain("实验目的");
  });
});

describe("teaching loop", () => {
  it("manages courses, classrooms and join links through the service layer", () => {
    const created = createCourseWithClassroom("user_teacher", { name: "单测课程", classroomName: "单测一班" });
    expect(created.joinCode).toMatch(/^C\d{6}$/);
    updateCourse("user_teacher", created.id, { name: "单测课程改名" });
    updateClassroom("user_teacher", created.classroomId, { name: "单测一班改名", joinCode: "UNIT77" });
    const extraClassroom = createClassroomForCourse("user_teacher", created.id, { name: "单测二班" });
    expect(extraClassroom.joinCode).toMatch(/^C\d{6}$/);
    expect(joinClassroom("user_student_8", "UNIT77")).toBe(created.classroomId);
    expect(Object.getPrototypeOf(listStudentClassrooms("user_student_8")[0])).toBe(Object.prototype);
    const rows = listTeacherCourses("user_teacher").filter((course) => course.id === created.id);
    expect(rows.some((course) => course.name === "单测课程改名" && course.classroomName === "单测一班改名")).toBe(true);
    deleteCourse("user_teacher", created.id);
    expect(listTeacherCourses("user_teacher").some((course) => course.id === created.id)).toBe(false);
  });

  it("aggregates live quiz responses from LiveQuizResponse", () => {
    startLiveSession(DEMO_CLASSROOM_ID);
    const liveQuiz = startLiveQuiz(DEMO_CLASSROOM_ID, { quizNodeId: "chapter-practice-1-quizSet", questionId: "q1" });
    const response = respondLiveQuiz("user_student", liveQuiz.id, { answer: 2 });
    expect(response.isCorrect).toBe(true);
    const results = getLiveQuizResults(liveQuiz.id);
    expect(results.answeredCount).toBe(1);
    expect(results.correctCount).toBe(1);
  });

  it("prevents duplicate attendance while preserving one present record", () => {
    const attendance = startAttendance(DEMO_CLASSROOM_ID);
    signAttendance("user_student", { code: attendance.code });
    signAttendance("user_student", { code: attendance.code });
    const analytics = getClassAnalytics(DEMO_CLASSROOM_ID);
    expect(analytics.studentCount).toBe(8);
  });

  it("requires location for geo attendance and stores distance in rows", () => {
    const attendance = startAttendance(DEMO_CLASSROOM_ID, { requireLocation: true, latitude: 31.2304, longitude: 121.4737, radiusMeters: 300 });
    signAttendance("user_student", { code: attendance.code, latitude: 31.23045, longitude: 121.47375, accuracyMeters: 20 });
    expect(() => signAttendance("user_student_2", { code: attendance.code, latitude: 39.9042, longitude: 116.4074 })).toThrow("ATTENDANCE_OUT_OF_RANGE");
    const signed = getAttendanceRows(attendance.id).find((row) => row.studentId === "user_student");
    expect(signed?.source).toBe("student-geo");
    expect(signed?.distanceMeters ?? 999).toBeLessThan(50);
  });

  it("builds class analytics from persisted activity and learning tables", () => {
    const analytics = getClassAnalytics(DEMO_CLASSROOM_ID);
    expect(analytics.averageActiveSeconds).toBeGreaterThan(0);
    expect(analytics.simulationParticipationRate).toBeGreaterThan(0);
    expect(analytics.averageQuizAccuracy).toBeGreaterThan(0);
  });

  it("summarizes resource learning details and exports them", async () => {
    const snapshot = getCurrentSnapshot(DEMO_BOOK_ID);
    const resource = listCourseResourcesForClassroom(DEMO_CLASSROOM_ID, "STUDENT").find((item) => item.asset.kind === "PDF");
    expect(resource).toBeTruthy();
    if (!resource) throw new Error("resource missing");
    recordEvent("user_student", {
      bookVersionId: snapshot.versionId,
      classroomId: DEMO_CLASSROOM_ID,
      eventType: "RESOURCE_OPEN",
      payload: { resourceId: resource.id, assetId: resource.asset.id, category: resource.category, assetKind: resource.asset.kind }
    });
    const details = getResourceLearningDetails(DEMO_CLASSROOM_ID);
    expect(details.summaries.some((item) => item.title === resource.title && item.openCount >= 1)).toBe(true);
    expect((await buildResourceLearningWorkbook(DEMO_CLASSROOM_ID)).byteLength).toBeGreaterThan(4000);
  });
});

describe("security guards", () => {
  const editorUser: PublicUser = { id: "user_editor", name: "演示编辑者", email: "editor@demo.local", role: "EDITOR" };
  const teacherUser: PublicUser = { id: "user_teacher", name: "林老师", email: "teacher@demo.local", role: "TEACHER" };
  const studentUser: PublicUser = { id: "user_student", name: "陈同学", email: "student@demo.local", role: "STUDENT" };

  it("only enables demo login when DEMO_MODE is explicitly true", () => {
    const previous = process.env.DEMO_MODE;
    process.env.DEMO_MODE = "false";
    expect(() => demoLogin("student")).toThrow("DEMO_MODE_DISABLED");
    delete process.env.DEMO_MODE;
    expect(() => demoLogin("student")).toThrow("DEMO_MODE_DISABLED");
    process.env.DEMO_MODE = "true";
    expect(demoLogin("student").id).toBe("user_student");
    if (previous === undefined) {
      delete process.env.DEMO_MODE;
    } else {
      process.env.DEMO_MODE = previous;
    }
  });

  it("prevents students and non-owner teachers from editing or publishing books", () => {
    expect(() => ensureEditorBookOwner(DEMO_BOOK_ID, studentUser)).toThrow("EDITOR_ROLE_REQUIRED_FORBIDDEN");
    expect(() => ensureEditorBookOwner(DEMO_BOOK_ID, teacherUser)).toThrow("EDITOR_ROLE_REQUIRED_FORBIDDEN");
    expect(() => ensureEditorBookOwner(DEMO_BOOK_ID, { ...editorUser, id: "user_editor_other" })).toThrow("BOOK_OWNER_FORBIDDEN");
    expect(ensureEditorBookOwner(DEMO_BOOK_ID, editorUser).id).toBe(DEMO_BOOK_ID);
  });

  it("prevents students and editors from starting teacher-only classroom actions", () => {
    expect(() => ensureTeacherClassroomAccess(DEMO_CLASSROOM_ID, studentUser)).toThrow("TEACHER_ROLE_REQUIRED_FORBIDDEN");
    expect(() => ensureTeacherClassroomAccess(DEMO_CLASSROOM_ID, editorUser)).toThrow("TEACHER_ROLE_REQUIRED_FORBIDDEN");
    expect(ensureTeacherClassroomAccess(DEMO_CLASSROOM_ID, teacherUser).id).toBe(DEMO_COURSE_ID);
  });

  it("prevents unenrolled students from live quiz and attendance actions", () => {
    const created = createCourseWithClassroom("user_teacher", { name: "权限测试课", classroomName: "未加入班级" });
    startLiveSession(created.classroomId);
    const liveQuiz = startLiveQuiz(created.classroomId, { quizNodeId: "chapter-practice-1-quizSet", questionId: "q1" });
    const attendance = startAttendance(created.classroomId);
    expect(() => ensureStudentClassroomAccess(created.classroomId, studentUser)).toThrow("STUDENT_CLASSROOM_FORBIDDEN");
    expect(() => ensureLiveQuizStudent(liveQuiz.id, "user_student")).toThrow("STUDENT_CLASSROOM_FORBIDDEN");
    expect(() => ensureAttendanceStudent(attendance.id, "user_student")).toThrow("STUDENT_CLASSROOM_FORBIDDEN");
  });
});

describe("P1 workflows", () => {
  it("answers AI questions with local textbook citations when no external key is configured", async () => {
    const previousAiKey = process.env.AI_API_KEY;
    const previousOpenAiKey = process.env.OPENAI_API_KEY;
    delete process.env.AI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const snapshot = getCurrentSnapshot(DEMO_BOOK_ID);
      const result = await askAiQuestion("user_student", DEMO_BOOK_ID, {
        bookVersionId: snapshot.versionId,
        question: "F=ma 中质量变大会怎样影响加速度？"
      });
      expect(result.providerStatus).toBe("local_fallback");
      expect(result.answer.content).toContain("F=ma");
      expect(result.answer.citations.length).toBeGreaterThan(0);
      const conversations = listAiConversations("user_student", snapshot.versionId);
      expect(conversations[0]?.messages).toHaveLength(2);
      expect(conversations[0]?.messages[1]?.citations[0]?.nodeId).toBeTruthy();
    } finally {
      if (previousAiKey) process.env.AI_API_KEY = previousAiKey;
      if (previousOpenAiKey) process.env.OPENAI_API_KEY = previousOpenAiKey;
    }
  });

  it("seeds assignment, accepts student submission and stores teacher grading", () => {
    const seeded = listAssignmentsForStudent(DEMO_CLASSROOM_ID, "user_student");
    expect(seeded[0]?.submission?.status).toBe("GRADED");
    expect(seeded[0]?.sections.map((section) => section.title)).toContain("二、实验操作");
    expect(seeded[0]?.questions.some((question) => question.type === "ordering" && question.media.length > 0)).toBe(true);
    const advancedBankItems = listQuestionBank("user_teacher").filter((item) => ["ordering", "matching", "shortAnswer"].includes(item.question.type));
    const draft = createAssignment("user_teacher", DEMO_CLASSROOM_ID, {
      title: "单测作业",
      instructions: "从题库抽题发布。",
      questionBankItemIds: advancedBankItems.map((item) => item.id),
      sections: [{
        id: "section-unit",
        title: "单测大题",
        instructions: "验证服务层保存大题结构。",
        questionIds: advancedBankItems.map((item) => item.question.id)
      }]
    });
    const published = publishAssignment("user_teacher", DEMO_CLASSROOM_ID, draft.id);
    expect(published.status).toBe("PUBLISHED");
    expect(published.sections[0]?.title).toBe("单测大题");
    const submission = submitAssignment("user_student_8", published.id, {
      answers: { q_order_experiment: [0, 1, 2, 3], q_match_quantities: [2, 1, 0], q_short_reasoning: "由 a=F/m 可知质量越大加速度越小。" },
      textAnswer: "质量越大，相同合力下加速度越小。"
    });
    expect(submission.status).toBe("SUBMITTED");
    const graded = gradeAssignmentSubmission("user_teacher", DEMO_CLASSROOM_ID, submission.id, { score: submission.maxScore, feedback: "批改通过。" });
    expect(graded.status).toBe("GRADED");
    expect(listAssignmentSubmissions("user_teacher", DEMO_CLASSROOM_ID, published.id)).toHaveLength(1);
    expect(listAssignmentsForTeacher(DEMO_CLASSROOM_ID, "user_teacher").some((item) => item.id === published.id)).toBe(true);
  });

  it("imports question bank rows from xlsx", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("导入");
    sheet.addRow(["type", "question", "options", "leftItems", "rightItems", "correct", "rubric", "sampleAnswer", "explanation", "score", "mediaAssetIds", "section", "tags"]);
    sheet.addRow(["single", "测试题：合力增大时加速度？", "增大|减小|不变", "", "", "A", "", "", "质量不变时成正比。", 5, "", "基础题", "单测"]);
    sheet.addRow(["ordering", "测试题：实验步骤排序", "连接传感器|施力|记录数据", "", "", "A,B,C", "", "", "先连接再施力并记录。", 6, "asset_forceDiagram", "实验题", "排序"]);
    sheet.addRow(["matching", "测试题：物理量配对", "", "合力F|质量m", "单位kg|单位N", "B,A", "", "", "F 对 N，m 对 kg。", 6, "", "实验题", "配对"]);
    sheet.addRow(["shortAnswer", "测试题：解释质量影响", "", "", "", "", "写出 a=F/m|说明质量越大加速度越小", "合力相同时，质量越大加速度越小。", "按 rubric 批改。", 10, "asset_guide", "探究题", "解答"]);
    const buffer = await workbookBuffer(workbook);
    const before = listQuestionBank("user_teacher").length;
    const result = await importQuestionBankWorkbook("user_teacher", "unit.xlsx", buffer);
    expect(result.imported).toBe(4);
    expect(result.errors).toHaveLength(0);
    const imported = listQuestionBank("user_teacher");
    expect(imported.length).toBe(before + 4);
    expect(imported.some((item) => item.question.type === "shortAnswer" && item.question.media.length > 0)).toBe(true);
  });

  it("lists independent course resources including local SCORM/H5P and creates resource references", () => {
    const resources = listCourseResourcesForClassroom(DEMO_CLASSROOM_ID, "TEACHER");
    expect(resources.some((item) => item.asset.kind === "SCORM")).toBe(true);
    expect(resources.some((item) => item.asset.kind === "H5P")).toBe(true);
    const created = createCourseResource("user_teacher", DEMO_CLASSROOM_ID, {
      assetId: "asset_guide",
      title: "单测 PDF 资源",
      description: "重复引用现有 PDF。",
      category: "REFERENCE",
      visibility: "CLASS"
    });
    expect(created.asset.kind).toBe("PDF");
  });

  it("builds reports, mind map, formula templates and simulation runs from services", async () => {
    const personalWorkbook = await buildPersonalReportWorkbook("user_student", DEMO_BOOK_ID);
    const classWorkbook = await buildClassReportWorkbook(DEMO_CLASSROOM_ID);
    expect(personalWorkbook.byteLength).toBeGreaterThan(4000);
    expect(classWorkbook.byteLength).toBeGreaterThan(4000);
    expect(buildClassReportSvg(DEMO_CLASSROOM_ID)).toContain("<svg");
    const mindMap = buildNotesMindMap("user_student", DEMO_BOOK_ID);
    expect(mindMap.nodes.some((node) => node.kind === "concept")).toBe(true);
    const savedMindMap = saveNotesMindMap("user_student", DEMO_BOOK_ID, {
      nodes: [...mindMap.nodes, { id: "custom:unit-force", label: "单测自定义力学节点", kind: "concept", weight: 2, x: 640, y: 180 }],
      edges: [...mindMap.edges, { source: "root", target: "custom:unit-force", label: "自定义" }]
    });
    expect(savedMindMap.nodes.some((node) => node.label === "单测自定义力学节点")).toBe(true);
    expect(buildNotesMindMap("user_student", DEMO_BOOK_ID).nodes.some((node) => node.label === "单测自定义力学节点")).toBe(true);
    const run = runAndSaveSimulationTemplate("user_student", { templateKey: "projectile", values: { speed: 12, angle: 40, gravity: 9.8 } });
    expect(run.result.metrics.length).toBeGreaterThan(1);
    expect(getFormulaTemplates().some((template) => template.id === "hooke-law")).toBe(true);
    expect(buildClassReportSvg(DEMO_CLASSROOM_ID)).toContain("班级学习报告");
    expect((await buildPersonalReportWorkbook("user_student", DEMO_BOOK_ID)).byteLength).toBeGreaterThan(4000);
  });

  it("imports chart data from xlsx and generates formula suggestions locally", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("实验趋势");
    sheet.addRow(["拉力", "加速度"]);
    sheet.addRow(["2N", 1]);
    sheet.addRow(["4N", 2]);
    sheet.addRow(["6N", 3]);
    const chart = await importChartWorkbook({ fileName: "chart.xlsx", buffer: await workbookBuffer(workbook) });
    expect(chart.title).toBe("实验趋势");
    expect(chart.items).toEqual([{ label: "2N", value: 1 }, { label: "4N", value: 2 }, { label: "6N", value: 3 }]);
    expect(chart.chartType).toBe("line");
    const slices = buildPieSlices([{ label: "音频", value: 2 }, { label: "视频", value: 3 }], 300, 200);
    expect(slices).toHaveLength(2);
    expect(slices[0].path).toContain("A ");
    expect(slices.reduce((sum, slice) => sum + slice.percentage, 0)).toBeCloseTo(1);

    const previousAiKey = process.env.AI_API_KEY;
    const previousOpenAiKey = process.env.OPENAI_API_KEY;
    delete process.env.AI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const suggestion = await suggestFormula({ prompt: "生成牛顿第二定律实验公式", currentLatex: "", context: "合力、质量和加速度" });
      expect(suggestion.latex).toBe("F=ma");
      expect(suggestion.parameterDemo?.force).toBe(6);
    } finally {
      if (previousAiKey) process.env.AI_API_KEY = previousAiKey;
      if (previousOpenAiKey) process.env.OPENAI_API_KEY = previousOpenAiKey;
    }
  });

  it("builds local file previews and detects specialist adapters", async () => {
    const pdfPreview = await getAssetPreview("asset_guide");
    expect(pdfPreview.mode).toBe("pdf");
    expect(pdfPreview.fileUrl).toContain("/api/assets/asset_guide/file");

    const docxPreview = await getAssetPreview("asset_docx");
    expect(docxPreview.mode).toBe("html");
    expect(docxPreview.html).toContain("牛顿第二定律");

    expect(detectPreviewAdapter("drawing.dwg", "application/acad").adapter).toBe("cad-metadata");
    expect(detectPreviewAdapter("drawing.dwg", "application/acad").title).toContain("识别与降级预览");
    expect(detectPreviewAdapter("scan.dcm", "application/dicom").adapter).toBe("dicom-metadata");
    expect(detectPreviewAdapter("flow.vsdx", "application/vnd.ms-visio.drawing").adapter).toBe("visio-metadata");
  });
});

describe("cloud readiness and security foundation", () => {
  it("reports cloud readiness, stores objects and runs the database queue", () => {
    const readiness = getCloudReadiness();
    expect(readiness.database.ready).toBe(true);
    expect(readiness.objectStorage.ready).toBe(true);

    const object = putObject({ key: "tenant-demo/reports/unit.txt", data: Buffer.from("cloud object"), contentType: "text/plain" });
    expect(fs.existsSync(object.absolutePath)).toBe(true);
    expect(() => putObject({ key: "../escape.txt", data: Buffer.from("bad") })).toThrow("OBJECT_KEY_INVALID");

    const job = enqueueJob({ type: "report.export", payload: { classroomId: DEMO_CLASSROOM_ID } });
    expect(job.status).toBe("READY");
    const claimed = claimNextJob();
    expect(claimed?.id).toBe(job.id);
    expect(claimed?.attempts).toBe(1);
    expect(completeJob(job.id).status).toBe("DONE");
  });

  it("creates verifiable database backups and enforces tenant RBAC", () => {
    const backup = createDatabaseBackup("unit");
    expect(backup.sha256).toHaveLength(64);
    expect(backup.size).toBeGreaterThan(1000);
    expect(listBackups()[0]?.id).toBe(backup.id);

    const tenants = listTenantsForUser("user_editor");
    expect(tenants[0]?.role).toBe("OWNER");
    const assigned = assignTenantRole("user_editor", "tenant_demo", "user_teacher", "ADMIN");
    expect(assigned.role).toBe("ADMIN");
    expect(() => assignTenantRole("user_student", "tenant_demo", "user_teacher", "TEACHER")).toThrow("TENANT_FORBIDDEN");
  });

  it("exposes a PostgreSQL migration plan for production deployment", () => {
    const migrationPlan = buildPostgresMigrationPlan();
    expect(migrationPlan).toContain("CREATE TABLE IF NOT EXISTS \"Tenant\"");
    expect(migrationPlan).toContain("CREATE TABLE IF NOT EXISTS \"PlatformJob\"");
  });
});

async function workbookBuffer(workbook: ExcelJS.Workbook): Promise<Buffer> {
  const data: unknown = await workbook.xlsx.writeBuffer();
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  throw new Error("WORKBOOK_BUFFER_FAILED");
}
