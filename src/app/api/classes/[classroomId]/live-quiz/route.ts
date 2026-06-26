import { requireUser } from "@/server/auth/session";
import { LiveQuizStartInputSchema, startLiveQuiz } from "@/server/services/teaching";
import { errorResponse, ok, parseJson } from "@/server/http";

interface RouteContext {
  params: Promise<{ classroomId: string }>;
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    await requireUser();
    const input = await parseJson(request, LiveQuizStartInputSchema);
    const { classroomId } = await context.params;
    return ok({ quiz: startLiveQuiz(classroomId, input) });
  } catch (error) {
    return errorResponse(error);
  }
}
