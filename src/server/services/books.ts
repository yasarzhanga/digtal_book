import path from "node:path";
import mammoth from "mammoth";
import { z } from "zod";
import { BookSnapshotSchema, ChapterDocumentSchema, type BookSnapshot, type ChapterDocument } from "@/content-engine/schema/document";
import { collectAssetIdsFromDocument } from "@/content-engine/utils/assets";
import { asRow, asRows, getDb, withTransaction } from "@/server/db/client";
import { id } from "@/server/db/ids";
import { stringifyJson } from "@/server/db/json";
import { createBufferedAsset, toAsset } from "@/server/services/assets";
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
  topLevelChapterCount: number;
  subChapterCount: number;
  mediaCount: number;
  imageCount: number;
  tableCount: number;
  linkCount: number;
  createdChapterId?: string;
  createdChapterIds?: string[];
  html: string;
  warnings: string[];
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

export function getEditorBookForOwner(bookId: string, ownerId: string): EditorBook {
  const book = mustGetBook(bookId);
  if (book.ownerId !== ownerId) {
    throw new Error("BOOK_OWNER_FORBIDDEN");
  }
  return getEditorBook(bookId);
}

export function listBooks(): { id: string; title: string; subtitle: string; currentPublishedVersionId: string | null }[] {
  const rows = asRows<BookRow>(getDb().prepare("SELECT * FROM Book ORDER BY createdAt DESC").all());
  return rows.map((row) => ({ id: row.id, title: row.title, subtitle: row.subtitle, currentPublishedVersionId: row.currentPublishedVersionId }));
}

