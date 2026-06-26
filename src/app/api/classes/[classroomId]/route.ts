import { requireUser } from "@/server/auth/session";
import { ClassroomUpdateInputSchema, deleteClassroom, getClassroom, updateClassroom } from "@/server/services/teaching";
import { errorResponse, ok, parseJson } from "@/server/http";

interface RouteContext {
  params: Promise<{ classroomId: string }>;
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  try {
    await requireUser();
    const { classroomId } = await context.params;
    return ok({ classroom: getClassroom(classroomId) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireUser();
    if (user.role !== "TEACHER") {
      throw new Error("FORBIDDEN");
    }
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
    const user = await requireUser();
    if (user.role !== "TEACHER") {
      throw new Error("FORBIDDEN");
    }
    const { classroomId } = await context.params;
    deleteClassroom(user.id, classroomId);
    return ok({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
