import { ensureClassroomTeacher, requireTeacher } from "@/server/auth/guards";
import { errorResponse, ok } from "@/server/http";
import { listAssignmentSubmissions } from "@/server/services/p1";

interface RouteContext {
  params: Promise<{ classroomId: string; assignmentId: string }>;
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireTeacher();
    const { classroomId, assignmentId } = await context.params;
    ensureClassroomTeacher(classroomId, user.id);
    return ok({ submissions: listAssignmentSubmissions(user.id, classroomId, assignmentId) });
  } catch (error) {
    return errorResponse(error);
  }
}
