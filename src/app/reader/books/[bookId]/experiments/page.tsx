import { requireUser } from "@/server/auth/session";
import { getReaderSnapshot, getPersonalReport } from "@/server/services/reader";

interface PageProps {
  params: Promise<{ bookId: string }>;
}

export default async function ExperimentsPage({ params }: PageProps) {
  const user = await requireUser();
  const { bookId } = await params;
  const snapshot = getReaderSnapshot(bookId);
  const report = getPersonalReport(user.id, snapshot.versionId);
  return (
    <main className="workspace-page">
      <section className="page-heading">
        <p className="eyebrow">个人实验记录</p>
        <h1>F = ma 保存记录</h1>
      </section>
      <div className="experiment-list">
        {report.savedExperiments.map((item) => <article className="experiment-row" key={`${item.createdAt}-${item.force}`}><strong>F={item.force}N，m={item.mass}kg</strong><span>a={item.acceleration.toFixed(2)}m/s²</span><small>{new Date(item.createdAt).toLocaleString()}</small></article>)}
      </div>
    </main>
  );
}
