import { requireUser } from "@/server/auth/session";
import { errorResponse, ok, parseJson } from "@/server/http";
import { AssignmentSubmitInputSchema, submitAssignment } from "@/server/services/p1";

interface RouteContext {
  params: Promise<{ assignmentId: string }>;
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireUser();
    if (user.role !== "STUDENT") {
      throw new Error("FORBIDDEN");
    }
    const { assignmentId } = await context.params;
    const input = await parseJson(request, AssignmentSubmitInputSchema);
    return ok({ submission: submitAssignment(user.id, assignmentId, input) });
  } catch (error) {
    return errorResponse(error);
  }
}
