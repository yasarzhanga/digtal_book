import { requireUser } from "@/server/auth/session";
import { errorResponse, ok } from "@/server/http";
import { importQuestionBankWorkbook, listAssignmentsForTeacher, listQuestionBank } from "@/server/services/p1";

interface RouteContext {
  params: Promise<{ classroomId: string }>;
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireUser();
    if (user.role !== "TEACHER") {
      throw new Error("FORBIDDEN");
    }
    const { classroomId } = await context.params;
    listAssignmentsForTeacher(classroomId, user.id);
    return ok({ items: listQuestionBank(user.id) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireUser();
    if (user.role !== "TEACHER") {
      throw new Error("FORBIDDEN");
    }
    const { classroomId } = await context.params;
    listAssignmentsForTeacher(classroomId, user.id);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new Error("FILE_REQUIRED");
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await importQuestionBankWorkbook(user.id, file.name, buffer);
    return ok(result);
  } catch (error) {
    return errorResponse(error);
  }
}
