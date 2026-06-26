import type { z } from "zod";

export function parseJson<T>(schema: z.ZodType<T>, value: string): T {
  return schema.parse(JSON.parse(value) as unknown);
}

export function parseUnknownJson(value: string): unknown {
  return JSON.parse(value) as unknown;
}

export function stringifyJson(value: unknown): string {
  return JSON.stringify(value);
}
