import { ensureClassroomTeacher, requireTeacher } from "@/server/auth/guards";
import { errorResponse } from "@/server/http";
import { buildQuestionBankTemplateWorkbook } from "@/server/services/p1";

interface RouteContext {
  params: Promise<{ classroomId: string }>;
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireTeacher();
    const { classroomId } = await context.params;
    ensureClassroomTeacher(classroomId, user.id);
    const buffer = await buildQuestionBankTemplateWorkbook();
    return fileResponse(buffer, "question-bank-template.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
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
