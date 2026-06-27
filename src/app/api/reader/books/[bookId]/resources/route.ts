import { requireUser } from "@/server/auth/session";
import { ensureBookReadable } from "@/server/auth/guards";
import { aggregateResources } from "@/server/services/reader";
import { errorResponse, ok } from "@/server/http";

interface RouteContext {
  params: Promise<{ bookId: string }>;
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireUser();
    const { bookId } = await context.params;
    ensureBookReadable(user, bookId);
    return ok({ resources: aggregateResources(bookId) });
  } catch (error) {
    return errorResponse(error);
  }
}
