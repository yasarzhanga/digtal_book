import { DemoLoginInputSchema, demoLogin } from "@/server/services/auth";
import { setSession } from "@/server/auth/session";
import { errorResponse, ok, parseJson } from "@/server/http";

export async function POST(request: Request): Promise<Response> {
  try {
    const input = await parseJson(request, DemoLoginInputSchema);
    const user = demoLogin(input.role);
    await setSession(user);
    return ok({ user });
  } catch (error) {
    return errorResponse(error);
  }
}
