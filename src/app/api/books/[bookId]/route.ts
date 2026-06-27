import { ensureBookOwner, requireEditor } from "@/server/auth/guards";
import { getEditorBook } from "@/server/services/books";
import { errorResponse, ok } from "@/server/http";

interface RouteContext {
  params: Promise<{ bookId: string }>;
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireEditor();
    const { bookId } = await context.params;
    ensureBookOwner(bookId, user.id);
    return ok({ book: getEditorBook(bookId) });
  } catch (error) {
    return errorResponse(error);
  }
}
