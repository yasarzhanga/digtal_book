"use client";

import "katex/dist/katex.min.css";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import katex from "katex";
import { ClipboardList, Download, Expand, Mic, Pause, Play, RotateCcw, Save, Search, Volume2 } from "lucide-react";
import type { Asset } from "@/content-engine/schema/assets";
import type { BookSnapshot, SnapshotChapter } from "@/content-engine/schema/document";
import type { ChartNode, ContentNode, PhysicsSimulationNode, QuizQuestion, QuizSetNode } from "@/content-engine/schema/nodes";
import { applyAnnotationMarksToHtml, type AnnotationRange } from "@/content-engine/utils/annotations";
import { acceleration, sampleMotion } from "@/content-engine/utils/simulation";
import { trackWithContext } from "@/content-engine/tracking/client";

export type ReaderMode = "digital" | "traditional";

interface DocumentRendererProps {
  snapshot: BookSnapshot;
  chapter: SnapshotChapter;
  mode: ReaderMode;
  bookId: string;
  classroomId?: string;
  annotations?: (AnnotationRange & { chapterId: string; nodeId: string })[];
  onNavigate?: (chapterId: string, nodeId?: string) => void;
  onTeacherSetLocation?: (chapterId: string, nodeId: string) => void;
}

export function DocumentRenderer({ snapshot, chapter, mode, bookId, classroomId, annotations = [], onNavigate, onTeacherSetLocation }: DocumentRendererProps) {
  const assets = useMemo(() => new Map(snapshot.assets.map((asset) => [asset.id, asset])), [snapshot.assets]);
  const track = useMemo(() => trackWithContext(snapshot.versionId, classroomId), [snapshot.versionId, classroomId]);

  useEffect(() => {
    track({ eventType: "PAGE_VIEW", chapterId: chapter.id, nodeId: chapter.document.nodes[0]?.nodeId, payload: { mode } });
  }, [bookId, chapter, mode, snapshot.versionId, track]);

  return (
    <article className={`document-flow mode-${mode}`} data-chapter-id={chapter.id}>
      {chapter.document.nodes.map((node) => (
        <section className="node-shell" id={node.nodeId} key={node.nodeId} data-node-id={node.nodeId}>
          {onTeacherSetLocation ? (
            <button className="tiny-action node-teach" type="button" onClick={() => onTeacherSetLocation(chapter.id, node.nodeId)}>
              设为当前教学位置
            </button>
          ) : null}
          {mode === "traditional" ? (
            <TraditionalNode node={node} assets={assets} />
          ) : (
            <DigitalNode
              node={node}
              chapterId={chapter.id}
              bookId={bookId}
              snapshot={snapshot}
              assets={assets}
              track={track}
              annotations={annotations.filter((annotation) => annotation.chapterId === chapter.id && annotation.nodeId === node.nodeId)}
              onNavigate={onNavigate}
            />
          )}
        </section>
      ))}
    </article>
  );
}

function DigitalNode({
  node,
  chapterId,
  bookId,
  snapshot,
  assets,
  track,
  annotations,
  onNavigate
}: {
  node: ContentNode;
  chapterId: string;
  bookId: string;
  snapshot: BookSnapshot;
  assets: Map<string, Asset>;
  track: ReturnType<typeof trackWithContext>;
  annotations: AnnotationRange[];
  onNavigate?: (chapterId: string, nodeId?: string) => void;
}) {
  switch (node.type) {
    case "heading":
      return <HeadingNode node={node} />;
    case "richText":
      return <RichTextNode node={node} chapterId={chapterId} track={track} annotations={annotations} />;
    case "callout":
      return <CalloutNode node={node} />;
    case "imageInteractive":
      return <ImageNode node={node} asset={assets.get(node.assetId)} chapterId={chapterId} track={track} onNavigate={onNavigate} />;
    case "gallery":
      return <GalleryNode node={node} assets={assets} chapterId={chapterId} track={track} />;
    case "audio":
      return <AudioNode node={node} asset={assets.get(node.assetId)} chapterId={chapterId} track={track} />;
    case "video":
      return <VideoNode node={node} asset={assets.get(node.assetId)} caption={node.captionAssetId ? assets.get(node.captionAssetId) : undefined} chapterId={chapterId} track={track} />;
    case "formulaBlock":
      return <FormulaNode node={node} chapterId={chapterId} track={track} />;
    case "chart":
      return <ChartNodeView node={node} chapterId={chapterId} track={track} />;
    case "physicsSimulation":
      return <SimulationNode node={node} chapterId={chapterId} bookId={bookId} snapshot={snapshot} track={track} />;
    case "model3d":
      return <ModelNode node={node} asset={assets.get(node.assetId)} chapterId={chapterId} track={track} />;
    case "panorama":
      return <PanoramaNode node={node} asset={assets.get(node.assetId)} chapterId={chapterId} track={track} />;
    case "extendedReading":
      return <ExtendedReadingNode node={node} chapterId={chapterId} track={track} />;
    case "attachment":
      return <AttachmentNode node={node} asset={assets.get(node.assetId)} chapterId={chapterId} track={track} />;
    case "quizSet":
      return <QuizNode node={node} chapterId={chapterId} bookId={bookId} snapshot={snapshot} assets={assets} track={track} />;
    case "recordingTask":
      return <RecordingNode node={node} chapterId={chapterId} bookId={bookId} snapshot={snapshot} track={track} />;
    case "knowledgeGraph":
      return <KnowledgeGraphNode node={node} chapterId={chapterId} snapshot={snapshot} track={track} onNavigate={onNavigate} />;
    default:
      return <div className="unsupported-node">不支持内容：{JSON.stringify(node)}</div>;
  }
}

