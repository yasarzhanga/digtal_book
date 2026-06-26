import { z } from "zod";

export const ActivityEventTypeSchema = z.enum([
  "PAGE_VIEW",
  "NODE_VIEW",
  "AUDIO_PLAY",
  "AUDIO_PROGRESS",
  "AUDIO_COMPLETE",
  "VIDEO_PLAY",
  "VIDEO_PROGRESS",
  "VIDEO_COMPLETE",
  "IMAGE_HOTSPOT_OPEN",
  "GALLERY_CHANGE",
  "FORMULA_COPY",
  "CHART_INTERACT",
  "MODEL3D_INTERACT",
  "PANORAMA_OPEN",
  "PANORAMA_HOTSPOT_OPEN",
  "SIMULATION_RUN",
  "SIMULATION_PARAMETER_CHANGE",
  "SIMULATION_SAVE",
  "KNOWLEDGE_BUBBLE_OPEN",
  "ATTACHMENT_OPEN",
  "RESOURCE_OPEN",
  "FOCUS_MODE_TOGGLE",
  "AI_QA_ASK",
  "AI_SELECTION_ACTION",
  "QUIZ_SUBMIT",
  "ANNOTATION_CREATE",
  "NOTE_CREATE",
  "TTS_START",
  "RECORDING_SUBMIT",
  "KNOWLEDGE_GRAPH_NODE_OPEN",
  "MINDMAP_EDIT",
  "ASSIGNMENT_SUBMIT",
  "ASSIGNMENT_GRADE",
  "TEACHER_SYNC",
  "LIVE_QUIZ_SUBMIT",
  "ATTENDANCE_SIGN"
]);

export type ActivityEventType = z.infer<typeof ActivityEventTypeSchema>;

export const ActivityEventInputSchema = z.object({
  bookVersionId: z.string().optional(),
  classroomId: z.string().optional(),
  chapterId: z.string().optional(),
  nodeId: z.string().optional(),
  eventType: ActivityEventTypeSchema,
  durationSeconds: z.number().nonnegative().optional(),
  progress: z.number().min(0).max(1).optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
  occurredAt: z.string().datetime().optional()
});

export const ActivityBatchSchema = z.object({
  events: z.array(ActivityEventInputSchema).min(1).max(50)
});

export type ActivityEventInput = z.infer<typeof ActivityEventInputSchema>;
