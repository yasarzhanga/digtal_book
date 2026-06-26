"use client";

import { useState } from "react";

interface BankItem {
  id: string;
  source: string;
  question: {
    type: string;
    question: string;
    score: number;
    media?: { assetId: string; title: string; kind: string; caption: string }[];
    rubric?: string[];
    items?: string[];
    leftItems?: string[];
    rightItems?: string[];
  };
  tags: string[];
  createdAt: string;
}

export function QuestionBankClient({ classroomId, initialItems }: { classroomId: string; initialItems: BankItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [message, setMessage] = useState("");

  async function refresh() {
    const response = await fetch(`/api/classes/${classroomId}/question-bank`);
    if (response.ok) {
      const json = await response.json() as { items: BankItem[] };
      setItems(json.items);
    }
  }

  async function upload(formData: FormData) {
    const response = await fetch(`/api/classes/${classroomId}/question-bank`, { method: "POST", body: formData });
    if (response.ok) {
      const result = await response.json() as { imported: number; errors: { row: number; message: string }[] };
      setMessage(`导入 ${result.imported} 题，错误 ${result.errors.length} 条`);
      await refresh();
    } else {
      setMessage("导入失败：请使用 xlsx 模板并检查题型字段");
    }
  }

  return (
    <main className="workspace-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">P1 Excel 批量导入</p>
          <h1>题库管理</h1>
        </div>
        <a className="primary-link" href={`/api/classes/${classroomId}/question-bank/template`}>下载模板</a>
      </section>
      <form className="p1-panel upload-form" action={(formData) => void upload(formData)}>
        <input name="file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" />
        <button className="primary-action" type="submit">导入 Excel</button>
        {message ? <span>{message}</span> : null}
      </form>
      <section className="question-bank-grid">
        {items.map((item) => (
          <article className="resource-card" key={item.id}>
            <span>{questionTypeLabel(item.question.type)} · {item.question.score} 分</span>
            <strong>{item.question.question}</strong>
            {item.question.items?.length ? <small>排序项：{item.question.items.join(" / ")}</small> : null}
            {item.question.leftItems?.length ? <small>配对项：{item.question.leftItems.join(" / ")} ↔ {item.question.rightItems?.join(" / ")}</small> : null}
            {item.question.rubric?.length ? <small>Rubric：{item.question.rubric.join("；")}</small> : null}
            {item.question.media?.length ? (
              <div className="question-media-badges">
                {item.question.media.map((media) => <span key={media.assetId}>{media.kind} · {media.title}</span>)}
              </div>
            ) : null}
            <small>{item.tags.join("，") || item.source}</small>
          </article>
        ))}
      </section>
    </main>
  );
}

function questionTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    single: "单选题",
    multiple: "多选题",
    boolean: "判断题",
    fill: "填空题",
    ordering: "排序题",
    matching: "配对题",
    shortAnswer: "解答题"
  };
  return labels[type] ?? type;
}
