import { z } from "zod";
import type { BookSnapshot } from "@/content-engine/schema/document";
import type { ContentNode, QuizQuestion } from "@/content-engine/schema/nodes";
import { asRow, asRows, getDb, withTransaction } from "@/server/db/client";
import { id } from "@/server/db/ids";
import { parseJson, stringifyJson } from "@/server/db/json";
import type { AiConversationRow, AiMessageRow } from "@/server/db/types";
import { getPersonalReport, getReaderSnapshot } from "@/server/services/reader";
import { recordEvent } from "@/server/services/events";

export const AiQuestionInputSchema = z.object({
  bookVersionId: z.string().min(1).optional(),
  conversationId: z.string().min(1).optional(),
  chapterId: z.string().min(1).optional(),
  question: z.string().trim().min(2).max(800)
});

export const AiCitationSchema = z.object({
  chapterId: z.string().min(1),
  chapterTitle: z.string().min(1),
  nodeId: z.string().min(1),
  nodeType: z.string().min(1),
  title: z.string().min(1),
  excerpt: z.string().min(1),
  score: z.number().nonnegative()
});

const AiCitationListSchema = z.array(AiCitationSchema);

export const FormulaAssistantInputSchema = z.object({
  prompt: z.string().trim().min(2).max(400),
  currentLatex: z.string().max(400).default(""),
  context: z.string().max(800).default("")
});

export const FormulaSuggestionSchema = z.object({
  latex: z.string().min(1).max(400),
  caption: z.string().min(1).max(500),
  number: z.string().max(80).default("AI"),
  parameterDemo: z.object({
    force: z.number(),
    mass: z.number().positive()
  }).optional(),
  provider: z.string().min(1),
  status: z.enum(["external", "local_fallback", "provider_error"]),
  message: z.string().min(1)
});

const AiProviderConfigSchema = z.object({
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
  model: z.string().min(1),
  timeoutMs: z.number().int().positive(),
  maxTokens: z.number().int().positive()
});

const ChatCompletionResponseSchema = z.object({
  choices: z.array(z.object({
    message: z.object({
      content: z.string().nullable().optional()
    }).optional()
  })).min(1)
});

type AiQuestionInput = z.infer<typeof AiQuestionInputSchema>;
type AiCitation = z.infer<typeof AiCitationSchema>;
type AiProviderConfig = z.infer<typeof AiProviderConfigSchema>;
type AiProviderStatus = "external" | "local_fallback" | "provider_error";
export type FormulaSuggestion = z.infer<typeof FormulaSuggestionSchema>;

interface AiChunk extends AiCitation {
  text: string;
}

export interface AiMessageDto {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  citations: AiCitation[];
  provider: string;
  createdAt: string;
}

export interface AiConversationDto {
  id: string;
  userId: string;
  bookVersionId: string;
  title: string;
  provider: string;
  createdAt: string;
  updatedAt: string;
  messages: AiMessageDto[];
}

export interface AiAskResult {
  conversation: AiConversationDto;
  answer: AiMessageDto;
  providerConfigured: boolean;
  providerStatus: AiProviderStatus;
  providerMessage: string;
}

interface ProviderAnswer {
  content: string;
  provider: string;
  status: AiProviderStatus;
  message: string;
}

const defaultAiBaseUrl = "https://api.openai.com/v1";

export function isAiProviderConfigured(): boolean {
  return Boolean(readProviderConfig());
}

export async function suggestFormula(input: z.input<typeof FormulaAssistantInputSchema>): Promise<FormulaSuggestion> {
  const parsed = FormulaAssistantInputSchema.parse(input);
  const config = readProviderConfig();
  if (!config) {
    return localFormulaSuggestion(parsed.prompt, parsed.currentLatex, parsed.context);
  }
  try {
    const suggestion = await requestFormulaCompletion(config, parsed.prompt, parsed.currentLatex, parsed.context);
    return FormulaSuggestionSchema.parse({
      ...suggestion,
      provider: config.model,
      status: "external",
      message: `已通过外部 AI 接口 ${config.model} 生成公式建议。`
    });
  } catch (error) {
    const fallback = localFormulaSuggestion(parsed.prompt, parsed.currentLatex, parsed.context);
    return FormulaSuggestionSchema.parse({
      ...fallback,
      provider: `${config.model}:fallback`,
      status: "provider_error",
      message: `外部 AI 接口暂不可用，已使用本地公式规则兜底：${errorMessage(error)}`
    });
  }
}

