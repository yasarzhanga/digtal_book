import path from "node:path";
import mammoth from "mammoth";
import { z } from "zod";
import { BookSnapshotSchema, ChapterDocumentSchema, type BookSnapshot, type ChapterDocument } from "@/content-engine/schema/document";
import { collectAssetIdsFromDocument } from "@/content-engine/utils/assets";
import { asRow, asRows, getDb, withTransaction } from "@/server/db/client";
import { id } from "@/server/db/ids";
import { stringifyJson } from "@/server/db/json";
import { toAsset } from "@/server/services/assets";
import type { AssetRow, BookRow, BookVersionRow, ChapterRow, DraftDocumentRow } from "@/server/db/types";

export const SaveDocumentInputSchema = z.object({
  revision: z.number().int().nonnegative(),
  document: ChapterDocumentSchema
});

export const PublishInputSchema = z.object({
  note: z.string().max(200).default("")
});

export const ChapterPatchSchema = z.object({
  title: z.string().min(1).optional()
});

export const DocxImportSourceSchema = z.object({
  fileName: z.string().min(1),
  buffer: z.instanceof(Buffer),
  confirm: z.boolean().default(false)
});

export interface DocxImportResult {
  chapterCount: number;
  mediaCount: number;
  tableCount: number;
  createdChapterId?: string;
  html: string;
}

export interface EditorChapter {
  id: string;
  title: string;
  level: number;
  sortOrder: number;
  parentId: string | null;
  document: ChapterDocument;
  revision: number;
  updatedAt: string;
}

export interface EditorBook {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  coverAssetId: string | null;
  currentPublishedVersionId: string | null;
  chapters: EditorChapter[];
  versions: { id: string; versionNumber: number; note: string; publishedAt: string }[];
}

export function getEditorBook(bookId: string): EditorBook {
  const book = mustGetBook(bookId);
  const chapters = getChapters(bookId);
  const drafts = new Map(asRows<DraftDocumentRow>(getDb().prepare("SELECT * FROM DraftDocument WHERE chapterId IN (SELECT id FROM Chapter WHERE bookId = ?)").all(bookId)).map((row) => [row.chapterId, row]));
  const versions = asRows<BookVersionRow>(getDb().prepare("SELECT id, bookId, versionNumber, snapshotJson, note, publishedAt FROM BookVersion WHERE bookId = ? ORDER BY versionNumber DESC").all(bookId));
  return {
    id: book.id,
    title: book.title,
    subtitle: book.subtitle,
    description: book.description,
    coverAssetId: book.coverAssetId,
    currentPublishedVersionId: book.currentPublishedVersionId,
    chapters: chapters.map((chapter) => {
      const draft = drafts.get(chapter.id);
      if (!draft) {
        throw new Error(`Draft missing for chapter ${chapter.id}`);
      }
      return {
        id: chapter.id,
        title: chapter.title,
        level: chapter.level,
        sortOrder: chapter.sortOrder,
        parentId: chapter.parentId,
        document: ChapterDocumentSchema.parse(JSON.parse(draft.documentJson) as unknown),
        revision: draft.revision,
        updatedAt: draft.updatedAt
      };
    }),
    versions: versions.map((version) => ({
      id: version.id,
      versionNumber: version.versionNumber,
      note: version.note,
      publishedAt: version.publishedAt
    }))
  };
}

export function listBooks(): { id: string; title: string; subtitle: string; currentPublishedVersionId: string | null }[] {
  const rows = asRows<BookRow>(getDb().prepare("SELECT * FROM Book ORDER BY createdAt DESC").all());
  return rows.map((row) => ({ id: row.id, title: row.title, subtitle: row.subtitle, currentPublishedVersionId: row.currentPublishedVersionId }));
}

