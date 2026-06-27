import { requireUser } from "@/server/auth/session";
import { errorResponse, ok } from "@/server/http";
import { ensureAssetReadable } from "@/server/services/assets";
import { getAssetPreview } from "@/server/services/previews";

interface RouteContext {
  params: Promise<{ assetId: string }>;
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireUser();
    const { assetId } = await context.params;
    ensureAssetReadable(assetId, user);
    return ok({ preview: await getAssetPreview(assetId) });
  } catch (error) {
    return errorResponse(error);
  }
}
