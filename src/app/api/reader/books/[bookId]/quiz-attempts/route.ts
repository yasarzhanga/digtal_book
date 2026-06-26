import { requireUser } from "@/server/auth/session";
import { getReaderSnapshot, QuizAttemptInputSchema, submitQuiz } from "@/server/services/reader";
import { errorResponse, ok, parseJson } from "@/server/http";

interface RouteContext {
  params: Promise<{ bookId: string }>;
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireUser();
    const input = await parseJson(request, QuizAttemptInputSchema);
    const { bookId } = await context.params;
    return ok(submitQuiz(user.id, getReaderSnapshot(bookId), input));
  } catch (error) {
    return errorResponse(error);
  }
}
