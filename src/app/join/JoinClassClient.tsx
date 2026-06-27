"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export function JoinClassClient({ code, bookId }: { code: string; bookId: string }) {
  const [status, setStatus] = useState("正在加入班级...");
  const [classroomId, setClassroomId] = useState("");

  useEffect(() => {
    async function join() {
      const response = await fetch("/api/classes/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ joinCode: code })
      });
      if (!response.ok) {
        setStatus("入班失败，请检查邀请码。");
        return;
      }
      const json = await response.json() as { classroomId: string };
      setClassroomId(json.classroomId);
      setStatus("已加入班级");
    }
    void join();
  }, [code]);

  return (
    <main className="workspace-page join-page">
      <section className="page-heading">
        <p className="eyebrow">扫码入班</p>
        <h1>{status}</h1>
      </section>
      <div className="p1-panel">
        <p>邀请码：<b>{code}</b></p>
        {classroomId ? <p>班级 ID：{classroomId}</p> : null}
        <Link className="primary-link" href={`/reader/books/${bookId}${classroomId ? `?classroomId=${classroomId}` : ""}`}>进入数字教材</Link>
      </div>
    </main>
  );
}
