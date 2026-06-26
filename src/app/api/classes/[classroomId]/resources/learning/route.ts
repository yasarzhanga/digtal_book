import { requireUser } from "@/server/auth/session";
import { errorResponse, ok } from "@/server/http";
import { buildResourceLearningWorkbook, listAssignmentsForTeacher } from "@/server/services/p1";
import { getResourceLearningDetails } from "@/server/services/teaching";

interface RouteContext {
  params: Promise<{ classroomId: string }>;
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireUser();
    if (user.role !== "TEACHER") {
      throw new Error("FORBIDDEN");
    }
    const { classroomId } = await context.params;
    listAssignmentsForTeacher(classroomId, user.id);
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
