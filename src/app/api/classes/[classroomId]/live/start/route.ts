import { requireUser } from "@/server/auth/session";
import { startLiveSession } from "@/server/services/teaching";
import { errorResponse, ok } from "@/server/http";

interface RouteContext {
  params: Promise<{ classroomId: string }>;
}

export async function POST(_request: Request, context: RouteContext): Promise<Response> {
  try {
    await requireUser();
    const { classroomId } = await context.params;
    return ok({ live: startLiveSession(classroomId) });
  } catch (error) {
    return errorResponse(error);
  }
}
