import { ensureLiveQuizTeacher, requireTeacher } from "@/server/auth/guards";
import { endLiveQuiz } from "@/server/services/teaching";
import { errorResponse, ok } from "@/server/http";

interface RouteContext {
  params: Promise<{ liveQuizId: string }>;
}

export async function POST(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireTeacher();
    const { liveQuizId } = await context.params;
    ensureLiveQuizTeacher(liveQuizId, user.id);
    endLiveQuiz(liveQuizId);
    return ok({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
