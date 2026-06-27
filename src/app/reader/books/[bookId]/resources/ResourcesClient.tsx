"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { enqueueEvent, flushEvents } from "@/content-engine/tracking/client";

interface BookResource {
  type: string;
  nodeId: string;
  chapterId: string;
  title: string;
  assetIds: string[];
  searchText?: string;
}

interface CourseResource {
  id: string;
  title: string;
  description: string;
  category: string;
  visibility: string;
  asset: {
    id: string;
    kind: string;
    title: string;
    originalName: string;
    url: string;
  };
  searchText?: string;
}

export function ResourcesClient({
  bookId,
  classroomId,
  bookVersionId,
  bookTitle,
  resources,
  courseResources
}: {
  bookId: string;
  classroomId?: string;
  bookVersionId: string;
  bookTitle: string;
  resources: BookResource[];
  courseResources: CourseResource[];
}) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const filteredBookResources = useMemo(
    () => normalizedQuery ? resources.filter((item) => resourceText(item).includes(normalizedQuery)) : resources,
    [normalizedQuery, resources]
  );
  const filteredCourseResources = useMemo(
    () => normalizedQuery ? courseResources.filter((item) => courseResourceText(item).includes(normalizedQuery)) : courseResources,
    [courseResources, normalizedQuery]
  );

  function trackResourceOpen(kind: "book" | "course", payload: Record<string, unknown>) {
    enqueueEvent({
      bookVersionId,
      classroomId,
      eventType: "RESOURCE_OPEN",
      payload: { kind, ...payload }
    });
    void flushEvents();
  }

  return (
    <main className="workspace-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">自动资源中心 + 课程独立资源</p>
          <h1>{bookTitle}</h1>
        </div>
      </section>
      <section className="resource-search-panel">
        <label>
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索资源标题、类型、文件名或文件内容" />
        </label>
        <span>{filteredBookResources.length + filteredCourseResources.length} 个结果</span>
      </section>
      <section className="resource-section">
        <h2>教材内嵌资源</h2>
        <div className="resource-grid">
          {filteredBookResources.map((item) => (
            <Link
              className="resource-card"
              href={`/reader/books/${bookId}${classroomId ? `?classroomId=${classroomId}&chapter=${item.chapterId}` : `?chapter=${item.chapterId}`}#${item.nodeId}`}
              key={item.nodeId}
              onClick={() => trackResourceOpen("book", { chapterId: item.chapterId, nodeId: item.nodeId, type: item.type, assetIds: item.assetIds })}
            >
              <strong>{item.title}</strong>
              <span>{item.type}</span>
              <small>{item.assetIds.join("、") || "交互节点"}</small>
            </Link>
          ))}
        </div>
      </section>
      <section className="resource-section">
        <h2>课程独立资源</h2>
        <div className="resource-grid">
          {filteredCourseResources.map((item) => (
            <Link
              className="resource-card"
              href={`/reader/books/${bookId}/resources/${item.asset.id}${classroomId ? `?classroomId=${classroomId}` : ""}`}
              key={item.id}
              onClick={() => trackResourceOpen("course", { resourceId: item.id, assetId: item.asset.id, category: item.category, assetKind: item.asset.kind })}
            >
              <strong>{item.title}</strong>
              <span>{item.category} · {item.asset.kind}</span>
              <small>{item.description || item.asset.originalName}</small>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}

function resourceText(item: BookResource): string {
  return [item.title, item.type, item.nodeId, item.chapterId, ...item.assetIds, item.searchText ?? ""].join(" ").toLowerCase();
}

function courseResourceText(item: CourseResource): string {
  return [item.title, item.description, item.category, item.visibility, item.asset.kind, item.asset.title, item.asset.originalName, item.searchText ?? ""].join(" ").toLowerCase();
}