export function listAiConversations(userId: string, bookVersionId: string): AiConversationDto[] {
  const conversations = asRows<AiConversationRow>(
    getDb().prepare("SELECT * FROM AiConversation WHERE userId = ? AND bookVersionId = ? ORDER BY updatedAt DESC LIMIT 20").all(userId, bookVersionId)
  );
  if (!conversations.length) {
    return [];
  }
  const conversationIds = conversations.map((conversation) => conversation.id);
  const messages = asRows<AiMessageRow>(
    getDb().prepare(`SELECT * FROM AiMessage WHERE conversationId IN (${placeholders(conversationIds.length)}) ORDER BY createdAt ASC`).all(...conversationIds)
  );
  const grouped = new Map<string, AiMessageDto[]>();
  for (const message of messages) {
    const list = grouped.get(message.conversationId) ?? [];
    list.push(toMessageDto(message));
    grouped.set(message.conversationId, list);
  }
  return conversations.map((conversation) => ({
    ...conversation,
    messages: grouped.get(conversation.id) ?? []
  }));
}

export async function askAiQuestion(userId: string, bookId: string, input: AiQuestionInput): Promise<AiAskResult> {
  const parsed = AiQuestionInputSchema.parse(input);
  const snapshot = getReaderSnapshot(bookId);
  const bookVersionId = parsed.bookVersionId ?? snapshot.versionId;
  if (bookVersionId !== snapshot.versionId) {
    throw new Error("AI_VERSION_NOT_CURRENT");
  }

  const existingConversation = parsed.conversationId ? getConversationRow(userId, bookVersionId, parsed.conversationId) : null;
  if (parsed.conversationId && !existingConversation) {
    throw new Error("AI_CONVERSATION_NOT_FOUND");
  }

  const history = existingConversation ? listMessagesForConversation(existingConversation.id).slice(-8) : [];
  const chunks = rankChunks(snapshot, parsed.question, parsed.chapterId).slice(0, 5);
  const citations = chunks.slice(0, 4).map(toCitation);
  const learnerSignals = summarizeLearnerSignals(userId, bookVersionId);
  const providerAnswer = await answerWithProvider(parsed.question, chunks, history, learnerSignals);
  const now = new Date().toISOString();
  let conversationId = existingConversation?.id ?? "";
  let assistantMessageId = "";

  withTransaction(() => {
    if (!conversationId) {
      conversationId = id("ai_conversation");
      getDb().prepare("INSERT INTO AiConversation (id, userId, bookVersionId, title, provider, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
        conversationId,
        userId,
        bookVersionId,
        titleFromQuestion(parsed.question),
        providerAnswer.provider,
        now,
        now
      );
    } else {
      getDb().prepare("UPDATE AiConversation SET provider = ?, updatedAt = ? WHERE id = ? AND userId = ?").run(providerAnswer.provider, now, conversationId, userId);
    }

    const userMessageId = id("ai_message");
    assistantMessageId = id("ai_message");
    const insertMessage = getDb().prepare("INSERT INTO AiMessage (id, conversationId, role, content, citationsJson, provider, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)");
    insertMessage.run(userMessageId, conversationId, "USER", parsed.question, stringifyJson([]), "student", now);
    insertMessage.run(assistantMessageId, conversationId, "ASSISTANT", providerAnswer.content, stringifyJson(citations), providerAnswer.provider, new Date().toISOString());
    recordEvent(userId, {
      bookVersionId,
      chapterId: citations[0]?.chapterId,
      nodeId: citations[0]?.nodeId,
      eventType: "AI_QA_ASK",
      payload: {
        provider: providerAnswer.provider,
        status: providerAnswer.status,
        citationCount: citations.length,
        questionLength: parsed.question.length
      }
    });
  });

  const conversation = getConversationDto(userId, bookVersionId, conversationId);
  const answer = conversation.messages.find((message) => message.id === assistantMessageId);
  if (!answer) {
    throw new Error("AI_MESSAGE_SAVE_FAILED");
  }
  return {
    conversation,
    answer,
    providerConfigured: Boolean(readProviderConfig()),
    providerStatus: providerAnswer.status,
    providerMessage: providerAnswer.message
  };
}

