"use client";

import { useMemo, useState, type DragEvent } from "react";
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from "lucide-react";

type QuestionType = "single" | "multiple" | "boolean" | "fill" | "ordering" | "matching" | "shortAnswer";
type Answer = string | number | boolean | number[];

interface QuestionMedia {
  assetId: string;
  title: string;
  kind: string;
  caption: string;
}

interface Question {
  id: string;
  type: QuestionType;
  question: string;
  score: number;
  explanation: string;
  options?: string[];
  acceptedAnswers?: string[];
  items?: string[];
  leftItems?: string[];
  rightItems?: string[];
  correct?: number[] | boolean;
  rubric?: string[];
  sampleAnswer?: string;
  media: QuestionMedia[];
  sectionId?: string;
}

interface AssignmentSection {
  id: string;
  title: string;
  instructions: string;
  questionIds: string[];
}

interface Assignment {
  id: string;
  title: string;
  instructions: string;
  status: "DRAFT" | "PUBLISHED" | "CLOSED";
  dueAt: string | null;
  sections: AssignmentSection[];
  questions: Question[];
  submittedCount: number;
  gradedCount: number;
}

interface BankItem {
  id: string;
  question: Question;
  tags: string[];
}

interface Submission {
  id: string;
  studentName: string;
  answers: Record<string, Answer>;
  textAnswer: string;
  score: number | null;
  maxScore: number;
  feedback: string;
  status: "SUBMITTED" | "GRADED";
  submittedAt: string;
}

interface PaperItem {
  bankItemId: string;
  sectionId: string;
}

const defaultSections: AssignmentSection[] = [
  { id: "section-core", title: "一、基础巩固", instructions: "概念、判断与计算题。", questionIds: [] },
  { id: "section-experiment", title: "二、实验操作", instructions: "排序题、配对题和题内素材观察。", questionIds: [] },
  { id: "section-inquiry", title: "三、探究表达", instructions: "解答题按 rubric 批改。", questionIds: [] }
];

