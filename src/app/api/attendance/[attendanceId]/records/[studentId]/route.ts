import { z } from "zod";
import { ensureAttendanceTeacher, requireTeacher } from "@/server/auth/guards";
import { updateAttendanceRecord } from "@/server/services/teaching";
import { errorResponse, ok, parseJson } from "@/server/http";

const StatusSchema = z.object({ status: z.enum(["PRESENT", "LEAVE", "ABSENT"]) });

interface RouteContext {
  params: Promise<{ attendanceId: string; studentId: string }>;
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireTeacher();
    const input = await parseJson(request, StatusSchema);
    const { attendanceId, studentId } = await context.params;
    ensureAttendanceTeacher(attendanceId, user.id);
    updateAttendanceRecord(attendanceId, studentId, input.status);
    return ok({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
