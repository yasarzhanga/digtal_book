import { requireUser } from "@/server/auth/session";
import { errorResponse, ok, parseJson } from "@/server/http";
import {
  AssignmentCreateInputSchema,
  createAssignment,
  listAssignmentsForStudent,
  listAssignmentsForTeacher
} from "@/server/services/p1";

interface RouteContext {
  params: Promise<{ classroomId: string }>;
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireUser();
    const { classroomId } = await context.params;
    const assignments = user.role === "STUDENT"
      ? listAssignmentsForStudent(classroomId, user.id)
      : listAssignmentsForTeacher(classroomId, user.id);
    return ok({ assignments });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireUser();
    if (user.role !== "TEACHER") {
      throw new Error("FORBIDDEN");
    }
    const { classroomId } = await context.params;
    const input = await parseJson(request, AssignmentCreateInputSchema);
    return ok({ assignment: createAssignment(user.id, classroomId, input) });
  } catch (error) {
    return errorResponse(error);
  }
}
