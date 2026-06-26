import { requireUser } from "@/server/auth/session";
import { errorResponse, ok } from "@/server/http";
import { getFormulaTemplates } from "@/server/services/p1";

export async function GET(): Promise<Response> {
  try {
    await requireUser();
    return ok({ templates: getFormulaTemplates() });
  } catch (error) {
    return errorResponse(error);
  }
}
