import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AssetKindSchema, AssetSchema, uploadRules, type Asset } from "@/content-engine/schema/assets";
import { collectAssetIdsFromDocument } from "@/content-engine/utils/assets";
import { ChapterDocumentSchema } from "@/content-engine/schema/document";
import { asRow, asRows, getDb } from "@/server/db/client";
import { id } from "@/server/db/ids";
import { BookSnapshotSchema } from "@/content-engine/schema/document";
import type { AssetRow, BookVersionRow, DraftDocumentRow } from "@/server/db/types";
import type { PublicUser } from "@/server/services/auth";
import { extractAssetSearchText } from "@/server/services/asset-search";
import { ensureBookReadable } from "@/server/auth/guards";

export const AssetUploadInputSchema = z.object({
  title: z.string().min(1),
  kind: AssetKindSchema
});

export const BufferedAssetInputSchema = z.object({
  title: z.string().min(1),
  originalName: z.string().min(1),
  mimeType: z.string().min(1),
  kind: AssetKindSchema,
  buffer: z.instanceof(Buffer)
});

export function toAsset(row: AssetRow): Asset {
  return AssetSchema.parse({
    id: row.id,
    key: row.assetKey,
    kind: row.kind,
    title: row.title,
    originalName: row.originalName,
    mimeType: row.mimeType,
    size: row.size,
    relativePath: row.relativePath,
    url: `/api/assets/${row.id}/file`,
    description: row.description ?? "",
    metadata: JSON.parse(row.metadataJson) as unknown
  });
}

export function listAssets(): Asset[] {
  const rows = asRows<AssetRow>(getDb().prepare("SELECT * FROM Asset ORDER BY kind, title").all());
  return rows.map(toAsset);
}

export function listReadableAssets(user: PublicUser): Asset[] {
  const rows = asRows<AssetRow>(getDb().prepare("SELECT * FROM Asset ORDER BY kind, title").all());
  return rows.filter((row) => canAccessAssetRow(row, user)).map(toAsset);
}

export function getAsset(assetId: string): Asset | null {
  const row = asRow<AssetRow>(getDb().prepare("SELECT * FROM Asset WHERE id = ?").get(assetId));
  return row ? toAsset(row) : null;
}

export function ensureAssetReadable(assetId: string, user: PublicUser): Asset {
  const row = asRow<AssetRow>(getDb().prepare("SELECT * FROM Asset WHERE id = ?").get(assetId));
  if (!row) {
    throw new Error("ASSET_NOT_FOUND");
  }
  if (!canAccessAssetRow(row, user)) {
    throw new Error("ASSET_READ_FORBIDDEN");
  }
  return toAsset(row);
}

export function getAssetFile(assetId: string): { absolutePath: string; mimeType: string; originalName: string; size: number } {
  const row = asRow<AssetRow>(getDb().prepare("SELECT * FROM Asset WHERE id = ?").get(assetId));
  if (!row) {
    throw new Error("ASSET_NOT_FOUND");
  }
  const uploadRoot = path.resolve(process.cwd(), "storage/uploads");
  const absolutePath = path.resolve(uploadRoot, row.relativePath);
  const relative = path.relative(uploadRoot, absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("ASSET_PATH_TRAVERSAL");
  }
  if (!fs.existsSync(absolutePath)) {
    throw new Error("ASSET_FILE_MISSING");
  }
  return { absolutePath, mimeType: row.mimeType, originalName: row.originalName, size: row.size };
}

