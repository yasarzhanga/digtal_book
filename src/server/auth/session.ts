import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import { getUserById, type PublicUser } from "@/server/services/auth";

const SessionPayloadSchema = z.object({
  sub: z.string().min(1),
  role: z.string().min(1)
});

const cookieName = "dt_session";

function secret(): Uint8Array {
  return new TextEncoder().encode(process.env.SESSION_SECRET ?? "digital-textbook-local-demo-secret");
}

export async function createSessionCookie(user: PublicUser): Promise<string> {
  return new SignJWT({ role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret());
}

export async function setSession(user: PublicUser): Promise<void> {
  const token = await createSessionCookie(user);
  const store = await cookies();
  store.set(cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.ENFORCE_HTTPS === "true" || process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7
  });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(cookieName);
}

export async function getCurrentUser(): Promise<PublicUser | null> {
  const store = await cookies();
  const token = store.get(cookieName)?.value;
  if (!token) {
    return null;
  }
  try {
    const verified = await jwtVerify(token, secret());
    const parsed = SessionPayloadSchema.parse({ sub: verified.payload.sub, role: verified.payload.role });
    return getUserById(parsed.sub);
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<PublicUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("UNAUTHENTICATED");
  }
  return user;
}
