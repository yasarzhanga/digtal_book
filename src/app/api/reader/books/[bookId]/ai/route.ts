import { requireUser } from "@/server/auth/session";
import { errorResponse, ok, parseJson } from "@/server/http";
import { AiQuestionInputSchema, askAiQuestion, isAiProviderConfigured, listAiConversations, type AiAskResult } from "@/server/services/ai";
import { getReaderSnapshot } from "@/server/services/reader";

interface RouteContext {
  params: Promise<{ bookId: string }>;
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireUser();
    const { bookId } = await context.params;
    const snapshot = getReaderSnapshot(bookId);
    return ok({
      providerConfigured: isAiProviderConfigured(),
      conversations: listAiConversations(user.id, snapshot.versionId)
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireUser();
    const { bookId } = await context.params;
    const input = await parseJson(request, AiQuestionInputSchema);
    const result = await askAiQuestion(user.id, bookId, input);
    const url = new URL(request.url);
    if (url.searchParams.get("stream") === "1") {
      return streamAiResult(result);
    }
    return ok(result);
  } catch (error) {
    return errorResponse(error);
  }
}

function streamAiResult(result: AiAskResult): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(sse("status", { message: result.providerMessage, providerStatus: result.providerStatus })));
      for (const chunk of chunkText(result.answer.content, 18)) {
        controller.enqueue(encoder.encode(sse("delta", { content: chunk })));
      }
      controller.enqueue(encoder.encode(sse("done", result)));
      controller.close();
    }
  });
  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no"
    }
  });
}

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function chunkText(text: string, size: number): string[] {
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += size) {
    chunks.push(text.slice(index, index + size));
  }
  return chunks.length ? chunks : [""];
}
