import bcrypt from "bcryptjs";
import { z } from "zod";
import { asRow, getDb } from "@/server/db/client";
import type { UserRow } from "@/server/db/types";

export const RoleSchema = z.enum(["EDITOR", "TEACHER", "STUDENT"]);
export type UserRole = z.infer<typeof RoleSchema>;

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export const LoginInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export const DemoLoginInputSchema = z.object({
  role: z.enum(["editor", "teacher", "student"])
});

export function toPublicUser(row: UserRow): PublicUser {
  return { id: row.id, name: row.name, email: row.email, role: RoleSchema.parse(row.role) };
}

export function getUserById(userId: string): PublicUser | null {
  const row = asRow<UserRow>(getDb().prepare("SELECT * FROM User WHERE id = ?").get(userId));
  return row ? toPublicUser(row) : null;
}

export function login(email: string, password: string): PublicUser {
  const row = asRow<UserRow>(getDb().prepare("SELECT * FROM User WHERE email = ?").get(email));
  if (!row || !bcrypt.compareSync(password, row.passwordHash)) {
    throw new Error("INVALID_LOGIN");
  }
  return toPublicUser(row);
}

export function demoLogin(role: "editor" | "teacher" | "student"): PublicUser {
  if (process.env.DEMO_MODE === "false") {
    throw new Error("DEMO_MODE_DISABLED");
  }
  const email = `${role}@demo.local`;
  const row = asRow<UserRow>(getDb().prepare("SELECT * FROM User WHERE email = ?").get(email));
  if (!row) {
    throw new Error("DEMO_USER_MISSING");
  }
  return toPublicUser(row);
}