function readProviderConfig(): AiProviderConfig | null {
  const apiKey = process.env.AI_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }
  return AiProviderConfigSchema.parse({
    baseUrl: stripTrailingSlash(process.env.AI_API_BASE_URL ?? process.env.OPENAI_BASE_URL ?? defaultAiBaseUrl),
    apiKey,
    model: process.env.AI_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    timeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 12000),
    maxTokens: Number(process.env.AI_MAX_TOKENS ?? 800)
  });
}

async function answerWithProvider(question: string, chunks: AiChunk[], history: AiMessageDto[], learnerSignals: string): Promise<ProviderAnswer> {
  const config = readProviderConfig();
  if (!config) {
    return {
      content: buildLocalAnswer(question, chunks, learnerSignals),
      provider: "local-reference",
      status: "local_fallback",
      message: "未配置 AI_API_KEY，已使用本地教材检索生成参考回答。"
    };
  }

  try {
    const content = await requestChatCompletion(config, question, chunks, history, learnerSignals);
    return {
      content,
      provider: config.model,
      status: "external",
      message: `已通过外部 AI 接口 ${config.model} 生成，并附带本地教材引用。`
    };
  } catch (error) {
    return {
      content: buildLocalAnswer(question, chunks, learnerSignals),
      provider: `${config.model}:fallback`,
      status: "provider_error",
      message: `外部 AI 接口暂不可用，已使用本地教材检索兜底：${errorMessage(error)}`
    };
  }
}

async function requestChatCompletion(config: AiProviderConfig, question: string, chunks: AiChunk[], history: AiMessageDto[], learnerSignals: string): Promise<string> {
  const controller = new AbortController();
  const timer = windowlessTimeout(() => controller.abort(), config.timeoutMs);
  const endpoint = new URL("chat/completions", `${config.baseUrl}/`).toString();
  const context = chunks.length
    ? chunks.map((chunk, index) => `[${index + 1}] ${chunk.chapterTitle} / ${chunk.title} / ${chunk.nodeType}\n${chunk.excerpt}`).join("\n\n")
    : "未在当前教材发布内容中命中直接证据。";

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        max_tokens: config.maxTokens,
        messages: [
          {
            role: "system",
            content: [
              "你是数字教材平台内的 AI 助教。只使用用户问题、本地教材上下文和学习信号作答。",
              "回答要简洁、具体、面向学生；如果教材证据不足，明确说明并给出可验证的下一步。",
              "不要编造资源、页码、实验结果或学生数据。"
            ].join("\n")
          },
          ...history.map((message) => ({
            role: message.role === "USER" ? "user" : "assistant",
            content: message.content
          })),
          {
            role: "user",
            content: [
              `学生问题：${question}`,
              "",
              `本地教材引用：\n${context}`,
              "",
              `学习信号：${learnerSignals}`,
              "",
              "请用中文回答，最后用一句“可继续查看：...”指出最相关的教材组件。"
            ].join("\n")
          }
        ]
      }),
      signal: controller.signal
    });
    const raw = await response.text();
    if (!response.ok) {
      throw new Error(`AI_PROVIDER_${response.status}_${raw.slice(0, 160)}`);
    }
    const parsed = ChatCompletionResponseSchema.parse(JSON.parse(raw) as unknown);
    const content = parsed.choices[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("AI_PROVIDER_EMPTY_RESPONSE");
    }
    return content;
  } finally {
    clearTimeout(timer);
  }
}

