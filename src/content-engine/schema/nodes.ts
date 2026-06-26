import { z } from "zod";

const NodeBaseSchema = z.object({
  nodeId: z.string().min(1)
});

const HotspotSchema = z.object({
  id: z.string().min(1).optional(),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  title: z.string().min(1),
  body: z.string().min(1),
  target: z.string().optional()
});

const ModelHotspotSchema = z.object({
  id: z.string().min(1).optional(),
  position: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1)
});

const PanoramaHotspotSchema = z.object({
  id: z.string().min(1).optional(),
  yaw: z.number().min(-180).max(180),
  pitch: z.number().min(-90).max(90),
  title: z.string().min(1),
  body: z.string().min(1)
});

const TranscriptCueSchema = z.object({
  time: z.number().min(0),
  text: z.string().min(1)
});

const QuestionMediaSchema = z.object({
  assetId: z.string().min(1),
  title: z.string().min(1),
  kind: z.enum(["IMAGE", "AUDIO", "VIDEO", "PDF", "DOCX", "SCORM", "H5P", "OTHER"]).default("OTHER"),
  caption: z.string().default("")
});

const QuestionCommonSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  explanation: z.string().min(1),
  score: z.number().positive(),
  media: z.array(QuestionMediaSchema).default([]),
  sectionId: z.string().min(1).optional()
});

export const HeadingNodeSchema = NodeBaseSchema.extend({
  type: z.literal("heading"),
  level: z.number().int().min(1).max(6),
  text: z.string().min(1)
});

export const RichTextNodeSchema = NodeBaseSchema.extend({
  type: z.literal("richText"),
  html: z.string().min(1)
});

export const CalloutNodeSchema = NodeBaseSchema.extend({
  type: z.literal("callout"),
  tone: z.enum(["info", "key", "warning", "experiment"]),
  title: z.string().min(1),
  body: z.string().min(1)
});

export const ImageInteractiveNodeSchema = NodeBaseSchema.extend({
  type: z.literal("imageInteractive"),
  assetId: z.string().min(1),
  alt: z.string().default(""),
  caption: z.string().default(""),
  width: z.number().min(30).max(100).default(100),
  align: z.enum(["left", "center", "right"]).default("center"),
  hotspots: z.array(HotspotSchema).default([])
});

export const GalleryNodeSchema = NodeBaseSchema.extend({
  type: z.literal("gallery"),
  assetIds: z.array(z.string().min(1)).min(1),
  captions: z.array(z.string()).default([]),
  autoplay: z.boolean().default(false),
  startIndex: z.number().int().nonnegative().default(0)
});

export const AudioNodeSchema = NodeBaseSchema.extend({
  type: z.literal("audio"),
  assetId: z.string().min(1),
  title: z.string().min(1),
  coverAssetId: z.string().optional(),
  transcript: z.string().default(""),
  chapters: z.array(z.object({ time: z.number().min(0), label: z.string().min(1) })).default([]),
  downloadable: z.boolean().default(false)
});

export const VideoNodeSchema = NodeBaseSchema.extend({
  type: z.literal("video"),
  assetId: z.string().min(1),
  title: z.string().min(1),
  coverAssetId: z.string().optional(),
  captionAssetId: z.string().optional(),
  transcript: z.array(TranscriptCueSchema).default([]),
  caption: z.string().default("")
});

export const FormulaBlockNodeSchema = NodeBaseSchema.extend({
  type: z.literal("formulaBlock"),
  latex: z.string().min(1),
  number: z.string().optional(),
  caption: z.string().default(""),
  parameterDemo: z.object({ force: z.number(), mass: z.number().positive() }).optional()
});

export const ChartNodeSchema = NodeBaseSchema.extend({
  type: z.literal("chart"),
  chartType: z.enum(["line", "bar", "pie"]),
  title: z.string().min(1),
  items: z.array(z.object({ label: z.string().min(1), value: z.number() })).min(1),
  xLabel: z.string().default(""),
  yLabel: z.string().default(""),
  showLegend: z.boolean().default(true),
  theme: z.enum(["light", "dark"]).default("light"),
  color: z.string().default("#2f7dd1")
});

const RangeSchema = z.object({
  min: z.number(),
  max: z.number(),
  step: z.number().positive(),
  default: z.number()
});

export const PhysicsSimulationNodeSchema = NodeBaseSchema.extend({
  type: z.literal("physicsSimulation"),
  title: z.string().min(1),
  force: RangeSchema,
  mass: RangeSchema,
  showTrajectory: z.boolean().default(true),
  showFormula: z.boolean().default(true),
  prompt: z.string().default("")
});

