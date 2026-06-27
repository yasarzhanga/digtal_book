import { ensureClassroomTeacher, requireTeacher } from "@/server/auth/guards";
import { startLiveSession } from "@/server/services/teaching";
import { errorResponse, ok } from "@/server/http";

interface RouteContext {
  params: Promise<{ classroomId: string }>;
}

export async function POST(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireTeacher();
    const { classroomId } = await context.params;
    ensureClassroomTeacher(classroomId, user.id);
    return ok({ live: startLiveSession(classroomId) });
  } catch (error) {
    return errorResponse(error);
  }
}
