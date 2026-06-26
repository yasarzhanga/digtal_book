import { getCurrentUser } from "@/server/auth/session";
import { ok } from "@/server/http";

export async function GET(): Promise<Response> {
  return ok({ user: await getCurrentUser() });
}
