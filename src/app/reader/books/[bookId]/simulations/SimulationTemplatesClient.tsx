"use client";

import { useMemo, useState } from "react";

interface Field {
  key: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  default: number;
}

interface Template {
  key: string;
  title: string;
  concept: string;
  fields: Field[];
}

interface Result {
  title: string;
  metrics: { label: string; value: number; unit: string }[];
  series: { label: string; x: number; y: number }[];
}

interface Run {
  id: string;
  templateKey: string;
  input: Record<string, number>;
  result: Result;
  createdAt: string;
}

export function SimulationTemplatesClient({ bookId, classroomId, templates, initialRuns }: { bookId: string; classroomId?: string; templates: Template[]; initialRuns: Run[] }) {
  const [selectedKey, setSelectedKey] = useState(templates[0]?.key ?? "");
  const [values, setValues] = useState<Record<string, number>>({});
  const [runs, setRuns] = useState(initialRuns);
  const selected = useMemo(() => templates.find((item) => item.key === selectedKey) ?? templates[0], [selectedKey, templates]);
  const currentValues = Object.fromEntries((selected?.fields ?? []).map((field) => [field.key, values[field.key] ?? field.default]));
  const latest = runs[0]?.result;

  async function runTemplate() {
    if (!selected) return;
    const response = await fetch(`/api/reader/books/${bookId}/simulation-templates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateKey: selected.key, values: currentValues, classroomId })
    });
    if (response.ok) {
      const json = await response.json() as { run: Run };
      setRuns((current) => [json.run, ...current]);
    }
  }

  return (
    <main className="workspace-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">P1 更多仿真模板</p>
          <h1>可复用物理实验</h1>
        </div>
        <a className="primary-link" href={`/reader/books/${bookId}/experiments`}>F=ma 记录</a>
      </section>
      <div className="simulation-workbench">
        <aside className="template-list">
          {templates.map((template) => <button className={template.key === selected?.key ? "active" : ""} key={template.key} type="button" onClick={() => setSelectedKey(template.key)}>{template.title}<small>{template.concept}</small></button>)}
        </aside>
        <section className="template-stage">
          {selected ? (
            <>
              <h2>{selected.title}</h2>
              <div className="sim-controls">
                {selected.fields.map((field) => (
                  <label key={field.key}>{field.label} {currentValues[field.key]}{field.unit}
                    <input type="range" min={field.min} max={field.max} step={field.step} value={currentValues[field.key]} onChange={(event) => setValues((current) => ({ ...current, [field.key]: Number(event.target.value) }))} />
                  </label>
                ))}
              </div>
              <button className="primary-action" type="button" onClick={() => void runTemplate()}>运行并保存</button>
              {latest ? <ResultChart result={latest} /> : null}
            </>
          ) : null}
        </section>
      </div>
      <section className="experiment-list">
        {runs.map((run) => <article className="experiment-row" key={run.id}><strong>{run.result.title}</strong><span>{run.result.metrics.map((metric) => `${metric.label} ${metric.value}${metric.unit}`).join("，")}</span><small>{formatDate(run.createdAt)}</small></article>)}
      </section>
    </main>
  );
}

function ResultChart({ result }: { result: Result }) {
  const maxX = Math.max(1, ...result.series.map((point) => point.x));
  const maxY = Math.max(1, ...result.series.map((point) => point.y));
  return (
    <div className="chart-card">
      <div className="metric-grid compact">
        {result.metrics.map((metric) => <article className="metric-card" key={metric.label}><span>{metric.label}</span><strong>{metric.value}{metric.unit}</strong></article>)}
      </div>
      <svg viewBox="0 0 640 260">
        <polyline fill="none" stroke="#1b7f83" strokeWidth="4" points={result.series.map((point) => `${40 + (point.x / maxX) * 560},${220 - (point.y / maxY) * 180}`).join(" ")} />
        {result.series.map((point, index) => <circle key={`${point.x}-${index}`} cx={40 + (point.x / maxX) * 560} cy={220 - (point.y / maxY) * 180} r="5" fill="#c6502c" />)}
      </svg>
    </div>
  );
}

function formatDate(value: string): string {
  return value.replace("T", " ").slice(0, 19);
}
