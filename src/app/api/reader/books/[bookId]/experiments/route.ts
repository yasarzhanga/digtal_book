import { requireStudent } from "@/server/auth/guards";
import { ExperimentInputSchema, saveExperiment } from "@/server/services/reader";
import { errorResponse, ok, parseJson } from "@/server/http";

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireStudent();
    const input = await parseJson(request, ExperimentInputSchema);
    return ok(saveExperiment(user.id, input));
  } catch (error) {
    return errorResponse(error);
  }
}
