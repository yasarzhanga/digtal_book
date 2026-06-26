import { z } from "zod";

export const AssetKindSchema = z.enum(["IMAGE", "AUDIO", "VIDEO", "MODEL3D", "PANORAMA", "PDF", "DOCUMENT", "SCORM", "H5P"]);
export type AssetKind = z.infer<typeof AssetKindSchema>;

export const AssetSchema = z.object({
  id: z.string().min(1),
  key: z.string().min(1),
  kind: AssetKindSchema,
  title: z.string().min(1),
  originalName: z.string().min(1),
  mimeType: z.string().min(1),
  size: z.number().int().nonnegative(),
  relativePath: z.string().min(1),
  url: z.string().min(1),
  description: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export type Asset = z.infer<typeof AssetSchema>;

export const UploadRuleSchema = z.object({
  kinds: z.array(AssetKindSchema),
  maxBytes: z.number().int().positive(),
  mimeTypes: z.array(z.string())
});

export const uploadRules: Record<AssetKind, z.infer<typeof UploadRuleSchema>> = {
  IMAGE: {
    kinds: ["IMAGE"],
    maxBytes: 10 * 1024 * 1024,
    mimeTypes: ["image/png", "image/jpeg", "image/webp", "image/svg+xml"]
  },
  AUDIO: {
    kinds: ["AUDIO"],
    maxBytes: 30 * 1024 * 1024,
    mimeTypes: ["audio/mpeg", "audio/wav", "audio/ogg", "audio/x-wav", "audio/webm"]
  },
  VIDEO: {
    kinds: ["VIDEO"],
    maxBytes: 100 * 1024 * 1024,
    mimeTypes: ["video/mp4", "video/webm"]
  },
  MODEL3D: {
    kinds: ["MODEL3D"],
    maxBytes: 50 * 1024 * 1024,
    mimeTypes: ["model/gltf-binary", "model/gltf+json", "application/octet-stream"]
  },
  PANORAMA: {
    kinds: ["PANORAMA"],
    maxBytes: 20 * 1024 * 1024,
    mimeTypes: ["image/jpeg", "image/webp"]
  },
  PDF: {
    kinds: ["PDF"],
    maxBytes: 50 * 1024 * 1024,
    mimeTypes: ["application/pdf"]
  },
  DOCUMENT: {
    kinds: ["DOCUMENT"],
    maxBytes: 50 * 1024 * 1024,
    mimeTypes: [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    ]
  },
  SCORM: {
    kinds: ["SCORM"],
    maxBytes: 100 * 1024 * 1024,
    mimeTypes: ["application/zip", "application/x-zip-compressed", "application/octet-stream"]
  },
  H5P: {
    kinds: ["H5P"],
    maxBytes: 100 * 1024 * 1024,
    mimeTypes: ["application/zip", "application/x-zip-compressed", "application/octet-stream", "application/h5p"]
  }
};
