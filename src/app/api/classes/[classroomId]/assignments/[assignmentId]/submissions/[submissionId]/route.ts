import { requireUser } from "@/server/auth/session";
import { errorResponse, ok, parseJson } from "@/server/http";
import { AssignmentGradeInputSchema, gradeAssignmentSubmission } from "@/server/services/p1";

interface RouteContext {
  params: Promise<{ classroomId: string; assignmentId: string; submissionId: string }>;
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireUser();
    if (user.role !== "TEACHER") {
      throw new Error("FORBIDDEN");
    }
    const { classroomId, submissionId } = await context.params;
    const input = await parseJson(request, AssignmentGradeInputSchema);
    return ok({ submission: gradeAssignmentSubmission(user.id, classroomId, submissionId, input) });
  } catch (error) {
    return errorResponse(error);
  }
}
