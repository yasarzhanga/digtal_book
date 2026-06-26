"use client";

export function VersionsClient({ bookId, versions }: { bookId: string; versions: { id: string; versionNumber: number; note: string; publishedAt: string; componentCount: number }[] }) {
  async function activate(versionId: string) {
    await fetch(`/api/books/${bookId}/versions/${versionId}/activate`, { method: "POST" });
    window.location.reload();
  }
  return (
    <main className="workspace-page">
      <section className="page-heading">
        <p className="eyebrow">发布版本</p>
        <h1>不可变快照</h1>
      </section>
      <div className="version-list">
        {versions.map((version) => (
          <article className="version-row" key={version.id}>
            <strong>v{version.versionNumber}</strong>
            <span>{version.note}</span>
            <small>{new Date(version.publishedAt).toLocaleString()} · {version.componentCount} 个节点</small>
            <button type="button" onClick={() => void activate(version.id)}>设为当前阅读版本</button>
          </article>
        ))}
      </div>
    </main>
  );
}