function TraditionalNode({ node, assets }: { node: ContentNode; assets: Map<string, Asset> }) {
  if (node.type === "heading") return <HeadingNode node={node} />;
  if (node.type === "richText") return <div className="rich-text traditional-copy" dangerouslySetInnerHTML={{ __html: node.html }} />;
  if (node.type === "callout") return <CalloutNode node={node} />;
  if (node.type === "formulaBlock") return <FormulaNode node={node} chapterId="" track={() => undefined} />;
  if (node.type === "chart") return <ChartNodeView node={node} chapterId="" track={() => undefined} staticOnly />;
  if (node.type === "quizSet") {
    return <TraditionalCard title={node.title} detail={`${node.questions.length} 道练习题，请扫码进入数字教材作答。`} />;
  }
  const assetIds = assetIdsForNode(node);
  const title = "title" in node ? node.title : node.type;
  const resourceNames = assetIds.map((assetId) => assets.get(assetId)?.title ?? assetId).join("、");
  return <TraditionalCard title={title} detail={resourceNames ? `资源二维码 / 外链卡片：${resourceNames}` : "数字互动资源，请扫码查看。"} />;
}

function HeadingNode({ node }: { node: Extract<ContentNode, { type: "heading" }> }) {
  if (node.level === 1) return <h1 className="doc-heading level-1">{node.text}</h1>;
  if (node.level === 2) return <h2 className="doc-heading level-2">{node.text}</h2>;
  if (node.level === 3) return <h3 className="doc-heading level-3">{node.text}</h3>;
  if (node.level === 4) return <h4 className="doc-heading level-4">{node.text}</h4>;
  if (node.level === 5) return <h5 className="doc-heading level-5">{node.text}</h5>;
  return <h6 className="doc-heading level-6">{node.text}</h6>;
}

function RichTextNode({ node, chapterId, track, annotations }: { node: Extract<ContentNode, { type: "richText" }>; chapterId: string; track: ReturnType<typeof trackWithContext>; annotations: AnnotationRange[] }) {
  const [bubble, setBubble] = useState<{ title: string; body: string } | null>(null);
  const html = useMemo(() => applyAnnotationMarksToHtml(node.html, annotations), [annotations, node.html]);
  function onClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target;
    if (target instanceof HTMLElement && target.dataset.term) {
      setBubble({ title: target.dataset.title ?? target.dataset.term, body: target.dataset.body ?? "" });
      track({ eventType: "KNOWLEDGE_BUBBLE_OPEN", chapterId, nodeId: node.nodeId, payload: { term: target.dataset.term } });
    }
  }
  return (
    <div className="rich-text-wrap">
      <div className="rich-text" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
      {bubble ? (
        <div className="inline-popover">
          <strong>{bubble.title}</strong>
          <p>{bubble.body}</p>
          <button type="button" onClick={() => setBubble(null)}>关闭</button>
        </div>
      ) : null}
    </div>
  );
}

function CalloutNode({ node }: { node: Extract<ContentNode, { type: "callout" }> }) {
  return (
    <aside className={`callout ${node.tone}`}>
      <b>{node.title}</b>
      <p>{node.body}</p>
    </aside>
  );
}

function ImageNode({ node, asset, chapterId, track, onNavigate }: { node: Extract<ContentNode, { type: "imageInteractive" }>; asset?: Asset; chapterId: string; track: ReturnType<typeof trackWithContext>; onNavigate?: (chapterId: string, nodeId?: string) => void }) {
  const [hotspot, setHotspot] = useState<(typeof node.hotspots)[number] | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const stageStyle: CSSProperties = { maxWidth: `${node.width}%` };
  if (!asset) return <MissingAsset id={node.assetId} />;
  return (
    <figure className="media-card image-card">
      <div className={`${zoomed ? "image-stage zoomed" : "image-stage"} align-${node.align}`} style={stageStyle}>
        <img src={asset.url} alt={node.alt || asset.title} onClick={() => setZoomed(true)} />
        {node.hotspots.map((item) => (
          <button
            className="hotspot"
            key={item.id ?? item.title}
            type="button"
            style={{ left: `${item.x}%`, top: `${item.y}%` }}
            onClick={() => {
              setHotspot(item);
              track({ eventType: "IMAGE_HOTSPOT_OPEN", chapterId, nodeId: node.nodeId, payload: { title: item.title } });
            }}
            aria-label={item.title}
          />
        ))}
      </div>
      <figcaption>{node.caption}</figcaption>
      <div className="media-actions">
        <button type="button" onClick={() => setZoomed((value) => !value)}><Expand size={16} /> 放大</button>
      </div>
      {hotspot ? (
        <div className="inline-popover">
          <strong>{hotspot.title}</strong>
          <p>{hotspot.body}</p>
          {hotspot.target ? <button type="button" onClick={() => onNavigate?.(hotspot.target ?? chapterId)}>跳转</button> : null}
          <button type="button" onClick={() => setHotspot(null)}>关闭</button>
        </div>
      ) : null}
    </figure>
  );
}

function GalleryNode({ node, assets, chapterId, track }: { node: Extract<ContentNode, { type: "gallery" }>; assets: Map<string, Asset>; chapterId: string; track: ReturnType<typeof trackWithContext> }) {
  const [index, setIndex] = useState(Math.min(node.startIndex, node.assetIds.length - 1));
  const current = assets.get(node.assetIds[index]);
  function go(next: number) {
    const nextIndex = (next + node.assetIds.length) % node.assetIds.length;
    setIndex(nextIndex);
    track({ eventType: "GALLERY_CHANGE", chapterId, nodeId: node.nodeId, payload: { index: nextIndex } });
  }
  if (!current) return <MissingAsset id={node.assetIds[index]} />;
  return (
    <figure className="media-card gallery-card">
      <img src={current.url} alt={current.title} />
      <figcaption>{node.captions[index] ?? current.title}</figcaption>
      <div className="media-actions">
        <button type="button" onClick={() => go(index - 1)}>上一张</button>
        <span>{index + 1} / {node.assetIds.length}</span>
        <button type="button" onClick={() => go(index + 1)}>下一张</button>
      </div>
      <div className="thumbnail-row">
        {node.assetIds.map((assetId, assetIndex) => {
          const asset = assets.get(assetId);
          return asset ? <button className={assetIndex === index ? "active" : ""} key={assetId} type="button" onClick={() => go(assetIndex)}><img src={asset.url} alt={asset.title} /></button> : null;
        })}
      </div>
    </figure>
  );
}