export function saveChapterDocument(chapterId: string, input: z.infer<typeof SaveDocumentInputSchema>): { revision: number; updatedAt: string } {
  const parsed = SaveDocumentInputSchema.parse(input);
  const draft = asRow<DraftDocumentRow>(getDb().prepare("SELECT * FROM DraftDocument WHERE chapterId = ?").get(chapterId));
  if (!draft) {
    throw new Error("DRAFT_NOT_FOUND");
  }
  if (draft.revision !== parsed.revision) {
    throw new Error("REVISION_CONFLICT");
  }
  const revision = draft.revision + 1;
  const updatedAt = new Date().toISOString();
  getDb().prepare("UPDATE DraftDocument SET documentJson = ?, plainText = ?, revision = ?, updatedAt = ? WHERE chapterId = ?").run(
    stringifyJson(parsed.document),
    plainText(parsed.document),
    revision,
    updatedAt,
    chapterId
  );
  return { revision, updatedAt };
}

export function patchChapter(chapterId: string, input: z.infer<typeof ChapterPatchSchema>): void {
  const parsed = ChapterPatchSchema.parse(input);
  if (parsed.title) {
    const now = new Date().toISOString();
    getDb().prepare("UPDATE Chapter SET title = ?, updatedAt = ? WHERE id = ?").run(parsed.title, now, chapterId);
  }
}

export function reorderChapters(bookId: string, chapterIds: string[]): void {
  withTransaction(() => {
    const chapterSet = new Set(getChapters(bookId).map((chapter) => chapter.id));
    for (const chapterId of chapterIds) {
      if (!chapterSet.has(chapterId)) {
        throw new Error("INVALID_CHAPTER_REORDER");
      }
    }
    const update = getDb().prepare("UPDATE Chapter SET sortOrder = ?, updatedAt = ? WHERE id = ? AND bookId = ?");
    const now = new Date().toISOString();
    chapterIds.forEach((chapterId, index) => update.run(index, now, chapterId, bookId));
  });
}

export function publishBook(bookId: string, note: string): BookSnapshot {
  return withTransaction(() => {
    const book = mustGetBook(bookId);
    const chapters = getChapters(bookId);
    const drafts = asRows<DraftDocumentRow>(getDb().prepare("SELECT * FROM DraftDocument WHERE chapterId IN (SELECT id FROM Chapter WHERE bookId = ?)").all(bookId));
    const draftsByChapter = new Map(drafts.map((draft) => [draft.chapterId, draft]));
    const snapshotChapters = chapters.map((chapter) => {
      const draft = draftsByChapter.get(chapter.id);
      if (!draft) {
        throw new Error("PUBLISH_DRAFT_MISSING");
      }
      return {
        id: chapter.id,
        parentId: chapter.parentId,
        title: chapter.title,
        level: chapter.level,
        sortOrder: chapter.sortOrder,
        document: ChapterDocumentSchema.parse(JSON.parse(draft.documentJson) as unknown)
      };
    });
    const assetIds = new Set(snapshotChapters.flatMap((chapter) => collectAssetIdsFromDocument(chapter.document)));
    if (book.coverAssetId) {
      assetIds.add(book.coverAssetId);
    }
    const assets = asRows<AssetRow>(getDb().prepare(`SELECT * FROM Asset WHERE id IN (${placeholders(assetIds.size)})`).all(...assetIds));
    if (assets.length !== assetIds.size) {
      throw new Error("PUBLISH_ASSET_MISSING");
    }
    const maxRow = asRow<{ maxVersion: number | null }>(getDb().prepare("SELECT MAX(versionNumber) AS maxVersion FROM BookVersion WHERE bookId = ?").get(bookId));
    const versionNumber = (maxRow?.maxVersion ?? 0) + 1;
    const versionId = id("version");
    const publishedAt = new Date().toISOString();
    const snapshot = BookSnapshotSchema.parse({
      book: {
        id: book.id,
        title: book.title,
        subtitle: book.subtitle,
        description: book.description,
        coverAssetId: book.coverAssetId
      },
      versionId,
      versionNumber,
      publishedAt,
      chapters: snapshotChapters,
      assets: assets.map(toAsset)
    });
    getDb().prepare("INSERT INTO BookVersion (id, bookId, versionNumber, snapshotJson, note, publishedAt) VALUES (?, ?, ?, ?, ?, ?)").run(
      versionId,
      bookId,
      versionNumber,
      stringifyJson(snapshot),
      note || `发布版本 ${versionNumber}`,
      publishedAt
    );
    getDb().prepare("UPDATE Book SET currentPublishedVersionId = ?, updatedAt = ? WHERE id = ?").run(versionId, publishedAt, bookId);
    return snapshot;
  });
}

