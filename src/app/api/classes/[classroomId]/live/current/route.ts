import { requireUser } from "@/server/auth/session";
import { getCurrentLive } from "@/server/services/teaching";
import { errorResponse, ok } from "@/server/http";

interface RouteContext {
  params: Promise<{ classroomId: string }>;
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  try {
    await requireUser();
    const { classroomId } = await context.params;
    return ok(getCurrentLive(classroomId));
  } catch (error) {
    return errorResponse(error);
  }
}
