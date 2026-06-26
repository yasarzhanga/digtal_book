import { requireUser } from "@/server/auth/session";
import { LiveLocationInputSchema, setLiveLocation } from "@/server/services/teaching";
import { errorResponse, ok, parseJson } from "@/server/http";

interface RouteContext {
  params: Promise<{ classroomId: string }>;
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  try {
    await requireUser();
    const input = await parseJson(request, LiveLocationInputSchema);
    const { classroomId } = await context.params;
    return ok({ live: setLiveLocation(classroomId, input) });
  } catch (error) {
    return errorResponse(error);
  }
}
