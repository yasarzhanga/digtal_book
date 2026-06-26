import { requireUser } from "@/server/auth/session";
import { getLiveQuizResults } from "@/server/services/teaching";
import { errorResponse, ok } from "@/server/http";

interface RouteContext {
  params: Promise<{ liveQuizId: string }>;
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  try {
    await requireUser();
    const { liveQuizId } = await context.params;
    return ok({ results: getLiveQuizResults(liveQuizId) });
  } catch (error) {
    return errorResponse(error);
  }
}
