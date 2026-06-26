"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ExternalLink } from "lucide-react";

type Answer = string | number | boolean | number[];
type QuestionType = "single" | "multiple" | "boolean" | "fill" | "ordering" | "matching" | "shortAnswer";

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
  options?: string[];
  acceptedAnswers?: string[];
  items?: string[];
  leftItems?: string[];
  rightItems?: string[];
  rubric?: string[];
  sampleAnswer?: string;
  media: QuestionMedia[];
  score: number;
  explanation: string;
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
  status: string;
  sections: AssignmentSection[];
  questions: Question[];
  submission: {
    score: number | null;
    maxScore: number;
    feedback: string;
    status: string;
    submittedAt: string;
    answers?: Record<string, Answer>;
  } | null;
}

export function StudentAssignmentsClient({ classroomId, initialAssignments }: { classroomId: string; initialAssignments: Assignment[] }) {
  const [assignments, setAssignments] = useState(initialAssignments);
  const [answers, setAnswers] = useState<Record<string, Record<string, Answer>>>(() => seedSubmissionAnswers(initialAssignments));
  const [textAnswers, setTextAnswers] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");

  async function refresh() {
    const response = await fetch(`/api/classes/${classroomId}/assignments`);
    if (response.ok) {
      const json = await response.json() as { assignments: Assignment[] };
      setAssignments(json.assignments);
    }
  }

  function setAnswer(assignmentId: string, questionId: string, answer: Answer) {
    setAnswers((current) => ({ ...current, [assignmentId]: { ...(current[assignmentId] ?? {}), [questionId]: answer } }));
  }

  function toggleMultiple(assignmentId: string, questionId: string, index: number) {
    const current = answers[assignmentId]?.[questionId];
    const values = Array.isArray(current) ? current : [];
    setAnswer(assignmentId, questionId, values.includes(index) ? values.filter((item) => item !== index) : [...values, index]);
  }

  function moveOrdering(assignmentId: string, question: Question, from: number, to: number) {
    if (!question.items || to < 0 || to >= question.items.length) return;
    const current = answers[assignmentId]?.[question.id];
    const order = Array.isArray(current) && current.length === question.items.length ? [...current] : question.items.map((_, index) => index);
    const [item] = order.splice(from, 1);
    if (item === undefined) return;
    order.splice(to, 0, item);
    setAnswer(assignmentId, question.id, order);
  }

  function setMatching(assignmentId: string, question: Question, leftIndex: number, rightIndex: number) {
    const current = answers[assignmentId]?.[question.id];
    const values = Array.isArray(current) && current.length === question.leftItems?.length ? [...current] : (question.leftItems ?? []).map(() => -1);
    values[leftIndex] = rightIndex;
    setAnswer(assignmentId, question.id, values);
  }

  async function submit(assignmentId: string) {
    const response = await fetch(`/api/assignments/${assignmentId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: answers[assignmentId] ?? {}, textAnswer: textAnswers[assignmentId] ?? "" })
    });
    setMessage(response.ok ? "提交成功，已进入教师批改列表" : "提交失败：请确认身份或作业状态");
    await refresh();
  }

  return (
    <main className="workspace-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">P1 学生作业</p>
          <h1>作业与反馈</h1>
        </div>
        <a className="primary-link" href="/reader/books/book_newton_second_law/report">学习报告</a>
      </section>
      {message ? <p className="p1-message">{message}</p> : null}
      <section className="assignment-list">
        {assignments.map((assignment) => {
          const questionById = new Map(assignment.questions.map((question) => [question.id, question]));
          return (
            <article className="assignment-card" key={assignment.id}>
              <header>
                <div>
                  <strong>{assignment.title}</strong>
                  <span>{assignment.status} · {assignment.sections.length} 大题 · {assignment.questions.length} 题</span>
                </div>
                {assignment.submission ? <b>{assignment.submission.status} · {assignment.submission.score ?? 0}/{assignment.submission.maxScore}</b> : <b>未提交</b>}
              </header>
              <p>{assignment.instructions}</p>
              <div className="student-paper">
                {assignment.sections.map((section) => (
                  <section className="assignment-section" key={section.id}>
                    <h3>{section.title}</h3>
                    <p>{section.instructions}</p>
                    <div className="question-stack">
                      {section.questionIds.map((questionId, questionIndex) => {
                        const question = questionById.get(questionId);
                        return question ? (
                          <QuestionAnswer
                            key={question.id}
                            assignmentId={assignment.id}
                            question={question}
                            questionIndex={questionIndex}
                            value={answers[assignment.id]?.[question.id]}
                            onAnswer={setAnswer}
                            onToggleMultiple={toggleMultiple}
                            onMoveOrdering={moveOrdering}
                            onSetMatching={setMatching}
                          />
                        ) : null;
                      })}
                    </div>
                  </section>
                ))}
              </div>
              <label>整体解释说明<textarea value={textAnswers[assignment.id] ?? ""} onChange={(event) => setTextAnswers((current) => ({ ...current, [assignment.id]: event.target.value }))} placeholder="用自己的话说明思路" /></label>
              {assignment.submission?.feedback ? <p className="feedback-box">教师反馈：{assignment.submission.feedback}</p> : null}
              <button className="primary-action" type="button" onClick={() => void submit(assignment.id)}>提交/更新作业</button>
            </article>
          );
        })}
      </section>
    </main>
  );
}

function QuestionAnswer({
  assignmentId,
  question,
  questionIndex,
  value,
  onAnswer,
  onToggleMultiple,
  onMoveOrdering,
  onSetMatching
}: {
  assignmentId: string;
  question: Question;
  questionIndex: number;
  value: Answer | undefined;
  onAnswer: (assignmentId: string, questionId: string, answer: Answer) => void;
  onToggleMultiple: (assignmentId: string, questionId: string, index: number) => void;
  onMoveOrdering: (assignmentId: string, question: Question, from: number, to: number) => void;
  onSetMatching: (assignmentId: string, question: Question, leftIndex: number, rightIndex: number) => void;
}) {
  const order = question.type === "ordering" && question.items
    ? (Array.isArray(value) && value.length === question.items.length ? value : question.items.map((_, index) => index))
    : [];
  const matching = question.type === "matching" && question.leftItems
    ? (Array.isArray(value) && value.length === question.leftItems.length ? value : question.leftItems.map(() => -1))
    : [];
  return (
    <section className="assignment-question">
      <b>{questionIndex + 1}. {questionTypeLabel(question.type)} · {question.question}</b>
      <QuestionMediaLinks media={question.media} />
      {question.type === "single" ? question.options?.map((option, index) => (
        <label key={option}><input name={`${assignmentId}-${question.id}`} type="radio" checked={value === index} onChange={() => onAnswer(assignmentId, question.id, index)} /> {option}</label>
      )) : null}
      {question.type === "multiple" ? question.options?.map((option, index) => (
        <label key={option}><input type="checkbox" checked={Array.isArray(value) && value.includes(index)} onChange={() => onToggleMultiple(assignmentId, question.id, index)} /> {option}</label>
      )) : null}
      {question.type === "boolean" ? (
        <select value={typeof value === "boolean" ? String(value) : ""} onChange={(event) => onAnswer(assignmentId, question.id, event.target.value === "true")}>
          <option value="">选择</option>
          <option value="true">正确</option>
          <option value="false">错误</option>
        </select>
      ) : null}
      {question.type === "fill" ? <input placeholder="填写答案" value={typeof value === "string" ? value : ""} onChange={(event) => onAnswer(assignmentId, question.id, event.target.value)} /> : null}
      {question.type === "ordering" ? (
        <div className="ordering-answer">
          {order.map((itemIndex, orderIndex) => (
            <div className="ordering-row" key={`${question.id}-${itemIndex}`}>
              <span>{orderIndex + 1}</span>
              <b>{question.items?.[itemIndex]}</b>
              <button type="button" aria-label="排序上移" disabled={orderIndex === 0} onClick={() => onMoveOrdering(assignmentId, question, orderIndex, orderIndex - 1)}><ArrowUp size={16} /></button>
              <button type="button" aria-label="排序下移" disabled={orderIndex === order.length - 1} onClick={() => onMoveOrdering(assignmentId, question, orderIndex, orderIndex + 1)}><ArrowDown size={16} /></button>
            </div>
          ))}
        </div>
      ) : null}
      {question.type === "matching" ? (
        <div className="matching-answer">
          {question.leftItems?.map((left, leftIndex) => (
            <label key={left}>
              <span>{left}</span>
              <select value={matching[leftIndex] ?? -1} onChange={(event) => onSetMatching(assignmentId, question, leftIndex, Number(event.target.value))}>
                <option value={-1}>选择对应项</option>
                {question.rightItems?.map((right, rightIndex) => <option key={right} value={rightIndex}>{right}</option>)}
              </select>
            </label>
          ))}
        </div>
      ) : null}
      {question.type === "shortAnswer" ? (
        <div className="short-answer-block">
          <textarea value={typeof value === "string" ? value : ""} onChange={(event) => onAnswer(assignmentId, question.id, event.target.value)} placeholder="写出完整推理过程" />
          <small>评分要点：{question.rubric?.join("；")}</small>
        </div>
      ) : null}
    </section>
  );
}

function QuestionMediaLinks({ media }: { media: QuestionMedia[] }) {
  if (!media.length) return null;
  return (
    <div className="question-media-list">
      {media.map((item) => (
        <a key={item.assetId} href={`/api/assets/${item.assetId}/file`} target="_blank" rel="noreferrer">
          <ExternalLink size={14} />
          <span>{item.kind}</span>
          <b>{item.title}</b>
        </a>
      ))}
    </div>
  );
}

function seedSubmissionAnswers(assignments: Assignment[]): Record<string, Record<string, Answer>> {
  return Object.fromEntries(assignments.map((assignment) => [assignment.id, assignment.submission?.answers ?? {}]));
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
