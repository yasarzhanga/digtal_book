import { AssetUploadInputSchema, createUploadedAsset, listReadableAssets } from "@/server/services/assets";
import { requireRole } from "@/server/auth/guards";
import { errorResponse, ok } from "@/server/http";

export async function GET(): Promise<Response> {
  try {
    const user = await requireRole(["EDITOR", "TEACHER"]);
    return ok({ assets: listReadableAssets(user) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireRole(["EDITOR", "TEACHER"]);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new Error("FILE_REQUIRED");
    }
    const input = AssetUploadInputSchema.parse({
      title: String(form.get("title") ?? file.name),
      kind: String(form.get("kind") ?? "IMAGE")
    });
    const asset = await createUploadedAsset(file, input, user.id);
    return ok({ asset });
  } catch (error) {
    return errorResponse(error);
  }
}
