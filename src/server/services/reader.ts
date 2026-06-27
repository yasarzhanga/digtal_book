import { z } from "zod";
import type { BookSnapshot } from "@/content-engine/schema/document";
import { ContentNodeSchema, type ContentNode, type QuizSetNode } from "@/content-engine/schema/nodes";
import { ActivityEventTypeSchema } from "@/content-engine/tracking/events";
import { collectAssetIdsFromDocument } from "@/content-engine/utils/assets";
import { acceleration, sampleMotion } from "@/content-engine/utils/simulation";
import { scoreQuiz, type QuizAnswer } from "@/content-engine/utils/quiz";
import { asRow, asRows, getDb } from "@/server/db/client";
import { id } from "@/server/db/ids";
import { stringifyJson } from "@/server/db/json";
import { getCurrentSnapshot } from "@/server/services/books";
import { recordTrustedInternalEvent } from "@/server/services/events";
import { assetSearchText } from "@/server/services/asset-search";

export const ReadingStateInputSchema = z.object({
  bookVersionId: z.string().min(1),
  lastChapterId: z.string().min(1),
  lastNodeId: z.string().min(1).optional(),
  activeSecondsDelta: z.number().int().nonnegative().default(0)
});

export const AnnotationInputSchema = z.object({
  bookVersionId: z.string().min(1),
  chapterId: z.string().min(1),
  nodeId: z.string().min(1),
  quote: z.string().min(1),
  startOffset: z.number().int().nonnegative().default(0),
  endOffset: z.number().int().nonnegative().default(0),
  color: z.enum(["yellow", "green", "blue", "pink"]),
  note: z.string().default("")
});

export const ExperimentInputSchema = z.object({
  bookVersionId: z.string().min(1),
  chapterId: z.string().min(1),
  nodeId: z.string().min(1),
  force: z.number().positive(),
  mass: z.number().positive()
});

export const QuizAttemptInputSchema = z.object({
  bookVersionId: z.string().min(1),
  chapterId: z.string().min(1),
  nodeId: z.string().min(1),
  answers: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.number())])),
  durationSeconds: z.number().int().nonnegative()
});

export interface SearchResult {
  chapterId: string;
  nodeId: string;
  type: string;
  title: string;
  excerpt: string;
  source?: "content" | "resource";
}

export interface PersonalReport {
  activeSeconds: number;
  visitedChapters: number;
  mediaCompletionRate: number;
  audioCompletionRate: number;
  videoCompletionRate: number;
  modelPanoramaInteractions: number;
  simulationRuns: number;
  simulationSaveCount: number;
  savedExperiments: { force: number; mass: number; acceleration: number; createdAt: string }[];
  quizAttempts: { score: number; maxScore: number; createdAt: string }[];
  noteCount: number;
  recordingCount: number;
  recentActivities: { eventType: string; chapterId: string | null; nodeId: string | null; occurredAt: string; payload: unknown }[];
  trend: { day: string; count: number }[];
}

export function getReaderSnapshot(bookId: string): BookSnapshot {
  return getCurrentSnapshot(bookId);
}

export function searchBook(bookId: string, query: string): SearchResult[] {
  const snapshot = getCurrentSnapshot(bookId);
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return [];
  }
  const results: SearchResult[] = [];
  for (const chapter of snapshot.chapters) {
    for (const node of chapter.document.nodes) {
      const haystack = nodeText(node).toLowerCase();
      if (haystack.includes(needle)) {
        const index = Math.max(0, haystack.indexOf(needle) - 18);
        results.push({
          chapterId: chapter.id,
          nodeId: node.nodeId,
          type: node.type,
          title: nodeTitle(node),
          excerpt: nodeText(node).slice(index, index + 80),
          source: "content"
        });
      }
    }
  }
  const assetById = new Map(snapshot.assets.map((asset) => [asset.id, asset]));
  for (const resource of aggregateResources(bookId)) {
    const assets = resource.assetIds.map((assetId) => assetById.get(assetId)).filter((asset) => asset !== undefined);
    const haystack = [
      resource.title,
      resource.type,
      resource.nodeId,
      resource.chapterId,
      ...resource.assetIds,
      ...assets.flatMap((asset) => [asset.kind, asset.title, asset.originalName, asset.description ?? "", assetSearchText(asset)])
    ].join(" ").toLowerCase();
    if (haystack.includes(needle) && !results.some((item) => item.nodeId === resource.nodeId && item.source === "resource")) {
      results.push({
        chapterId: resource.chapterId,
        nodeId: resource.nodeId,
        type: assets[0]?.kind ? `resource:${assets[0].kind}` : `resource:${resource.type}`,
        title: resource.title,
        excerpt: assets.map((asset) => `${asset.kind} ${asset.title} ${asset.originalName}`).join("；") || "交互资源节点",
        source: "resource"
      });
    }
  }
  return results;
}

