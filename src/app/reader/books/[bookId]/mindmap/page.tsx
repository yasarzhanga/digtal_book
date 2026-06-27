import { ensureBookReadable, requireStudent } from "@/server/auth/guards";
import { buildNotesMindMap } from "@/server/services/p1";
import { MindMapClient } from "./MindMapClient";

interface PageProps {
  params: Promise<{ bookId: string }>;
}

export default async function MindMapPage({ params }: PageProps) {
  const user = await requireStudent();
  const { bookId } = await params;
  ensureBookReadable(user, bookId);
  const mindMap = buildNotesMindMap(user.id, bookId);
  return (
    <main className="workspace-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">P1 笔记生成思维导图</p>
          <h1>我的知识网络</h1>
        </div>
        <a className="primary-link" href={`/api/reader/books/${bookId}/mindmap`}>查看 JSON</a>
      </section>
      <MindMapClient bookId={bookId} initialMindMap={mindMap} />
    </main>
  );
}
