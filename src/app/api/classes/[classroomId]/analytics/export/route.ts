import { ensureClassroomTeacher, requireTeacher } from "@/server/auth/guards";
import { errorResponse } from "@/server/http";
import { buildClassReportSvg, buildClassReportWorkbook } from "@/server/services/p1";

interface RouteContext {
  params: Promise<{ classroomId: string }>;
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireTeacher();
    const { classroomId } = await context.params;
    ensureClassroomTeacher(classroomId, user.id);
    const format = new URL(request.url).searchParams.get("format") ?? "xlsx";
    if (format === "svg") {
      return new Response(buildClassReportSvg(classroomId), {
        headers: {
          "Content-Type": "image/svg+xml; charset=utf-8",
          "Content-Disposition": "attachment; filename=\"class-report.svg\""
        }
      });
    }
    const buffer = await buildClassReportWorkbook(classroomId);
    return fileResponse(buffer, "class-report.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
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