function AudioNode({ node, asset, chapterId, track }: { node: Extract<ContentNode, { type: "audio" }>; asset?: Asset; chapterId: string; track: ReturnType<typeof trackWithContext> }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastProgressAt = useRef(0);
  const [rate, setRate] = useState(1);
  if (!asset) return <MissingAsset id={node.assetId} />;
  function reportProgress(media: HTMLAudioElement) {
    if (media.duration <= 0) return;
    const now = Date.now();
    const progress = media.currentTime / media.duration;
    if (now - lastProgressAt.current < 5000 && progress < 0.98) return;
    lastProgressAt.current = now;
    track({ eventType: "AUDIO_PROGRESS", chapterId, nodeId: node.nodeId, progress });
  }
  function setPlaybackRate(value: number) {
    setRate(value);
    if (audioRef.current) audioRef.current.playbackRate = value;
  }
  return (
    <section className="media-card audio-card">
      <h3><Volume2 size={18} /> {node.title}</h3>
      <audio
        ref={audioRef}
        src={asset.url}
        controls
        onPlay={() => track({ eventType: "AUDIO_PLAY", chapterId, nodeId: node.nodeId })}
        onTimeUpdate={(event) => reportProgress(event.currentTarget)}
        onEnded={() => track({ eventType: "AUDIO_COMPLETE", chapterId, nodeId: node.nodeId, progress: 1 })}
      />
      <div className="media-actions">
        {[0.75, 1, 1.25, 1.5, 2].map((value) => <button className={rate === value ? "active" : ""} key={value} type="button" onClick={() => setPlaybackRate(value)}>{value}x</button>)}
        {node.chapters.map((chapter) => <button key={chapter.label} type="button" onClick={() => { if (audioRef.current) audioRef.current.currentTime = chapter.time; }}>{chapter.label}</button>)}
      </div>
      <details>
        <summary>展开文字稿</summary>
        <p>{node.transcript}</p>
      </details>
    </section>
  );
}

function VideoNode({ node, asset, caption, chapterId, track }: { node: Extract<ContentNode, { type: "video" }>; asset?: Asset; caption?: Asset; chapterId: string; track: ReturnType<typeof trackWithContext> }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastProgressAt = useRef(0);
  if (!asset) return <MissingAsset id={node.assetId} />;
  function reportProgress(media: HTMLVideoElement) {
    if (media.duration <= 0) return;
    const now = Date.now();
    const progress = media.currentTime / media.duration;
    if (now - lastProgressAt.current < 5000 && progress < 0.98) return;
    lastProgressAt.current = now;
    track({ eventType: "VIDEO_PROGRESS", chapterId, nodeId: node.nodeId, progress });
  }
  return (
    <section className="media-card video-card">
      <h3>{node.title}</h3>
      <video
        ref={videoRef}
        src={asset.url}
        controls
        playsInline
        onPlay={() => track({ eventType: "VIDEO_PLAY", chapterId, nodeId: node.nodeId })}
        onTimeUpdate={(event) => reportProgress(event.currentTarget)}
        onEnded={() => track({ eventType: "VIDEO_COMPLETE", chapterId, nodeId: node.nodeId, progress: 1 })}
      >
        {caption ? <track src={caption.url} kind="subtitles" srcLang="zh" label="中文字幕" default /> : null}
      </video>
      <p>{node.caption}</p>
      <div className="media-actions">
        {[0.75, 1, 1.25, 1.5, 2].map((rate) => <button key={rate} type="button" onClick={() => { if (videoRef.current) videoRef.current.playbackRate = rate; }}>{rate}x</button>)}
        <button type="button" onClick={() => videoRef.current?.requestFullscreen()}><Expand size={16} /> 全屏</button>
      </div>
      <div className="transcript-list">
        {node.transcript.map((cue) => <button key={cue.time} type="button" onClick={() => { if (videoRef.current) videoRef.current.currentTime = cue.time; }}>{cue.time}s {cue.text}</button>)}
      </div>
    </section>
  );
}

function FormulaNode({ node, chapterId, track }: { node: Extract<ContentNode, { type: "formulaBlock" }>; chapterId: string; track: ReturnType<typeof trackWithContext> }) {
  const [force, setForce] = useState(node.parameterDemo?.force ?? 6);
  const [mass, setMass] = useState(node.parameterDemo?.mass ?? 2);
  const html = katex.renderToString(node.latex, { throwOnError: false, displayMode: true });
  return (
    <section className="formula-card">
      <button className="copy-latex" type="button" onClick={() => { void navigator.clipboard?.writeText(node.latex); track({ eventType: "FORMULA_COPY", chapterId, nodeId: node.nodeId }); }}>复制 LaTeX</button>
      <div dangerouslySetInnerHTML={{ __html: html }} />
      <p>{node.number ? `(${node.number}) ` : ""}{node.caption}</p>
      {node.parameterDemo ? (
        <div className="formula-demo">
          <label>F <input type="number" value={force} onChange={(event) => setForce(Number(event.target.value))} /></label>
          <label>m <input type="number" value={mass} min={0.1} onChange={(event) => setMass(Number(event.target.value))} /></label>
          <span>a = F / m = {(force / mass).toFixed(2)} m/s²</span>
        </div>
      ) : null}
    </section>
  );
}

