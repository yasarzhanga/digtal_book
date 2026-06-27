import { z } from "zod";
import { ensureBookVersionWritable, ensureVersionNode, requireStudent } from "@/server/auth/guards";
import { createUploadedAsset } from "@/server/services/assets";
import { createRecordingSubmission } from "@/server/services/reader";
import { errorResponse, ok } from "@/server/http";

const RecordingFieldsSchema = z.object({
  bookVersionId: z.string().min(1),
  chapterId: z.string().min(1),
  nodeId: z.string().min(1),
  durationSeconds: z.coerce.number().int().nonnegative()
});

interface RouteContext {
  params: Promise<{ bookId: string }>;
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireStudent();
    const form = await request.formData();
    const input = RecordingFieldsSchema.parse({
      bookVersionId: form.get("bookVersionId"),
      chapterId: form.get("chapterId"),
      nodeId: form.get("nodeId"),
      durationSeconds: form.get("durationSeconds") ?? "0"
    });
    const { bookId } = await context.params;
    ensureBookVersionWritable(user, bookId, input.bookVersionId);
    ensureVersionNode(input.bookVersionId, input.chapterId, input.nodeId);
    const file = form.get("file");
    const asset = file instanceof File && file.size > 0
      ? await createUploadedAsset(file, { kind: "AUDIO", title: "学生录音提交" }, user.id)
      : { id: "asset_narration" };
    createRecordingSubmission(user.id, { ...input, assetId: asset.id });
    return ok({ ok: true, assetId: asset.id });
  } catch (error) {
    return errorResponse(error);
  }
}
