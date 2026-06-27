import fs from "node:fs";
import { requireUser } from "@/server/auth/session";
import { ensureAssetReadable, getAssetFile } from "@/server/services/assets";
import { errorResponse } from "@/server/http";

interface RouteContext {
  params: Promise<{ assetId: string }>;
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireUser();
    const { assetId } = await context.params;
    ensureAssetReadable(assetId, user);
    const file = getAssetFile(assetId);
    const buffer = fs.readFileSync(file.absolutePath);
    const range = request.headers.get("range");
    if (range) {
      const match = /bytes=(\d+)-(\d*)/.exec(range);
      if (match) {
        const start = Number(match[1]);
        const end = match[2] ? Number(match[2]) : buffer.length - 1;
        const chunk = buffer.subarray(start, end + 1);
        return new Response(chunk, {
          status: 206,
          headers: {
            "Content-Type": file.mimeType,
            "Accept-Ranges": "bytes",
            "Content-Length": String(chunk.length),
            "Content-Range": `bytes ${start}-${end}/${buffer.length}`,
            "Content-Disposition": `inline; filename="${encodeURIComponent(file.originalName)}"`
          }
        });
      }
    }
    return new Response(buffer, {
      headers: {
        "Content-Type": file.mimeType,
        "Accept-Ranges": "bytes",
        "Content-Length": String(file.size),
        "Content-Disposition": `inline; filename="${encodeURIComponent(file.originalName)}"`
      }
    });
  } catch (error) {
    return errorResponse(error);
  }
}