function ChartNodeView({ node, chapterId, track, staticOnly = false }: { node: ChartNode; chapterId: string; track: ReturnType<typeof trackWithContext>; staticOnly?: boolean }) {
  const [hidden, setHidden] = useState(false);
  const max = Math.max(...node.items.map((item) => item.value), 1);
  const width = 620;
  const height = 260;
  const points = node.items.map((item, index) => {
    const x = 50 + (index / Math.max(node.items.length - 1, 1)) * (width - 100);
    const y = height - 40 - (item.value / max) * (height - 90);
    return { ...item, x, y };
  });
  return (
    <section className={`media-card chart-card ${node.theme}`}>
      <h3>{node.title}</h3>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={node.title}>
        <line x1="45" y1="25" x2="45" y2={height - 40} />
        <line x1="45" y1={height - 40} x2={width - 30} y2={height - 40} />
        {!hidden && node.chartType === "line" ? <polyline points={points.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke={node.color} strokeWidth="4" /> : null}
        {!hidden && points.map((point) => (
          <g key={point.label}>
            {node.chartType === "bar" ? <rect x={point.x - 20} y={point.y} width="40" height={height - 40 - point.y} fill={node.color} /> : <circle cx={point.x} cy={point.y} r="7" fill={node.color} />}
            <title>{point.label}: {point.value}</title>
            <text x={point.x} y={height - 18} textAnchor="middle">{point.label}</text>
            <text x={point.x} y={point.y - 10} textAnchor="middle">{point.value}</text>
          </g>
        ))}
      </svg>
      <div className="media-actions">
        {node.showLegend ? <button type="button" onClick={() => { setHidden((value) => !value); track({ eventType: "CHART_INTERACT", chapterId, nodeId: node.nodeId, payload: { action: "legend-toggle" } }); }}>图例筛选</button> : null}
        {!staticOnly ? <button type="button" onClick={() => downloadChartSvg(node.nodeId)}><Download size={16} /> 下载 PNG</button> : null}
      </div>
    </section>
  );
}

function SimulationNode({ node, chapterId, bookId, snapshot, track }: { node: PhysicsSimulationNode; chapterId: string; bookId: string; snapshot: BookSnapshot; track: ReturnType<typeof trackWithContext> }) {
  const [force, setForce] = useState(node.force.default);
  const [mass, setMass] = useState(node.mass.default);
  const [running, setRunning] = useState(false);
  const [time, setTime] = useState(0);
  const a = acceleration(force, mass);
  useEffect(() => {
    if (!running) return undefined;
    const started = performance.now() - time * 1000;
    let frame = 0;
    function tick(now: number) {
      setTime(Math.min(5, (now - started) / 1000));
      frame = window.requestAnimationFrame(tick);
    }
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [running, time]);
  useEffect(() => {
    if (time >= 5) setRunning(false);
  }, [time]);
  const samples = sampleMotion(force, mass, Math.max(1, time), 0.5);
  const position = Math.min(88, 8 + 0.5 * a * time * time * 5);
  async function save() {
    await fetch(`/api/reader/books/${bookId}/experiments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookVersionId: snapshot.versionId, chapterId, nodeId: node.nodeId, force, mass })
    });
    track({ eventType: "SIMULATION_SAVE", chapterId, nodeId: node.nodeId, payload: { force, mass, acceleration: a } });
  }
  return (
    <section className="media-card simulation-card">
      <h3>{node.title}</h3>
      <p>{node.prompt}</p>
      <div className="sim-controls">
        <label>力 F: {force}N<input type="range" min={node.force.min} max={node.force.max} step={node.force.step} value={force} onChange={(event) => { setForce(Number(event.target.value)); track({ eventType: "SIMULATION_PARAMETER_CHANGE", chapterId, nodeId: node.nodeId, payload: { force: Number(event.target.value), mass } }); }} /></label>
        <label>质量 m: {mass}kg<input type="range" min={node.mass.min} max={node.mass.max} step={node.mass.step} value={mass} onChange={(event) => { setMass(Number(event.target.value)); track({ eventType: "SIMULATION_PARAMETER_CHANGE", chapterId, nodeId: node.nodeId, payload: { force, mass: Number(event.target.value) } }); }} /></label>
      </div>
      <div className="sim-track">
        <div className="sim-cart" style={{ left: `${position}%` }}>小车</div>
      </div>
      <div className="formula-strip">F={force}N　m={mass}kg　a=F/m={a.toFixed(2)}m/s²　t={time.toFixed(1)}s</div>
      <svg className="sim-curve" viewBox="0 0 500 160">
        <polyline fill="none" stroke="#db5b30" strokeWidth="4" points={samples.map((sample, index) => `${20 + index * 42},${140 - Math.min(120, sample.velocity * 16)}`).join(" ")} />
        <text x="18" y="20">v-t 曲线</text>
      </svg>
      <div className="media-actions">
        <button type="button" onClick={() => { setRunning(true); track({ eventType: "SIMULATION_RUN", chapterId, nodeId: node.nodeId, payload: { force, mass } }); }}><Play size={16} /> 开始</button>
        <button type="button" onClick={() => setRunning(false)}><Pause size={16} /> 暂停</button>
        <button type="button" onClick={() => { setRunning(false); setTime(0); }}><RotateCcw size={16} /> 重置</button>
        <button type="button" onClick={() => void save()}><Save size={16} /> 保存实验数据</button>
      </div>
    </section>
  );
}

function ModelNode({ node, asset, chapterId, track }: { node: Extract<ContentNode, { type: "model3d" }>; asset?: Asset; chapterId: string; track: ReturnType<typeof trackWithContext> }) {
  const [auto, setAuto] = useState(node.autoRotate);
  const [hotspot, setHotspot] = useState<(typeof node.hotspots)[number] | null>(null);
  useEffect(() => {
    void import("@google/model-viewer");
  }, []);
  if (!asset) return <MissingAsset id={node.assetId} />;
  return (
    <section className="media-card model-card">
      <h3>{node.title}</h3>
      <model-viewer src={asset.url} alt={node.title} poster="/api/assets/asset_forceDiagram/file" reveal="auto" camera-controls auto-rotate={auto ? "true" : undefined} interaction-prompt="none" shadow-intensity="0.5" onMouseDown={() => track({ eventType: "MODEL3D_INTERACT", chapterId, nodeId: node.nodeId, payload: { action: "drag" } })} />
      <p>{node.description}</p>
      <div className="media-actions">
        <button type="button" onClick={() => setAuto((value) => !value)}>自动旋转 {auto ? "开" : "关"}</button>
        <button type="button" onClick={() => track({ eventType: "MODEL3D_INTERACT", chapterId, nodeId: node.nodeId, payload: { action: "reset" } })}><RotateCcw size={16} /> 重置视角</button>
        {node.hotspots.map((item) => <button key={item.id ?? item.title} type="button" onClick={() => { setHotspot(item); track({ eventType: "MODEL3D_INTERACT", chapterId, nodeId: node.nodeId, payload: { hotspot: item.title } }); }}>{item.title}</button>)}
      </div>
      {hotspot ? <div className="inline-popover"><strong>{hotspot.title}</strong><p>{hotspot.body}</p><button type="button" onClick={() => setHotspot(null)}>关闭</button></div> : null}
    </section>
  );
}

function PanoramaNode({ node, asset, chapterId, track }: { node: Extract<ContentNode, { type: "panorama" }>; asset?: Asset; chapterId: string; track: ReturnType<typeof trackWithContext> }) {
  const [yaw, setYaw] = useState(node.initialYaw);
  const [zoom, setZoom] = useState(100);
  const [hotspot, setHotspot] = useState<(typeof node.hotspots)[number] | null>(null);
  const dragging = useRef(false);
  if (!asset) return <MissingAsset id={node.assetId} />;
  return (
    <section className="media-card panorama-card">
      <h3>{node.title}</h3>
      <div
        className="panorama-stage"
        style={{ backgroundImage: `url(${asset.url})`, backgroundPositionX: `${50 + yaw / 3.6}%`, backgroundSize: `${zoom}% auto` }}
        onPointerDown={() => { dragging.current = true; track({ eventType: "PANORAMA_OPEN", chapterId, nodeId: node.nodeId }); }}
        onPointerUp={() => { dragging.current = false; }}
        onPointerLeave={() => { dragging.current = false; }}
        onPointerMove={(event) => { if (dragging.current) setYaw((value) => Math.max(-180, Math.min(180, value + event.movementX * -0.4))); }}
      >
        {node.hotspots.map((item) => (
          <button
            className="hotspot panorama-hotspot"
            key={item.id ?? item.title}
            type="button"
            style={{ left: `${50 + item.yaw / 3.6}%`, top: `${50 - item.pitch / 1.8}%` }}
            onClick={() => { setHotspot(item); track({ eventType: "PANORAMA_HOTSPOT_OPEN", chapterId, nodeId: node.nodeId, payload: { title: item.title } }); }}
          />
        ))}
      </div>
      <div className="media-actions">
        <label>缩放 <input type="range" min="100" max="180" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label>
        <button type="button" onClick={() => setYaw(node.initialYaw)}><RotateCcw size={16} /> 重置视角</button>
      </div>
      {hotspot ? <div className="inline-popover"><strong>{hotspot.title}</strong><p>{hotspot.body}</p><button type="button" onClick={() => setHotspot(null)}>关闭</button></div> : null}
    </section>
  );
}

function ExtendedReadingNode({ node, chapterId, track }: { node: Extract<ContentNode, { type: "extendedReading" }>; chapterId: string; track: ReturnType<typeof trackWithContext> }) {
  return (
    <details className="media-card extension-card" onToggle={(event) => { if (event.currentTarget.open) track({ eventType: "KNOWLEDGE_BUBBLE_OPEN", chapterId, nodeId: node.nodeId, payload: { title: node.title } }); }}>
      <summary>{node.title}<span>{node.summary}</span></summary>
      <p>{node.body}</p>
      <div className="tag-row">{node.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
    </details>
  );
}

interface AssetPreviewPayload {
  mode: "pdf" | "html" | "spreadsheet" | "package" | "specialist" | "download";
  title: string;
  html?: string;
  fileUrl?: string;
  message?: string;
  adapter: string;
}

function AttachmentNode({ node, asset, chapterId, track }: { node: Extract<ContentNode, { type: "attachment" }>; asset?: Asset; chapterId: string; track: ReturnType<typeof trackWithContext> }) {
  const [preview, setPreview] = useState<AssetPreviewPayload | null>(null);
  useEffect(() => {
    if (!node.preview || !asset) return undefined;
    let mounted = true;
    void fetch(`/api/assets/${asset.id}/preview`).then(async (response) => {
      if (!response.ok || !mounted) return;
      const json = await response.json() as { preview: AssetPreviewPayload };
      setPreview(json.preview);
      track({ eventType: "ATTACHMENT_OPEN", chapterId, nodeId: node.nodeId, payload: { assetId: asset.id, title: node.title, adapter: json.preview.adapter, mode: json.preview.mode } });
    });
    return () => {
      mounted = false;
    };
  }, [asset, chapterId, node.nodeId, node.preview, track]);
  if (!asset) return <MissingAsset id={node.assetId} />;
  return (
    <section className="media-card attachment-card">
      <h3>{node.title}</h3>
      {node.preview && preview?.mode === "pdf" ? <iframe title={node.title} src={preview.fileUrl ?? asset.url} /> : null}
      {node.preview && (preview?.mode === "html" || preview?.mode === "spreadsheet") ? <div className="file-preview-html" dangerouslySetInnerHTML={{ __html: preview.html ?? "" }} /> : null}
      {node.preview && preview && ["package", "specialist", "download"].includes(preview.mode) ? <p>{preview.message ?? `${asset.originalName} 可下载查看。`}</p> : null}
      {node.preview && !preview ? <p>正在生成本地预览...</p> : null}
      {!node.preview ? <p>{asset.originalName} 可下载查看。</p> : null}
      <div className="media-actions">
        <a href={asset.url} target="_blank" rel="noreferrer"><Expand size={16} /> 打开/全屏</a>
        <a href={asset.url} download><Download size={16} /> 下载</a>
      </div>
    </section>
  );
}

function QuizNode({ node, chapterId, bookId, snapshot, assets, track }: { node: QuizSetNode; chapterId: string; bookId: string; snapshot: BookSnapshot; assets: Map<string, Asset>; track: ReturnType<typeof trackWithContext> }) {
  const [answers, setAnswers] = useState<Record<string, string | number | boolean | number[]>>({});
  const [result, setResult] = useState<{ score: number; maxScore: number; correctQuestionIds: string[] } | null>(null);
  async function submit() {
    const response = await fetch(`/api/reader/books/${bookId}/quiz-attempts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookVersionId: snapshot.versionId, chapterId, nodeId: node.nodeId, answers, durationSeconds: 80 })
    });
    const json = await response.json() as { score: number; maxScore: number; correctQuestionIds: string[] };
    setResult(json);
    track({ eventType: "QUIZ_SUBMIT", chapterId, nodeId: node.nodeId, payload: { score: json.score } });
  }
  return (
    <section className="media-card quiz-card">
      <h3>{node.title}</h3>
      {node.questions.map((question, index) => (
        <QuestionView key={question.id} question={question} index={index} value={answers[question.id]} onChange={(value) => setAnswers((current) => ({ ...current, [question.id]: value }))} result={result} assets={assets} />
      ))}
      <div className="media-actions">
        <button type="button" onClick={() => void submit()}>提交并即时判分</button>
        {node.allowRetry ? <button type="button" onClick={() => { setAnswers({}); setResult(null); }}>重做</button> : null}
        {result ? <strong>得分 {result.score}/{result.maxScore}</strong> : null}
      </div>
    </section>
  );
}