export function getVersions(bookId: string): { id: string; versionNumber: number; note: string; publishedAt: string; componentCount: number }[] {
  const rows = asRows<BookVersionRow>(getDb().prepare("SELECT * FROM BookVersion WHERE bookId = ? ORDER BY versionNumber DESC").all(bookId));
  return rows.map((row) => {
    const snapshot = BookSnapshotSchema.parse(JSON.parse(row.snapshotJson) as unknown);
    return {
      id: row.id,
      versionNumber: row.versionNumber,
      note: row.note,
      publishedAt: row.publishedAt,
      componentCount: snapshot.chapters.reduce((total, chapter) => total + chapter.document.nodes.length, 0)
    };
  });
}

export function activateVersion(bookId: string, versionId: string): void {
  const row = asRow<BookVersionRow>(getDb().prepare("SELECT * FROM BookVersion WHERE id = ? AND bookId = ?").get(versionId, bookId));
  if (!row) {
    throw new Error("VERSION_NOT_FOUND");
  }
  getDb().prepare("UPDATE Book SET currentPublishedVersionId = ?, updatedAt = ? WHERE id = ?").run(versionId, new Date().toISOString(), bookId);
}

export async function importDocxFixture(bookId: string, confirm: boolean): Promise<DocxImportResult> {
  mustGetBook(bookId);
  const docxPath = path.resolve(process.cwd(), "starter-assets/imports/sample-physics.docx");
  const result = await mammoth.convertToHtml({ path: docxPath }, mammothOptions());
  return importDocxHtml(bookId, "sample-physics.docx", result.value, confirm);
}

export async function importDocxUpload(bookId: string, input: z.input<typeof DocxImportSourceSchema>): Promise<DocxImportResult> {
  mustGetBook(bookId);
  const parsed = DocxImportSourceSchema.parse(input);
  if (!parsed.fileName.toLowerCase().endsWith(".docx")) {
    throw new Error("DOCX_ONLY");
  }
  if (parsed.buffer.byteLength > 25 * 1024 * 1024) {
    throw new Error("DOCX_TOO_LARGE");
  }
  const result = await mammoth.convertToHtml({ buffer: parsed.buffer }, mammothOptions());
  return importDocxHtml(bookId, parsed.fileName, result.value, parsed.confirm);
}

