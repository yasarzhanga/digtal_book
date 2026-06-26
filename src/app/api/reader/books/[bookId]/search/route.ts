import { requireUser } from "@/server/auth/session";
import { searchBook } from "@/server/services/reader";
import { errorResponse, ok } from "@/server/http";

interface RouteContext {
  params: Promise<{ bookId: string }>;
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  try {
    await requireUser();
    const { bookId } = await context.params;
    const query = new URL(request.url).searchParams.get("q") ?? "";
    return ok({ results: searchBook(bookId, query) });
  } catch (error) {
    return errorResponse(error);
  }
}