export function aggregateResources(bookId: string): { type: string; nodeId: string; chapterId: string; title: string; assetIds: string[] }[] {
  const snapshot = getCurrentSnapshot(bookId);
  return snapshot.chapters.flatMap((chapter) => chapter.document.nodes.map((node) => ({
    type: node.type,
    nodeId: node.nodeId,
    chapterId: chapter.id,
    title: nodeTitle(node),
    assetIds: collectAssetIdsFromDocument({ type: "chapterDocument", version: 1, nodes: [node] })
  })).filter((item) => item.assetIds.length > 0 || ["chart", "physicsSimulation", "quizSet", "knowledgeGraph"].includes(item.type)));
}

export function upsertReadingState(userId: string, input: z.infer<typeof ReadingStateInputSchema>): void {
  const parsed = ReadingStateInputSchema.parse(input);
  const now = new Date().toISOString();
  const existing = asRow<{ id: string; visitedChapterIdsJson: string; activeSeconds: number }>(
    getDb().prepare("SELECT id, visitedChapterIdsJson, activeSeconds FROM ReadingState WHERE userId = ? AND bookVersionId = ?").get(userId, parsed.bookVersionId)
  );
  const visited = new Set<string>(existing ? JSON.parse(existing.visitedChapterIdsJson) as string[] : []);
  visited.add(parsed.lastChapterId);
  if (existing) {
    getDb().prepare("UPDATE ReadingState SET lastChapterId = ?, lastNodeId = ?, visitedChapterIdsJson = ?, activeSeconds = ?, updatedAt = ? WHERE id = ?").run(
      parsed.lastChapterId,
      parsed.lastNodeId ?? null,
      stringifyJson([...visited]),
      existing.activeSeconds + parsed.activeSecondsDelta,
      now,
      existing.id
    );
  } else {
    getDb().prepare("INSERT INTO ReadingState (id, userId, bookVersionId, lastChapterId, lastNodeId, visitedChapterIdsJson, activeSeconds, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
      id("reading"),
      userId,
      parsed.bookVersionId,
      parsed.lastChapterId,
      parsed.lastNodeId ?? null,
      stringifyJson([...visited]),
      parsed.activeSecondsDelta,
      now
    );
  }
}

export function listAnnotations(userId: string, bookVersionId: string): unknown[] {
  return asRows<Record<string, unknown>>(getDb().prepare("SELECT * FROM Annotation WHERE userId = ? AND bookVersionId = ? ORDER BY createdAt DESC").all(userId, bookVersionId));
}

export function createAnnotation(userId: string, input: z.infer<typeof AnnotationInputSchema>): Record<string, unknown> {
  const parsed = AnnotationInputSchema.parse(input);
  const now = new Date().toISOString();
  const annotationId = id("note");
  getDb().prepare("INSERT INTO Annotation (id, userId, bookVersionId, chapterId, nodeId, quote, startOffset, endOffset, color, note, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
    annotationId,
    userId,
    parsed.bookVersionId,
    parsed.chapterId,
    parsed.nodeId,
    parsed.quote,
    parsed.startOffset,
    parsed.endOffset,
    parsed.color,
    parsed.note,
    now,
    now
  );
  recordTrustedInternalEvent(userId, {
    bookVersionId: parsed.bookVersionId,
    chapterId: parsed.chapterId,
    nodeId: parsed.nodeId,
    eventType: parsed.note ? "NOTE_CREATE" : "ANNOTATION_CREATE",
    payload: { color: parsed.color, quote: parsed.quote.slice(0, 40) }
  });
  const row = asRow<Record<string, unknown>>(getDb().prepare("SELECT * FROM Annotation WHERE id = ?").get(annotationId));
  if (!row) {
    throw new Error("ANNOTATION_CREATE_FAILED");
  }
  return row;
}

