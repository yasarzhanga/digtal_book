import { getVersions } from "@/server/services/books";
import { ensureBookOwner, requireEditor } from "@/server/auth/guards";
import { errorResponse, ok } from "@/server/http";

interface RouteContext {
  params: Promise<{ bookId: string }>;
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireEditor();
    const { bookId } = await context.params;
    ensureBookOwner(bookId, user.id);
    return ok({ versions: getVersions(bookId) });
  } catch (error) {
    return errorResponse(error);
  }
}
