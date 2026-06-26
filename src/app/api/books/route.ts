import { requireUser } from "@/server/auth/session";
import { listBooks } from "@/server/services/books";
import { errorResponse, ok } from "@/server/http";

export async function GET(): Promise<Response> {
  try {
    await requireUser();
    return ok({ books: listBooks() });
  } catch (error) {
    return errorResponse(error);
  }
}
