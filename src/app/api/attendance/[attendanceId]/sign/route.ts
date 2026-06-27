import { ensureAttendanceCodeMatches, ensureAttendanceStudent, requireStudent } from "@/server/auth/guards";
import { AttendanceSignInputSchema, signAttendance } from "@/server/services/teaching";
import { errorResponse, ok, parseJson } from "@/server/http";

interface RouteContext {
  params: Promise<{ attendanceId: string }>;
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireStudent();
    const input = await parseJson(request, AttendanceSignInputSchema);
    const { attendanceId } = await context.params;
    ensureAttendanceStudent(attendanceId, user.id);
    ensureAttendanceCodeMatches(attendanceId, input.code);
    signAttendance(user.id, input);
    return ok({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
