import { requireUser } from "@/server/auth/session";
import { ExperimentInputSchema, saveExperiment } from "@/server/services/reader";
import { errorResponse, ok, parseJson } from "@/server/http";

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireUser();
    const input = await parseJson(request, ExperimentInputSchema);
    return ok(saveExperiment(user.id, input));
  } catch (error) {
    return errorResponse(error);
  }
}
