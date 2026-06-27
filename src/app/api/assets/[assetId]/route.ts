import { deleteUnreferencedAsset, getVisibleAssetReferences } from "@/server/services/assets";
import { ensureAssetOwner, requireRole } from "@/server/auth/guards";
import { errorResponse, ok } from "@/server/http";

interface RouteContext {
  params: Promise<{ assetId: string }>;
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireRole(["EDITOR", "TEACHER"]);
    const { assetId } = await context.params;
    return ok({ references: getVisibleAssetReferences(assetId, user) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireRole(["EDITOR", "TEACHER"]);
    const { assetId } = await context.params;
    ensureAssetOwner(assetId, user.id);
    deleteUnreferencedAsset(assetId);
    return ok({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
