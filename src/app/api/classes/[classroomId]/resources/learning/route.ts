import { ensureClassroomTeacher, requireTeacher } from "@/server/auth/guards";
import { errorResponse, ok } from "@/server/http";
import { buildResourceLearningWorkbook } from "@/server/services/p1";
import { getResourceLearningDetails } from "@/server/services/teaching";

interface RouteContext {
  params: Promise<{ classroomId: string }>;
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireTeacher();
    const { classroomId } = await context.params;
    ensureClassroomTeacher(classroomId, user.id);
    const format = new URL(request.url).searchParams.get("format");
    if (format === "xlsx") {
      const buffer = await buildResourceLearningWorkbook(classroomId);
      return new Response(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": "attachment; filename=\"resource-learning.xlsx\""
        }
      });
    }
    return ok({ learning: getResourceLearningDetails(classroomId) });
  } catch (error) {
    return errorResponse(error);
  }
}