async function requestFormulaCompletion(config: AiProviderConfig, prompt: string, currentLatex: string, context: string): Promise<Omit<FormulaSuggestion, "provider" | "status" | "message">> {
  const controller = new AbortController();
  const timer = windowlessTimeout(() => controller.abort(), config.timeoutMs);
  const endpoint = new URL("chat/completions", `${config.baseUrl}/`).toString();
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.1,
        max_tokens: Math.min(config.maxTokens, 500),
        messages: [
          {
            role: "system",
            content: [
              "你是数字教材编辑器里的公式助手。",
              "只输出 JSON：{\"latex\":\"...\",\"caption\":\"...\",\"number\":\"...\",\"parameterDemo\":{\"force\":6,\"mass\":2}}。",
              "LaTeX 必须适合 KaTeX，不能包含 Markdown。parameterDemo 只有在 F=ma 或等价力学关系适用时才给出。"
            ].join("\n")
          },
          {
            role: "user",
            content: `编辑需求：${prompt}\n当前 LaTeX：${currentLatex || "无"}\n教材上下文：${context || "无"}`
          }
        ]
      }),
      signal: controller.signal
    });
    const raw = await response.text();
    if (!response.ok) {
      throw new Error(`AI_PROVIDER_${response.status}_${raw.slice(0, 160)}`);
    }
    const parsed = ChatCompletionResponseSchema.parse(JSON.parse(raw) as unknown);
    const content = parsed.choices[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("AI_PROVIDER_EMPTY_RESPONSE");
    }
    return FormulaSuggestionSchema.omit({ provider: true, status: true, message: true }).parse(JSON.parse(stripJsonFence(content)) as unknown);
  } finally {
    clearTimeout(timer);
  }
}

function localFormulaSuggestion(prompt: string, currentLatex: string, context: string): FormulaSuggestion {
  const text = normalize(`${prompt} ${context} ${currentLatex}`);
  if (/动能|kinetic|energy/.test(text)) {
    return FormulaSuggestionSchema.parse({
      latex: "E_k=\\frac{1}{2}mv^2",
      caption: "动能等于质量与速度平方乘积的一半。",
      number: "AI-动能",
      provider: "local-formula",
      status: "local_fallback",
      message: "未配置 AI_API_KEY，已使用本地公式规则生成建议。"
    });
  }
  if (/胡克|弹簧|hooke|spring/.test(text)) {
    return FormulaSuggestionSchema.parse({
      latex: "F=-kx",
      caption: "弹性回复力与形变量成正比，方向相反。",
      number: "AI-胡克",
      provider: "local-formula",
      status: "local_fallback",
      message: "未配置 AI_API_KEY，已使用本地公式规则生成建议。"
    });
  }
  if (/功|work|位移|夹角/.test(text)) {
    return FormulaSuggestionSchema.parse({
      latex: "W=Fs\\cos\\theta",
      caption: "恒力做功等于力在位移方向上的分量与位移的乘积。",
      number: "AI-做功",
      provider: "local-formula",
      status: "local_fallback",
      message: "未配置 AI_API_KEY，已使用本地公式规则生成建议。"
    });
  }
  return FormulaSuggestionSchema.parse({
    latex: "F=ma",
    caption: "合力等于质量与加速度的乘积；质量不变时，合力越大，加速度越大。",
    number: "AI-F=ma",
    parameterDemo: { force: 6, mass: 2 },
    provider: "local-formula",
    status: "local_fallback",
    message: "未配置 AI_API_KEY，已使用本地公式规则生成建议。"
  });
}

