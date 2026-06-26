import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { deleteAnnotation, updateAnnotation } from "@/server/services/reader";
import { errorResponse, ok, parseJson } from "@/server/http";

const PatchSchema = z.object({ note: z.string() });

interface RouteContext {
  params: Promise<{ annotationId: string }>;
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireUser();
    const input = await parseJson(request, PatchSchema);
    const { annotationId } = await context.params;
    updateAnnotation(user.id, annotationId, input.note);
    return ok({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireUser();
    const { annotationId } = await context.params;
    deleteAnnotation(user.id, annotationId);
    return ok({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
