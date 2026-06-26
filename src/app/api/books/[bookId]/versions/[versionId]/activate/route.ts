import { activateVersion } from "@/server/services/books";
import { requireUser } from "@/server/auth/session";
import { errorResponse, ok } from "@/server/http";

interface RouteContext {
  params: Promise<{ bookId: string; versionId: string }>;
}

export async function POST(_request: Request, context: RouteContext): Promise<Response> {
  try {
    await requireUser();
    const { bookId, versionId } = await context.params;
    activateVersion(bookId, versionId);
    return ok({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