export function updateAnnotation(userId: string, annotationId: string, note: string): void {
  getDb().prepare("UPDATE Annotation SET note = ?, updatedAt = ? WHERE id = ? AND userId = ?").run(note, new Date().toISOString(), annotationId, userId);
}

export function deleteAnnotation(userId: string, annotationId: string): void {
  getDb().prepare("DELETE FROM Annotation WHERE id = ? AND userId = ?").run(annotationId, userId);
}

export function saveExperiment(userId: string, input: z.infer<typeof ExperimentInputSchema>): { acceleration: number; samples: ReturnType<typeof sampleMotion> } {
  const parsed = ExperimentInputSchema.parse(input);
  const a = acceleration(parsed.force, parsed.mass);
  const samples = sampleMotion(parsed.force, parsed.mass, 5, 0.5);
  const now = new Date().toISOString();
  getDb().prepare("INSERT INTO ExperimentRun (id, userId, bookVersionId, chapterId, nodeId, force, mass, acceleration, samplesJson, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
    id("experiment"),
    userId,
    parsed.bookVersionId,
    parsed.chapterId,
    parsed.nodeId,
    parsed.force,
    parsed.mass,
    a,
    stringifyJson(samples),
    now
  );
  recordTrustedInternalEvent(userId, {
    bookVersionId: parsed.bookVersionId,
    chapterId: parsed.chapterId,
    nodeId: parsed.nodeId,
    eventType: "SIMULATION_SAVE",
    payload: { force: parsed.force, mass: parsed.mass, acceleration: a }
  });
  return { acceleration: a, samples };
}

export function submitQuiz(userId: string, snapshot: BookSnapshot, input: z.infer<typeof QuizAttemptInputSchema>): { score: number; maxScore: number; correctQuestionIds: string[] } {
  const parsed = QuizAttemptInputSchema.parse(input);
  const node = findNode(snapshot, parsed.nodeId);
  if (!node || node.type !== "quizSet") {
    throw new Error("QUIZ_NOT_FOUND");
  }
  const answerMap = parsed.answers as Record<string, QuizAnswer>;
  const result = scoreQuiz(node.questions, answerMap);
  getDb().prepare("INSERT INTO QuizAttempt (id, userId, bookVersionId, chapterId, nodeId, answersJson, score, maxScore, durationSeconds, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
    id("quiz"),
    userId,
    parsed.bookVersionId,
    parsed.chapterId,
    parsed.nodeId,
    stringifyJson(parsed.answers),
    result.score,
    result.maxScore,
    parsed.durationSeconds,
    new Date().toISOString()
  );
  recordTrustedInternalEvent(userId, {
    bookVersionId: parsed.bookVersionId,
    chapterId: parsed.chapterId,
    nodeId: parsed.nodeId,
    eventType: "QUIZ_SUBMIT",
    durationSeconds: parsed.durationSeconds,
    progress: result.maxScore > 0 ? result.score / result.maxScore : 0,
    payload: { score: result.score, maxScore: result.maxScore }
  });
  return result;
}

export function createRecordingSubmission(userId: string, input: { bookVersionId: string; chapterId: string; nodeId: string; assetId: string; durationSeconds: number }): void {
  const now = new Date().toISOString();
  getDb().prepare("INSERT INTO RecordingSubmission (id, userId, bookVersionId, chapterId, nodeId, assetId, durationSeconds, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
    id("recording"),
    userId,
    input.bookVersionId,
    input.chapterId,
    input.nodeId,
    input.assetId,
    input.durationSeconds,
    now
  );
  recordTrustedInternalEvent(userId, {
    bookVersionId: input.bookVersionId,
    chapterId: input.chapterId,
    nodeId: input.nodeId,
    eventType: "RECORDING_SUBMIT",
    durationSeconds: input.durationSeconds,
    payload: { assetId: input.assetId }
  });
}

