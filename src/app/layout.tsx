import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/server/auth/session";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import "./globals.css";

export const metadata: Metadata = {
  title: "数字教材平台沉浸式展示 Demo V2",
  description: "大学物理：牛顿第二定律实验课"
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <html lang="zh-CN">
      <body>
        <header className="topbar">
          <Link className="brand" href="/demo">数字教材 Demo V2</Link>
          <nav>
            <Link href="/editor/books" prefetch={false}>编辑</Link>
            <Link href="/reader/books/book_newton_second_law" prefetch={false}>阅读</Link>
            <Link href="/teacher/courses" prefetch={false}>教学</Link>
          </nav>
          <RoleSwitcher currentUser={user} />
        </header>
        {children}
      </body>
    </html>
  );
}
