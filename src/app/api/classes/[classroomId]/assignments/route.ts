import { ensureClassroomTeacher, ensureStudentEnrolled, requireRole, requireTeacher } from "@/server/auth/guards";
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
    const user = await requireRole(["TEACHER", "STUDENT"]);
    const { classroomId } = await context.params;
    if (user.role === "TEACHER") {
      ensureClassroomTeacher(classroomId, user.id);
    } else {
      ensureStudentEnrolled(classroomId, user.id);
    }
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
    const user = await requireTeacher();
    const { classroomId } = await context.params;
    ensureClassroomTeacher(classroomId, user.id);
    const input = await parseJson(request, AssignmentCreateInputSchema);
    return ok({ assignment: createAssignment(user.id, classroomId, input) });
  } catch (error) {
    return errorResponse(error);
  }
}
