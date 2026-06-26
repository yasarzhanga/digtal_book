import { requireUser } from "@/server/auth/session";
import { errorResponse, ok } from "@/server/http";
import { getAssetPreview } from "@/server/services/previews";

interface RouteContext {
  params: Promise<{ assetId: string }>;
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  try {
    await requireUser();
    const { assetId } = await context.params;
    return ok({ preview: await getAssetPreview(assetId) });
  } catch (error) {
    return errorResponse(error);
  }
}
