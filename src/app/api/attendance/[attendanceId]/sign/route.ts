import { requireUser } from "@/server/auth/session";
import { AttendanceSignInputSchema, signAttendance } from "@/server/services/teaching";
import { errorResponse, ok, parseJson } from "@/server/http";

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireUser();
    const input = await parseJson(request, AttendanceSignInputSchema);
    signAttendance(user.id, input);
    return ok({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
