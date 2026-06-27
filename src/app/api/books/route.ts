import { requireEditor } from "@/server/auth/guards";
import { listBooksForOwner } from "@/server/services/books";
import { errorResponse, ok } from "@/server/http";

export async function GET(): Promise<Response> {
  try {
    const user = await requireEditor();
    return ok({ books: listBooksForOwner(user.id) });
  } catch (error) {
    return errorResponse(error);
  }
}
