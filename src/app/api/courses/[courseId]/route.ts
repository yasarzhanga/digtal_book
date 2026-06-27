import { requireTeacher } from "@/server/auth/guards";
import { CourseUpdateInputSchema, deleteCourse, updateCourse } from "@/server/services/teaching";
import { errorResponse, ok, parseJson } from "@/server/http";

interface RouteContext {
  params: Promise<{ courseId: string }>;
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireTeacher();
    const { courseId } = await context.params;
    const input = await parseJson(request, CourseUpdateInputSchema);
    updateCourse(user.id, courseId, input);
    return ok({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireTeacher();
    const { courseId } = await context.params;
    deleteCourse(user.id, courseId);
    return ok({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
