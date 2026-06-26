import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import bcrypt from "bcryptjs";
import { closeDb, getDb, withTransaction } from "../src/server/db/client";
import { DEMO_BOOK_ID, DEMO_CLASSROOM_ID, DEMO_COURSE_ID, DEMO_VERSION_ID } from "../src/server/db/ids";
import { resetSchema } from "../src/server/db/schema";
import { AssetSchema, type Asset, type AssetKind } from "../src/content-engine/schema/assets";
import { ChapterDocumentSchema, type BookSnapshot, type ChapterDocument } from "../src/content-engine/schema/document";
import { ContentNodeSchema, type ContentNode, type QuizQuestion } from "../src/content-engine/schema/nodes";
import { collectAssetIdsFromDocument } from "../src/content-engine/utils/assets";
import { acceleration, sampleMotion } from "../src/content-engine/utils/simulation";
import { scoreQuiz, type QuizAnswer } from "../src/content-engine/utils/quiz";
import { extractAssetSearchText } from "../src/server/services/asset-search";

interface BlueprintAsset {
  key: string;
  kind: AssetKind;
  path: string;
  title: string;
  captions?: string;
}

interface BlueprintChapter {
  id: string;
  title: string;
  nodes: BlueprintNode[];
}

type BlueprintNode = Record<string, unknown> & { type: string };

interface Blueprint {
  book: {
    title: string;
    subtitle: string;
    description: string;
    coverAsset: string;
  };
  assets: BlueprintAsset[];
  chapters: BlueprintChapter[];
}

const blueprintPath = path.resolve(process.cwd(), "seed/lesson-blueprint.json");
const blueprint = JSON.parse(fs.readFileSync(blueprintPath, "utf8")) as Blueprint;
const startedAt = new Date("2026-06-25T09:00:00.000Z");

