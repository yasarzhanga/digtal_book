"use client";

import { BookOpen, ChartNoAxesCombined, Cpu, GraduationCap, PenTool } from "lucide-react";
import { useRouter } from "next/navigation";

const entries = [
  { role: "editor", label: "一键进入编辑者", href: "/editor/books/book_newton_second_law", icon: PenTool },
  { role: "student", label: "一键进入学生", href: "/reader/books/book_newton_second_law", icon: BookOpen },
  { role: "teacher", label: "一键进入教师", href: "/teacher/classes/class_physics_1/live", icon: GraduationCap }
] as const;

export function DemoHome() {
  const router = useRouter();
  async function enter(role: (typeof entries)[number]["role"], href: string) {
    await fetch("/api/auth/demo-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role })
    });
    router.push(href);
    router.refresh();
  }
  return (
    <main className="demo-page">
      <section className="demo-hero">
        <div>
          <p className="eyebrow">大学物理 · 牛顿第二定律实验课</p>
          <h1>数字教材平台沉浸式展示 Demo V2</h1>
          <p>同一份教材内容，在编辑、阅读和课堂中完成资源内嵌、知识操作、即时反馈、学习留痕和教学可见。</p>
          <div className="value-tags">
            {["内容内嵌", "知识可操作", "即时反馈", "学习留痕", "教学可见"].map((tag) => <span key={tag}>{tag}</span>)}
          </div>
          <div className="entry-grid">
            {entries.map((entry) => {
              const Icon = entry.icon;
              return (
                <button key={entry.role} type="button" onClick={() => void enter(entry.role, entry.href)}>
                  <Icon size={22} />
                  {entry.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="hero-instrument">
          <Cpu size={40} />
          <ChartNoAxesCombined size={40} />
          <div className="force-formula">F = ma</div>
          <div className="motion-line" />
          <div className="motion-line short" />
        </div>
      </section>
      <section className="story-steps">
        {["编辑者修改富文本、插入 3D 和仿真并发布", "学生从传统视图切换到数字视图，播放媒体并保存实验", "教师同步位置、推送随堂题、发起签到并查看统计"].map((text, index) => (
          <article key={text}>
            <span>{index + 1}</span>
            <p>{text}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
