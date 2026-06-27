import { ensureBookVersionWritable, ensureVersionNode, requireStudent } from "@/server/auth/guards";
import { ReadingStateInputSchema, upsertReadingState } from "@/server/services/reader";
import { errorResponse, ok, parseJson } from "@/server/http";

interface RouteContext {
  params: Promise<{ bookId: string }>;
}

export async function PUT(request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireStudent();
    const input = await parseJson(request, ReadingStateInputSchema);
    const { bookId } = await context.params;
    ensureBookVersionWritable(user, bookId, input.bookVersionId);
    ensureVersionNode(input.bookVersionId, input.lastChapterId, input.lastNodeId);
    upsertReadingState(user.id, input);
    return ok({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
