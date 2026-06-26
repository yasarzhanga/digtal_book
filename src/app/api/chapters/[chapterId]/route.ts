import { requireUser } from "@/server/auth/session";
import { ChapterPatchSchema, patchChapter } from "@/server/services/books";
import { errorResponse, ok, parseJson } from "@/server/http";

interface RouteContext {
  params: Promise<{ chapterId: string }>;
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  try {
    await requireUser();
    const input = await parseJson(request, ChapterPatchSchema);
    const { chapterId } = await context.params;
    patchChapter(chapterId, input);
    return ok({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
