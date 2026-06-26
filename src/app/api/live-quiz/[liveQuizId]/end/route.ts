import { requireUser } from "@/server/auth/session";
import { endLiveQuiz } from "@/server/services/teaching";
import { errorResponse, ok } from "@/server/http";

interface RouteContext {
  params: Promise<{ liveQuizId: string }>;
}

export async function POST(_request: Request, context: RouteContext): Promise<Response> {
  try {
    await requireUser();
    const { liveQuizId } = await context.params;
    endLiveQuiz(liveQuizId);
    return ok({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
