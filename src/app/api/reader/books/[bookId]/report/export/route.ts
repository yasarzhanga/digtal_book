import { requireUser } from "@/server/auth/session";
import { errorResponse } from "@/server/http";
import { buildPersonalReportSvg, buildPersonalReportWorkbook } from "@/server/services/p1";

interface RouteContext {
  params: Promise<{ bookId: string }>;
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireUser();
    const { bookId } = await context.params;
    const format = new URL(request.url).searchParams.get("format") ?? "xlsx";
    if (format === "svg") {
      return new Response(buildPersonalReportSvg(user.id, bookId), {
        headers: {
          "Content-Type": "image/svg+xml; charset=utf-8",
          "Content-Disposition": "attachment; filename=\"personal-report.svg\""
        }
      });
    }
    const buffer = await buildPersonalReportWorkbook(user.id, bookId);
    return fileResponse(buffer, "personal-report.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  } catch (error) {
    return errorResponse(error);
  }
}

function fileResponse(buffer: Buffer, filename: string, contentType: string): Response {
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`
    }
  });
}
