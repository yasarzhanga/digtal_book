import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { reorderChapters } from "@/server/services/books";
import { errorResponse, ok, parseJson } from "@/server/http";

const ReorderSchema = z.object({ chapterIds: z.array(z.string().min(1)) });

interface RouteContext {
  params: Promise<{ bookId: string }>;
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    await requireUser();
    const input = await parseJson(request, ReorderSchema);
    const { bookId } = await context.params;
    reorderChapters(bookId, input.chapterIds);
    return ok({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
