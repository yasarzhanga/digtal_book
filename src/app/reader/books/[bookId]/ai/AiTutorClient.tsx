"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { Bot, BookOpen, MessageSquarePlus, RefreshCw, Send, Sparkles } from "lucide-react";
import type { AiAskResult, AiConversationDto } from "@/server/services/ai";

const suggestions = [
  "F=ma 中质量变大会怎样影响加速度？",
  "帮我总结小车受力实验的操作步骤",
  "哪些资源适合复习牛顿第二定律？",
  "根据本章内容出一道检测题并解释答案"
];

export function AiTutorClient({
  bookId,
  bookTitle,
  bookVersionId,
  initialConversations,
  providerConfigured
}: {
  bookId: string;
  bookTitle: string;
  bookVersionId: string;
  initialConversations: AiConversationDto[];
  providerConfigured: boolean;
}) {
  const [conversations, setConversations] = useState(initialConversations);
  const [activeId, setActiveId] = useState(initialConversations[0]?.id ?? "");
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [configured, setConfigured] = useState(providerConfigured);
  const [status, setStatus] = useState(providerConfigured ? "外部 AI 接口已配置" : "未配置 AI_API_KEY，当前使用本地参考回答");
  const [error, setError] = useState("");
  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeId) ?? null,
    [activeId, conversations]
  );
  const messages = activeConversation?.messages ?? [];

  async function submit(event?: FormEvent<HTMLFormElement>, override?: string) {
    event?.preventDefault();
    const nextQuestion = (override ?? question).trim();
    if (!nextQuestion || loading) return;
    setLoading(true);
    setError("");
    setStatus("正在生成回答");
    try {
      const response = await fetch(`/api/reader/books/${bookId}/ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookVersionId,
          conversationId: activeId || undefined,
          question: nextQuestion
        })
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const result = await response.json() as AiAskResult;
      setConfigured(result.providerConfigured);
      setStatus(result.providerMessage);
      setQuestion("");
      setConversations((current) => upsertConversation(current, result.conversation));
      setActiveId(result.conversation.id);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "AI_QA_FAILED");
      setStatus("回答生成失败");
    } finally {
      setLoading(false);
    }
  }

  async function refresh() {
    const response = await fetch(`/api/reader/books/${bookId}/ai`);
    if (!response.ok) return;
    const json = await response.json() as { providerConfigured: boolean; conversations: AiConversationDto[] };
    setConfigured(json.providerConfigured);
    setConversations(json.conversations);
    setActiveId((current) => current || json.conversations[0]?.id || "");
    setStatus(json.providerConfigured ? "外部 AI 接口已配置" : "未配置 AI_API_KEY，当前使用本地参考回答");
  }

  return (
    <main className="workspace-page ai-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">外部模型 + 本地教材引用</p>
          <h1>AI 问答</h1>
          <p>{bookTitle}</p>
        </div>
        <div className="inline-actions">
          <button type="button" onClick={() => void refresh()}><RefreshCw size={16} /> 刷新</button>
          <Link className="primary-link" href={`/reader/books/${bookId}`}><BookOpen size={16} /> 返回教材</Link>
        </div>
      </section>

      <div className="ai-shell">
        <aside className="ai-history-panel">
          <div className={configured ? "ai-provider ready" : "ai-provider fallback"}>
            <Bot size={18} />
            <div>
              <strong>{configured ? "外部接口" : "本地兜底"}</strong>
              <span>{status}</span>
            </div>
          </div>
          <button className="ai-new-chat" type="button" onClick={() => setActiveId("")}>
            <MessageSquarePlus size={16} /> 新建对话
          </button>
          <div className="ai-history-list">
            {conversations.map((conversation) => (
              <button
                className={conversation.id === activeId ? "active" : ""}
                key={conversation.id}
                type="button"
                onClick={() => setActiveId(conversation.id)}
              >
                <strong>{conversation.title}</strong>
                <span>{conversation.messages.length} 条消息</span>
              </button>
            ))}
          </div>
        </aside>

        <section className="ai-chat-panel">
          <div className="ai-thread">
            {messages.length ? messages.map((message) => (
              <article className={`ai-message ${message.role === "USER" ? "user" : "assistant"}`} key={message.id}>
                <header>
                  <span>{message.role === "USER" ? "我" : "AI 助教"}</span>
                  <small>{message.provider}</small>
                </header>
                <p>{message.content}</p>
                {message.citations.length ? (
                  <div className="ai-citations">
                    {message.citations.map((citation) => (
                      <Link href={`/reader/books/${bookId}?chapter=${citation.chapterId}#${citation.nodeId}`} key={`${message.id}-${citation.nodeId}`}>
                        <strong>{citation.chapterTitle} · {citation.title}</strong>
                        <span>{citation.excerpt}</span>
                      </Link>
                    ))}
                  </div>
                ) : null}
              </article>
            )) : (
              <div className="ai-empty">
                <Sparkles size={22} />
                <strong>教材问答已就绪</strong>
                <span>{configured ? "外部模型将结合本地教材引用回答。" : "配置 AI_API_KEY 后启用外部模型，当前可使用本地参考回答。"}</span>
              </div>
            )}
            {loading ? <div className="ai-thinking">正在检索教材并请求模型...</div> : null}
          </div>

          <div className="ai-suggestions">
            {suggestions.map((item) => (
              <button key={item} type="button" onClick={() => void submit(undefined, item)} disabled={loading}>
                {item}
              </button>
            ))}
          </div>

          <form className="ai-composer" onSubmit={(event) => void submit(event)}>
            <textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="输入关于当前教材的问题" />
            <button className="primary-action" type="submit" disabled={loading || !question.trim()}>
              <Send size={16} /> 发送
            </button>
          </form>
          {error ? <p className="form-error">{error}</p> : null}
        </section>
      </div>
    </main>
  );
}

function upsertConversation(conversations: AiConversationDto[], next: AiConversationDto): AiConversationDto[] {
  const others = conversations.filter((conversation) => conversation.id !== next.id);
  return [next, ...others];
}
