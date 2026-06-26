import { requireUser } from "@/server/auth/session";
import { getReaderSnapshot } from "@/server/services/reader";
import { errorResponse, ok } from "@/server/http";

interface RouteContext {
  params: Promise<{ bookId: string }>;
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  try {
    await requireUser();
    const { bookId } = await context.params;
    return ok({ snapshot: getReaderSnapshot(bookId) });
  } catch (error) {
    return errorResponse(error);
  }
}
