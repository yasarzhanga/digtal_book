export interface UserRow extends Record<string, unknown> {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: "EDITOR" | "TEACHER" | "STUDENT";
  createdAt: string;
  updatedAt: string;
}

export interface TenantRow extends Record<string, unknown> {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

export interface TenantMembershipRow extends Record<string, unknown> {
  id: string;
  tenantId: string;
  userId: string;
  role: "OWNER" | "ADMIN" | "TEACHER" | "STUDENT";
  createdAt: string;
}

export interface BookRow extends Record<string, unknown> {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  coverAssetId: string | null;
  ownerId: string;
  currentPublishedVersionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChapterRow extends Record<string, unknown> {
  id: string;
  bookId: string;
  parentId: string | null;
  title: string;
  level: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface DraftDocumentRow extends Record<string, unknown> {
  id: string;
  chapterId: string;
  documentJson: string;
  plainText: string;
  revision: number;
  updatedAt: string;
}

export interface AssetRow extends Record<string, unknown> {
  id: string;
  ownerId: string;
  kind: string;
  assetKey: string;
  originalName: string;
  mimeType: string;
  size: number;
  relativePath: string;
  title: string;
  description: string | null;
  metadataJson: string;
  createdAt: string;
}

export interface BookVersionRow extends Record<string, unknown> {
  id: string;
  bookId: string;
  versionNumber: number;
  snapshotJson: string;
  note: string;
  publishedAt: string;
}

export interface LiveSessionRow extends Record<string, unknown> {
  id: string;
  classroomId: string;
  status: "ACTIVE" | "ENDED";
  currentChapterId: string | null;
  currentNodeId: string | null;
  startedAt: string;
  endedAt: string | null;
}

export interface LiveQuizRow extends Record<string, unknown> {
  id: string;
  liveSessionId: string;
  quizNodeId: string;
  questionId: string;
  status: "ACTIVE" | "ENDED";
  startedAt: string;
  endedAt: string | null;
}

export interface AttendanceSessionRow extends Record<string, unknown> {
  id: string;
  classroomId: string;
  code: string;
  status: "ACTIVE" | "ENDED";
  requireLocation: number;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number;
  expiresAt: string;
  createdAt: string;
}

export interface CourseRow extends Record<string, unknown> {
  id: string;
  teacherId: string;
  bookId: string;
  name: string;
  createdAt: string;
}

export interface AssignmentRow extends Record<string, unknown> {
  id: string;
  classroomId: string;
  teacherId: string;
  title: string;
  instructions: string;
  status: "DRAFT" | "PUBLISHED" | "CLOSED";
  dueAt: string | null;
  sectionsJson: string;
  createdAt: string;
  publishedAt: string | null;
}

export interface AssignmentQuestionRow extends Record<string, unknown> {
  id: string;
  assignmentId: string;
  questionJson: string;
  sortOrder: number;
}

export interface AssignmentSubmissionRow extends Record<string, unknown> {
  id: string;
  assignmentId: string;
  studentId: string;
  answersJson: string;
  textAnswer: string;
  score: number | null;
  maxScore: number;
  feedback: string;
  status: "SUBMITTED" | "GRADED";
  submittedAt: string;
  gradedAt: string | null;
}

export interface QuestionBankItemRow extends Record<string, unknown> {
  id: string;
  teacherId: string;
  source: string;
  questionJson: string;
  tagsJson: string;
  createdAt: string;
}

export interface CourseResourceRow extends Record<string, unknown> {
  id: string;
  courseId: string;
  assetId: string;
  title: string;
  description: string;
  category: string;
  visibility: "TEACHER" | "CLASS";
  createdAt: string;
}

export interface SimulationTemplateRunRow extends Record<string, unknown> {
  id: string;
  userId: string;
  templateKey: string;
  inputJson: string;
  resultJson: string;
  createdAt: string;
}

export interface AiConversationRow extends Record<string, unknown> {
  id: string;
  userId: string;
  bookVersionId: string;
  title: string;
  provider: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiMessageRow extends Record<string, unknown> {
  id: string;
  conversationId: string;
  role: "USER" | "ASSISTANT";
  content: string;
  citationsJson: string;
  provider: string;
  createdAt: string;
}

export interface PlatformJobRow extends Record<string, unknown> {
  id: string;
  type: string;
  payloadJson: string;
  status: "READY" | "PROCESSING" | "DONE" | "FAILED";
  attempts: number;
  scheduledAt: string;
  lockedAt: string | null;
  completedAt: string | null;
  error: string | null;
  createdAt: string;
}

export interface BackupRecordRow extends Record<string, unknown> {
  id: string;
  path: string;
  sha256: string;
  size: number;
  createdAt: string;
}