function QuestionView({ question, index, value, onChange, result, assets }: { question: QuizQuestion; index: number; value: string | number | boolean | number[] | undefined; onChange: (value: string | number | boolean | number[]) => void; result: { correctQuestionIds: string[] } | null; assets: Map<string, Asset> }) {
  const correct = result?.correctQuestionIds.includes(question.id);
  const ordering = question.type === "ordering" ? (Array.isArray(value) && value.length === question.items.length ? value : question.items.map((_, itemIndex) => itemIndex)) : [];
  const matching = question.type === "matching" ? (Array.isArray(value) && value.length === question.leftItems.length ? value : question.leftItems.map(() => -1)) : [];
  function moveOrdering(from: number, to: number) {
    const next = [...ordering];
    const [item] = next.splice(from, 1);
    if (item === undefined) return;
    next.splice(to, 0, item);
    onChange(next);
  }
  return (
    <div className={`question ${result ? (correct ? "correct" : "wrong") : ""}`}>
      <p><b>{index + 1}.</b> {question.question}</p>
      <QuestionMediaList question={question} assets={assets} />
      {question.type === "single" || question.type === "multiple" ? (
        <div className="option-grid">
          {question.options.map((option, optionIndex) => (
            <label key={option}>
              <input
                type={question.type === "single" ? "radio" : "checkbox"}
                checked={question.type === "single" ? value === optionIndex : Array.isArray(value) && value.includes(optionIndex)}
                onChange={(event) => {
                  if (question.type === "single") onChange(optionIndex);
                  else {
                    const current = Array.isArray(value) ? value : [];
                    onChange(event.currentTarget.checked ? [...current, optionIndex] : current.filter((item) => item !== optionIndex));
                  }
                }}
              />
              {option}
            </label>
          ))}
        </div>
      ) : null}
      {question.type === "boolean" ? (
        <div className="option-grid">
          <label><input type="radio" checked={value === true} onChange={() => onChange(true)} /> 正确</label>
          <label><input type="radio" checked={value === false} onChange={() => onChange(false)} /> 错误</label>
        </div>
      ) : null}
      {question.type === "fill" ? <input className="fill-input" value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)} placeholder="输入答案" /> : null}
      {question.type === "ordering" ? (
        <div className="ordering-answer">
          {ordering.map((itemIndex, orderIndex) => (
            <div className="ordering-row" key={`${question.id}-${itemIndex}`}>
              <span>{orderIndex + 1}</span>
              <b>{question.items[itemIndex]}</b>
              <button type="button" disabled={orderIndex === 0} onClick={() => moveOrdering(orderIndex, orderIndex - 1)}>上移</button>
              <button type="button" disabled={orderIndex === ordering.length - 1} onClick={() => moveOrdering(orderIndex, orderIndex + 1)}>下移</button>
            </div>
          ))}
        </div>
      ) : null}
      {question.type === "matching" ? (
        <div className="matching-answer">
          {question.leftItems.map((left, leftIndex) => (
            <label key={left}>
              <span>{left}</span>
              <select value={matching[leftIndex] ?? -1} onChange={(event) => {
                const next = [...matching];
                next[leftIndex] = Number(event.target.value);
                onChange(next);
              }}>
                <option value={-1}>选择对应项</option>
                {question.rightItems.map((right, rightIndex) => <option key={right} value={rightIndex}>{right}</option>)}
              </select>
            </label>
          ))}
        </div>
      ) : null}
      {question.type === "shortAnswer" ? (
        <textarea className="short-answer" value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)} placeholder="写出完整推理过程，提交后由教师按 rubric 批改" />
      ) : null}
      {result ? <p className="explain">解析：{question.explanation}</p> : null}
    </div>
  );
}