export function getPersonalReport(userId: string, bookVersionId: string): PersonalReport {
  const state = asRow<{ activeSeconds: number; visitedChapterIdsJson: string }>(
    getDb().prepare("SELECT activeSeconds, visitedChapterIdsJson FROM ReadingState WHERE userId = ? AND bookVersionId = ?").get(userId, bookVersionId)
  );
  const audioCompletionRate = mediaCompletionRateForPrefix(userId, bookVersionId, "AUDIO");
  const videoCompletionRate = mediaCompletionRateForPrefix(userId, bookVersionId, "VIDEO");
  const mediaRates = [audioCompletionRate, videoCompletionRate].filter((value) => value > 0);
  const savedExperiments = asRows<{ force: number; mass: number; acceleration: number; createdAt: string }>(
    getDb().prepare("SELECT force, mass, acceleration, createdAt FROM ExperimentRun WHERE userId = ? AND bookVersionId = ? ORDER BY createdAt DESC").all(userId, bookVersionId)
  );
  const quizAttempts = asRows<{ score: number; maxScore: number; createdAt: string }>(
    getDb().prepare("SELECT score, maxScore, createdAt FROM QuizAttempt WHERE userId = ? AND bookVersionId = ? ORDER BY createdAt DESC").all(userId, bookVersionId)
  );
  const noteCount = count("Annotation", "userId = ? AND bookVersionId = ?", [userId, bookVersionId]);
  const recordingCount = count("RecordingSubmission", "userId = ? AND bookVersionId = ?", [userId, bookVersionId]);
  const simulationRuns = count("ActivityEvent", "userId = ? AND bookVersionId = ? AND eventType IN ('SIMULATION_RUN','SIMULATION_SAVE')", [userId, bookVersionId]);
  const modelPanoramaInteractions = count("ActivityEvent", "userId = ? AND bookVersionId = ? AND eventType IN ('MODEL3D_INTERACT','PANORAMA_OPEN','PANORAMA_HOTSPOT_OPEN')", [userId, bookVersionId]);
  const events = asRows<{ eventType: string; chapterId: string | null; nodeId: string | null; occurredAt: string; payloadJson: string | null }>(
    getDb().prepare("SELECT eventType, chapterId, nodeId, occurredAt, payloadJson FROM ActivityEvent WHERE userId = ? AND bookVersionId = ? ORDER BY occurredAt DESC LIMIT 20").all(userId, bookVersionId)
  );
  const trendRows = asRows<{ day: string; count: number }>(
    getDb().prepare("SELECT substr(occurredAt, 1, 10) AS day, COUNT(*) AS count FROM ActivityEvent WHERE userId = ? AND bookVersionId = ? GROUP BY day ORDER BY day DESC LIMIT 7").all(userId, bookVersionId)
  );
  return {
    activeSeconds: state?.activeSeconds ?? 0,
    visitedChapters: state ? (JSON.parse(state.visitedChapterIdsJson) as string[]).length : 0,
    mediaCompletionRate: mediaRates.length ? mediaRates.reduce((sum, value) => sum + value, 0) / mediaRates.length : 0,
    audioCompletionRate,
    videoCompletionRate,
    modelPanoramaInteractions,
    simulationRuns,
    simulationSaveCount: savedExperiments.length,
    savedExperiments,
    quizAttempts,
    noteCount,
    recordingCount,
    recentActivities: events.map((event) => ({
      eventType: event.eventType,
      chapterId: event.chapterId,
      nodeId: event.nodeId,
      occurredAt: event.occurredAt,
      payload: event.payloadJson ? JSON.parse(event.payloadJson) as unknown : {}
    })),
    trend: trendRows
  };
}

