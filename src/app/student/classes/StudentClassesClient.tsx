"use client";

import Link from "next/link";
import { useState } from "react";

interface StudentClassroom {
  id: string;
  name: string;
  joinCode: string;
  courseName: string;
  bookId: string;
}

export function StudentClassesClient({ initialClassrooms, initialCode = "" }: { initialClassrooms: StudentClassroom[]; initialCode?: string }) {
  const [joinCode, setJoinCode] = useState(initialCode);
  const [message, setMessage] = useState("");

  async function joinClassroom() {
    setMessage("正在加入班级...");
    const response = await fetch("/api/classes/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ joinCode })
    });
    if (!response.ok) {
      setMessage("入班失败，请检查邀请码。");
      return;
    }
    const json = await response.json() as { classroomId: string };
    setMessage(`已加入班级 ${json.classroomId}`);
    window.location.assign("/student/classes");
  }

  return (
    <main className="workspace-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">学生班级</p>
          <h1>我的课程班级</h1>
        </div>
      </section>
      <section className="p1-panel">
        <h2>输入邀请码加入班级</h2>
        <div className="inline-actions">
          <input value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} placeholder="例如 PHYS01" />
          <button type="button" onClick={() => void joinClassroom()}>加入班级</button>
        </div>
        {message ? <small>{message}</small> : null}
      </section>
      <section className="assignment-list">
        {initialClassrooms.map((classroom) => (
          <article className="assignment-card" key={classroom.id}>
            <h2>{classroom.name}</h2>
            <p>{classroom.courseName}</p>
            <small>邀请码 {classroom.joinCode}</small>
            <Link className="primary-link" href={`/reader/books/${classroom.bookId}?classroomId=${classroom.id}`}>进入班级教材</Link>
          </article>
        ))}
        {initialClassrooms.length === 0 ? <p className="muted-text">尚未加入班级。</p> : null}
      </section>
    </main>
  );
}
