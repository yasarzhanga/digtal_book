import { requireStudent } from "@/server/auth/guards";
import { errorResponse, ok, parseJson } from "@/server/http";
import { getReaderSnapshot } from "@/server/services/reader";
import {
  getSimulationTemplates,
  listSimulationTemplateRuns,
  runAndSaveSimulationTemplate,
  SimulationTemplateRunInputSchema
} from "@/server/services/p1";

interface RouteContext {
  params: Promise<{ bookId: string }>;
}

export async function GET(_request: Request, _context: RouteContext): Promise<Response> {
  try {
    const user = await requireStudent();
    return ok({ templates: getSimulationTemplates(), runs: listSimulationTemplateRuns(user.id) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireStudent();
    const { bookId } = await context.params;
    const snapshot = getReaderSnapshot(bookId);
    const raw = await parseJson(request, SimulationTemplateRunInputSchema.partial({ bookVersionId: true }));
    const input = SimulationTemplateRunInputSchema.parse({ ...raw, bookVersionId: raw.bookVersionId ?? snapshot.versionId });
    return ok({ run: runAndSaveSimulationTemplate(user.id, input) });
  } catch (error) {
    return errorResponse(error);
  }
}
