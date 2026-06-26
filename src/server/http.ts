import { NextResponse } from "next/server";
import type { z } from "zod";

export async function parseJson<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  const body = await request.json() as unknown;
  return schema.parse(body);
}

export function ok<T>(data: T, init?: ResponseInit): NextResponse<T> {
  return NextResponse.json(data, init);
}

export function errorResponse(error: unknown): NextResponse<{ error: string }> {
  const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
  const status = message === "UNAUTHENTICATED" ? 401
      : message.includes("NOT_FOUND") || message.includes("MISSING") ? 404
        : message.includes("CONFLICT") ? 409
        : message.includes("DISABLED") || message.includes("FORBIDDEN") ? 403
          : 400;
  return NextResponse.json({ error: message }, { status });
}
