import { ensureChapterBookOwner, requireEditor } from "@/server/auth/guards";
import { SaveDocumentInputSchema, saveChapterDocument } from "@/server/services/books";
import { errorResponse, ok, parseJson } from "@/server/http";

interface RouteContext {
  params: Promise<{ chapterId: string }>;
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireEditor();
    const input = await parseJson(request, SaveDocumentInputSchema);
    const { chapterId } = await context.params;
    ensureChapterBookOwner(chapterId, user.id);
    return ok(saveChapterDocument(chapterId, input));
  } catch (error) {
    return errorResponse(error);
  }
}
