import { requireUser } from "@/server/auth/session";
import { errorResponse, ok } from "@/server/http";
import { closeAssignment } from "@/server/services/p1";

interface RouteContext {
  params: Promise<{ classroomId: string; assignmentId: string }>;
}

export async function POST(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireUser();
    if (user.role !== "TEACHER") {
      throw new Error("FORBIDDEN");
    }
    const { classroomId, assignmentId } = await context.params;
    return ok({ assignment: closeAssignment(user.id, classroomId, assignmentId) });
  } catch (error) {
    return errorResponse(error);
  }
}
