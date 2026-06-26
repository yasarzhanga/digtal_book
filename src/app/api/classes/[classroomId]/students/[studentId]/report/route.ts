import { requireUser } from "@/server/auth/session";
import { getStudentReport } from "@/server/services/teaching";
import { errorResponse, ok } from "@/server/http";

interface RouteContext {
  params: Promise<{ classroomId: string; studentId: string }>;
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  try {
    await requireUser();
    const { classroomId, studentId } = await context.params;
    return ok({ report: getStudentReport(classroomId, studentId) });
  } catch (error) {
    return errorResponse(error);
  }
}
