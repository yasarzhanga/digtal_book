import { ensureClassroomTeacher, ensureStudentEnrolled, requireRole, requireTeacher } from "@/server/auth/guards";
import { ClassroomUpdateInputSchema, deleteClassroom, getClassroom, updateClassroom } from "@/server/services/teaching";
import { errorResponse, ok, parseJson } from "@/server/http";

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
    return ok({ classroom: getClassroom(classroomId) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireTeacher();
    const { classroomId } = await context.params;
    const input = await parseJson(request, ClassroomUpdateInputSchema);
    updateClassroom(user.id, classroomId, input);
    return ok({ classroom: getClassroom(classroomId) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireTeacher();
    const { classroomId } = await context.params;
    deleteClassroom(user.id, classroomId);
    return ok({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