function importDocxHtml(bookId: string, fileName: string, rawHtml: string, confirm: boolean): DocxImportResult {
  const html = sanitizeImportedHtml(rawHtml || "<p>DOCX 已导入，但没有可见正文。</p>");
  const headingMatches = [...html.matchAll(/<h[12][^>]*>/g)];
  const imageMatches = [...html.matchAll(/<img\b/g)];
  const tableMatches = [...html.matchAll(/<table\b/g)];
  if (!confirm) {
    return { chapterCount: Math.max(1, headingMatches.length), mediaCount: imageMatches.length, tableCount: tableMatches.length, html };
  }
  const now = new Date().toISOString();
  const existingCount = getChapters(bookId).length;
  const chapterId = id("chapter");
  const title = extractImportTitle(html, fileName);
  const document = ChapterDocumentSchema.parse({
    type: "chapterDocument",
    version: 1,
    nodes: [
      { nodeId: `${chapterId}-0-heading`, type: "heading", level: 1, text: title },
      { nodeId: `${chapterId}-1-richText`, type: "richText", html }
    ]
  });
  withTransaction(() => {
    getDb().prepare("INSERT INTO Chapter (id, bookId, parentId, title, level, sortOrder, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
      chapterId,
      bookId,
      null,
      title,
      1,
      existingCount,
      now,
      now
    );
    getDb().prepare("INSERT INTO DraftDocument (id, chapterId, documentJson, plainText, revision, updatedAt) VALUES (?, ?, ?, ?, ?, ?)").run(
      `draft_${chapterId}`,
      chapterId,
      stringifyJson(document),
      plainText(document),
      1,
      now
    );
  });
  return { chapterCount: 1, mediaCount: imageMatches.length, tableCount: tableMatches.length, createdChapterId: chapterId, html };
}

function mammothOptions() {
  return {
    styleMap: [
      "p[style-name='Title'] => h1:fresh",
      "p[style-name='Subtitle'] => h2:fresh",
      "p[style-name='Heading 1'] => h1:fresh",
      "p[style-name='Heading 2'] => h2:fresh",
      "p[style-name='Heading 3'] => h3:fresh",
      "p[style-name='标题 1'] => h1:fresh",
      "p[style-name='标题 2'] => h2:fresh",
      "p[style-name='标题 3'] => h3:fresh"
    ],
    includeDefaultStyleMap: true
  };
}

function sanitizeImportedHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "")
    .replace(/\sjavascript:/gi, "");
}

function extractImportTitle(html: string, fileName: string): string {
  const heading = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i.exec(html)?.[1];
  const title = (heading ? heading.replace(/<[^>]+>/g, " ") : path.basename(fileName, path.extname(fileName)))
    .replace(/\s+/g, " ")
    .trim();
  return title || "DOCX 导入章节";
}

export function getCurrentSnapshot(bookId: string): BookSnapshot {
  const book = mustGetBook(bookId);
  if (!book.currentPublishedVersionId) {
    throw new Error("BOOK_NOT_PUBLISHED");
  }
  const row = asRow<BookVersionRow>(getDb().prepare("SELECT * FROM BookVersion WHERE id = ?").get(book.currentPublishedVersionId));
  if (!row) {
    throw new Error("VERSION_NOT_FOUND");
  }
  return BookSnapshotSchema.parse(JSON.parse(row.snapshotJson) as unknown);
}

export function getSnapshotByVersion(versionId: string): BookSnapshot {
  const row = asRow<BookVersionRow>(getDb().prepare("SELECT * FROM BookVersion WHERE id = ?").get(versionId));
  if (!row) {
    throw new Error("VERSION_NOT_FOUND");
  }
  return BookSnapshotSchema.parse(JSON.parse(row.snapshotJson) as unknown);
}

function mustGetBook(bookId: string): BookRow {
  const book = asRow<BookRow>(getDb().prepare("SELECT * FROM Book WHERE id = ?").get(bookId));
  if (!book) {
    throw new Error("BOOK_NOT_FOUND");
  }
  return book;
}

function getChapters(bookId: string): ChapterRow[] {
  return asRows<ChapterRow>(getDb().prepare("SELECT * FROM Chapter WHERE bookId = ? ORDER BY sortOrder ASC").all(bookId));
}

function placeholders(count: number): string {
  if (count <= 0) {
    return "''";
  }
  return Array.from({ length: count }, () => "?").join(",");
}

function plainText(document: ChapterDocument): string {
  return document.nodes.map((node) => {
    if (node.type === "heading") return node.text;
    if (node.type === "richText") return node.html.replace(/<[^>]+>/g, " ");
    if ("title" in node) return node.title;
    return node.type;
  }).join(" ").replace(/\s+/g, " ").trim();
}
