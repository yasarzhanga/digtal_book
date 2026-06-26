import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import mammoth from "mammoth";
import { z } from "zod";
import type { Asset } from "@/content-engine/schema/assets";

export const AssetSearchTextSchema = z.string().max(6000);

type AssetSearchSource = Pick<Asset, "kind" | "title" | "originalName" | "mimeType"> & {
  description?: string;
  metadata?: Record<string, unknown>;
};

export async function extractAssetSearchText(asset: AssetSearchSource, absolutePath: string): Promise<string> {
  const parts = [
    asset.kind,
    asset.title,
    asset.originalName,
    asset.description ?? "",
    ...metadataText(asset.metadata ?? {})
  ];
  const extension = path.extname(asset.originalName).toLowerCase();
  try {
    if (asset.mimeType.includes("wordprocessingml") || extension === ".docx") {
      const result = await mammoth.extractRawText({ path: absolutePath });
      parts.push(result.value);
    } else if (asset.mimeType.includes("spreadsheetml") || extension === ".xlsx") {
      parts.push(await extractSpreadsheetText(absolutePath));
    } else if (isPlainTextAsset(asset, extension)) {
      parts.push(fs.readFileSync(absolutePath, "utf8"));
    }
  } catch (error) {
    parts.push(`索引提取失败 ${error instanceof Error ? error.message : "UNKNOWN_ERROR"}`);
  }
  return normalizeSearchText(parts.join(" "));
}

export function assetSearchText(asset: Asset): string {
  const stored = typeof asset.metadata.searchText === "string" ? asset.metadata.searchText : "";
  return normalizeSearchText([
    asset.kind,
    asset.title,
    asset.originalName,
    asset.description ?? "",
    ...metadataText(asset.metadata),
    stored
  ].join(" "));
}

async function extractSpreadsheetText(filePath: string): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const cells: string[] = [];
  for (const sheet of workbook.worksheets) {
    cells.push(sheet.name);
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const values = row.values;
      if (!Array.isArray(values)) return;
      cells.push(...values.slice(1).map(cellToText).filter(Boolean));
    });
  }
  return cells.join(" ");
}

function isPlainTextAsset(asset: AssetSearchSource, extension: string): boolean {
  return asset.mimeType.startsWith("text/") || [".txt", ".md", ".csv", ".tsv", ".vtt"].includes(extension);
}

function metadataText(metadata: Record<string, unknown>): string[] {
  return Object.entries(metadata).flatMap(([key, value]) => {
    if (key === "searchText") return [];
    if (typeof value === "string") return [value];
    if (typeof value === "number" || typeof value === "boolean") return [String(value)];
    if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
    return [];
  });
}

function cellToText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && "text" in value && typeof value.text === "string") return value.text;
  if (typeof value === "object" && "result" in value) return cellToText(value.result as ExcelJS.CellValue);
  return "";
}

function normalizeSearchText(value: string): string {
  return AssetSearchTextSchema.parse(value.replace(/\s+/g, " ").trim().slice(0, 6000));
}
