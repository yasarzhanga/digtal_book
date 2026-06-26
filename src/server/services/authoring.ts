import ExcelJS from "exceljs";
import { z } from "zod";
import { ChartNodeSchema } from "@/content-engine/schema/nodes";

export const ChartWorkbookImportSourceSchema = z.object({
  fileName: z.string().min(1),
  buffer: z.instanceof(Buffer)
});

export const ChartWorkbookImportResultSchema = ChartNodeSchema.omit({ nodeId: true, type: true });

export type ChartWorkbookImportResult = z.infer<typeof ChartWorkbookImportResultSchema>;

export async function importChartWorkbook(input: z.input<typeof ChartWorkbookImportSourceSchema>): Promise<ChartWorkbookImportResult> {
  const parsed = ChartWorkbookImportSourceSchema.parse(input);
  if (!/\.xlsx$/i.test(parsed.fileName)) {
    throw new Error("CHART_IMPORT_REQUIRES_XLSX");
  }
  if (parsed.buffer.byteLength > 8 * 1024 * 1024) {
    throw new Error("CHART_IMPORT_FILE_TOO_LARGE");
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(parsed.buffer as unknown as ExcelJS.Buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new Error("CHART_IMPORT_SHEET_MISSING");
  }

  const rows = sheet.getSheetValues().filter((row): row is ExcelJS.CellValue[] => Array.isArray(row));
  const header = rows[0] ?? [];
  const labelHeader = cellToText(header[1]) || "标签";
  const valueHeader = cellToText(header[2]) || "数值";
  const items = rows.slice(1).map((row) => {
    const label = cellToText(row[1]).trim();
    const value = cellToNumber(row[2]);
    return label && Number.isFinite(value) ? { label, value } : null;
  }).filter((item): item is { label: string; value: number } => Boolean(item));

  if (items.length < 1) {
    throw new Error("CHART_IMPORT_NO_NUMERIC_ROWS");
  }

  return ChartWorkbookImportResultSchema.parse({
    chartType: inferChartType(sheet.name, valueHeader),
    title: sheet.name && sheet.name !== "Sheet1" ? sheet.name : "Excel 导入图表",
    items,
    xLabel: labelHeader,
    yLabel: valueHeader,
    showLegend: true,
    theme: "light",
    color: "#1b7f83"
  });
}

function inferChartType(sheetName: string, valueHeader: string): "line" | "bar" | "pie" {
  const text = `${sheetName} ${valueHeader}`.toLowerCase();
  if (/占比|比例|percent|ratio|pie/.test(text)) return "pie";
  if (/趋势|时间|time|trend|line/.test(text)) return "line";
  return "bar";
}

function cellToText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  const record = objectRecord(value);
  if (typeof record.text === "string") return record.text;
  if (Array.isArray(record.richText)) {
    return record.richText.map((item) => objectRecord(item).text).filter((item): item is string => typeof item === "string").join("");
  }
  if ("result" in record) {
    return cellToText(record.result as ExcelJS.CellValue);
  }
  return "";
}

function cellToNumber(value: ExcelJS.CellValue): number {
  if (typeof value === "number") return value;
  const text = cellToText(value).replace(/[%％]/g, "").trim();
  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric : Number.NaN;
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}
