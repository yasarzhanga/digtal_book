import { requireUser } from "@/server/auth/session";
import { LiveQuizResponseInputSchema, respondLiveQuiz } from "@/server/services/teaching";
import { errorResponse, ok, parseJson } from "@/server/http";

interface RouteContext {
  params: Promise<{ liveQuizId: string }>;
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireUser();
    const input = await parseJson(request, LiveQuizResponseInputSchema);
    const { liveQuizId } = await context.params;
    return ok(respondLiveQuiz(user.id, liveQuizId, input));
  } catch (error) {
    return errorResponse(error);
  }
}
