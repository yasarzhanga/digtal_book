import { PublishInputSchema, publishBook } from "@/server/services/books";
import { requireUser } from "@/server/auth/session";
import { errorResponse, ok, parseJson } from "@/server/http";

interface RouteContext {
  params: Promise<{ bookId: string }>;
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    await requireUser();
    const input = await parseJson(request, PublishInputSchema);
    const { bookId } = await context.params;
    return ok({ snapshot: publishBook(bookId, input.note) });
  } catch (error) {
    return errorResponse(error);
  }
}
