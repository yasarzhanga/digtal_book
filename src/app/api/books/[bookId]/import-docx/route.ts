import { z } from "zod";
import { importDocxFixture, importDocxUpload } from "@/server/services/books";
import { requireUser } from "@/server/auth/session";
import { errorResponse, ok, parseJson } from "@/server/http";

const ImportSchema = z.object({ confirm: z.boolean().default(false) });
const FormImportSchema = z.object({
  confirm: z.boolean().default(false),
  file: z.instanceof(File)
});

interface RouteContext {
  params: Promise<{ bookId: string }>;
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    await requireUser();
    const { bookId } = await context.params;
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const input = await parseImportForm(request);
      const buffer = Buffer.from(await input.file.arrayBuffer());
      return ok(await importDocxUpload(bookId, { fileName: input.file.name, buffer, confirm: input.confirm }));
    }
    const input = await parseJson(request, ImportSchema);
    return ok(await importDocxFixture(bookId, input.confirm));
  } catch (error) {
    return errorResponse(error);
  }
}

async function parseImportForm(request: Request): Promise<z.infer<typeof FormImportSchema>> {
  const formData = await request.formData();
  const file = formData.get("file");
  const confirmValue = formData.get("confirm");
  const confirm = confirmValue === "true" || confirmValue === "1" || confirmValue === "on";
  return FormImportSchema.parse({ file, confirm });
}
