import { requireEditor } from "@/server/auth/guards";
import { listBooks } from "@/server/services/books";
import { errorResponse, ok } from "@/server/http";

export async function GET(): Promise<Response> {
  try {
    await requireEditor();
    return ok({ books: listBooks() });
  } catch (error) {
    return errorResponse(error);
  }
}