function QuestionMediaList({ question, assets }: { question: QuizQuestion; assets: Map<string, Asset> }) {
  if (!question.media.length) return null;
  return (
    <div className="question-media-list">
      {question.media.map((media) => {
        const asset = assets.get(media.assetId);
        const url = asset?.url ?? `/api/assets/${media.assetId}/file`;
        return (
          <a key={`${question.id}-${media.assetId}`} href={url} target="_blank" rel="noreferrer">
            <span>{media.kind}</span>
            <b>{media.title}</b>
            {media.caption ? <small>{media.caption}</small> : null}
          </a>
        );
      })}
    </div>
  );
}

function RecordingNode({ node, chapterId, bookId, snapshot, track }: { node: Extract<ContentNode, { type: "recordingTask" }>; chapterId: string; bookId: string; snapshot: BookSnapshot; track: ReturnType<typeof trackWithContext> }) {
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [chunks, setChunks] = useState<Blob[]>([]);
  const [url, setUrl] = useState<string | null>(null);
  const [status, setStatus] = useState("未开始");
  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (event) => setChunks((current) => [...current, event.data]);
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: "audio/webm" });
        setUrl(URL.createObjectURL(blob));
      };
      setChunks([]);
      recorder.start();
      setMediaRecorder(recorder);
      setStatus("录音中");
    } catch {
      setStatus("麦克风权限不可用，可提交示例片段验证链路。");
    }
  }
  function stop() {
    mediaRecorder?.stop();
    mediaRecorder?.stream.getTracks().forEach((trackItem) => trackItem.stop());
    setStatus("已结束，可回放并提交");
  }
  async function submit() {
    const form = new FormData();
    const blob = chunks.length ? new Blob(chunks, { type: "audio/webm" }) : new Blob(["demo recording"], { type: "audio/webm" });
    form.set("file", blob, "recording.webm");
    form.set("bookVersionId", snapshot.versionId);
    form.set("chapterId", chapterId);
    form.set("nodeId", node.nodeId);
    form.set("durationSeconds", String(Math.max(1, node.recommendedSeconds)));
    await fetch(`/api/reader/books/${bookId}/recordings`, { method: "POST", body: form });
    setStatus("已提交到学习报告");
    track({ eventType: "RECORDING_SUBMIT", chapterId, nodeId: node.nodeId, durationSeconds: node.recommendedSeconds });
  }
  return (
    <section className="media-card recording-card">
      <h3><Mic size={18} /> {node.title}</h3>
      <p>{node.prompt}</p>
      <p>建议时长：{node.recommendedSeconds}s</p>
      <div className="media-actions">
        <button type="button" onClick={() => void start()}>开始录音</button>
        <button type="button" onClick={stop}>结束</button>
        <button type="button" onClick={() => void submit()}>提交录音</button>
      </div>
      <p>{status}</p>
      {url ? <audio src={url} controls /> : null}
    </section>
  );
}

