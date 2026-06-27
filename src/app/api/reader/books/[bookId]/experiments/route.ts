import { ensureBookVersionWritable, ensureVersionNode, requireStudent } from "@/server/auth/guards";
import { ExperimentInputSchema, saveExperiment } from "@/server/services/reader";
import { errorResponse, ok, parseJson } from "@/server/http";

interface RouteContext {
  params: Promise<{ bookId: string }>;
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireStudent();
    const input = await parseJson(request, ExperimentInputSchema);
    const { bookId } = await context.params;
    ensureBookVersionWritable(user, bookId, input.bookVersionId);
    ensureVersionNode(input.bookVersionId, input.chapterId, input.nodeId);
    return ok(saveExperiment(user.id, input));
  } catch (error) {
    return errorResponse(error);
  }
}
