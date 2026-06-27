import path from "node:path";
import ExcelJS from "exceljs";
import mammoth from "mammoth";
import { z } from "zod";
import type { Asset } from "@/content-engine/schema/assets";
import { getAsset, getAssetFile } from "@/server/services/assets";

export const PreviewModeSchema = z.enum(["pdf", "html", "spreadsheet", "package", "specialist", "download"]);

export const AssetPreviewSchema = z.object({
  asset: z.object({
    id: z.string(),
    title: z.string(),
    kind: z.string(),
    originalName: z.string(),
    mimeType: z.string(),
    url: z.string()
  }),
  adapter: z.string().min(1),
  mode: PreviewModeSchema,
  title: z.string().min(1),
  html: z.string().optional(),
  fileUrl: z.string().optional(),
  message: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export type AssetPreview = z.infer<typeof AssetPreviewSchema>;

interface PreviewAdapter {
  adapter: string;
  mode: z.infer<typeof PreviewModeSchema>;
  title: string;
  specialist?: "cad" | "dicom" | "visio";
}

export function detectPreviewAdapter(fileName: string, mimeType: string, kind?: string): PreviewAdapter {
  const extension = path.extname(fileName).toLowerCase();
  if (mimeType === "application/pdf" || extension === ".pdf" || kind === "PDF") {
    return { adapter: "pdf-native", mode: "pdf", title: "PDF 原生预览" };
  }
  if (mimeType.includes("wordprocessingml") || extension === ".docx") {
    return { adapter: "office-docx-html", mode: "html", title: "Office/WPS 文档转 HTML 预览" };
  }
  if (mimeType.includes("spreadsheetml") || extension === ".xlsx") {
    return { adapter: "office-xlsx-grid", mode: "spreadsheet", title: "Office/WPS 表格转网格预览" };
  }
  if (mimeType.includes("presentationml") || extension === ".pptx") {
    return { adapter: "office-pptx-fallback", mode: "download", title: "演示文稿下载预览" };
  }
  if ([".dwg", ".dxf", ".step", ".stp", ".iges", ".igs"].includes(extension) || /cad|dxf|dwg|step/i.test(mimeType)) {
    return { adapter: "cad-metadata", mode: "specialist", title: "CAD 工程图识别与降级预览", specialist: "cad" };
  }
  if ([".dcm", ".dicom"].includes(extension) || /dicom/i.test(mimeType)) {
    return { adapter: "dicom-metadata", mode: "specialist", title: "DICOM 影像识别与降级预览", specialist: "dicom" };
  }
  if ([".vsdx", ".vsd"].includes(extension) || /visio/i.test(mimeType)) {
    return { adapter: "visio-metadata", mode: "specialist", title: "Visio 流程图识别与降级预览", specialist: "visio" };
  }
  if (kind === "SCORM" || kind === "H5P") {
    return { adapter: "learning-package-launch", mode: "package", title: `${kind} 本地包识别与降级预览` };
  }
  return { adapter: "download-fallback", mode: "download", title: "安全下载预览" };
}

export async function getAssetPreview(assetId: string): Promise<AssetPreview> {
  const asset = getAsset(assetId);
  if (!asset) {
    throw new Error("ASSET_NOT_FOUND");
  }
  const file = getAssetFile(assetId);
  const adapter = detectPreviewAdapter(asset.originalName, asset.mimeType, asset.kind);
  const base = {
    asset: previewAsset(asset),
    adapter: adapter.adapter,
    mode: adapter.mode,
    title: adapter.title,
    fileUrl: asset.url,
    metadata: {
      size: asset.size,
      relativePath: asset.relativePath,
      specialist: adapter.specialist
    }
  };

  if (adapter.mode === "html") {
    const result = await mammoth.convertToHtml({ path: file.absolutePath });
    return AssetPreviewSchema.parse({
      ...base,
      html: sanitizePreviewHtml(result.value),
      message: result.messages.length ? result.messages.map((item) => item.message).join("；") : "DOCX 已转换为本地 HTML 预览。"
    });
  }

  if (adapter.mode === "spreadsheet") {
    return AssetPreviewSchema.parse({
      ...base,
      html: await spreadsheetHtml(file.absolutePath),
      message: "XLSX 已转换为只读表格预览。"
    });
  }

  if (adapter.mode === "specialist") {
    return AssetPreviewSchema.parse({
      ...base,
      message: `${adapter.title} 已识别文件类型。当前演示提供元数据、下载和后续接入真实渲染服务的稳定入口，不伪装完整渲染、专业阅片或制图能力。`
    });
  }

  if (adapter.mode === "package") {
    return AssetPreviewSchema.parse({
      ...base,
      message: "本地学习资源包已识别。当前 Demo 提供启动入口和下载链路，不内置完整 SCORM Runtime 或 H5P Player。"
    });
  }

  return AssetPreviewSchema.parse(base);
}

function previewAsset(asset: Asset): AssetPreview["asset"] {
  return {
    id: asset.id,
    title: asset.title,
    kind: asset.kind,
    originalName: asset.originalName,
    mimeType: asset.mimeType,
    url: asset.url
  };
}

function sanitizePreviewHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "");
}

async function spreadsheetHtml(filePath: string): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.worksheets[0];
  if (!sheet) return "<p>表格为空。</p>";
  const rows: string[] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells = row.values;
    if (!Array.isArray(cells)) return;
    rows.push(`<tr>${cells.slice(1).map((cell) => `<td>${escapeHtml(cellToText(cell))}</td>`).join("")}</tr>`);
  });
  return `<table><tbody>${rows.join("")}</tbody></table>`;
}

function cellToText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && "text" in value && typeof value.text === "string") return value.text;
  if (typeof value === "object" && "result" in value) return cellToText(value.result as ExcelJS.CellValue);
  return "";
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}
