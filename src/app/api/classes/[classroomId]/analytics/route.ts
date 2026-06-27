import { ensureClassroomTeacher, requireTeacher } from "@/server/auth/guards";
import { getClassAnalytics } from "@/server/services/teaching";
import { errorResponse, ok } from "@/server/http";

interface RouteContext {
  params: Promise<{ classroomId: string }>;
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireTeacher();
    const { classroomId } = await context.params;
    ensureClassroomTeacher(classroomId, user.id);
    return ok({ analytics: getClassAnalytics(classroomId) });
  } catch (error) {
    return errorResponse(error);
  }
}
