import { z } from "zod";
import { ensureBookOwner, requireEditor } from "@/server/auth/guards";
import { reorderChapters } from "@/server/services/books";
import { errorResponse, ok, parseJson } from "@/server/http";

const ReorderSchema = z.object({ chapterIds: z.array(z.string().min(1)) });

interface RouteContext {
  params: Promise<{ bookId: string }>;
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireEditor();
    const input = await parseJson(request, ReorderSchema);
    const { bookId } = await context.params;
    ensureBookOwner(bookId, user.id);
    reorderChapters(bookId, input.chapterIds);
    return ok({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
