"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { BookSnapshot } from "@/content-engine/schema/document";
import { DocumentRenderer } from "@/content-engine/renderer/DocumentRenderer";

interface Classroom {
  id: string;
  name: string;
  joinCode: string;
  courseName: string;
  bookId: string;
  studentCount: number;
}

interface CurrentLive {
  live: { id: string; currentChapterId: string | null; currentNodeId: string | null; status: string } | null;
  quiz: { id: string; quizNodeId: string; questionId: string; status: string } | null;
  attendance: { id: string; code: string; expiresAt: string; requireLocation: number; latitude: number | null; longitude: number | null; radiusMeters: number } | null;
}

interface Results {
  liveQuizId: string;
  answeredCount: number;
  correctCount: number;
  distribution: { label: string; count: number }[];
}

export function TeacherLiveClient({ classroom, snapshot, current }: { classroom: Classroom; snapshot: BookSnapshot; current: CurrentLive }) {
  const [chapterId, setChapterId] = useState(snapshot.chapters[0]?.id ?? "");
  const [live, setLive] = useState(current);
  const [results, setResults] = useState<Results | null>(null);
  const [attendanceRecords, setAttendanceRecords] = useState<{ studentId: string; name: string; status: string; source: string; distanceMeters: number | null }[]>([]);
  const chapter = snapshot.chapters.find((item) => item.id === chapterId) ?? snapshot.chapters[0];
  const quizNode = useMemo(() => snapshot.chapters.flatMap((item) => item.document.nodes).find((node) => node.type === "quizSet"), [snapshot]);

  useEffect(() => {
    const timer = window.setInterval(() => void refresh(), 2500);
    return () => window.clearInterval(timer);
  }, [classroom.id]);

  async function refresh() {
    const liveResponse = await fetch(`/api/classes/${classroom.id}/live/current`);
    if (liveResponse.ok) {
      const next = await liveResponse.json() as CurrentLive;
      setLive(next);
      if (next.quiz) {
        const resultResponse = await fetch(`/api/live-quiz/${next.quiz.id}/results`);
        if (resultResponse.ok) {
          const json = await resultResponse.json() as { results: Results };
          setResults(json.results);
        }
      }
      if (next.attendance) {
        const attendanceResponse = await fetch(`/api/classes/${classroom.id}/attendance`);
        if (attendanceResponse.ok) {
          const json = await attendanceResponse.json() as { records: { studentId: string; name: string; status: string; source: string; distanceMeters: number | null }[] };
          setAttendanceRecords(json.records);
        }
      }
    }
  }

  async function startLive() {
    const response = await fetch(`/api/classes/${classroom.id}/live/start`, { method: "POST" });
    if (response.ok) await refresh();
  }

  async function setLocation(nextChapterId: string, nodeId: string) {
    await fetch(`/api/classes/${classroom.id}/live/location`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chapterId: nextChapterId, nodeId })
    });
    await refresh();
  }

  async function pushQuiz() {
    if (!quizNode || quizNode.type !== "quizSet") return;
    const response = await fetch(`/api/classes/${classroom.id}/live-quiz`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quizNodeId: quizNode.nodeId, questionId: quizNode.questions[0]?.id })
    });
    if (response.ok) await refresh();
  }

  async function startAttendance() {
    const response = await fetch(`/api/classes/${classroom.id}/attendance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requireLocation: true, latitude: 31.2304, longitude: 121.4737, radiusMeters: 500 })
    });
    if (response.ok) {
      const json = await response.json() as { records: { studentId: string; name: string; status: string; source: string; distanceMeters: number | null }[] };
      setAttendanceRecords(json.records);
      await refresh();
    }
  }

  return (
    <main className="teacher-live-layout">
      <aside className="teacher-panel">
        <p className="eyebrow">{classroom.courseName}</p>
        <h1>{classroom.name}</h1>
        <p>邀请码：<b>{classroom.joinCode}</b> · 学生 {classroom.studentCount} 人</p>
        <div className="teacher-actions">
          <button type="button" onClick={() => void startLive()}>开始课堂</button>
          <button type="button" onClick={() => void setLocation("chapter-operate", "chapter-operate-5-physicsSimulation")}>定位到仿真实验</button>
          <button type="button" onClick={() => void pushQuiz()}>发起随堂题</button>
          <button type="button" onClick={() => void startAttendance()}>发起签到</button>
          <Link href={`/teacher/classes/${classroom.id}/assignments`} prefetch={false}>作业发布/批改</Link>
          <Link href={`/teacher/classes/${classroom.id}/question-bank`} prefetch={false}>题库导入</Link>
          <Link href={`/teacher/classes/${classroom.id}/resources`} prefetch={false}>课程资源</Link>
          <Link href={`/teacher/classes/${classroom.id}/analytics`} prefetch={false}>班级报告</Link>
        </div>
        <section className="live-status">
          <h2>课堂状态</h2>
          <p>{live.live ? `进行中：${live.live.currentNodeId}` : "未开始"}</p>
          {live.quiz ? <p>随堂题：{live.quiz.questionId}</p> : null}
          {live.attendance ? <p>签到码：<b>{live.attendance.code}</b> · {live.attendance.requireLocation ? `地理签到 ${live.attendance.radiusMeters}m` : "普通签到"}</p> : null}
        </section>
        <section className="live-results">
          <h2>随堂结果</h2>
          {results ? <p>已答 {results.answeredCount}，正确 {results.correctCount}</p> : <p>暂无随堂题结果</p>}
          {results?.distribution.map((item) => <div className="distribution-row" key={item.label}><span>{item.label}</span><b>{item.count}</b></div>)}
        </section>
        <section className="attendance-list">
          <h2>签到记录</h2>
          {attendanceRecords.map((item) => <div key={item.studentId}><span>{item.name}</span><b>{item.status}{item.distanceMeters !== null ? ` · ${Math.round(item.distanceMeters)}m` : ""}</b></div>)}
        </section>
      </aside>
      <section className="teacher-reader">
        <div className="teacher-tabs">
          {snapshot.chapters.map((item) => <button className={item.id === chapter.id ? "active" : ""} key={item.id} type="button" onClick={() => setChapterId(item.id)}>{item.title}</button>)}
        </div>
        <DocumentRenderer snapshot={snapshot} chapter={chapter} mode="digital" bookId={classroom.bookId} classroomId={classroom.id} onTeacherSetLocation={(nextChapterId, nodeId) => void setLocation(nextChapterId, nodeId)} />
      </section>
    </main>
  );
}
