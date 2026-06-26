import { requireUser } from "@/server/auth/session";
import { getReaderSnapshot, listAnnotations } from "@/server/services/reader";

interface PageProps {
  params: Promise<{ bookId: string }>;
}

export default async function NotesPage({ params }: PageProps) {
  const user = await requireUser();
  const { bookId } = await params;
  const snapshot = getReaderSnapshot(bookId);
  const annotations = listAnnotations(user.id, snapshot.versionId) as { id: string; quote: string; note: string; color: string; chapterId: string }[];
  return (
    <main className="workspace-page">
      <section className="page-heading">
        <p className="eyebrow">跨章节笔记</p>
        <h1>我的标注和笔记</h1>
      </section>
      <div className="note-list">
        {annotations.map((annotation) => <article className={`note-card ${annotation.color}`} key={annotation.id}><strong>{annotation.quote}</strong><p>{annotation.note}</p><small>{annotation.chapterId}</small></article>)}
      </div>
    </main>
  );
}
