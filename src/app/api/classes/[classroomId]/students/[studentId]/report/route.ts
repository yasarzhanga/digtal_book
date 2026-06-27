import { ensureClassroomTeacher, requireTeacher } from "@/server/auth/guards";
import { getStudentReport } from "@/server/services/teaching";
import { errorResponse, ok } from "@/server/http";

interface RouteContext {
  params: Promise<{ classroomId: string; studentId: string }>;
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireTeacher();
    const { classroomId, studentId } = await context.params;
    ensureClassroomTeacher(classroomId, user.id);
    return ok({ report: getStudentReport(classroomId, studentId) });
  } catch (error) {
    return errorResponse(error);
  }
}