function rankChunks(snapshot: BookSnapshot, question: string, chapterId?: string): AiChunk[] {
  const terms = questionTerms(question);
  const normalizedQuestion = normalize(question);
  return buildChunks(snapshot, chapterId).map((chunk) => {
    const normalizedText = normalize(`${chunk.title} ${chunk.text}`);
    let score = normalizedText.includes(normalizedQuestion) ? 10 : 0;
    for (const term of terms) {
      if (normalizedText.includes(term)) {
        score += term.length >= 3 ? 3 : 1;
      }
      if (normalize(chunk.title).includes(term)) {
        score += 2;
      }
    }
    score += domainBoost(question, chunk);
    return { ...chunk, score, excerpt: excerptFor(chunk.text, terms) };
  }).filter((chunk) => chunk.score > 0)
    .sort((first, second) => second.score - first.score || first.chapterTitle.localeCompare(second.chapterTitle, "zh-Hans-CN"));
}

function buildChunks(snapshot: BookSnapshot, chapterId?: string): AiChunk[] {
  const chapters = chapterId ? snapshot.chapters.filter((chapter) => chapter.id === chapterId) : snapshot.chapters;
  return chapters.flatMap((chapter) => chapter.document.nodes.map((node) => {
    const title = nodeTitle(node);
    const text = nodeText(node);
    return {
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      nodeId: node.nodeId,
      nodeType: node.type,
      title,
      text,
      excerpt: trimText(text, 220),
      score: 0
    };
  })).filter((chunk) => chunk.text.trim().length > 0);
}

function nodeTitle(node: ContentNode): string {
  if (node.type === "heading") return node.text;
  if ("title" in node) return node.title;
  if (node.type === "richText") return "教材正文";
  if (node.type === "formulaBlock") return node.number ? `公式 ${node.number}` : "公式";
  return node.type;
}

function nodeText(node: ContentNode): string {
  switch (node.type) {
    case "heading":
      return node.text;
    case "richText":
      return stripHtml(node.html);
    case "callout":
      return `${node.title}。${node.body}`;
    case "imageInteractive":
      return [node.alt, node.caption, ...node.hotspots.map((hotspot) => `${hotspot.title}。${hotspot.body}`)].join(" ");
    case "gallery":
      return node.captions.join(" ");
    case "audio":
      return [node.title, node.transcript, ...node.chapters.map((chapter) => chapter.label)].join(" ");
    case "video":
      return [node.title, node.caption, ...node.transcript.map((cue) => cue.text)].join(" ");
    case "formulaBlock":
      return [node.latex, node.number ?? "", node.caption, node.parameterDemo ? `参数演示：F=${node.parameterDemo.force}, m=${node.parameterDemo.mass}` : ""].join(" ");
    case "chart":
      return [node.title, node.xLabel, node.yLabel, ...node.items.map((item) => `${item.label} ${item.value}`)].join(" ");
    case "physicsSimulation":
      return `${node.title}。${node.prompt}。可调合力范围 ${node.force.min}-${node.force.max}，质量范围 ${node.mass.min}-${node.mass.max}，用于观察 F=ma、加速度、速度和位移变化。`;
    case "model3d":
      return [node.title, node.description, ...node.hotspots.map((hotspot) => `${hotspot.title}。${hotspot.body}`)].join(" ");
    case "panorama":
      return [node.title, ...node.hotspots.map((hotspot) => `${hotspot.title}。${hotspot.body}`)].join(" ");
    case "extendedReading":
      return [node.title, node.summary, node.body, ...node.tags].join(" ");
    case "attachment":
      return `${node.title}。附件可预览：${node.preview ? "是" : "否"}`;
    case "quizSet":
      return [node.title, ...node.questions.flatMap(questionText)].join(" ");
    case "recordingTask":
      return `${node.title}。${node.prompt}。建议录音 ${node.recommendedSeconds} 秒。`;
    case "knowledgeGraph":
      return [node.title, ...node.nodes.map((item) => `${item.label} ${item.type}`), ...node.edges.map((edge) => `${edge.source} ${edge.label} ${edge.target}`)].join(" ");
  }
}

