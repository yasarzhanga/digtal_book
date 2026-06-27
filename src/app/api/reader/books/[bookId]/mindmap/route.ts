import { ensureBookReadable, requireStudent } from "@/server/auth/guards";
import { errorResponse, ok, parseJson } from "@/server/http";
import { buildNotesMindMap, MindMapSchema, saveNotesMindMap } from "@/server/services/p1";

interface RouteContext {
  params: Promise<{ bookId: string }>;
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireStudent();
    const { bookId } = await context.params;
    ensureBookReadable(user, bookId);
    return ok({ mindMap: buildNotesMindMap(user.id, bookId) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireStudent();
    const { bookId } = await context.params;
    ensureBookReadable(user, bookId);
    const input = await parseJson(request, MindMapSchema);
    return ok({ mindMap: saveNotesMindMap(user.id, bookId, input) });
  } catch (error) {
    return errorResponse(error);
  }
}
