import { requireStudent } from "@/server/auth/guards";
import { getReaderSnapshot, getPersonalReport } from "@/server/services/reader";
import { errorResponse, ok } from "@/server/http";

interface RouteContext {
  params: Promise<{ bookId: string }>;
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireStudent();
    const { bookId } = await context.params;
    const snapshot = getReaderSnapshot(bookId);
    return ok({ report: getPersonalReport(user.id, snapshot.versionId) });
  } catch (error) {
    return errorResponse(error);
  }
}