function questionText(question: QuizQuestion): string[] {
  const common = [question.question, question.explanation, ...question.media.map((item) => `${item.title} ${item.caption}`)];
  if (question.type === "single" || question.type === "multiple") {
    return [...common, ...question.options];
  }
  if (question.type === "fill") {
    return [...common, ...question.acceptedAnswers];
  }
  if (question.type === "boolean") {
    return [...common, question.correct ? "正确" : "错误"];
  }
  if (question.type === "ordering") {
    return [...common, ...question.items];
  }
  if (question.type === "matching") {
    return [...common, ...question.leftItems, ...question.rightItems];
  }
  return [...common, ...question.rubric, question.sampleAnswer];
}

function questionTerms(question: string): string[] {
  const normalized = normalize(question);
  const terms = new Set<string>(normalized.match(/[a-z0-9=]+|[\p{L}\p{N}]+/gu) ?? []);
  const cjkSequences = normalized.match(/[\u3400-\u9fff]{2,}/g) ?? [];
  for (const sequence of cjkSequences) {
    for (const length of [2, 3, 4]) {
      for (let index = 0; index <= sequence.length - length; index += 1) {
        terms.add(sequence.slice(index, index + length));
      }
    }
  }
  if (/f\s*=?\s*ma|牛顿|第二定律|合力|质量|加速度|force|mass/.test(normalized)) {
    ["f=ma", "牛顿第二定律", "合力", "质量", "加速度", "受力"].forEach((term) => terms.add(normalize(term)));
  }
  if (/视频|音频|资源|pdf|附件|3d|全景|仿真|实验|题|测验|作业|图谱/.test(normalized)) {
    ["资源", "视频", "音频", "仿真", "实验", "题组", "知识图谱"].forEach((term) => terms.add(normalize(term)));
  }
  return [...terms].filter((term) => term.length > 1).slice(0, 80);
}

function domainBoost(question: string, chunk: AiChunk): number {
  const normalized = normalize(question);
  let boost = 0;
  if (/本节|重点|概念|总结|学习目标/.test(normalized) && ["heading", "richText", "callout"].includes(chunk.nodeType)) boost += 7;
  if (/仿真|实验|模拟|f=ma|合力|质量|加速度/.test(normalized) && chunk.nodeType === "physicsSimulation") boost += 8;
  if (/公式|推导|f=ma|牛顿/.test(normalized) && chunk.nodeType === "formulaBlock") boost += 8;
  if (/题|测验|练习|作业|检测/.test(normalized) && chunk.nodeType === "quizSet") boost += 6;
  if (/图谱|关系|概念/.test(normalized) && chunk.nodeType === "knowledgeGraph") boost += 6;
  if (/视频|演示/.test(normalized) && chunk.nodeType === "video") boost += 5;
  if (/音频|讲解|听/.test(normalized) && chunk.nodeType === "audio") boost += 5;
  return boost;
}

function buildLocalAnswer(question: string, chunks: AiChunk[], learnerSignals: string): string {
  const first = chunks[0];
  const references = chunks.slice(0, 3).map((chunk, index) => `${index + 1}. ${chunk.chapterTitle}「${chunk.title}」`).join("；");
  const normalized = normalize(question);
  const lines: string[] = [];
  if (first) {
    lines.push(`根据当前教材中「${first.title}」等内容，可以这样理解：${trimText(first.text, 140)}`);
  } else {
    lines.push("当前发布教材里没有命中非常直接的材料，我先给出基于本地内容的学习建议。");
  }
  if (/f\s*=?\s*ma|牛顿|第二定律|合力|质量|加速度/.test(normalized)) {
    lines.push("牛顿第二定律的核心关系是 F=ma：合力 F 越大，加速度 a 越大；质量 m 越大，在同样合力下加速度越小。方向上，加速度与合力方向一致。");
  }
  if (/实验|仿真|操作|怎么做/.test(normalized)) {
    lines.push("建议打开 F=ma 仿真实验，先固定质量改变合力，再固定合力改变质量，对比速度、位移和加速度曲线。");
  }
  if (/题|练习|作业|检测/.test(normalized)) {
    lines.push("可以到题组或作业里做一次即时检测，重点关注单选、多选、判断和填空题后的解析。");
  }
  lines.push(`学习信号：${learnerSignals}`);
  lines.push(first ? `可继续查看：${references}` : "可继续查看：教材搜索、资源中心和章节大纲。");
  return lines.join("\n");
}

