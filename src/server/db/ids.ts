import { randomUUID } from "node:crypto";

export function id(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

export const DEMO_BOOK_ID = "book_newton_second_law";
export const DEMO_CLASSROOM_ID = "class_physics_1";
export const DEMO_COURSE_ID = "course_university_physics";
export const DEMO_VERSION_ID = "version_newton_v1";
