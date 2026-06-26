"use client";

import { useMemo, useState } from "react";
import { GitBranch, Plus, Save, Search, Trash2 } from "lucide-react";

interface MindMapNode {
  id: string;
  label: string;
  kind: "root" | "chapter" | "note" | "concept" | "question";
  weight: number;
  x?: number;
  y?: number;
}

interface MindMapEdge {
  source: string;
  target: string;
  label: string;
}

interface MindMap {
  nodes: MindMapNode[];
  edges: MindMapEdge[];
}

interface PositionedMindMapNode extends MindMapNode {
  x: number;
  y: number;
}

export function MindMapClient({ bookId, initialMindMap }: { bookId: string; initialMindMap: MindMap }) {
  const [mindMap, setMindMap] = useState(initialMindMap);
  const [selectedId, setSelectedId] = useState(initialMindMap.nodes[0]?.id ?? "root");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("已从笔记生成");
  const positioned = useMemo(() => layoutMindMap(mindMap), [mindMap]);
  const selected = mindMap.nodes.find((node) => node.id === selectedId) ?? mindMap.nodes[0];
  const visibleIds = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return new Set(mindMap.nodes.map((node) => node.id));
    const matches = new Set(mindMap.nodes.filter((node) => `${node.label} ${node.kind}`.toLowerCase().includes(needle)).map((node) => node.id));
    matches.add("root");
    for (const edge of mindMap.edges) {
      if (matches.has(edge.source)) matches.add(edge.target);
      if (matches.has(edge.target)) matches.add(edge.source);
    }
    return matches;
  }, [mindMap, query]);
  const byId = new Map(positioned.map((node) => [node.id, node]));

  function updateSelected(patch: Partial<MindMapNode>) {
    if (!selected) return;
    setMindMap((current) => ({
      nodes: current.nodes.map((node) => node.id === selected.id ? { ...node, ...patch } : node),
      edges: current.edges
    }));
    setStatus("有未保存修改");
  }

  function addNode() {
    const parent = selected ?? mindMap.nodes[0];
    const parentPosition = positioned.find((node) => node.id === parent?.id);
    const node: MindMapNode = {
      id: `custom:${Date.now()}`,
      label: "新知识点",
      kind: "concept",
      weight: 2,
      x: (parentPosition?.x ?? 420) + 110,
      y: (parentPosition?.y ?? 250) + 40
    };
    setMindMap((current) => ({
      nodes: [...current.nodes, node],
      edges: [...current.edges, { source: parent?.id ?? "root", target: node.id, label: "延伸" }]
    }));
    setSelectedId(node.id);
    setStatus("有未保存修改");
  }

  function deleteSelected() {
    if (!selected || selected.id === "root") return;
    setMindMap((current) => ({
      nodes: current.nodes.filter((node) => node.id !== selected.id),
      edges: current.edges.filter((edge) => edge.source !== selected.id && edge.target !== selected.id)
    }));
    setSelectedId("root");
    setStatus("有未保存修改");
  }

  async function save() {
    setStatus("正在保存");
    const response = await fetch(`/api/reader/books/${bookId}/mindmap`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mindMap)
    });
    if (!response.ok) {
      setStatus("保存失败");
      return;
    }
    const json = await response.json() as { mindMap: MindMap };
    setMindMap(json.mindMap);
    setStatus("已保存到数据库");
  }

  return (
    <section className="mindmap-workbench">
      <div className="mindmap-toolbar">
        <label><Search size={16} /> <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索脑图节点" /></label>
        <button type="button" onClick={addNode}><Plus size={16} /> 添加节点</button>
        <button type="button" onClick={() => void save()}><Save size={16} /> 保存脑图</button>
        <span>{status}</span>
      </div>
      <div className="mindmap-editor">
        <svg viewBox="0 0 840 520" role="img" aria-label="可编辑笔记思维导图">
          {mindMap.edges.map((edge) => {
            const source = byId.get(edge.source);
            const target = byId.get(edge.target);
            const visible = visibleIds.has(edge.source) && visibleIds.has(edge.target);
            return source && target && visible ? (
              <g key={`${edge.source}-${edge.target}-${edge.label}`}>
                <line x1={source.x} y1={source.y} x2={target.x} y2={target.y} />
                <text x={(source.x + target.x) / 2} y={(source.y + target.y) / 2}>{edge.label}</text>
              </g>
            ) : null;
          })}
          {positioned.filter((node) => visibleIds.has(node.id)).map((node) => (
            <g
              className={`mind-node ${node.kind}${node.id === selected?.id ? " selected" : ""}`}
              key={node.id}
              transform={`translate(${node.x} ${node.y})`}
              onClick={() => setSelectedId(node.id)}
              role="button"
              tabIndex={0}
            >
              <circle r={node.kind === "root" ? 46 : 30 + node.weight * 3} />
              <text textAnchor="middle" y="5">{node.label}</text>
            </g>
          ))}
        </svg>
        <aside className="mindmap-inspector">
          <h2><GitBranch size={17} /> 编辑脑图</h2>
          {selected ? (
            <>
              <label>节点名称<input value={selected.label} onChange={(event) => updateSelected({ label: event.target.value })} /></label>
              <label>节点类型
                <select value={selected.kind} onChange={(event) => updateSelected({ kind: event.target.value as MindMapNode["kind"] })} disabled={selected.id === "root"}>
                  <option value="root">中心</option>
                  <option value="chapter">章节</option>
                  <option value="note">笔记</option>
                  <option value="concept">概念</option>
                  <option value="question">习题</option>
                </select>
              </label>
              <label>权重 {selected.weight}<input type="range" min="1" max="8" value={selected.weight} onChange={(event) => updateSelected({ weight: Number(event.target.value) })} /></label>
              {selected.id.startsWith("chapter:") ? <a className="primary-link" href={`/reader/books/${bookId}?chapter=${selected.id.replace("chapter:", "")}`}>打开对应原文</a> : null}
              <button type="button" onClick={deleteSelected} disabled={selected.id === "root"}><Trash2 size={16} /> 删除节点</button>
            </>
          ) : <p>选择一个节点开始编辑。</p>}
        </aside>
      </div>
    </section>
  );
}

function layoutMindMap(mindMap: MindMap): PositionedMindMapNode[] {
  const centerX = 420;
  const centerY = 250;
  return mindMap.nodes.map((node, index) => {
    if (typeof node.x === "number" && typeof node.y === "number") return { ...node, x: roundCoord(node.x), y: roundCoord(node.y) };
    if (node.id === "root") return { ...node, x: centerX, y: centerY };
    const angle = (Math.PI * 2 * (index - 1)) / Math.max(1, mindMap.nodes.length - 1);
    const radius = node.kind === "chapter" ? 140 : node.kind === "concept" ? 250 : 210;
    return { ...node, x: roundCoord(centerX + Math.cos(angle) * radius), y: roundCoord(centerY + Math.sin(angle) * radius) };
  });
}

function roundCoord(value: number): number {
  return Math.round(value * 1000) / 1000;
}
