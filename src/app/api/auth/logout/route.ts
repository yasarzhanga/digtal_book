import { clearSession } from "@/server/auth/session";
import { ok } from "@/server/http";

export async function POST(): Promise<Response> {
  await clearSession();
  return ok({ ok: true });
}