function summarizeLearnerSignals(userId: string, bookVersionId: string): string {
  const report = getPersonalReport(userId, bookVersionId);
  const latestQuiz = report.quizAttempts[0];
  return [
    `已阅读约 ${Math.round(report.activeSeconds / 60)} 分钟`,
    `访问章节 ${report.visitedChapters} 个`,
    `仿真实验 ${report.simulationRuns} 次`,
    latestQuiz ? `最近测验 ${latestQuiz.score}/${latestQuiz.maxScore}` : "暂无测验提交",
    `笔记 ${report.noteCount} 条`
  ].join("，");
}

function getConversationRow(userId: string, bookVersionId: string, conversationId: string): AiConversationRow | null {
  return asRow<AiConversationRow>(
    getDb().prepare("SELECT * FROM AiConversation WHERE id = ? AND userId = ? AND bookVersionId = ?").get(conversationId, userId, bookVersionId)
  );
}

function getConversationDto(userId: string, bookVersionId: string, conversationId: string): AiConversationDto {
  const conversation = getConversationRow(userId, bookVersionId, conversationId);
  if (!conversation) {
    throw new Error("AI_CONVERSATION_NOT_FOUND");
  }
  return {
    ...conversation,
    messages: listMessagesForConversation(conversation.id)
  };
}

function listMessagesForConversation(conversationId: string): AiMessageDto[] {
  return asRows<AiMessageRow>(
    getDb().prepare("SELECT * FROM AiMessage WHERE conversationId = ? ORDER BY createdAt ASC").all(conversationId)
  ).map(toMessageDto);
}

function toMessageDto(row: AiMessageRow): AiMessageDto {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    citations: safeParseCitations(row.citationsJson),
    provider: row.provider,
    createdAt: row.createdAt
  };
}

function safeParseCitations(value: string): AiCitation[] {
  try {
    return parseJson(AiCitationListSchema, value);
  } catch {
    return [];
  }
}

function toCitation(chunk: AiChunk): AiCitation {
  return {
    chapterId: chunk.chapterId,
    chapterTitle: chunk.chapterTitle,
    nodeId: chunk.nodeId,
    nodeType: chunk.nodeType,
    title: chunk.title,
    excerpt: chunk.excerpt,
    score: chunk.score
  };
}

function titleFromQuestion(question: string): string {
  return trimText(question.replace(/\s+/g, " "), 28);
}

function excerptFor(text: string, terms: string[]): string {
  const normalizedText = normalize(text);
  const hit = terms.find((term) => normalizedText.includes(term));
  if (!hit) {
    return trimText(text, 220);
  }
  const index = Math.max(0, normalizedText.indexOf(hit) - 40);
  return trimText(text.slice(index), 220);
}

function trimText(text: string, maxLength: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized || "教材节点";
  }
  return `${normalized.slice(0, maxLength - 1)}…`;
}

function stripHtml(html: string): string {
  return decodeHtml(html.replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " "));
}

function decodeHtml(value: string): string {
  return value.replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "").replace(/[，。！？、；：,.!?;:()[\]{}"'“”‘’]/g, "");
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function stripJsonFence(value: string): string {
  return value.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(",");
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.slice(0, 180);
  }
  return "UNKNOWN_ERROR";
}

function windowlessTimeout(callback: () => void, ms: number): NodeJS.Timeout {
  return setTimeout(callback, ms);
}
