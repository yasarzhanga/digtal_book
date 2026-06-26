import { ActivityBatchSchema } from "@/content-engine/tracking/events";
import { requireUser } from "@/server/auth/session";
import { recordEvents } from "@/server/services/events";
import { errorResponse, ok, parseJson } from "@/server/http";

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireUser();
    const input = await parseJson(request, ActivityBatchSchema);
    recordEvents(user.id, input.events);
    return ok({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
