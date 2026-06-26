import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { importChartWorkbook } from "@/server/services/authoring";
import { getEditorBook } from "@/server/services/books";
import { errorResponse, ok } from "@/server/http";

const ChartImportFormSchema = z.object({
  file: z.instanceof(File)
}).superRefine((value, context) => {
  if (!/\.xlsx$/i.test(value.file.name)) {
    context.addIssue({ code: "custom", message: "CHART_IMPORT_REQUIRES_XLSX", path: ["file"] });
  }
  if (value.file.size > 8 * 1024 * 1024) {
    context.addIssue({ code: "custom", message: "CHART_IMPORT_FILE_TOO_LARGE", path: ["file"] });
  }
});

interface RouteContext {
  params: Promise<{ bookId: string }>;
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    await requireUser();
    const { bookId } = await context.params;
    getEditorBook(bookId);
    const formData = await request.formData();
    const parsed = ChartImportFormSchema.parse({ file: formData.get("file") });
    const buffer = Buffer.from(await parsed.file.arrayBuffer());
    const chart = await importChartWorkbook({ fileName: parsed.file.name, buffer });
    return ok({ chart });
  } catch (error) {
    return errorResponse(error);
  }
}
