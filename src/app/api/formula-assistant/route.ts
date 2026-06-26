import { requireUser } from "@/server/auth/session";
import { FormulaAssistantInputSchema, suggestFormula } from "@/server/services/ai";
import { errorResponse, ok, parseJson } from "@/server/http";

export async function POST(request: Request): Promise<Response> {
  try {
    await requireUser();
    const input = await parseJson(request, FormulaAssistantInputSchema);
    return ok({ suggestion: await suggestFormula(input) });
  } catch (error) {
    return errorResponse(error);
  }
}