export async function createUploadedAsset(file: File, input: z.infer<typeof AssetUploadInputSchema>, ownerId: string): Promise<Asset> {
  const rule = uploadRules[input.kind];
  if (!rule.mimeTypes.includes(file.type)) {
    throw new Error("UNSUPPORTED_FILE_TYPE");
  }
  if (file.size > rule.maxBytes) {
    throw new Error("FILE_TOO_LARGE");
  }
  const extension = safeExtension(file.name);
  const assetId = id("asset");
  const relativePath = `${assetId}${extension}`;
  const uploadRoot = path.resolve(process.cwd(), "storage/uploads");
  fs.mkdirSync(uploadRoot, { recursive: true });
  const arrayBuffer = await file.arrayBuffer();
  fs.writeFileSync(path.join(uploadRoot, relativePath), Buffer.from(arrayBuffer));
  const metadata = {
    searchText: await extractAssetSearchText({
      kind: input.kind,
      title: input.title,
      originalName: file.name,
      mimeType: file.type,
      description: "",
      metadata: {}
    }, path.join(uploadRoot, relativePath))
  };

  const now = new Date().toISOString();
  getDb().prepare("INSERT INTO Asset (id, ownerId, kind, assetKey, originalName, mimeType, size, relativePath, title, description, metadataJson, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
    assetId,
    ownerId,
    input.kind,
    assetId,
    file.name,
    file.type,
    file.size,
    relativePath,
    input.title,
    "",
    JSON.stringify(metadata),
    now
  );
  const asset = getAsset(assetId);
  if (!asset) {
    throw new Error("ASSET_CREATE_FAILED");
  }
  return asset;
}

export async function createBufferedAsset(input: z.input<typeof BufferedAssetInputSchema>, ownerId: string): Promise<Asset> {
  const parsed = BufferedAssetInputSchema.parse(input);
  const rule = uploadRules[parsed.kind];
  if (!rule.mimeTypes.includes(parsed.mimeType)) {
    throw new Error("UNSUPPORTED_FILE_TYPE");
  }
  if (parsed.buffer.byteLength > rule.maxBytes) {
    throw new Error("FILE_TOO_LARGE");
  }
  const assetId = id("asset");
  const relativePath = `${assetId}${safeExtension(parsed.originalName)}`;
  const uploadRoot = path.resolve(process.cwd(), "storage/uploads");
  fs.mkdirSync(uploadRoot, { recursive: true });
  const absolutePath = path.join(uploadRoot, relativePath);
  fs.writeFileSync(absolutePath, parsed.buffer);
  const metadata = {
    searchText: await extractAssetSearchText({
      kind: parsed.kind,
      title: parsed.title,
      originalName: parsed.originalName,
      mimeType: parsed.mimeType,
      description: "",
      metadata: {}
    }, absolutePath)
  };
  const now = new Date().toISOString();
  getDb().prepare("INSERT INTO Asset (id, ownerId, kind, assetKey, originalName, mimeType, size, relativePath, title, description, metadataJson, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
    assetId,
    ownerId,
    parsed.kind,
    assetId,
    parsed.originalName,
    parsed.mimeType,
    parsed.buffer.byteLength,
    relativePath,
    parsed.title,
    "",
    JSON.stringify(metadata),
    now
  );
  const asset = getAsset(assetId);
  if (!asset) {
    throw new Error("ASSET_CREATE_FAILED");
  }
  return asset;
}

export function getAssetReferences(assetId: string): { chapterId: string; count: number }[] {
  const rows = asRows<DraftDocumentRow>(getDb().prepare("SELECT chapterId, documentJson FROM DraftDocument").all());
  return rows.flatMap((row) => {
    const document = ChapterDocumentSchema.parse(JSON.parse(row.documentJson) as unknown);
    const count = collectAssetIdsFromDocument(document).filter((idValue) => idValue === assetId).length;
    return count > 0 ? [{ chapterId: row.chapterId, count }] : [];
  });
}

export function getVisibleAssetReferences(assetId: string, user: PublicUser): { chapterId: string; count: number }[] {
  ensureAssetReadable(assetId, user);
  const rows = asRows<DraftDocumentRow & { bookId: string }>(
    getDb().prepare(`
      SELECT DraftDocument.chapterId, DraftDocument.documentJson, Chapter.bookId
      FROM DraftDocument JOIN Chapter ON Chapter.id = DraftDocument.chapterId
      ORDER BY Chapter.sortOrder ASC
    `).all()
  );
  return rows.flatMap((row) => {
    if (!canReadBook(user, row.bookId)) {
      return [];
    }
    const document = ChapterDocumentSchema.parse(JSON.parse(row.documentJson) as unknown);
    const count = collectAssetIdsFromDocument(document).filter((idValue) => idValue === assetId).length;
    return count > 0 ? [{ chapterId: row.chapterId, count }] : [];
  });
}

