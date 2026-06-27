import { ensureClassroomTeacher, requireTeacher } from "@/server/auth/guards";
import { LiveQuizStartInputSchema, startLiveQuiz } from "@/server/services/teaching";
import { errorResponse, ok, parseJson } from "@/server/http";

interface RouteContext {
  params: Promise<{ classroomId: string }>;
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireTeacher();
    const input = await parseJson(request, LiveQuizStartInputSchema);
    const { classroomId } = await context.params;
    ensureClassroomTeacher(classroomId, user.id);
    return ok({ quiz: startLiveQuiz(classroomId, input) });
  } catch (error) {
    return errorResponse(error);
  }
}
