import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { joinClassroom } from "@/server/services/teaching";
import { errorResponse, ok, parseJson } from "@/server/http";

const JoinSchema = z.object({ joinCode: z.string().min(1) });

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireUser();
    const input = await parseJson(request, JoinSchema);
    return ok({ classroomId: joinClassroom(user.id, input.joinCode) });
  } catch (error) {
    return errorResponse(error);
  }
}
