"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type TouchEvent } from "react";
import { BookMarked, ChevronLeft, ChevronRight, ClipboardList, Code2, FlaskConical, GitBranch, Headphones, Languages, Maximize2, Minimize2, Moon, Search, Sparkles, SunMedium, TextQuote } from "lucide-react";
import type { BookSnapshot } from "@/content-engine/schema/document";
import { DocumentRenderer, type ReaderMode } from "@/content-engine/renderer/DocumentRenderer";
import { enqueueEvent } from "@/content-engine/tracking/client";
import { ReaderAiPanel } from "./ReaderAiPanel";

interface LiveCurrent {
  live: { id: string; currentChapterId: string | null; currentNodeId: string | null; status: string } | null;
  quiz: { id: string; quizNodeId: string; questionId: string } | null;
  attendance: { id: string; code: string; requireLocation: number; latitude: number | null; longitude: number | null; radiusMeters: number } | null;
}

interface SearchResult {
  chapterId: string;
  nodeId: string;
  type: string;
  title: string;
  excerpt: string;
  source?: "content" | "resource";
}

type ReaderStyle = CSSProperties & {
  "--reader-font-size": string;
};

interface SelectionMenu {
  x: number;
  y: number;
  text: string;
}

export function ReaderClient({ bookId, snapshot }: { bookId: string; snapshot: BookSnapshot }) {
  const [chapterId, setChapterId] = useState(snapshot.chapters[0]?.id ?? "");
  const [mode, setMode] = useState<ReaderMode>("digital");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [theme, setTheme] = useState("light");
  const [fontSize, setFontSize] = useState(18);
  const [live, setLive] = useState<LiveCurrent | null>(null);
  const [noteText, setNoteText] = useState("");
  const [focusMode, setFocusMode] = useState(false);
  const [selectionMenu, setSelectionMenu] = useState<SelectionMenu | null>(null);
  const [aiPromptRequest, setAiPromptRequest] = useState<{ id: string; text: string } | null>(null);
  const [attendanceMessage, setAttendanceMessage] = useState("");
  const touchStartY = useRef<number | null>(null);
  const chapter = snapshot.chapters.find((item) => item.id === chapterId) ?? snapshot.chapters[0];
  const chapterIndex = Math.max(0, snapshot.chapters.findIndex((item) => item.id === chapter.id));
  const previousChapter = snapshot.chapters[chapterIndex - 1];
  const nextChapter = snapshot.chapters[chapterIndex + 1];
  const quizNode = useMemo(() => snapshot.chapters.flatMap((item) => item.document.nodes).find((node) => node.type === "quizSet"), [snapshot]);
  const readerStyle: ReaderStyle = { "--reader-font-size": `${fontSize}px` };

  useEffect(() => {
    let mounted = true;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch("/api/classes/class_physics_1/live/current");
        if (response.ok && mounted) setLive(await response.json() as LiveCurrent);
      } catch {
        // The reader may unmount during Playwright navigation or tab close.
      }
    }, 2500);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const targetChapterId = params.get("chapter");
    if (targetChapterId && snapshot.chapters.some((item) => item.id === targetChapterId)) {
      setChapterId(targetChapterId);
      const targetNodeId = window.location.hash.replace("#", "");
      window.setTimeout(() => document.getElementById(targetNodeId)?.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
    }
  }, [snapshot.chapters]);

  useEffect(() => {
    const closeSelectionMenu = () => setSelectionMenu(null);
    window.addEventListener("click", closeSelectionMenu);
    window.addEventListener("scroll", closeSelectionMenu, true);
    return () => {
      window.removeEventListener("click", closeSelectionMenu);
      window.removeEventListener("scroll", closeSelectionMenu, true);
    };
  }, []);

  async function search() {
    const response = await fetch(`/api/reader/books/${bookId}/search?q=${encodeURIComponent(query)}`);
    if (response.ok) {
      const json = await response.json() as { results: SearchResult[] };
      setResults(json.results);
    }
  }

  function navigate(nextChapterId: string, nodeId?: string) {
    setChapterId(nextChapterId);
    setSelectionMenu(null);
    window.setTimeout(() => document.getElementById(nodeId ?? "")?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
  }

  function navigateByOffset(offset: -1 | 1, source: "button" | "touch" = "button") {
    const target = offset < 0 ? previousChapter : nextChapter;
    if (!target) return;
    setChapterId(target.id);
    setSelectionMenu(null);
    window.setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 80);
    enqueueEvent({
      bookVersionId: snapshot.versionId,
      chapterId: target.id,
      nodeId: target.document.nodes[0]?.nodeId,
      eventType: "PAGE_VIEW",
      payload: { navigation: offset < 0 ? "previous" : "next", source }
    });
  }

  function toggleFocusMode() {
    setFocusMode((current) => {
      const next = !current;
      enqueueEvent({
        bookVersionId: snapshot.versionId,
        chapterId: chapter.id,
        nodeId: chapter.document.nodes[0]?.nodeId,
        eventType: "FOCUS_MODE_TOGGLE",
        payload: { enabled: next }
      });
      return next;
    });
  }

  function handleContextMenu(event: MouseEvent<HTMLElement>) {
    const selectedText = window.getSelection()?.toString().trim() ?? "";
    if (selectedText.length < 2) return;
    event.preventDefault();
    setSelectionMenu({ x: event.clientX, y: event.clientY, text: selectedText.slice(0, 600) });
  }

  function handleTouchStart(event: TouchEvent<HTMLElement>) {
    touchStartY.current = event.touches[0]?.clientY ?? null;
  }

  function handleTouchEnd(event: TouchEvent<HTMLElement>) {
    const start = touchStartY.current;
    touchStartY.current = null;
    if (start === null) return;
    const end = event.changedTouches[0]?.clientY;
    if (end === undefined) return;
    const delta = end - start;
    if (Math.abs(delta) < 90) return;
    const nearTop = window.scrollY < 36;
    const nearBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 36;
    if (delta > 0 && nearTop) {
      navigateByOffset(-1, "touch");
    }
    if (delta < 0 && nearBottom) {
      navigateByOffset(1, "touch");
    }
  }

  function askAboutSelection(action: "summary" | "explain" | "translate" | "code") {
    if (!selectionMenu) return;
    const actionPrompt = {
      summary: "请用 3 点摘要这段教材内容",
      explain: "请面向学生解释这段教材内容，并指出和本章知识点的关系",
      translate: "请把这段内容翻译成英文，并解释关键术语",
      code: "请解释这段内容中的公式、代码或符号含义；如果不是代码，请说明它对应的物理概念"
    }[action];
    enqueueEvent({
      bookVersionId: snapshot.versionId,
      chapterId: chapter.id,
      nodeId: chapter.document.nodes[0]?.nodeId,
      eventType: "AI_SELECTION_ACTION",
      payload: { action, length: selectionMenu.text.length }
    });
    setAiPromptRequest({ id: `${action}-${Date.now()}`, text: `${actionPrompt}：\n${selectionMenu.text}` });
    setSelectionMenu(null);
  }

  async function addNote(color: "yellow" | "green" | "blue" | "pink") {
    const selection = window.getSelection()?.toString().trim() || "当前段落";
    await fetch(`/api/reader/books/${bookId}/annotations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bookVersionId: snapshot.versionId,
        chapterId: chapter.id,
        nodeId: chapter.document.nodes[0]?.nodeId ?? chapter.id,
        quote: selection,
        startOffset: 0,
        endOffset: selection.length,
        color,
        note: noteText
      })
    });
    setNoteText("");
  }

  function speakSelection() {
    const text = window.getSelection()?.toString().trim() || chapter.title;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = /[a-zA-Z]/.test(text) ? "en-US" : "zh-CN";
    window.speechSynthesis.speak(utterance);
    enqueueEvent({ bookVersionId: snapshot.versionId, chapterId: chapter.id, nodeId: chapter.document.nodes[0]?.nodeId, eventType: "TTS_START", payload: { length: text.length } });
  }

  async function syncTeacher() {
    if (!live?.live?.currentChapterId) return;
    navigate(live.live.currentChapterId, live.live.currentNodeId ?? undefined);
    enqueueEvent({ bookVersionId: snapshot.versionId, classroomId: "class_physics_1", chapterId: live.live.currentChapterId, nodeId: live.live.currentNodeId ?? undefined, eventType: "TEACHER_SYNC" });
  }

  async function answerLiveQuiz() {
    if (!live?.quiz) return;
    await fetch(`/api/live-quiz/${live.quiz.id}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answer: 2 })
    });
  }

  async function signCurrentAttendance() {
    if (!live?.attendance) return;
    setAttendanceMessage("正在签到...");
    const location = await getDemoLocation();
    const response = await fetch(`/api/attendance/${live.attendance.id}/sign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: live.attendance.code, ...location })
    });
    setAttendanceMessage(response.ok ? "签到成功" : "签到失败，请靠近课堂定位范围后重试");
  }

  return (
    <main className={`reader-layout theme-${theme}${focusMode ? " focused" : ""}`} style={readerStyle}>
      <aside className="reader-left">
        <h2>{snapshot.book.title}</h2>
        <div className="mode-toggle" role="tablist">
          <button className={mode === "traditional" ? "active" : ""} type="button" onClick={() => setMode("traditional")}>传统教材视图</button>
          <button className={mode === "digital" ? "active" : ""} type="button" onClick={() => setMode("digital")}>数字教材视图</button>
        </div>
        <nav className="toc">
          {snapshot.chapters.map((item) => <button className={item.id === chapter.id ? "active" : ""} key={item.id} type="button" onClick={() => setChapterId(item.id)}>{item.title}</button>)}
        </nav>
        <div className="search-box">
          <label><Search size={16} /> <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="全文与资源搜索" /></label>
          <button type="button" onClick={() => void search()}>搜索</button>
          {results.map((result) => <button key={`${result.chapterId}-${result.nodeId}`} type="button" onClick={() => navigate(result.chapterId, result.nodeId)}>{result.type} · {result.title}<small>{result.excerpt}</small></button>)}
        </div>
      </aside>
      <section className="reader-main" onContextMenu={handleContextMenu} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        {live?.live?.status === "ACTIVE" ? (
          <div className="live-banner">
            <span>课堂进行中，教师当前位置：{live.live.currentNodeId}</span>
            <button type="button" onClick={() => void syncTeacher()}>同步教师位置</button>
            {live.quiz ? <button type="button" onClick={() => void answerLiveQuiz()}>回答随堂题</button> : null}
            {live.attendance ? <button type="button" onClick={() => void signCurrentAttendance()}>地理签到</button> : null}
            {attendanceMessage ? <small>{attendanceMessage}</small> : null}
          </div>
        ) : null}
        <div className="reading-controls">
          <button type="button" onClick={() => navigateByOffset(-1)} disabled={!previousChapter}><ChevronLeft size={16} /> 上一节</button>
          <button type="button" onClick={() => navigateByOffset(1)} disabled={!nextChapter}>下一节 <ChevronRight size={16} /></button>
          <button className={focusMode ? "active" : ""} type="button" onClick={toggleFocusMode}>
            {focusMode ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            {focusMode ? "退出专注" : "专注模式"}
          </button>
          <button type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? <SunMedium size={16} /> : <Moon size={16} />} 主题</button>
          <label>字号<input type="range" min="16" max="24" value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))} /></label>
          <Link href={`/reader/books/${bookId}/resources`} prefetch={false}><BookMarked size={16} /> 资源中心</Link>
          <Link href={`/reader/books/${bookId}/assignments`} prefetch={false}><ClipboardList size={16} /> 作业</Link>
          <Link href={`/reader/books/${bookId}/mindmap`} prefetch={false}><GitBranch size={16} /> 思维导图</Link>
          <Link href={`/reader/books/${bookId}/simulations`} prefetch={false}><FlaskConical size={16} /> 仿真模板</Link>
          <Link href={`/reader/books/${bookId}/report`} prefetch={false}><Headphones size={16} /> 学习报告</Link>
        </div>
        <DocumentRenderer snapshot={snapshot} chapter={chapter} mode={mode} bookId={bookId} classroomId="class_physics_1" onNavigate={navigate} />
        <div className="chapter-nav">
          <button type="button" onClick={() => navigateByOffset(-1)} disabled={!previousChapter}>上一节</button>
          <button type="button" onClick={() => navigateByOffset(1)} disabled={!nextChapter}>下一节</button>
        </div>
        {selectionMenu ? (
          <div className="selection-ai-menu" style={{ left: selectionMenu.x, top: selectionMenu.y }} onClick={(event) => event.stopPropagation()}>
            <button type="button" onClick={() => askAboutSelection("summary")}><TextQuote size={15} /> 摘要</button>
            <button type="button" onClick={() => askAboutSelection("explain")}><Sparkles size={15} /> 解释</button>
            <button type="button" onClick={() => askAboutSelection("translate")}><Languages size={15} /> 翻译</button>
            <button type="button" onClick={() => askAboutSelection("code")}><Code2 size={15} /> 代码/公式</button>
          </div>
        ) : null}
      </section>
      <aside className="reader-right">
        <ReaderAiPanel bookId={bookId} bookVersionId={snapshot.versionId} chapterId={chapter.id} chapterTitle={chapter.title} promptRequest={aiPromptRequest} onNavigate={navigate} />
        <section className="notes-panel">
          <h3>笔记与朗读</h3>
          <textarea value={noteText} onChange={(event) => setNoteText(event.target.value)} placeholder="给选中文本添加笔记" />
          <div className="note-colors">
            {(["yellow", "green", "blue", "pink"] as const).map((color) => <button className={color} key={color} type="button" onClick={() => void addNote(color)}>{color}</button>)}
          </div>
          <button type="button" onClick={speakSelection}>朗读选中文本</button>
        </section>
        <section className="outline-panel">
          <h3>节内大纲</h3>
          {chapter.document.nodes.map((node) => {
            const label = node.type === "heading" ? node.text : "title" in node ? node.title : "";
            return label ? <button key={node.nodeId} type="button" onClick={() => document.getElementById(node.nodeId)?.scrollIntoView({ behavior: "smooth" })}>{label}</button> : null;
          })}
        </section>
        {quizNode?.type === "quizSet" ? <small>当前题组：{quizNode.questions.length} 题，可被教师推送为随堂题。</small> : null}
      </aside>
    </main>
  );
}

function getDemoLocation(): Promise<{ latitude: number; longitude: number; accuracyMeters: number }> {
  return new Promise((resolve) => {
    const fallback = { latitude: 31.2304, longitude: 121.4737, accuracyMeters: 30 };
    if (!navigator.geolocation) {
      resolve(fallback);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyMeters: position.coords.accuracy
      }),
      () => resolve(fallback),
      { enableHighAccuracy: true, timeout: 1200, maximumAge: 60_000 }
    );
  });
}
