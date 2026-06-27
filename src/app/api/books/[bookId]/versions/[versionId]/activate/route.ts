import { activateVersion } from "@/server/services/books";
import { ensureBookOwner, requireEditor } from "@/server/auth/guards";
import { errorResponse, ok } from "@/server/http";

interface RouteContext {
  params: Promise<{ bookId: string; versionId: string }>;
}

export async function POST(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireEditor();
    const { bookId, versionId } = await context.params;
    ensureBookOwner(bookId, user.id);
    activateVersion(bookId, versionId);
    return ok({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
