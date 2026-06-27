import { PublishInputSchema, publishBook } from "@/server/services/books";
import { ensureBookOwner, requireEditor } from "@/server/auth/guards";
import { errorResponse, ok, parseJson } from "@/server/http";

interface RouteContext {
  params: Promise<{ bookId: string }>;
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireEditor();
    const input = await parseJson(request, PublishInputSchema);
    const { bookId } = await context.params;
    ensureBookOwner(bookId, user.id);
    return ok({ snapshot: publishBook(bookId, input.note) });
  } catch (error) {
    return errorResponse(error);
  }
}
