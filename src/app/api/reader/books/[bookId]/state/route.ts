import { requireStudent } from "@/server/auth/guards";
import { ReadingStateInputSchema, upsertReadingState } from "@/server/services/reader";
import { errorResponse, ok, parseJson } from "@/server/http";

export async function PUT(request: Request): Promise<Response> {
  try {
    const user = await requireStudent();
    const input = await parseJson(request, ReadingStateInputSchema);
    upsertReadingState(user.id, input);
    return ok({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