export function mediaCompletionRateForPrefix(userId: string, bookVersionId: string, prefix: "AUDIO" | "VIDEO"): number {
  const rows = asRows<{ nodeId: string | null; eventType: string; progress: number | null }>(
    getDb().prepare(`
      SELECT nodeId, eventType, progress
      FROM ActivityEvent
      WHERE userId = ? AND bookVersionId = ? AND eventType IN (?, ?)
    `).all(userId, bookVersionId, `${prefix}_PROGRESS`, `${prefix}_COMPLETE`)
  );
  const maxByNode = new Map<string, number>();
  for (const row of rows) {
    const key = row.nodeId ?? `${prefix}:unknown`;
    const value = row.eventType.endsWith("COMPLETE") ? 1 : row.progress ?? 0;
    maxByNode.set(key, Math.max(maxByNode.get(key) ?? 0, value));
  }
  const values = [...maxByNode.values()].filter((value) => value > 0);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export function auditNoUnsupportedEventTypes(): boolean {
  const rows = asRows<{ eventType: string }>(getDb().prepare("SELECT DISTINCT eventType FROM ActivityEvent").all());
  return rows.every((row) => ActivityEventTypeSchema.safeParse(row.eventType).success);
}

export function findQuizNode(snapshot: BookSnapshot): QuizSetNode {
  for (const chapter of snapshot.chapters) {
    const node = chapter.document.nodes.find((item) => item.type === "quizSet");
    if (node && node.type === "quizSet") {
      return node;
    }
  }
  throw new Error("QUIZ_NOT_FOUND");
}

function findNode(snapshot: BookSnapshot, nodeId: string): ContentNode | null {
  for (const chapter of snapshot.chapters) {
    const node = chapter.document.nodes.find((item) => item.nodeId === nodeId);
    if (node) {
      return ContentNodeSchema.parse(node);
    }
  }
  return null;
}

function nodeTitle(node: ContentNode): string {
  if (node.type === "heading") return node.text;
  if ("title" in node) return node.title;
  if (node.type === "richText") return "正文";
  return node.type;
}

function nodeText(node: ContentNode): string {
  switch (node.type) {
    case "heading":
      return node.text;
    case "richText":
      return node.html.replace(/<[^>]+>/g, " ");
    case "callout":
      return `${node.title} ${node.body}`;
    case "imageInteractive":
      return [node.alt, node.caption, ...node.hotspots.map((hotspot) => `${hotspot.title} ${hotspot.body}`)].join(" ");
    case "gallery":
      return node.captions.join(" ");
    case "audio":
      return [node.title, node.transcript, ...node.chapters.map((chapter) => chapter.label)].join(" ");
    case "video":
      return [node.title, node.caption, ...node.transcript.map((cue) => cue.text)].join(" ");
    case "formulaBlock":
      return [node.latex, node.number ?? "", node.caption].join(" ");
    case "chart":
      return [node.title, node.xLabel, node.yLabel, ...node.items.map((item) => `${item.label} ${item.value}`)].join(" ");
    case "physicsSimulation":
      return `${node.title} ${node.prompt} F=ma 合力 质量 加速度`;
    case "model3d":
      return [node.title, node.description, ...node.hotspots.map((hotspot) => `${hotspot.title} ${hotspot.body}`)].join(" ");
    case "panorama":
      return [node.title, ...node.hotspots.map((hotspot) => `${hotspot.title} ${hotspot.body}`)].join(" ");
    case "extendedReading":
      return [node.title, node.summary, node.body, ...node.tags].join(" ");
    case "attachment":
      return node.title;
    case "quizSet":
      return [node.title, ...node.questions.map((question) => question.question)].join(" ");
    case "recordingTask":
      return `${node.title} ${node.prompt}`;
    case "knowledgeGraph":
      return [node.title, ...node.nodes.map((item) => item.label), ...node.edges.map((edge) => `${edge.source} ${edge.label} ${edge.target}`)].join(" ");
  }
}

function count(table: string, where: string, params: (string | number)[]): number {
  const row = asRow<{ value: number }>(getDb().prepare(`SELECT COUNT(*) AS value FROM ${table} WHERE ${where}`).get(...params));
  return row?.value ?? 0;
}
