import { z } from "zod";
import { requireStudent } from "@/server/auth/guards";
import { joinClassroom } from "@/server/services/teaching";
import { errorResponse, ok, parseJson } from "@/server/http";

const JoinSchema = z.object({ joinCode: z.string().min(1) });

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireStudent();
    const input = await parseJson(request, JoinSchema);
    return ok({ classroomId: joinClassroom(user.id, input.joinCode) });
  } catch (error) {
    return errorResponse(error);
  }
}
