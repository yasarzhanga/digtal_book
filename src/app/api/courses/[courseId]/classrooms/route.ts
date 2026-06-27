import { requireTeacher } from "@/server/auth/guards";
import { ClassroomCreateInputSchema, createClassroomForCourse } from "@/server/services/teaching";
import { errorResponse, ok, parseJson } from "@/server/http";

interface RouteContext {
  params: Promise<{ courseId: string }>;
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireTeacher();
    const { courseId } = await context.params;
    const input = await parseJson(request, ClassroomCreateInputSchema);
    return ok({ classroom: createClassroomForCourse(user.id, courseId, input) });
  } catch (error) {
    return errorResponse(error);
  }
}
