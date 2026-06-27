import { ensureChapterBookOwner, requireEditor } from "@/server/auth/guards";
import { ChapterPatchSchema, patchChapter } from "@/server/services/books";
import { errorResponse, ok, parseJson } from "@/server/http";

interface RouteContext {
  params: Promise<{ chapterId: string }>;
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireEditor();
    const input = await parseJson(request, ChapterPatchSchema);
    const { chapterId } = await context.params;
    ensureChapterBookOwner(chapterId, user.id);
    patchChapter(chapterId, input);
    return ok({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