export const Model3dNodeSchema = NodeBaseSchema.extend({
  type: z.literal("model3d"),
  assetId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(""),
  autoRotate: z.boolean().default(true),
  initialCamera: z.string().optional(),
  hotspots: z.array(ModelHotspotSchema).default([])
});

export const PanoramaNodeSchema = NodeBaseSchema.extend({
  type: z.literal("panorama"),
  assetId: z.string().min(1),
  title: z.string().min(1),
  initialYaw: z.number().min(-180).max(180).default(0),
  initialPitch: z.number().min(-90).max(90).default(0),
  hotspots: z.array(PanoramaHotspotSchema).default([])
});

export const ExtendedReadingNodeSchema = NodeBaseSchema.extend({
  type: z.literal("extendedReading"),
  title: z.string().min(1),
  summary: z.string().default(""),
  body: z.string().min(1),
  assetId: z.string().optional(),
  tags: z.array(z.string()).default([])
});

export const AttachmentNodeSchema = NodeBaseSchema.extend({
  type: z.literal("attachment"),
  assetId: z.string().min(1),
  title: z.string().min(1),
  preview: z.boolean().default(true)
});

export const QuizQuestionSchema = z.discriminatedUnion("type", [
  QuestionCommonSchema.extend({
    type: z.literal("single"),
    options: z.array(z.string().min(1)).min(2),
    correct: z.array(z.number().int().nonnegative()).min(1)
  }),
  QuestionCommonSchema.extend({
    type: z.literal("multiple"),
    options: z.array(z.string().min(1)).min(2),
    correct: z.array(z.number().int().nonnegative()).min(1)
  }),
  QuestionCommonSchema.extend({
    type: z.literal("boolean"),
    correct: z.boolean()
  }),
  QuestionCommonSchema.extend({
    type: z.literal("fill"),
    acceptedAnswers: z.array(z.string().min(1)).min(1)
  }),
  QuestionCommonSchema.extend({
    type: z.literal("ordering"),
    items: z.array(z.string().min(1)).min(2),
    correct: z.array(z.number().int().nonnegative()).min(2)
  }),
  QuestionCommonSchema.extend({
    type: z.literal("matching"),
    leftItems: z.array(z.string().min(1)).min(2),
    rightItems: z.array(z.string().min(1)).min(2),
    correct: z.array(z.number().int().nonnegative()).min(2)
  }),
  QuestionCommonSchema.extend({
    type: z.literal("shortAnswer"),
    rubric: z.array(z.string().min(1)).min(1),
    sampleAnswer: z.string().min(1)
  })
]);

export const QuizSetNodeSchema = NodeBaseSchema.extend({
  type: z.literal("quizSet"),
  title: z.string().min(1),
  questions: z.array(QuizQuestionSchema).min(1),
  allowRetry: z.boolean().default(true)
});

export const RecordingTaskNodeSchema = NodeBaseSchema.extend({
  type: z.literal("recordingTask"),
  title: z.string().min(1),
  prompt: z.string().min(1),
  recommendedSeconds: z.number().int().positive()
});

export const KnowledgeGraphNodeSchema = NodeBaseSchema.extend({
  type: z.literal("knowledgeGraph"),
  title: z.string().min(1),
  nodes: z.array(z.object({
    id: z.string().min(1),
    type: z.enum(["concept", "formula", "experiment", "quiz"]),
    label: z.string().min(1),
    target: z.string().optional(),
    x: z.number().optional(),
    y: z.number().optional()
  })).min(1),
  edges: z.array(z.object({
    source: z.string().min(1),
    target: z.string().min(1),
    label: z.string().default("")
  })).default([])
});

export const ContentNodeSchema = z.discriminatedUnion("type", [
  HeadingNodeSchema,
  RichTextNodeSchema,
  CalloutNodeSchema,
  ImageInteractiveNodeSchema,
  GalleryNodeSchema,
  AudioNodeSchema,
  VideoNodeSchema,
  FormulaBlockNodeSchema,
  ChartNodeSchema,
  PhysicsSimulationNodeSchema,
  Model3dNodeSchema,
  PanoramaNodeSchema,
  ExtendedReadingNodeSchema,
  AttachmentNodeSchema,
  QuizSetNodeSchema,
  RecordingTaskNodeSchema,
  KnowledgeGraphNodeSchema
]);

export type ContentNode = z.infer<typeof ContentNodeSchema>;
export type QuizQuestion = z.infer<typeof QuizQuestionSchema>;
export type QuizSetNode = z.infer<typeof QuizSetNodeSchema>;
export type PhysicsSimulationNode = z.infer<typeof PhysicsSimulationNodeSchema>;
export type ChartNode = z.infer<typeof ChartNodeSchema>;
