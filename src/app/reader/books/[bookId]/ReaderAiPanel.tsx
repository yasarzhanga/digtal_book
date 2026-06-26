"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Bot, ExternalLink, MessageSquarePlus, Send } from "lucide-react";
import type { AiAskResult, AiConversationDto } from "@/server/services/ai";

const chapterSuggestions = [
  "解释本节最重要的概念",
  "我应该先操作哪个组件？",
  "用一句话总结本节",
  "给我一道本节检测题"
];

export function ReaderAiPanel({
  bookId,
  bookVersionId,
  chapterId,
  chapterTitle,
  promptRequest,
  onNavigate
}: {
  bookId: string;
  bookVersionId: string;
  chapterId: string;
  chapterTitle: string;
  promptRequest?: { id: string; text: string } | null;
  onNavigate: (chapterId: string, nodeId?: string) => void;
}) {
  const [conversations, setConversations] = useState<AiConversationDto[]>([]);
  const [activeId, setActiveId] = useState("");
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [status, setStatus] = useState("正在读取问答状态");
  const [error, setError] = useState("");
  const [pendingQuestion, setPendingQuestion] = useState("");
  const [streamText, setStreamText] = useState("");
  const activeConversation = useMemo(
    () => activeId ? conversations.find((conversation) => conversation.id === activeId) ?? null : null,
    [activeId, conversations]
  );
  const messages = activeConversation?.messages.slice(-4) ?? [];

  useEffect(() => {
    let mounted = true;
    async function loadConversations() {
      const response = await fetch(`/api/reader/books/${bookId}/ai`);
      if (!response.ok || !mounted) return;
      const json = await response.json() as { providerConfigured: boolean; conversations: AiConversationDto[] };
      setConfigured(json.providerConfigured);
      setConversations(json.conversations);
      setActiveId((current) => current || json.conversations[0]?.id || "");
      setStatus(json.providerConfigured ? "外部 AI 已连接" : "本地教材参考回答");
    }
    void loadConversations();
    return () => {
      mounted = false;
    };
  }, [bookId]);

  useEffect(() => {
    if (!promptRequest?.text) return;
    void submit(undefined, promptRequest.text);
  }, [promptRequest?.id]);

  async function submit(event?: FormEvent<HTMLFormElement>, override?: string) {
    event?.preventDefault();
    const nextQuestion = (override ?? question).trim();
    if (!nextQuestion || loading) return;
    setLoading(true);
    setError("");
    setPendingQuestion(nextQuestion);
    setStreamText("");
    setStatus("正在检索本节内容");
    try {
      const response = await fetch(`/api/reader/books/${bookId}/ai?stream=1`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookVersionId,
          chapterId,
          conversationId: activeConversation?.id,
          question: nextQuestion
        })
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const result = response.body && response.headers.get("content-type")?.includes("text/event-stream")
        ? await readAiStream(response, {
          onDelta: (content) => setStreamText((current) => `${current}${content}`),
          onStatus: (message) => setStatus(message)
        })
        : await response.json() as AiAskResult;
      setConfigured(result.providerConfigured);
      setStatus(result.providerMessage);
      setConversations((current) => upsertConversation(current, result.conversation));
      setActiveId(result.conversation.id);
      setQuestion("");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "AI_QA_FAILED");
      setStatus("回答生成失败");
    } finally {
      setLoading(false);
      setPendingQuestion("");
      setStreamText("");
    }
  }

  return (
    <section className="reader-ai-panel">
      <header className="reader-ai-head">
        <div>
          <span><Bot size={16} /> AI 助教</span>
          <strong>{chapterTitle}</strong>
        </div>
        <Link href={`/reader/books/${bookId}/ai`} prefetch={false} aria-label="打开全屏 AI 问答"><ExternalLink size={16} /></Link>
      </header>
      <div className={configured ? "reader-ai-status ready" : "reader-ai-status fallback"}>{status}</div>
      <div className="reader-ai-thread" aria-live="polite">
        {messages.length ? messages.map((message) => (
          <article className={`reader-ai-message ${message.role === "USER" ? "user" : "assistant"}`} key={message.id}>
            <small>{message.role === "USER" ? "我" : "AI"}</small>
            <p>{message.content}</p>
            {message.citations.length ? (
              <div className="reader-ai-citations">
                {message.citations.slice(0, 2).map((citation) => (
                  <button key={`${message.id}-${citation.nodeId}`} type="button" onClick={() => onNavigate(citation.chapterId, citation.nodeId)}>
                    {citation.chapterTitle} · {citation.title}
                  </button>
                ))}
              </div>
            ) : null}
          </article>
        )) : (
          <div className="reader-ai-empty">
            <strong>围绕当前章节提问</strong>
            <span>回答会结合本地教材内容和学习记录。</span>
          </div>
        )}
        {pendingQuestion ? (
          <article className="reader-ai-message user streaming">
            <small>我</small>
            <p>{pendingQuestion}</p>
          </article>
        ) : null}
        {streamText ? (
          <article className="reader-ai-message assistant streaming">
            <small>AI</small>
            <p>{streamText}</p>
          </article>
        ) : null}
        {loading && !streamText ? <div className="reader-ai-thinking">正在生成...</div> : null}
      </div>
      <div className="reader-ai-suggestions">
        {chapterSuggestions.map((item) => (
          <button key={item} type="button" onClick={() => void submit(undefined, item)} disabled={loading}>{item}</button>
        ))}
      </div>
      <form className="reader-ai-composer" onSubmit={(event) => void submit(event)}>
        <textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="向 AI 提问当前章节" />
        <div>
          <button type="button" onClick={() => setActiveId("")}><MessageSquarePlus size={15} /> 新对话</button>
          <button className="primary-action" type="submit" disabled={loading || !question.trim()}><Send size={15} /> 问 AI</button>
        </div>
      </form>
      {error ? <p className="form-error">{error}</p> : null}
    </section>
  );
}