export async function resetDemoDatabase(): Promise<void> {
  process.env.DATABASE_PATH ??= "storage/demo.sqlite";
  resetStorage();
  resetSchema();

  const passwordHash = bcrypt.hashSync("demo123456", 10);
  const now = new Date().toISOString();
  const db = getDb();

  const assets = await seedAssets(now);
  const assetByKey = new Map(assets.map((asset) => [asset.key, asset]));
  const chapters = blueprint.chapters.map((chapter, index) => ({
    id: chapter.id,
    title: chapter.title,
    sortOrder: index,
    document: buildDocument(chapter, assetByKey)
  }));

  const snapshot = buildSnapshot(chapters, assets);

  withTransaction(() => {
    const insertUser = db.prepare("INSERT INTO User (id, name, email, passwordHash, role, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)");
    insertUser.run("user_editor", "演示编辑者", "editor@demo.local", passwordHash, "EDITOR", now, now);
    insertUser.run("user_teacher", "林老师", "teacher@demo.local", passwordHash, "TEACHER", now, now);
    insertUser.run("user_student", "陈同学", "student@demo.local", passwordHash, "STUDENT", now, now);
    for (let index = 2; index <= 8; index += 1) {
      insertUser.run(`user_student_${index}`, `示例学生 ${index}`, `student${index}@demo.local`, passwordHash, "STUDENT", now, now);
    }

    db.prepare("INSERT INTO Tenant (id, name, slug, createdAt) VALUES (?, ?, ?, ?)").run("tenant_demo", "数字教材演示租户", "demo", now);
    const insertMembership = db.prepare("INSERT INTO TenantMembership (id, tenantId, userId, role, createdAt) VALUES (?, ?, ?, ?, ?)");
    insertMembership.run("tenant_member_editor", "tenant_demo", "user_editor", "OWNER", now);
    insertMembership.run("tenant_member_teacher", "tenant_demo", "user_teacher", "TEACHER", now);
    insertMembership.run("tenant_member_student", "tenant_demo", "user_student", "STUDENT", now);
    for (let index = 2; index <= 8; index += 1) {
      insertMembership.run(`tenant_member_student_${index}`, "tenant_demo", `user_student_${index}`, "STUDENT", now);
    }

    const insertBook = db.prepare("INSERT INTO Book (id, title, subtitle, description, coverAssetId, ownerId, currentPublishedVersionId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
    insertBook.run(
      DEMO_BOOK_ID,
      blueprint.book.title,
      blueprint.book.subtitle,
      blueprint.book.description,
      "asset_cover",
      "user_editor",
      DEMO_VERSION_ID,
      now,
      now
    );

    const insertAsset = db.prepare("INSERT INTO Asset (id, ownerId, kind, assetKey, originalName, mimeType, size, relativePath, title, description, metadataJson, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    for (const asset of assets) {
      insertAsset.run(
        asset.id,
        "user_editor",
        asset.kind,
        asset.key,
        asset.originalName,
        asset.mimeType,
        asset.size,
        asset.relativePath,
        asset.title,
        asset.description ?? "",
        JSON.stringify(asset.metadata),
        now
      );
    }

    const insertChapter = db.prepare("INSERT INTO Chapter (id, bookId, parentId, title, level, sortOrder, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    const insertDraft = db.prepare("INSERT INTO DraftDocument (id, chapterId, documentJson, plainText, revision, updatedAt) VALUES (?, ?, ?, ?, ?, ?)");
    for (const chapter of chapters) {
      insertChapter.run(chapter.id, DEMO_BOOK_ID, null, chapter.title, 1, chapter.sortOrder, now, now);
      insertDraft.run(`draft_${chapter.id}`, chapter.id, JSON.stringify(chapter.document), plainText(chapter.document), 1, now);
    }

    db.prepare("INSERT INTO BookVersion (id, bookId, versionNumber, snapshotJson, note, publishedAt) VALUES (?, ?, ?, ?, ?, ?)").run(
      DEMO_VERSION_ID,
      DEMO_BOOK_ID,
      1,
      JSON.stringify(snapshot),
      "初始演示版本：完整 P0 样章",
      now
    );

    db.prepare("INSERT INTO Course (id, teacherId, bookId, name, createdAt) VALUES (?, ?, ?, ?, ?)").run(
      DEMO_COURSE_ID,
      "user_teacher",
      DEMO_BOOK_ID,
      "大学物理示范课",
      now
    );
    db.prepare("INSERT INTO Classroom (id, courseId, name, joinCode, createdAt) VALUES (?, ?, ?, ?, ?)").run(
      DEMO_CLASSROOM_ID,
      DEMO_COURSE_ID,
      "物理 1 班",
      "PHYS01",
      now
    );
    const insertEnrollment = db.prepare("INSERT INTO Enrollment (id, classroomId, studentId) VALUES (?, ?, ?)");
    const studentIds = ["user_student", ...Array.from({ length: 7 }, (_, index) => `user_student_${index + 2}`)];
    for (const studentId of studentIds) {
      insertEnrollment.run(`enroll_${studentId}`, DEMO_CLASSROOM_ID, studentId);
    }

    seedLearningHistory(studentIds);
    seedP1Data(studentIds);
  });

  closeDb();
}

function resetStorage(): void {
  const uploadRoot = path.resolve(process.cwd(), "storage/uploads");
  fs.rmSync(uploadRoot, { recursive: true, force: true });
  fs.rmSync(path.resolve(process.cwd(), "storage/object-store"), { recursive: true, force: true });
  fs.rmSync(path.resolve(process.cwd(), "storage/backups"), { recursive: true, force: true });
  fs.mkdirSync(uploadRoot, { recursive: true });
  fs.writeFileSync(path.join(uploadRoot, ".gitkeep"), "");
  const dbPath = path.resolve(process.cwd(), process.env.DATABASE_PATH ?? "storage/demo.sqlite");
  fs.rmSync(dbPath, { force: true });
  fs.rmSync(`${dbPath}-shm`, { force: true });
  fs.rmSync(`${dbPath}-wal`, { force: true });
}

async function seedAssets(now: string): Promise<Asset[]> {
  const uploadRoot = path.resolve(process.cwd(), "storage/uploads");
  const assets: Asset[] = [];
  for (const sourceAsset of blueprint.assets) {
    const id = `asset_${sourceAsset.key}`;
    const sourcePath = path.resolve(process.cwd(), "starter-assets", sourceAsset.path);
    const extension = path.extname(sourcePath);
    const relativePath = `${id}${extension}`;
    fs.copyFileSync(sourcePath, path.join(uploadRoot, relativePath));
    const stat = fs.statSync(sourcePath);
    const metadata = sourceAsset.captions ? { captions: sourceAsset.captions } : {};
    const asset = AssetSchema.parse({
      id,
      key: sourceAsset.key,
      kind: sourceAsset.kind,
      title: sourceAsset.title,
      originalName: path.basename(sourcePath),
      mimeType: inferMime(sourceAsset.kind, sourceAsset.path),
      size: stat.size,
      relativePath,
      url: `/api/assets/${id}/file`,
      description: `${sourceAsset.title}（来自 starter-assets，导入时间 ${now}）`,
      metadata
    });
    assets.push(AssetSchema.parse({
      ...asset,
      metadata: {
        ...metadata,
        searchText: await extractAssetSearchText(asset, path.join(uploadRoot, relativePath))
      }
    }));
    if (sourceAsset.captions) {
      const captionId = "asset_video_captions";
      const captionSource = path.resolve(process.cwd(), "starter-assets", sourceAsset.captions);
      const captionRelativePath = `${captionId}${path.extname(captionSource)}`;
      fs.copyFileSync(captionSource, path.join(uploadRoot, captionRelativePath));
      const captionStat = fs.statSync(captionSource);
      const captionAsset = AssetSchema.parse({
        id: captionId,
        key: "videoCaptions",
        kind: "DOCUMENT",
        title: "小车实验中文字幕",
        originalName: path.basename(captionSource),
        mimeType: "text/vtt",
        size: captionStat.size,
        relativePath: captionRelativePath,
        url: `/api/assets/${captionId}/file`,
        description: "视频字幕文件",
        metadata: {}
      });
      assets.push(AssetSchema.parse({
        ...captionAsset,
        metadata: {
          searchText: await extractAssetSearchText(captionAsset, path.join(uploadRoot, captionRelativePath))
        }
      }));
    }
  }
  const generatedPackages: { id: string; key: string; kind: AssetKind; title: string; fileName: string; mimeType: string; content: string }[] = [
    {
      id: "asset_scorm_demo",
      key: "scormDemo",
      kind: "SCORM",
      title: "SCORM 牛顿第二定律微课包",
      fileName: "newton-scorm-demo.zip",
      mimeType: "application/zip",
      content: "Local SCORM demo package for digital textbook V2. Contains imsmanifest marker for offline launch validation."
    },
    {
      id: "asset_h5p_demo",
      key: "h5pDemo",
      kind: "H5P",
      title: "H5P 力学互动题包",
      fileName: "newton-h5p-demo.h5p",
      mimeType: "application/h5p",
      content: "Local H5P demo package for digital textbook V2. Used to verify upload, listing and launch flow."
    }
  ];
  for (const item of generatedPackages) {
    const relativePath = `${item.id}${path.extname(item.fileName)}`;
    const absolutePath = path.join(uploadRoot, relativePath);
    fs.writeFileSync(absolutePath, item.content);
    const stat = fs.statSync(absolutePath);
    const packageAsset = AssetSchema.parse({
      id: item.id,
      key: item.key,
      kind: item.kind,
      title: item.title,
      originalName: item.fileName,
      mimeType: item.mimeType,
      size: stat.size,
      relativePath,
      url: `/api/assets/${item.id}/file`,
      description: `${item.title}（本地生成的 P1 示例包，导入时间 ${now}）`,
      metadata: { p1: true }
    });
    assets.push(AssetSchema.parse({
      ...packageAsset,
      metadata: {
        p1: true,
        searchText: await extractAssetSearchText(packageAsset, absolutePath)
      }
    }));
  }
  return assets;
}

function buildDocument(chapter: BlueprintChapter, assetByKey: Map<string, Asset>): ChapterDocument {
  const nodes = chapter.nodes.map((node, index) => convertNode(chapter.id, index, node, assetByKey));
  return ChapterDocumentSchema.parse({ type: "chapterDocument", version: 1, nodes });
}

function convertNode(chapterId: string, index: number, rawNode: BlueprintNode, assetByKey: Map<string, Asset>): ContentNode {
  const nodeId = `${chapterId}-${index}-${rawNode.type}`;
  switch (rawNode.type) {
    case "heading":
      return ContentNodeSchema.parse({ nodeId, type: "heading", level: numberValue(rawNode.level, 1), text: stringValue(rawNode.text) });
    case "richText":
      return ContentNodeSchema.parse({ nodeId, type: "richText", html: enrichKnowledgeBubble(stringValue(rawNode.html)) });
    case "callout":
      return ContentNodeSchema.parse({ nodeId, type: "callout", tone: stringValue(rawNode.tone), title: stringValue(rawNode.title), body: stringValue(rawNode.body) });
    case "imageInteractive":
      return ContentNodeSchema.parse({
        nodeId,
        type: "imageInteractive",
        assetId: assetId(assetByKey, stringValue(rawNode.asset)),
        alt: "小车受力示意图",
        caption: stringValue(rawNode.caption),
        width: 92,
        align: "center",
        hotspots: rawArray(rawNode.hotspots).map((hotspot, hotspotIndex) => ({
          id: `${nodeId}-hotspot-${hotspotIndex}`,
          x: numberValue(hotspot.x, 50),
          y: numberValue(hotspot.y, 50),
          title: stringValue(hotspot.title),
          body: stringValue(hotspot.body)
        }))
      });
    case "gallery":
      return ContentNodeSchema.parse({
        nodeId,
        type: "gallery",
        assetIds: stringArray(rawNode.assets).map((key) => assetId(assetByKey, key)),
        captions: stringArray(rawNode.captions),
        autoplay: false,
        startIndex: 0
      });
    case "audio":
      return ContentNodeSchema.parse({
        nodeId,
        type: "audio",
        assetId: assetId(assetByKey, stringValue(rawNode.asset)),
        title: "牛顿第二定律音频讲解",
        transcript: stringValue(rawNode.transcript),
        chapters: rawArray(rawNode.chapters).map((chapter) => ({ time: numberValue(chapter.time, 0), label: stringValue(chapter.label) })),
        downloadable: true
      });
    case "video":
      return ContentNodeSchema.parse({
        nodeId,
        type: "video",
        assetId: assetId(assetByKey, stringValue(rawNode.asset)),
        title: "小车受力实验视频",
        captionAssetId: "asset_video_captions",
        transcript: rawArray(rawNode.transcript).map((cue) => ({ time: numberValue(cue.time, 0), text: stringValue(cue.text) })),
        caption: "同一实验素材在教材内直接播放，无需外链。"
      });
    case "formulaBlock":
      return ContentNodeSchema.parse({
        nodeId,
        type: "formulaBlock",
        latex: stringValue(rawNode.latex),
        number: maybeString(rawNode.number),
        caption: stringValue(rawNode.caption),
        parameterDemo: rawNode.parameterDemo && typeof rawNode.parameterDemo === "object"
          ? { force: numberValue(record(rawNode.parameterDemo).force, 6), mass: numberValue(record(rawNode.parameterDemo).mass, 2) }
          : undefined
      });
    case "model3d":
      return ContentNodeSchema.parse({
        nodeId,
        type: "model3d",
        assetId: assetId(assetByKey, stringValue(rawNode.asset)),
        title: stringValue(rawNode.title),
        description: "本地 GLB 小车模型，可旋转、缩放并查看部件热点。",
        autoRotate: booleanValue(rawNode.autoRotate, true),
        hotspots: rawArray(rawNode.hotspots).map((hotspot, hotspotIndex) => ({
          id: `${nodeId}-hotspot-${hotspotIndex}`,
          position: stringValue(hotspot.position),
          title: stringValue(hotspot.title),
          body: stringValue(hotspot.body)
        }))
      });
    case "panorama":
      return ContentNodeSchema.parse({
        nodeId,
        type: "panorama",
        assetId: assetId(assetByKey, stringValue(rawNode.asset)),
        title: stringValue(rawNode.title),
        initialYaw: numberValue(rawNode.initialYaw, 0),
        initialPitch: numberValue(rawNode.initialPitch, 0),
        hotspots: rawArray(rawNode.hotspots).map((hotspot, hotspotIndex) => ({
          id: `${nodeId}-hotspot-${hotspotIndex}`,
          yaw: numberValue(hotspot.yaw, 0),
          pitch: numberValue(hotspot.pitch, 0),
          title: stringValue(hotspot.title),
          body: stringValue(hotspot.body)
        }))
      });
    case "physicsSimulation":
      return ContentNodeSchema.parse({
        nodeId,
        type: "physicsSimulation",
        title: stringValue(rawNode.title),
        force: rawNode.force,
        mass: rawNode.mass,
        showTrajectory: booleanValue(rawNode.showTrajectory, true),
        showFormula: booleanValue(rawNode.showFormula, true),
        prompt: stringValue(rawNode.prompt)
      });
    case "chart":
      return ContentNodeSchema.parse({
        nodeId,
        type: "chart",
        chartType: stringValue(rawNode.chartType),
        title: stringValue(rawNode.title),
        items: rawArray(rawNode.items).map((item) => ({ label: stringValue(item.label), value: numberValue(item.value, 0) })),
        xLabel: stringValue(rawNode.xLabel),
        yLabel: stringValue(rawNode.yLabel),
        showLegend: booleanValue(rawNode.showLegend, true),
        color: "#1b7f83"
      });
    case "extendedReading":
      return ContentNodeSchema.parse({ nodeId, type: "extendedReading", title: stringValue(rawNode.title), summary: stringValue(rawNode.summary), body: stringValue(rawNode.body), tags: ["生活物理", "惯性"] });
    case "quizSet":
      return ContentNodeSchema.parse({ nodeId, type: "quizSet", title: stringValue(rawNode.title), questions: rawArray(rawNode.questions), allowRetry: true });
    case "recordingTask":
      return ContentNodeSchema.parse({ nodeId, type: "recordingTask", title: stringValue(rawNode.title), prompt: stringValue(rawNode.prompt), recommendedSeconds: numberValue(rawNode.recommendedSeconds, 60) });
    case "attachment":
      return ContentNodeSchema.parse({ nodeId, type: "attachment", assetId: assetId(assetByKey, stringValue(rawNode.asset)), title: stringValue(rawNode.title), preview: booleanValue(rawNode.preview, true) });
    case "knowledgeGraph":
      return ContentNodeSchema.parse({ nodeId, type: "knowledgeGraph", title: stringValue(rawNode.title), nodes: rawArray(rawNode.nodes), edges: rawArray(rawNode.edges) });
    default:
      throw new Error(`Unsupported blueprint node: ${rawNode.type}`);
  }
}

function buildSnapshot(chapters: { id: string; title: string; sortOrder: number; document: ChapterDocument }[], assets: Asset[]): BookSnapshot {
  const referencedIds = new Set(chapters.flatMap((chapter) => collectAssetIdsFromDocument(chapter.document)));
  referencedIds.add("asset_cover");
  const snapshotAssets = assets.filter((asset) => referencedIds.has(asset.id));
  return {
    book: {
      id: DEMO_BOOK_ID,
      title: blueprint.book.title,
      subtitle: blueprint.book.subtitle,
      description: blueprint.book.description,
      coverAssetId: "asset_cover"
    },
    versionId: DEMO_VERSION_ID,
    versionNumber: 1,
    publishedAt: new Date().toISOString(),
    chapters: chapters.map((chapter) => ({
      id: chapter.id,
      parentId: null,
      title: chapter.title,
      level: 1,
      sortOrder: chapter.sortOrder,
      document: chapter.document
    })),
    assets: snapshotAssets
  };
}

function seedLearningHistory(studentIds: string[]): void {
  const db = getDb();
  const event = db.prepare("INSERT INTO ActivityEvent (id, userId, bookVersionId, classroomId, chapterId, nodeId, eventType, durationSeconds, progress, payloadJson, occurredAt, receivedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  const reading = db.prepare("INSERT INTO ReadingState (id, userId, bookVersionId, lastChapterId, lastNodeId, visitedChapterIdsJson, activeSeconds, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  const experiment = db.prepare("INSERT INTO ExperimentRun (id, userId, bookVersionId, chapterId, nodeId, force, mass, acceleration, samplesJson, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  const quiz = db.prepare("INSERT INTO QuizAttempt (id, userId, bookVersionId, chapterId, nodeId, answersJson, score, maxScore, durationSeconds, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  const annotation = db.prepare("INSERT INTO Annotation (id, userId, bookVersionId, chapterId, nodeId, quote, startOffset, endOffset, color, note, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  const recording = db.prepare("INSERT INTO RecordingSubmission (id, userId, bookVersionId, chapterId, nodeId, assetId, durationSeconds, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");

  const quizNode = findNode("chapter-practice", "quizSet");
  const questions = quizNode.type === "quizSet" ? quizNode.questions : [];
  for (const [index, studentId] of studentIds.entries()) {
    const day = new Date(startedAt.getTime() + index * 36_000_00);
    const suffix = index + 1;
    const activeSeconds = 620 + index * 95;
    reading.run(
      `reading_${studentId}`,
      studentId,
      DEMO_VERSION_ID,
      index % 3 === 0 ? "chapter-practice" : "chapter-operate",
      "chapter-operate-5-physicsSimulation",
      JSON.stringify(["chapter-observe", "chapter-operate", ...(index > 2 ? ["chapter-practice"] : [])]),
      activeSeconds,
      day.toISOString()
    );
    insertEvent(event, suffix, studentId, "PAGE_VIEW", "chapter-observe", "chapter-observe-0-heading", 80 + index * 3, 1, { mode: "digital" }, day);
    insertEvent(event, suffix + 20, studentId, "AUDIO_COMPLETE", "chapter-observe", "chapter-observe-5-audio", 42, 0.9, { playbackRate: 1.25 }, day);
    insertEvent(event, suffix + 40, studentId, "VIDEO_PROGRESS", "chapter-observe", "chapter-observe-6-video", 35 + index, 0.72 + index * 0.02, { playbackRate: 1 }, day);
    insertEvent(event, suffix + 60, studentId, "MODEL3D_INTERACT", "chapter-operate", "chapter-operate-3-model3d", 12, 1, { action: "rotate" }, day);
    insertEvent(event, suffix + 80, studentId, "PANORAMA_OPEN", "chapter-operate", "chapter-operate-4-panorama", 18, 1, { yaw: index * 10 }, day);

    const force = 4 + (index % 4) * 2;
    const mass = 1.5 + (index % 3) * 0.5;
    const a = acceleration(force, mass);
    experiment.run(
      `experiment_${studentId}`,
      studentId,
      DEMO_VERSION_ID,
      "chapter-operate",
      "chapter-operate-5-physicsSimulation",
      force,
      mass,
      a,
      JSON.stringify(sampleMotion(force, mass, 4, 1)),
      day.toISOString()
    );
    insertEvent(event, suffix + 100, studentId, "SIMULATION_SAVE", "chapter-operate", "chapter-operate-5-physicsSimulation", 30, 1, { force, mass, acceleration: a }, day);

    const answers = seededAnswers(index);
    const score = scoreQuiz(questions, answers);
    quiz.run(
      `quiz_${studentId}`,
      studentId,
      DEMO_VERSION_ID,
      "chapter-practice",
      "chapter-practice-1-quizSet",
      JSON.stringify(answers),
      score.score,
      score.maxScore,
      95 + index * 7,
      day.toISOString()
    );
    insertEvent(event, suffix + 120, studentId, "QUIZ_SUBMIT", "chapter-practice", "chapter-practice-1-quizSet", 95 + index * 7, score.score / score.maxScore, { score: score.score }, day);

    annotation.run(
      `note_${studentId}`,
      studentId,
      DEMO_VERSION_ID,
      "chapter-observe",
      "chapter-observe-1-richText",
      "加速度与合力成正比",
      0,
      10,
      index % 2 === 0 ? "yellow" : "blue",
      "把这个关系和后面的 F-a 图像对应起来。",
      day.toISOString(),
      day.toISOString()
    );
    insertEvent(event, suffix + 140, studentId, "NOTE_CREATE", "chapter-observe", "chapter-observe-1-richText", null, null, { color: "yellow" }, day);

    if (index % 2 === 0) {
      recording.run(
        `recording_${studentId}`,
        studentId,
        DEMO_VERSION_ID,
        "chapter-practice",
        "chapter-practice-2-recordingTask",
        "asset_narration",
        38 + index,
        day.toISOString()
      );
      insertEvent(event, suffix + 160, studentId, "RECORDING_SUBMIT", "chapter-practice", "chapter-practice-2-recordingTask", 38 + index, 1, { seeded: true }, day);
    }
  }
}

function seedP1Data(studentIds: string[]): void {
  const db = getDb();
  const now = new Date(startedAt.getTime() + 8 * 36_000_00).toISOString();
  const quizNode = findNode("chapter-practice", "quizSet");
  const baseQuestions = quizNode.type === "quizSet" ? quizNode.questions : [];
  const advancedQuestions: QuizQuestion[] = [
    {
      id: "q_order_experiment",
      type: "ordering",
      question: "按小车受力实验的操作流程排序。",
      items: ["连接小车、力传感器和运动传感器", "施加恒定拉力", "记录位移-时间数据", "由数据计算加速度"],
      correct: [0, 1, 2, 3],
      explanation: "实验要先搭建测量系统，再施加恒定拉力，随后采集数据并计算加速度。",
      score: 6,
      sectionId: "section-experiment",
      media: [{ assetId: "asset_forceDiagram", title: "小车受力示意图", kind: "IMAGE", caption: "观察拉力与重力方向" }]
    },
    {
      id: "q_match_quantities",
      type: "matching",
      question: "将物理量与含义或单位配对。",
      leftItems: ["合力 F", "质量 m", "加速度 a"],
      rightItems: ["运动状态改变快慢", "单位 kg", "单位 N"],
      correct: [2, 1, 0],
      explanation: "F 的单位是 N，m 的单位是 kg，a 表示速度变化快慢。",
      score: 6,
      sectionId: "section-experiment",
      media: []
    },
    {
      id: "q_short_reasoning",
      type: "shortAnswer",
      question: "结合公式和实验数据，解释为什么同样合力下重车加速度更小。",
      rubric: ["写出 a=F/m", "说明质量越大加速度越小", "联系小车实验数据或图像"],
      sampleAnswer: "由 a=F/m 可知，合力相同时质量越大，加速度越小；实验中重车的速度变化更慢，图像斜率也更小。",
      explanation: "解答题由教师按 rubric 批改，重点看公式、变量关系和实验证据。",
      score: 10,
      sectionId: "section-inquiry",
      media: [{ assetId: "asset_guide", title: "实验指导书", kind: "PDF", caption: "可引用实验步骤和记录表" }]
    }
  ];
  const questions = [...baseQuestions.map((question) => ({ ...question, sectionId: "section-core" })), ...advancedQuestions];
  const insertBank = db.prepare("INSERT INTO QuestionBankItem (id, teacherId, source, questionJson, tagsJson, createdAt) VALUES (?, ?, ?, ?, ?, ?)");
  for (const [index, question] of questions.entries()) {
    insertBank.run(
      `bank_seed_${index + 1}`,
      "user_teacher",
      "seed/lesson-blueprint.json",
      JSON.stringify(question),
      JSON.stringify(["牛顿第二定律", question.type, question.sectionId ?? "section-core"]),
      now
    );
  }

  const assignmentId = "assignment_newton_after_class";
  const sections = [
    { id: "section-core", title: "一、基础巩固", instructions: "完成概念、判断和计算题。", questionIds: baseQuestions.map((question) => question.id) },
    { id: "section-experiment", title: "二、实验操作", instructions: "完成排序题和配对题，注意观察题内素材。", questionIds: ["q_order_experiment", "q_match_quantities"] },
    { id: "section-inquiry", title: "三、探究表达", instructions: "写出公式、变量关系和实验证据。", questionIds: ["q_short_reasoning"] }
  ];
  db.prepare("INSERT INTO Assignment (id, classroomId, teacherId, title, instructions, status, dueAt, sectionsJson, createdAt, publishedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
    assignmentId,
    DEMO_CLASSROOM_ID,
    "user_teacher",
    "课后作业：试卷化解释 F=ma",
    "完成基础题、实验排序/配对题，并用一段话解释为什么同样的合力作用在不同质量小车上会产生不同加速度。",
    "PUBLISHED",
    new Date(startedAt.getTime() + 12 * 36_000_00).toISOString(),
    JSON.stringify(sections),
    now,
    now
  );
  const insertAssignmentQuestion = db.prepare("INSERT INTO AssignmentQuestion (id, assignmentId, questionJson, sortOrder) VALUES (?, ?, ?, ?)");
  for (const [index, question] of questions.entries()) {
    insertAssignmentQuestion.run(`assignment_question_seed_${index + 1}`, assignmentId, JSON.stringify(question), index);
  }

  const insertSubmission = db.prepare("INSERT INTO AssignmentSubmission (id, assignmentId, studentId, answersJson, textAnswer, score, maxScore, feedback, status, submittedAt, gradedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  const event = db.prepare("INSERT INTO ActivityEvent (id, userId, bookVersionId, classroomId, chapterId, nodeId, eventType, durationSeconds, progress, payloadJson, occurredAt, receivedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  for (const [index, studentId] of studentIds.slice(0, 5).entries()) {
    const answers = seededAnswers(index);
    const score = scoreQuiz(questions, answers);
    const submittedAt = new Date(startedAt.getTime() + (9 + index) * 36_000_00).toISOString();
    const graded = index < 3;
    insertSubmission.run(
      `submission_${studentId}`,
      assignmentId,
      studentId,
      JSON.stringify(answers),
      "相同合力下，质量越大，运动状态越不容易改变，因此加速度更小。",
      graded ? score.score : score.score,
      score.maxScore,
      graded ? "计算正确，解释能联系质量和惯性。继续补充图像斜率会更完整。" : "",
      graded ? "GRADED" : "SUBMITTED",
      submittedAt,
      graded ? new Date(new Date(submittedAt).getTime() + 2 * 36_000_00).toISOString() : null
    );
    insertEvent(event, 300 + index, studentId, "ASSIGNMENT_SUBMIT", "chapter-practice", "chapter-practice-1-quizSet", 180 + index * 12, score.score / score.maxScore, { assignmentId, score: score.score }, new Date(submittedAt));
    if (graded) {
      insertEvent(event, 330 + index, studentId, "ASSIGNMENT_GRADE", "chapter-practice", "chapter-practice-1-quizSet", null, score.score / score.maxScore, { assignmentId, score: score.score }, new Date(new Date(submittedAt).getTime() + 2 * 36_000_00));
    }
  }

  const insertResource = db.prepare("INSERT INTO CourseResource (id, courseId, assetId, title, description, category, visibility, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  insertResource.run("resource_guide", DEMO_COURSE_ID, "asset_guide", "实验指导书", "PDF 独立课程资源，可脱离章节统一管理。", "REFERENCE", "CLASS", now);
  insertResource.run("resource_docx", DEMO_COURSE_ID, "asset_docx", "DOCX 教材原稿", "教师端保留的课程建设素材。", "LESSON", "TEACHER", now);
  insertResource.run("resource_video", DEMO_COURSE_ID, "asset_video", "小车实验视频", "课堂演示和作业反馈均可引用。", "MEDIA", "CLASS", now);
  insertResource.run("resource_scorm", DEMO_COURSE_ID, "asset_scorm_demo", "SCORM 微课包", "本地 SCORM 包，验证课程资源上传和启动链路。", "SCORM", "CLASS", now);
  insertResource.run("resource_h5p", DEMO_COURSE_ID, "asset_h5p_demo", "H5P 互动题包", "本地 H5P 包，验证课程资源上传和启动链路。", "H5P", "CLASS", now);

  db.prepare("INSERT INTO SimulationTemplateRun (id, userId, templateKey, inputJson, resultJson, createdAt) VALUES (?, ?, ?, ?, ?, ?)").run(
    "simrun_seed_projectile",
    "user_student",
    "projectile",
    JSON.stringify({ speed: 14, angle: 45, gravity: 9.8 }),
    JSON.stringify({ title: "抛体运动", metrics: [{ label: "水平射程", value: 20, unit: "m" }], series: [{ label: "轨迹", x: 0, y: 0 }, { label: "轨迹", x: 10, y: 5 }] }),
    now
  );
}

function seededAnswers(index: number): Record<string, QuizAnswer> {
  if (index % 3 === 0) {
    return { q1: 2, q2: [0, 1, 3], q3: false, q4: "2.5", q_order_experiment: [0, 1, 2, 3], q_match_quantities: [2, 1, 0], q_short_reasoning: "由 a=F/m 可知，合力相同时质量越大，加速度越小。" };
  }
  if (index % 3 === 1) {
    return { q1: 2, q2: [0, 1], q3: false, q4: "2.50", q_order_experiment: [0, 1, 2, 3], q_match_quantities: [2, 1, 0], q_short_reasoning: "重车质量更大，速度变化慢。" };
  }
  return { q1: 1, q2: [0, 3], q3: true, q4: "2", q_order_experiment: [1, 0, 2, 3], q_match_quantities: [0, 1, 2], q_short_reasoning: "我还需要结合公式说明。" };
}

function insertEvent(
  statement: ReturnType<ReturnType<typeof getDb>["prepare"]>,
  idNumber: number,
  userId: string,
  eventType: string,
  chapterId: string,
  nodeId: string,
  durationSeconds: number | null,
  progress: number | null,
  payload: Record<string, unknown>,
  occurredAt: Date
): void {
  const eventId = `event_${userId}_${idNumber}`;
  statement.run(
    eventId,
    userId,
    DEMO_VERSION_ID,
    DEMO_CLASSROOM_ID,
    chapterId,
    nodeId,
    eventType,
    durationSeconds,
    progress,
    JSON.stringify(payload),
    occurredAt.toISOString(),
    new Date(occurredAt.getTime() + 1000).toISOString()
  );
}

function findNode(chapterId: string, type: ContentNode["type"]): ContentNode {
  const chapter = blueprint.chapters.find((item) => item.id === chapterId);
  if (!chapter) {
    throw new Error(`Missing blueprint chapter ${chapterId}`);
  }
  const assets = seedAssetMapForLookup();
  const document = buildDocument(chapter, assets);
  const node = document.nodes.find((item) => item.type === type);
  if (!node) {
    throw new Error(`Missing node ${type}`);
  }
  return node;
}

function seedAssetMapForLookup(): Map<string, Asset> {
  return new Map(blueprint.assets.map((asset) => {
    const id = `asset_${asset.key}`;
    const result = AssetSchema.parse({
      id,
      key: asset.key,
      kind: asset.kind,
      title: asset.title,
      originalName: path.basename(asset.path),
      mimeType: inferMime(asset.kind, asset.path),
      size: 1,
      relativePath: `${id}${path.extname(asset.path)}`,
      url: `/api/assets/${id}/file`,
      metadata: {}
    });
    return [asset.key, result];
  }));
}

function assetId(assetByKey: Map<string, Asset>, key: string): string {
  const asset = assetByKey.get(key);
  if (!asset) {
    throw new Error(`Missing asset key: ${key}`);
  }
  return asset.id;
}

function inferMime(kind: AssetKind, assetPath: string): string {
  const extension = path.extname(assetPath).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  if (extension === ".svg") return "image/svg+xml";
  if (extension === ".wav") return "audio/wav";
  if (extension === ".mp3") return "audio/mpeg";
  if (extension === ".ogg") return "audio/ogg";
  if (extension === ".mp4") return "video/mp4";
  if (extension === ".webm") return "video/webm";
  if (extension === ".glb") return "model/gltf-binary";
  if (extension === ".gltf") return "model/gltf+json";
  if (extension === ".pdf") return "application/pdf";
  if (extension === ".docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (extension === ".zip") return "application/zip";
  if (extension === ".h5p") return "application/h5p";
  if (kind === "DOCUMENT") return "application/octet-stream";
  return "application/octet-stream";
}

function plainText(document: ChapterDocument): string {
  return document.nodes.map((node) => {
    if (node.type === "heading") return node.text;
    if (node.type === "richText") return node.html.replace(/<[^>]+>/g, " ");
    if ("title" in node) return node.title;
    return node.type;
  }).join(" ").replace(/\s+/g, " ").trim();
}

function enrichKnowledgeBubble(html: string): string {
  return html.replace(
    "惯性",
    '<button class="knowledge-term" data-term="惯性" data-title="惯性" data-body="物体保持原有运动状态的性质。质量越大，惯性越强。">惯性</button>'
  );
}

function record(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }
  return {};
}

function rawArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(record) : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function stringValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  return "";
}

function maybeString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" ? value : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await resetDemoDatabase();
  console.log("Database reset complete: storage/demo.sqlite");
}
