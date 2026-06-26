import { LoginInputSchema, login } from "@/server/services/auth";
import { setSession } from "@/server/auth/session";
import { errorResponse, ok, parseJson } from "@/server/http";

export async function POST(request: Request): Promise<Response> {
  try {
    const input = await parseJson(request, LoginInputSchema);
    const user = login(input.email, input.password);
    await setSession(user);
    return ok({ user });
  } catch (error) {
    return errorResponse(error);
  }
}