function upsertConversation(conversations: AiConversationDto[], next: AiConversationDto): AiConversationDto[] {
  const others = conversations.filter((conversation) => conversation.id !== next.id);
  return [next, ...others];
}

async function readAiStream(
  response: Response,
  handlers: { onDelta: (content: string) => void; onStatus: (message: string) => void }
): Promise<AiAskResult> {
  const reader = response.body?.getReader();
  if (!reader) {
    return await response.json() as AiAskResult;
  }
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult: AiAskResult | null = null;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const event = parseSseEvent(part);
      if (!event) continue;
      if (event.type === "delta") {
        handlers.onDelta(event.content);
      } else if (event.type === "status") {
        handlers.onStatus(event.message);
      } else {
        finalResult = event.result;
      }
    }
  }
  if (buffer.trim()) {
    const event = parseSseEvent(buffer);
    if (event?.type === "done") {
      finalResult = event.result;
    }
  }
  if (!finalResult) {
    throw new Error("AI_STREAM_INCOMPLETE");
  }
  return finalResult;
}

type ReaderAiStreamEvent =
  | { type: "delta"; content: string }
  | { type: "status"; message: string }
  | { type: "done"; result: AiAskResult };

function parseSseEvent(raw: string): ReaderAiStreamEvent | null {
  const lines = raw.split("\n");
  const eventType = lines.find((line) => line.startsWith("event: "))?.slice(7).trim();
  const dataLine = lines.find((line) => line.startsWith("data: "));
  if (!eventType || !dataLine) {
    return null;
  }
  const data = JSON.parse(dataLine.slice(6)) as unknown;
  if (eventType === "delta" && isRecord(data) && typeof data.content === "string") {
    return { type: "delta", content: data.content };
  }
  if (eventType === "status" && isRecord(data) && typeof data.message === "string") {
    return { type: "status", message: data.message };
  }
  if (eventType === "done") {
    return { type: "done", result: data as AiAskResult };
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
