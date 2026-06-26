import { requireUser } from "@/server/auth/session";
import { AttendanceStartInputSchema, getAttendanceRows, getCurrentLive, startAttendance } from "@/server/services/teaching";
import { errorResponse, ok, parseJson } from "@/server/http";

interface RouteContext {
  params: Promise<{ classroomId: string }>;
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  try {
    await requireUser();
    const { classroomId } = await context.params;
    const attendance = getCurrentLive(classroomId).attendance;
    return ok({ attendance, records: attendance ? getAttendanceRows(attendance.id) : [] });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    await requireUser();
    const { classroomId } = await context.params;
    const input = request.headers.get("content-type")?.includes("application/json")
      ? await parseJson(request, AttendanceStartInputSchema)
      : {};
    const attendance = startAttendance(classroomId, input);
    return ok({ attendance, records: getAttendanceRows(attendance.id) });
  } catch (error) {
    return errorResponse(error);
  }
}
