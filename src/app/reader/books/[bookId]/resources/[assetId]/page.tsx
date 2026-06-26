import { requireUser } from "@/server/auth/session";
import { getAssetPreview } from "@/server/services/previews";
import { getReaderSnapshot } from "@/server/services/reader";
import { ResourcePreviewTracker } from "./ResourcePreviewTracker";

interface PageProps {
  params: Promise<{ bookId: string; assetId: string }>;
}

export default async function AssetPreviewPage({ params }: PageProps) {
  await requireUser();
  const { bookId, assetId } = await params;
  const preview = await getAssetPreview(assetId);
  const snapshot = getReaderSnapshot(bookId);
  return (
    <main className="workspace-page">
      <ResourcePreviewTracker bookVersionId={snapshot.versionId} classroomId="class_physics_1" assetId={assetId} title={preview.asset.title} assetKind={preview.asset.kind} />
      <section className="page-heading">
        <div>
          <p className="eyebrow">文件在线预览</p>
          <h1>{preview.asset.title}</h1>
          <p>{preview.title} · {preview.asset.originalName}</p>
        </div>
        <a className="primary-link" href={`/reader/books/${bookId}/resources`}>返回资源中心</a>
      </section>
      <section className={`file-preview file-preview-${preview.mode}`}>
        {preview.mode === "pdf" ? <iframe title={preview.asset.title} src={preview.fileUrl} /> : null}
        {preview.mode === "html" || preview.mode === "spreadsheet" ? <div className="file-preview-html" dangerouslySetInnerHTML={{ __html: preview.html ?? "" }} /> : null}
        {preview.mode === "package" || preview.mode === "specialist" || preview.mode === "download" ? (
          <article className="file-preview-fallback">
            <strong>{preview.title}</strong>
            <p>{preview.message ?? "当前文件可安全下载查看。"}</p>
            <dl>
              <div><dt>类型</dt><dd>{preview.asset.kind}</dd></div>
              <div><dt>MIME</dt><dd>{preview.asset.mimeType}</dd></div>
              <div><dt>适配器</dt><dd>{preview.adapter}</dd></div>
            </dl>
          </article>
        ) : null}
        <div className="media-actions">
          <a href={preview.fileUrl} target="_blank" rel="noreferrer">打开原文件</a>
          <a href={preview.fileUrl} download>下载</a>
        </div>
      </section>
    </main>
  );
}