export function AssignmentsClient({ classroomId, initialAssignments, bankItems }: { classroomId: string; initialAssignments: Assignment[]; bankItems: BankItem[] }) {
  const [assignments, setAssignments] = useState(initialAssignments);
  const [sections, setSections] = useState<AssignmentSection[]>(defaultSections);
  const [paperItems, setPaperItems] = useState<PaperItem[]>(() => bankItems.slice(0, 7).map((item, index) => ({
    bankItemId: item.id,
    sectionId: index < 4 ? "section-core" : index < 6 ? "section-experiment" : "section-inquiry"
  })));
  const [title, setTitle] = useState("P1 作业：试卷化多题型巩固");
  const [instructions, setInstructions] = useState("按大题结构完成题目；排序题、配对题自动判分，解答题由教师按 rubric 批改。");
  const [submissions, setSubmissions] = useState<Record<string, Submission[]>>({});
  const [message, setMessage] = useState("");
  const bankById = useMemo(() => new Map(bankItems.map((item) => [item.id, item])), [bankItems]);
  const selectedIds = useMemo(() => new Set(paperItems.map((item) => item.bankItemId)), [paperItems]);

  async function refresh() {
    const response = await fetch(`/api/classes/${classroomId}/assignments`);
    if (response.ok) {
      const json = await response.json() as { assignments: Assignment[] };
      setAssignments(json.assignments);
    }
  }

  async function create() {
    if (paperItems.length === 0) {
      setMessage("创建失败：请先把题目加入拖拽组卷区");
      return;
    }
    const payloadSections = sections.map((section) => ({
      ...section,
      questionIds: paperItems
        .filter((item) => item.sectionId === section.id)
        .map((item) => bankById.get(item.bankItemId)?.question.id)
        .filter((questionId): questionId is string => Boolean(questionId))
    })).filter((section) => section.questionIds.length > 0);
    const response = await fetch(`/api/classes/${classroomId}/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, instructions, questionBankItemIds: paperItems.map((item) => item.bankItemId), sections: payloadSections })
    });
    setMessage(response.ok ? "试卷作业已创建，可发布给学生" : "创建失败：请至少选择一道题");
    await refresh();
  }

  async function publish(assignmentId: string) {
    await fetch(`/api/classes/${classroomId}/assignments/${assignmentId}/publish`, { method: "POST" });
    await refresh();
  }

  async function close(assignmentId: string) {
    await fetch(`/api/classes/${classroomId}/assignments/${assignmentId}/close`, { method: "POST" });
    await refresh();
  }

  async function loadSubmissions(assignmentId: string) {
    const response = await fetch(`/api/classes/${classroomId}/assignments/${assignmentId}/submissions`);
    if (response.ok) {
      const json = await response.json() as { submissions: Submission[] };
      setSubmissions((current) => ({ ...current, [assignmentId]: json.submissions }));
    }
  }

  async function grade(assignmentId: string, submission: Submission, formData: FormData) {
    const score = Number(formData.get("score") ?? submission.score ?? 0);
    const feedback = String(formData.get("feedback") ?? "");
    const response = await fetch(`/api/classes/${classroomId}/assignments/${assignmentId}/submissions/${submission.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score, feedback })
    });
    setMessage(response.ok ? "批改已保存" : "批改失败：分数不能超过满分");
    await loadSubmissions(assignmentId);
  }

  function addBankItem(itemId: string, sectionId = sections[0]?.id ?? "section-core") {
    setPaperItems((current) => current.some((item) => item.bankItemId === itemId) ? current : [...current, { bankItemId: itemId, sectionId }]);
  }

  function removePaperItem(index: number) {
    setPaperItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function movePaperItem(from: number, to: number) {
    setPaperItems((current) => {
      if (to < 0 || to >= current.length) return current;
      const next = [...current];
      const [item] = next.splice(from, 1);
      if (!item) return current;
      next.splice(to, 0, item);
      return next;
    });
  }

  function handlePaperDrop(event: DragEvent<HTMLElement>, targetIndex?: number) {
    event.preventDefault();
    const paperIndex = Number(event.dataTransfer.getData("application/x-paper-index"));
    const bankItemId = event.dataTransfer.getData("application/x-bank-item-id");
    if (Number.isInteger(paperIndex) && paperIndex >= 0 && targetIndex !== undefined) {
      movePaperItem(paperIndex, targetIndex);
      return;
    }
    if (bankItemId) {
      setPaperItems((current) => {
        if (current.some((item) => item.bankItemId === bankItemId)) return current;
        const next = [...current];
        next.splice(targetIndex ?? current.length, 0, { bankItemId, sectionId: sections[0]?.id ?? "section-core" });
        return next;
      });
    }
  }

  function updatePaperSection(index: number, sectionId: string) {
    setPaperItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, sectionId } : item));
  }

  function addSection() {
    const nextIndex = sections.length + 1;
    setSections((current) => [...current, { id: `section-custom-${nextIndex}`, title: `${nextIndex}、自定义大题`, instructions: "补充本大题说明。", questionIds: [] }]);
  }

  return (
    <main className="workspace-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">P1 作业发布与批改</p>
          <h1>课后作业工作台</h1>
        </div>
        <a className="primary-link" href={`/teacher/classes/${classroomId}/question-bank`}>题库导入</a>
      </section>

      <section className="p1-panel paper-builder">
        <header>
          <div>
            <h2>拖拽组卷</h2>
            <p>从题库拖入组卷区，调整顺序并分配到大题结构。</p>
          </div>
          <button type="button" onClick={addSection}><Plus size={16} /> 新增大题</button>
        </header>
        <div className="two-col">
          <label>作业标题<input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          <label>说明<input value={instructions} onChange={(event) => setInstructions(event.target.value)} /></label>
        </div>

        <div className="paper-builder-grid">
          <section className="bank-pick-list question-bank-source">
            <h3>题库</h3>
            {bankItems.map((item) => (
              <article
                className={`bank-question-card ${selectedIds.has(item.id) ? "selected" : ""}`}
                draggable
                key={item.id}
                onDragStart={(event) => event.dataTransfer.setData("application/x-bank-item-id", item.id)}
              >
                <div>
                  <span>{questionTypeLabel(item.question.type)} · {item.question.score} 分</span>
                  <strong>{item.question.question}</strong>
                  <small>{item.tags.join("，")}</small>
                  <QuestionMediaBadges media={item.question.media} />
                </div>
                <button type="button" onClick={() => addBankItem(item.id)} disabled={selectedIds.has(item.id)}>加入组卷</button>
              </article>
            ))}
          </section>

          <section className="paper-drop-zone" onDragOver={(event) => event.preventDefault()} onDrop={handlePaperDrop}>
            <h3>试卷结构</h3>
            <div className="section-editor-list">
              {sections.map((section, sectionIndex) => (
                <div className="section-editor" key={section.id}>
                  <input value={section.title} aria-label={`大题 ${sectionIndex + 1} 标题`} onChange={(event) => setSections((current) => current.map((item) => item.id === section.id ? { ...item, title: event.target.value } : item))} />
                  <input value={section.instructions} aria-label={`大题 ${sectionIndex + 1} 说明`} onChange={(event) => setSections((current) => current.map((item) => item.id === section.id ? { ...item, instructions: event.target.value } : item))} />
                </div>
              ))}
            </div>
            <div className="paper-item-list">
              {paperItems.map((paperItem, index) => {
                const bankItem = bankById.get(paperItem.bankItemId);
                if (!bankItem) return null;
                return (
                  <article
                    className="paper-item"
                    draggable
                    key={paperItem.bankItemId}
                    onDragStart={(event) => event.dataTransfer.setData("application/x-paper-index", String(index))}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => handlePaperDrop(event, index)}
                  >
                    <GripVertical size={16} />
                    <div>
                      <span>{index + 1}. {questionTypeLabel(bankItem.question.type)} · {bankItem.question.score} 分</span>
                      <strong>{bankItem.question.question}</strong>
                      <QuestionMediaBadges media={bankItem.question.media} />
                    </div>
                    <select value={paperItem.sectionId} aria-label="选择大题" onChange={(event) => updatePaperSection(index, event.target.value)}>
                      {sections.map((section) => <option key={section.id} value={section.id}>{section.title}</option>)}
                    </select>
                    <button type="button" aria-label="上移题目" onClick={() => movePaperItem(index, index - 1)}><ArrowUp size={16} /></button>
                    <button type="button" aria-label="下移题目" onClick={() => movePaperItem(index, index + 1)}><ArrowDown size={16} /></button>
                    <button type="button" aria-label="移除题目" onClick={() => removePaperItem(index)}><Trash2 size={16} /></button>
                  </article>
                );
              })}
            </div>
          </section>
        </div>

        <button className="primary-action" type="button" onClick={() => void create()}>从题库创建作业</button>
        {message ? <p className="error-text">{message}</p> : null}
      </section>

      <section className="assignment-list">
        {assignments.map((assignment) => (
          <article className="assignment-card" key={assignment.id}>
            <header>
              <div>
                <strong>{assignment.title}</strong>
                <span>{assignment.status} · {assignment.questions.length} 题 · {assignment.sections.length} 大题 · 提交 {assignment.submittedCount} · 批改 {assignment.gradedCount}</span>
              </div>
              <div className="inline-actions">
                {assignment.status === "DRAFT" ? <button type="button" onClick={() => void publish(assignment.id)}>发布</button> : null}
                {assignment.status === "PUBLISHED" ? <button type="button" onClick={() => void close(assignment.id)}>截止</button> : null}
                <button type="button" onClick={() => void loadSubmissions(assignment.id)}>查看提交</button>
              </div>
            </header>
            <p>{assignment.instructions}</p>
            <AssignmentOutline assignment={assignment} />
            <div className="submission-list">
              {(submissions[assignment.id] ?? []).map((submission) => (
                <form className="submission-row" key={submission.id} action={(formData) => void grade(assignment.id, submission, formData)}>
                  <div>
                    <b>{submission.studentName}</b>
                    <small>{submission.status} · {new Date(submission.submittedAt).toLocaleString()}</small>
                    <SubmissionAnswers assignment={assignment} submission={submission} />
                    {submission.textAnswer ? <p>{submission.textAnswer}</p> : null}
                  </div>
                  <label>分数<input name="score" type="number" min="0" max={submission.maxScore} defaultValue={submission.score ?? 0} /></label>
                  <label>反馈<input name="feedback" defaultValue={submission.feedback || "已阅，解答题按 rubric 继续完善。"} /></label>
                  <button type="submit">保存批改</button>
                </form>
              ))}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}

function AssignmentOutline({ assignment }: { assignment: Assignment }) {
  const questionById = new Map(assignment.questions.map((question) => [question.id, question]));
  return (
    <div className="assignment-outline">
      {assignment.sections.map((section) => (
        <section key={section.id}>
          <h4>{section.title}</h4>
          <p>{section.instructions}</p>
          <ol>
            {section.questionIds.map((questionId) => {
              const question = questionById.get(questionId);
              return question ? <li key={question.id}>{questionTypeLabel(question.type)} · {question.question}</li> : null;
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}

function SubmissionAnswers({ assignment, submission }: { assignment: Assignment; submission: Submission }) {
  return (
    <div className="submission-answer-list">
      {assignment.questions.map((question) => (
        <span key={question.id}>{questionTypeLabel(question.type)}：{formatAnswer(question, submission.answers[question.id])}</span>
      ))}
    </div>
  );
}

function QuestionMediaBadges({ media }: { media: QuestionMedia[] }) {
  if (!media.length) return null;
  return (
    <div className="question-media-badges">
      {media.map((item) => <span key={item.assetId}>{item.kind} · {item.title}</span>)}
    </div>
  );
}

function formatAnswer(question: Question, answer: Answer | undefined): string {
  if (answer === undefined) return "未答";
  if (question.type === "single" && typeof answer === "number") return question.options?.[answer] ?? String(answer);
  if (question.type === "multiple" && Array.isArray(answer)) return answer.map((index) => question.options?.[index] ?? index).join("、");
  if (question.type === "ordering" && Array.isArray(answer)) return answer.map((index) => question.items?.[index] ?? index).join(" > ");
  if (question.type === "matching" && Array.isArray(answer)) {
    return answer.map((rightIndex, leftIndex) => `${question.leftItems?.[leftIndex] ?? leftIndex}-${question.rightItems?.[rightIndex] ?? rightIndex}`).join("；");
  }
  if (typeof answer === "boolean") return answer ? "正确" : "错误";
  return String(answer);
}

function questionTypeLabel(type: QuestionType): string {
  const labels: Record<QuestionType, string> = {
    single: "单选题",
    multiple: "多选题",
    boolean: "判断题",
    fill: "填空题",
    ordering: "排序题",
    matching: "配对题",
    shortAnswer: "解答题"
  };
  return labels[type];
}
