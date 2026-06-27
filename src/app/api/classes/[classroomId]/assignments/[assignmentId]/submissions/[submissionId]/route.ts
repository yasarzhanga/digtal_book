import { ensureClassroomTeacher, requireTeacher } from "@/server/auth/guards";
import { errorResponse, ok, parseJson } from "@/server/http";
import { AssignmentGradeInputSchema, gradeAssignmentSubmission } from "@/server/services/p1";

interface RouteContext {
  params: Promise<{ classroomId: string; assignmentId: string; submissionId: string }>;
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireTeacher();
    const { classroomId, submissionId } = await context.params;
    ensureClassroomTeacher(classroomId, user.id);
    const input = await parseJson(request, AssignmentGradeInputSchema);
    return ok({ submission: gradeAssignmentSubmission(user.id, classroomId, submissionId, input) });
  } catch (error) {
    return errorResponse(error);
  }
}
