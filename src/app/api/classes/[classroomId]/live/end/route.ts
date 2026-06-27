import { ensureClassroomTeacher, requireTeacher } from "@/server/auth/guards";
import { endLiveSession } from "@/server/services/teaching";
import { errorResponse, ok } from "@/server/http";

interface RouteContext {
  params: Promise<{ classroomId: string }>;
}

export async function POST(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireTeacher();
    const { classroomId } = await context.params;
    ensureClassroomTeacher(classroomId, user.id);
    endLiveSession(classroomId);
    return ok({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