type GraphMode = "map" | "path" | "quiz";

interface GraphTarget {
  chapterId: string;
  chapterTitle: string;
  nodeId?: string;
  nodeTitle?: string;
  questions: QuizSetNode["questions"];
}

function KnowledgeGraphNode({ node, chapterId, snapshot, track, onNavigate }: { node: Extract<ContentNode, { type: "knowledgeGraph" }>; chapterId: string; snapshot: BookSnapshot; track: ReturnType<typeof trackWithContext>; onNavigate?: (chapterId: string, nodeId?: string) => void }) {
  const [filter, setFilter] = useState("");
  const [mode, setMode] = useState<GraphMode>("map");
  const normalizedFilter = filter.trim().toLowerCase();
  const filtered = node.nodes.filter((item) => !normalizedFilter || `${item.label} ${item.type}`.toLowerCase().includes(normalizedFilter));
  const positions = filtered.map((item, index) => ({ ...item, x: item.x ?? 120 + (index % 3) * 190, y: item.y ?? 90 + Math.floor(index / 3) * 110 }));
  const quizLinks = filtered.filter((item) => item.type === "quiz").map((item) => ({
    item,
    target: resolveGraphTarget(item.target, snapshot, chapterId, item.type)
  }));

  function openGraphNode(item: Extract<ContentNode, { type: "knowledgeGraph" }>["nodes"][number]) {
    const target = resolveGraphTarget(item.target, snapshot, chapterId, item.type);
    track({ eventType: "KNOWLEDGE_GRAPH_NODE_OPEN", chapterId, nodeId: node.nodeId, payload: { graphNode: item.id, mode, target } });
    onNavigate?.(target.chapterId, target.nodeId);
  }

  return (
    <section className="media-card graph-card">
      <h3>{node.title}</h3>
      <div className="graph-tools">
        <div className="mode-toggle" role="tablist">
          <button className={mode === "map" ? "active" : ""} type="button" onClick={() => setMode("map")}>关系图</button>
          <button className={mode === "path" ? "active" : ""} type="button" onClick={() => setMode("path")}>学习路径</button>
          <button className={mode === "quiz" ? "active" : ""} type="button" onClick={() => setMode("quiz")}>习题联动</button>
        </div>
        <label className="search-inline"><Search size={16} /> <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="搜索图谱节点" /></label>
      </div>
      {mode === "map" ? (
        <svg viewBox="0 0 680 310">
          {node.edges.map((edge) => {
            const source = positions.find((item) => item.id === edge.source);
            const target = positions.find((item) => item.id === edge.target);
            return source && target ? <g key={`${edge.source}-${edge.target}`}><line x1={source.x} y1={source.y} x2={target.x} y2={target.y} /><text x={(source.x + target.x) / 2} y={(source.y + target.y) / 2}>{edge.label}</text></g> : null;
          })}
          {positions.map((item) => (
            <g key={item.id} className={`graph-node ${item.type}`} onClick={() => openGraphNode(item)}>
              <circle cx={item.x} cy={item.y} r="42" />
              <text x={item.x} y={item.y + 5} textAnchor="middle">{item.label}</text>
            </g>
          ))}
        </svg>
      ) : null}
      {mode === "path" ? (
        <ol className="graph-path-list">
          {filtered.map((item, index) => (
            <li key={item.id}>
              <span>{index + 1}</span>
              <strong>{item.label}</strong>
              <small>{graphTypeLabel(item.type)}</small>
              <button type="button" onClick={() => openGraphNode(item)}>定位原文</button>
            </li>
          ))}
        </ol>
      ) : null}
      {mode === "quiz" ? (
        <div className="graph-link-panel">
          {quizLinks.length > 0 ? quizLinks.map(({ item, target }) => (
            <article key={item.id}>
              <h4><ClipboardList size={16} /> {item.label}</h4>
              <p>已关联到 {target.chapterTitle}{target.nodeTitle ? ` · ${target.nodeTitle}` : ""}</p>
              {target.questions.length ? <ul>{target.questions.map((question) => <li key={question.id}>{question.question}</li>)}</ul> : null}
              <button type="button" onClick={() => openGraphNode(item)}>打开习题</button>
            </article>
          )) : <p>当前筛选下没有习题节点。</p>}
        </div>
      ) : null}
    </section>
  );
}

