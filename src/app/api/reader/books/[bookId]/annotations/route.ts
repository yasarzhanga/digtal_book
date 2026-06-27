import { ensureBookReadable, ensureBookVersionWritable, ensureVersionNode, requireStudent } from "@/server/auth/guards";
import { AnnotationInputSchema, createAnnotation, listAnnotations } from "@/server/services/reader";
import { getReaderSnapshot } from "@/server/services/reader";
import { errorResponse, ok, parseJson } from "@/server/http";

interface RouteContext {
  params: Promise<{ bookId: string }>;
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireStudent();
    const { bookId } = await context.params;
    ensureBookReadable(user, bookId);
    const snapshot = getReaderSnapshot(bookId);
    return ok({ annotations: listAnnotations(user.id, snapshot.versionId) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireStudent();
    const input = await parseJson(request, AnnotationInputSchema);
    const { bookId } = await context.params;
    ensureBookVersionWritable(user, bookId, input.bookVersionId);
    ensureVersionNode(input.bookVersionId, input.chapterId, input.nodeId);
    return ok({ annotation: createAnnotation(user.id, input) });
  } catch (error) {
    return errorResponse(error);
  }
}