export function listBooksForOwner(ownerId: string): { id: string; title: string; subtitle: string; currentPublishedVersionId: string | null }[] {
  const rows = asRows<BookRow>(getDb().prepare("SELECT * FROM Book WHERE ownerId = ? ORDER BY createdAt DESC").all(ownerId));
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

export async function importDocxFixture(bookId: string, ownerId: string, confirm: boolean): Promise<DocxImportResult> {
  mustGetBook(bookId);
  const docxPath = path.resolve(process.cwd(), "starter-assets/imports/sample-physics.docx");
  const conversion = await convertDocxToHtml({ path: docxPath }, "sample-physics.docx", ownerId, confirm);
  return importDocxHtml(bookId, "sample-physics.docx", conversion, confirm);
}

export async function importDocxUpload(bookId: string, ownerId: string, input: z.input<typeof DocxImportSourceSchema>): Promise<DocxImportResult> {
  mustGetBook(bookId);
  const parsed = DocxImportSourceSchema.parse(input);
  if (!parsed.fileName.toLowerCase().endsWith(".docx")) {
    throw new Error("DOCX_ONLY");
  }
  if (parsed.buffer.byteLength > 25 * 1024 * 1024) {
    throw new Error("DOCX_TOO_LARGE");
  }
  const conversion = await convertDocxToHtml({ buffer: parsed.buffer }, parsed.fileName, ownerId, parsed.confirm);
  return importDocxHtml(bookId, parsed.fileName, conversion, parsed.confirm);
}

interface DocxHtmlConversion {
  html: string;
  imageCount: number;
  warnings: string[];
}

interface ImportedSection {
  title: string;
  level: 1 | 2;
  parentIndex: number | null;
  body: string[];
}

async function convertDocxToHtml(input: { path: string } | { buffer: Buffer }, fileName: string, ownerId: string, persistImages: boolean): Promise<DocxHtmlConversion> {
  let imageCount = 0;
  const warnings: string[] = [];
  const convertImage = mammoth.images.imgElement(async (image) => {
    imageCount += 1;
    const contentType = image.contentType || "application/octet-stream";
    if (!persistImages) {
      return { src: `#docx-image-preview-${imageCount}` };
    }
    try {
      if (!supportedDocxImageMime(contentType)) {
        warnings.push(`图片未提取：第 ${imageCount} 张图片类型 ${contentType} 暂不在本地 Demo 支持范围`);
        return { src: `#docx-image-not-extracted-${imageCount}` };
      }
      const buffer = await image.readAsBuffer();
      const asset = await createBufferedAsset({
        title: `${path.basename(fileName, path.extname(fileName))} 图片 ${imageCount}`,
        originalName: `${path.basename(fileName, path.extname(fileName))}-image-${imageCount}${extensionForMime(contentType)}`,
        mimeType: contentType,
        kind: "IMAGE",
        buffer
      }, ownerId);
      return { src: asset.url };
    } catch {
      warnings.push(`图片未提取：第 ${imageCount} 张图片读取失败`);
      return { src: `#docx-image-not-extracted-${imageCount}` };
    }
  });
  const result = await mammoth.convertToHtml(input, mammothOptions(convertImage));
  const messageWarnings = result.messages.map((message) => message.message).filter((message) => message.trim().length > 0);
  return {
    html: result.value,
    imageCount,
    warnings: [...warnings, ...messageWarnings]
  };
}

function importDocxHtml(bookId: string, fileName: string, conversion: DocxHtmlConversion, confirm: boolean): DocxImportResult {
  const warningHtml = conversion.warnings.map((warning) => `<p><strong>${escapeHtml(warning)}</strong></p>`).join("");
  const html = sanitizeImportedHtml(`${conversion.html || "<p>DOCX 已导入，但没有可见正文。</p>"}${warningHtml}`);
  const sections = splitDocxSections(html, fileName);
  const tableMatches = [...html.matchAll(/<table\b/gi)];
  const linkMatches = [...html.matchAll(/<a\b/gi)];
  const imageMatches = [...html.matchAll(/<img\b/gi)];
  if (!confirm) {
    return {
      chapterCount: sections.length,
      topLevelChapterCount: sections.filter((section) => section.level === 1).length,
      subChapterCount: sections.filter((section) => section.level === 2).length,
      mediaCount: conversion.imageCount || imageMatches.length,
      imageCount: conversion.imageCount || imageMatches.length,
      tableCount: tableMatches.length,
      linkCount: linkMatches.length,
      html,
      warnings: conversion.warnings
    };
  }
  const now = new Date().toISOString();
  const existingCount = getChapters(bookId).length;
  const chapterIds = sections.map(() => id("chapter"));
  withTransaction(() => {
    sections.forEach((section, index) => {
      const chapterId = chapterIds[index];
      if (!chapterId) {
        throw new Error("DOCX_IMPORT_CHAPTER_ID_MISSING");
      }
      const bodyHtml = section.body.join("").trim() || "<p>从 DOCX 导入的章节。</p>";
      const document = ChapterDocumentSchema.parse({
        type: "chapterDocument",
        version: 1,
        nodes: [
          { nodeId: `${chapterId}-0-heading`, type: "heading", level: section.level, text: section.title },
          { nodeId: `${chapterId}-1-richText`, type: "richText", html: bodyHtml }
        ]
      });
      getDb().prepare("INSERT INTO Chapter (id, bookId, parentId, title, level, sortOrder, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
        chapterId,
        bookId,
        section.parentIndex === null ? null : chapterIds[section.parentIndex],
        section.title,
        section.level,
        existingCount + index,
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
  });
  return {
    chapterCount: sections.length,
    topLevelChapterCount: sections.filter((section) => section.level === 1).length,
    subChapterCount: sections.filter((section) => section.level === 2).length,
    mediaCount: conversion.imageCount || imageMatches.length,
    imageCount: conversion.imageCount || imageMatches.length,
    tableCount: tableMatches.length,
    linkCount: linkMatches.length,
    createdChapterId: chapterIds[0],
    createdChapterIds: chapterIds,
    html,
    warnings: conversion.warnings
  };
}

function mammothOptions(convertImage?: ReturnType<typeof mammoth.images.imgElement>) {
  return {
    styleMap: [
      "p[style-name='Title'] => h1:fresh",
      "p[style-name='Subtitle'] => h2:fresh",
      "p[style-name='Heading 1'] => h1:fresh",
      "p[style-name='Heading 2'] => h2:fresh",
      "p[style-name='Heading 3'] => h3:fresh",
      "p[style-name='Heading 4'] => h4:fresh",
      "p[style-name='Heading 5'] => h5:fresh",
      "p[style-name='Heading 6'] => h6:fresh",
      "p[style-name='标题 1'] => h1:fresh",
      "p[style-name='标题 2'] => h2:fresh",
      "p[style-name='标题 3'] => h3:fresh",
      "p[style-name='标题 4'] => h4:fresh",
      "p[style-name='标题 5'] => h5:fresh",
      "p[style-name='标题 6'] => h6:fresh"
    ],
    includeDefaultStyleMap: true,
    convertImage
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

function splitDocxSections(html: string, fileName: string): ImportedSection[] {
  const blocks = topLevelBlocks(html);
  const sections: ImportedSection[] = [];
  let currentTopLevelIndex: number | null = null;
  let currentSectionIndex: number | null = null;

  function startSection(level: 1 | 2, title: string, parentIndex: number | null): number {
    sections.push({ title: title || extractImportTitle(html, fileName), level, parentIndex, body: [] });
    return sections.length - 1;
  }

  function ensureTopLevelSection(): number {
    if (currentTopLevelIndex === null) {
      currentTopLevelIndex = startSection(1, extractImportTitle(html, fileName), null);
      currentSectionIndex = currentTopLevelIndex;
    }
    return currentTopLevelIndex;
  }

  for (const block of blocks) {
    if (block.tag === "h1") {
      currentTopLevelIndex = startSection(1, block.text, null);
      currentSectionIndex = currentTopLevelIndex;
      continue;
    }
    if (block.tag === "h2") {
      const parentIndex = ensureTopLevelSection();
      currentSectionIndex = startSection(2, block.text, parentIndex);
      continue;
    }
    if (currentSectionIndex === null) {
      currentSectionIndex = ensureTopLevelSection();
    }
    sections[currentSectionIndex]?.body.push(block.html);
  }

  if (sections.length === 0) {
    sections.push({ title: extractImportTitle(html, fileName), level: 1, parentIndex: null, body: [html] });
  }
  return sections;
}

function topLevelBlocks(html: string): { tag: string; html: string; text: string }[] {
  const pattern = /<(h[1-6]|p|ul|ol|table|blockquote|pre)(?:\s[^>]*)?>[\s\S]*?<\/\1>/gi;
  const blocks: { tag: string; html: string; text: string }[] = [];
  for (const match of html.matchAll(pattern)) {
    const raw = match[0];
    const tag = match[1]?.toLowerCase();
    if (!tag || !raw.trim()) continue;
    blocks.push({ tag, html: raw, text: htmlText(raw) });
  }
  return blocks.length ? blocks : [{ tag: "p", html: `<p>${escapeHtml(htmlText(html))}</p>`, text: htmlText(html) }];
}

function extractImportTitle(html: string, fileName: string): string {
  const heading = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i.exec(html)?.[1];
  const title = (heading ? htmlText(heading) : path.basename(fileName, path.extname(fileName)))
    .replace(/\s+/g, " ")
    .trim();
  return title || "DOCX 导入章节";
}

function supportedDocxImageMime(mimeType: string): boolean {
  return ["image/png", "image/jpeg", "image/webp", "image/svg+xml"].includes(mimeType);
}

function extensionForMime(mimeType: string): string {
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "image/svg+xml") return ".svg";
  return ".bin";
}

function htmlText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
