"use client";

import { useMemo, useState } from "react";
import type { Asset } from "@/content-engine/schema/assets";

type AssetWithReferences = Asset & { references: { chapterId: string; count: number }[] };

export function AssetLibraryClient({ assets }: { assets: AssetWithReferences[] }) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("ALL");
  const [view, setView] = useState<"grid" | "list">("grid");
  const filtered = useMemo(() => assets.filter((asset) => {
    const matchesKind = kind === "ALL" || asset.kind === kind;
    const matchesQuery = `${asset.title} ${asset.originalName}`.toLowerCase().includes(query.toLowerCase());
    return matchesKind && matchesQuery;
  }), [assets, kind, query]);
  return (
    <main className="workspace-page">
      <section className="page-heading">
        <p className="eyebrow">资源库</p>
        <h1>本地素材与上传资源</h1>
      </section>
      <div className="asset-tools">
        <input placeholder="搜索资源" value={query} onChange={(event) => setQuery(event.target.value)} />
        <select value={kind} onChange={(event) => setKind(event.target.value)}>
          {["ALL", "IMAGE", "AUDIO", "VIDEO", "MODEL3D", "PANORAMA", "PDF", "DOCUMENT", "SCORM", "H5P"].map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <button type="button" onClick={() => setView(view === "grid" ? "list" : "grid")}>{view === "grid" ? "列表" : "网格"}</button>
        <UploadForm />
      </div>
      <section className={`asset-${view}`}>
        {filtered.map((asset) => (
          <article className="asset-card" key={asset.id}>
            {asset.kind === "IMAGE" || asset.kind === "PANORAMA" ? <img src={asset.url} alt={asset.title} /> : <div className="asset-kind">{asset.kind}</div>}
            <strong>{asset.title}</strong>
            <span>{asset.originalName} · {Math.round(asset.size / 1024)}KB</span>
            <small>引用：{asset.references.map((ref) => `${ref.chapterId}×${ref.count}`).join("，") || "未引用"}</small>
          </article>
        ))}
      </section>
    </main>
  );
}

function UploadForm() {
  const [message, setMessage] = useState("");
  async function upload(formData: FormData) {
    const response = await fetch("/api/assets", { method: "POST", body: formData });
    setMessage(response.ok ? "上传成功，刷新后可见" : "上传失败：类型或大小不符合限制");
  }
  return (
    <form className="upload-form" action={(formData) => void upload(formData)}>
      <select name="kind" defaultValue="IMAGE">
        {["IMAGE", "AUDIO", "VIDEO", "MODEL3D", "PANORAMA", "PDF", "DOCUMENT", "SCORM", "H5P"].map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
      <input name="title" placeholder="资源标题" />
      <input name="file" type="file" />
      <button type="submit">上传</button>
      {message ? <span>{message}</span> : null}
    </form>
  );
}
