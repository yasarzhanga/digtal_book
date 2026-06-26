import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

let singleton: DatabaseSync | null = null;

export function getDatabasePath(): string {
  return path.resolve(process.cwd(), process.env.DATABASE_PATH ?? "storage/demo.sqlite");
}

export function getDb(): DatabaseSync {
  if (singleton) {
    return singleton;
  }
  const databasePath = getDatabasePath();
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  singleton = new DatabaseSync(databasePath);
  singleton.exec("PRAGMA foreign_keys = ON;");
  singleton.exec("PRAGMA journal_mode = WAL;");
  return singleton;
}

export function closeDb(): void {
  if (singleton) {
    singleton.close();
    singleton = null;
  }
}

export function withTransaction<T>(callback: () => T): T {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE;");
  try {
    const result = callback();
    db.exec("COMMIT;");
    return result;
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
}

export function asRow<T extends Record<string, unknown>>(value: unknown): T | null {
  if (value && typeof value === "object") {
    return value as T;
  }
  return null;
}

export function asRows<T extends Record<string, unknown>>(values: unknown[]): T[] {
  return values.filter((value): value is T => Boolean(value && typeof value === "object")) as T[];
}
