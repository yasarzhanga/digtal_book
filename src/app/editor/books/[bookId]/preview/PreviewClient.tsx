"use client";

import { useState } from "react";
import type { BookSnapshot } from "@/content-engine/schema/document";
import { DocumentRenderer } from "@/content-engine/renderer/DocumentRenderer";

export function PreviewClient({ snapshot, bookId }: { snapshot: BookSnapshot; bookId: string }) {
  const [chapterId, setChapterId] = useState(snapshot.chapters[0]?.id ?? "");
  const [width, setWidth] = useState(1440);
  const chapter = snapshot.chapters.find((item) => item.id === chapterId) ?? snapshot.chapters[0];
  return (
    <main className="workspace-page">
      <section className="page-heading">
        <p className="eyebrow">同 Renderer 预览</p>
        <h1>{snapshot.book.title}</h1>
      </section>
      <div className="preview-tools">
        <select value={chapterId} onChange={(event) => setChapterId(event.target.value)}>
          {snapshot.chapters.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
        {[1440, 834, 390].map((value) => <button className={width === value ? "active" : ""} key={value} type="button" onClick={() => setWidth(value)}>{value}</button>)}
      </div>
      <div className="device-preview" style={{ maxWidth: `${Math.min(width, 1100)}px` }}>
        <DocumentRenderer snapshot={snapshot} chapter={chapter} mode="digital" bookId={bookId} />
      </div>
    </main>
  );
}
