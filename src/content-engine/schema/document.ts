import { z } from "zod";
import { AssetSchema } from "./assets";
import { ContentNodeSchema } from "./nodes";

export const ChapterDocumentSchema = z.object({
  type: z.literal("chapterDocument"),
  version: z.literal(1),
  nodes: z.array(ContentNodeSchema)
});

export type ChapterDocument = z.infer<typeof ChapterDocumentSchema>;

export const SnapshotChapterSchema = z.object({
  id: z.string().min(1),
  parentId: z.string().nullable(),
  title: z.string().min(1),
  level: z.number().int().min(1).max(2),
  sortOrder: z.number().int().nonnegative(),
  document: ChapterDocumentSchema
});

export const BookSnapshotSchema = z.object({
  book: z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    subtitle: z.string().default(""),
    description: z.string().default(""),
    coverAssetId: z.string().nullable()
  }),
  versionId: z.string().min(1),
  versionNumber: z.number().int().positive(),
  publishedAt: z.string().min(1),
  chapters: z.array(SnapshotChapterSchema).min(1),
  assets: z.array(AssetSchema)
});

export type SnapshotChapter = z.infer<typeof SnapshotChapterSchema>;
export type BookSnapshot = z.infer<typeof BookSnapshotSchema>;

export const emptyChapterDocument = (): ChapterDocument => ({
  type: "chapterDocument",
  version: 1,
  nodes: []
});
