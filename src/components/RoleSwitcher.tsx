"use client";

import { useRouter } from "next/navigation";
import type { PublicUser } from "@/server/services/auth";

const roleTargets = {
  editor: "/editor/books/book_newton_second_law",
  teacher: "/teacher/classes/class_physics_1/live",
  student: "/reader/books/book_newton_second_law"
} as const;

export function RoleSwitcher({ currentUser }: { currentUser: PublicUser | null }) {
  const router = useRouter();
  async function switchRole(role: keyof typeof roleTargets) {
    await fetch("/api/auth/demo-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role })
    });
    router.push(roleTargets[role]);
    router.refresh();
  }
  return (
    <div className="role-switcher">
      <span>{currentUser ? `${currentUser.name} · ${currentUser.role}` : "未登录"}</span>
      <button type="button" onClick={() => void switchRole("editor")}>编辑者</button>
      <button type="button" onClick={() => void switchRole("student")}>学生</button>
      <button type="button" onClick={() => void switchRole("teacher")}>教师</button>
    </div>
  );
}
