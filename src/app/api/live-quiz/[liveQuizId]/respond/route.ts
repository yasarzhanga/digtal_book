import { ensureLiveQuizStudent, requireStudent } from "@/server/auth/guards";
import { LiveQuizResponseInputSchema, respondLiveQuiz } from "@/server/services/teaching";
import { errorResponse, ok, parseJson } from "@/server/http";

interface RouteContext {
  params: Promise<{ liveQuizId: string }>;
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireStudent();
    const input = await parseJson(request, LiveQuizResponseInputSchema);
    const { liveQuizId } = await context.params;
    ensureLiveQuizStudent(liveQuizId, user.id);
    return ok(respondLiveQuiz(user.id, liveQuizId, input));
  } catch (error) {
    return errorResponse(error);
  }
}