function resolveGraphTarget(target: string | undefined, snapshot: BookSnapshot, fallbackChapterId: string, nodeType: "concept" | "formula" | "experiment" | "quiz"): GraphTarget {
  const fallbackChapter = snapshot.chapters.find((chapter) => chapter.id === fallbackChapterId) ?? snapshot.chapters[0];
  const fallback = {
    chapterId: fallbackChapter?.id ?? fallbackChapterId,
    chapterTitle: fallbackChapter?.title ?? fallbackChapterId,
    nodeId: undefined as string | undefined,
    nodeTitle: undefined as string | undefined,
    questions: [] as QuizSetNode["questions"]
  };
  if (!target) return fallback;
  if (target.includes("#")) {
    const [chapterPart, nodePart] = target.split("#");
    const chapter = snapshot.chapters.find((item) => item.id === (chapterPart || fallbackChapterId));
    const node = chapter?.document.nodes.find((item) => item.nodeId === nodePart);
    return graphTargetFrom(chapter, node, fallback);
  }
  const chapter = snapshot.chapters.find((item) => item.id === target);
  if (chapter) {
    return graphTargetFrom(chapter, preferredGraphNode(chapter, nodeType), fallback);
  }
  const chapterByNode = snapshot.chapters.find((item) => item.document.nodes.some((contentNode) => contentNode.nodeId === target));
  const contentNode = chapterByNode?.document.nodes.find((item) => item.nodeId === target);
  return graphTargetFrom(chapterByNode, contentNode, fallback);
}

function graphTargetFrom(chapter: SnapshotChapter | undefined, node: ContentNode | undefined, fallback: GraphTarget): GraphTarget {
  if (!chapter) return fallback;
  return {
    chapterId: chapter.id,
    chapterTitle: chapter.title,
    nodeId: node?.nodeId,
    nodeTitle: node && "title" in node ? node.title : undefined,
    questions: node?.type === "quizSet" ? node.questions : []
  };
}

function preferredGraphNode(chapter: SnapshotChapter, nodeType: "concept" | "formula" | "experiment" | "quiz"): ContentNode | undefined {
  if (nodeType === "quiz") return chapter.document.nodes.find((node) => node.type === "quizSet");
  if (nodeType === "experiment") return chapter.document.nodes.find((node) => node.type === "physicsSimulation");
  if (nodeType === "formula") return chapter.document.nodes.find((node) => node.type === "formulaBlock");
  return chapter.document.nodes.find((node) => node.type === "heading" || node.type === "richText");
}

function graphTypeLabel(type: "concept" | "formula" | "experiment" | "quiz"): string {
  return { concept: "概念", formula: "公式", experiment: "实验", quiz: "习题" }[type];
}

function TraditionalCard({ title, detail }: { title: string; detail: string }) {
  return (
    <aside className="traditional-card">
      <div className="qr-mark" aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
    </aside>
  );
}

function MissingAsset({ id }: { id: string }) {
  return <div className="missing-asset">资源缺失：{id}</div>;
}

function assetIdsForNode(node: ContentNode): string[] {
  if (node.type === "imageInteractive") return [node.assetId];
  if (node.type === "gallery") return node.assetIds;
  if (node.type === "audio") return [node.assetId];
  if (node.type === "video") return [node.assetId];
  if (node.type === "model3d" || node.type === "panorama" || node.type === "attachment") return [node.assetId];
  return [];
}

function downloadChartSvg(nodeId: string): void {
  const element = document.querySelector<SVGElement>(`#${CSS.escape(nodeId)} svg`);
  if (!element) return;
  const blob = new Blob([element.outerHTML], { type: "image/svg+xml" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "chart.svg";
  link.click();
  URL.revokeObjectURL(link.href);
}
