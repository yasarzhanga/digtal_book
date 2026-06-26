import { requireUser } from "@/server/auth/session";
import { aggregateResources } from "@/server/services/reader";
import { errorResponse, ok } from "@/server/http";

interface RouteContext {
  params: Promise<{ bookId: string }>;
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  try {
    await requireUser();
    const { bookId } = await context.params;
    return ok({ resources: aggregateResources(bookId) });
  } catch (error) {
    return errorResponse(error);
  }
}