export function deleteUnreferencedAsset(assetId: string): void {
  const references = getAssetReferences(assetId);
  if (references.length > 0) {
    throw new Error("ASSET_IN_USE");
  }
  const file = getAssetFile(assetId);
  getDb().prepare("DELETE FROM Asset WHERE id = ?").run(assetId);
  fs.rmSync(file.absolutePath, { force: true });
}

function canAccessAssetRow(row: AssetRow, user: PublicUser): boolean {
  if (row.ownerId === user.id) {
    return true;
  }
  if (isStudentRecordingAsset(row.id, user)) {
    return true;
  }
  if (isCourseResourceAsset(row.id, user)) {
    return true;
  }
  return isPublishedBookAsset(row.id, user);
}

function isStudentRecordingAsset(assetId: string, user: PublicUser): boolean {
  if (user.role !== "STUDENT") {
    return false;
  }
  const row = asRow<{ id: string }>(
    getDb().prepare("SELECT id FROM RecordingSubmission WHERE assetId = ? AND userId = ? LIMIT 1").get(assetId, user.id)
  );
  return Boolean(row);
}

function isCourseResourceAsset(assetId: string, user: PublicUser): boolean {
  const rows = asRows<{ classroomId: string; teacherId: string; visibility: string }>(
    getDb().prepare(`
      SELECT Classroom.id AS classroomId, Course.teacherId, CourseResource.visibility
      FROM CourseResource
      JOIN Course ON Course.id = CourseResource.courseId
      JOIN Classroom ON Classroom.courseId = Course.id
      WHERE CourseResource.assetId = ?
    `).all(assetId)
  );
  return rows.some((row) => {
    if (user.role === "TEACHER") {
      return row.teacherId === user.id;
    }
    if (user.role === "STUDENT" && row.visibility === "CLASS") {
      const enrollment = asRow<{ id: string }>(
        getDb().prepare("SELECT id FROM Enrollment WHERE classroomId = ? AND studentId = ?").get(row.classroomId, user.id)
      );
      return Boolean(enrollment);
    }
    return false;
  });
}

function isPublishedBookAsset(assetId: string, user: PublicUser): boolean {
  const rows = asRows<BookVersionRow & { ownerId: string; currentPublishedVersionId: string | null }>(
    getDb().prepare(`
      SELECT BookVersion.*, Book.ownerId, Book.currentPublishedVersionId
      FROM BookVersion
      JOIN Book ON Book.currentPublishedVersionId = BookVersion.id
    `).all()
  );
  return rows.some((row) => {
    if (!snapshotReferencesAsset(row.snapshotJson, assetId)) {
      return false;
    }
    return canReadBook(user, row.bookId);
  });
}

function snapshotReferencesAsset(snapshotJson: string, assetId: string): boolean {
  try {
    const snapshot = BookSnapshotSchema.parse(JSON.parse(snapshotJson) as unknown);
    return snapshot.assets.some((asset) => asset.id === assetId)
      || snapshot.chapters.some((chapter) => collectAssetIdsFromDocument(chapter.document).includes(assetId));
  } catch {
    return false;
  }
}

function canReadBook(user: PublicUser, bookId: string): boolean {
  try {
    ensureBookReadable(user, bookId);
    return true;
  } catch {
    return false;
  }
}

function safeExtension(fileName: string): string {
  const extension = path.extname(fileName).toLowerCase();
  if (!/^\.[a-z0-9]+$/.test(extension)) {
    return `.${randomUUID().slice(0, 6)}`;
  }
  return extension;
}
