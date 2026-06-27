import { ensureLiveQuizTeacher, requireTeacher } from "@/server/auth/guards";
import { getLiveQuizResults } from "@/server/services/teaching";
import { errorResponse, ok } from "@/server/http";

interface RouteContext {
  params: Promise<{ liveQuizId: string }>;
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireTeacher();
    const { liveQuizId } = await context.params;
    ensureLiveQuizTeacher(liveQuizId, user.id);
    return ok({ results: getLiveQuizResults(liveQuizId) });
  } catch (error) {
    return errorResponse(error);
  }
}
