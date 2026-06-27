import { requireEditor } from "@/server/auth/guards";
import { FormulaAssistantInputSchema, suggestFormula } from "@/server/services/ai";
import { errorResponse, ok, parseJson } from "@/server/http";

export async function POST(request: Request): Promise<Response> {
  try {
    await requireEditor();
    const input = await parseJson(request, FormulaAssistantInputSchema);
    return ok({ suggestion: await suggestFormula(input) });
  } catch (error) {
    return errorResponse(error);
  }
}
