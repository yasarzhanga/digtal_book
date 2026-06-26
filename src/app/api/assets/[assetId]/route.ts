import { deleteUnreferencedAsset, getAssetReferences } from "@/server/services/assets";
import { requireUser } from "@/server/auth/session";
import { errorResponse, ok } from "@/server/http";

interface RouteContext {
  params: Promise<{ assetId: string }>;
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  try {
    await requireUser();
    const { assetId } = await context.params;
    return ok({ references: getAssetReferences(assetId) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext): Promise<Response> {
  try {
    await requireUser();
    const { assetId } = await context.params;
    deleteUnreferencedAsset(assetId);
    return ok({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
