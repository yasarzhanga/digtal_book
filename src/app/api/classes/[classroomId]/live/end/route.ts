import { requireUser } from "@/server/auth/session";
import { endLiveSession } from "@/server/services/teaching";
import { errorResponse, ok } from "@/server/http";

interface RouteContext {
  params: Promise<{ classroomId: string }>;
}

export async function POST(_request: Request, context: RouteContext): Promise<Response> {
  try {
    await requireUser();
    const { classroomId } = await context.params;
    endLiveSession(classroomId);
    return ok({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
