import { ensureClassroomTeacher, ensureStudentEnrolled, requireRole } from "@/server/auth/guards";
import { getCurrentLive } from "@/server/services/teaching";
import { errorResponse, ok } from "@/server/http";

interface RouteContext {
  params: Promise<{ classroomId: string }>;
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireRole(["TEACHER", "STUDENT"]);
    const { classroomId } = await context.params;
    if (user.role === "TEACHER") {
      ensureClassroomTeacher(classroomId, user.id);
    } else {
      ensureStudentEnrolled(classroomId, user.id);
    }
    return ok(getCurrentLive(classroomId));
  } catch (error) {
    return errorResponse(error);
  }
}
