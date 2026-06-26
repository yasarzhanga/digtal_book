import type { QuizQuestion } from "@/content-engine/schema/nodes";

export type QuizAnswer = string | number | boolean | number[];

export interface QuizScore {
  score: number;
  maxScore: number;
  correctQuestionIds: string[];
}

export function scoreQuiz(questions: QuizQuestion[], answers: Record<string, QuizAnswer>): QuizScore {
  let score = 0;
  let maxScore = 0;
  const correctQuestionIds: string[] = [];

  for (const question of questions) {
    maxScore += question.score;
    const answer = answers[question.id];
    const correct = isAnswerCorrect(question, answer);
    if (correct) {
      score += question.score;
      correctQuestionIds.push(question.id);
    }
  }

  return { score, maxScore, correctQuestionIds };
}

export function isAnswerCorrect(question: QuizQuestion, answer: QuizAnswer | undefined): boolean {
  if (question.type === "single") {
    return typeof answer === "number" && question.correct.length === 1 && question.correct[0] === answer;
  }
  if (question.type === "multiple") {
    if (!Array.isArray(answer)) {
      return false;
    }
    return sameNumberSet(answer, question.correct);
  }
  if (question.type === "boolean") {
    return typeof answer === "boolean" && answer === question.correct;
  }
  if (question.type === "fill") {
    return typeof answer === "string" && question.acceptedAnswers.map(normalizeText).includes(normalizeText(answer));
  }
  if (question.type === "ordering" || question.type === "matching") {
    return Array.isArray(answer) && sameOrderedNumbers(answer, question.correct);
  }
  if (question.type === "shortAnswer") {
    return false;
  }
  return false;
}

function sameNumberSet(a: number[], b: number[]): boolean {
  const left = [...a].sort((x, y) => x - y);
  const right = [...b].sort((x, y) => x - y);
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameOrderedNumbers(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}
