# 工程架构与实现约束

## 1. 推荐技术栈

保持单仓库、单进程、无付费服务和无运行时密钥依赖：

- Next.js App Router + TypeScript strict；
- Tailwind CSS + Radix/shadcn 级别基础组件 + Lucide；
- Prisma + SQLite；
- Zod；
- TipTap 及官方/社区扩展；
- dnd-kit；
- Mammoth；
- KaTeX；
- ECharts；
- `@google/model-viewer`；
- 360° 查看器可选 Photo Sphere Viewer；
- `@xyflow/react`；
- Embla Carousel；
- WaveSurfer 或自建音频波形/进度组件；
- qrcode.react；
- bcryptjs + jose；
- Vitest；
- Playwright。

不得依赖 OpenAI、地图、对象存储、视频转码、云数据库或其他需要密钥的在线 API。

## 2. 架构原则

### 2.1 功能纵向切片

每个内容节点都必须贯穿：

```text
Zod Schema
TipTap Node/Mark
编辑 NodeView
属性面板
序列化
发布快照
阅读 Renderer
传统模式降级 Renderer
事件追踪
测试
```

节点未贯穿全部链路，不算完成。

### 2.2 共享内容引擎

建议目录：

```text
src/
├── app/
│   ├── api/
│   ├── demo/
│   ├── login/
│   ├── editor/
│   ├── reader/
│   ├── teacher/
│   └── student/
├── content-engine/
│   ├── schema/
│   │   ├── document.ts
│   │   ├── nodes.ts
│   │   └── assets.ts
│   ├── editor/
│   │   ├── extensions/
│   │   ├── node-views/
│   │   ├── toolbar/
│   │   └── inspectors/
│   ├── renderer/
│   │   ├── DigitalDocument.tsx
│   │   ├── TraditionalDocument.tsx
│   │   └── nodes/
│   ├── tracking/
│   └── utils/
├── features/
│   ├── assets/
│   ├── publishing/
│   ├── reading/
│   ├── annotations/
│   ├── experiments/
│   ├── teaching/
│   └── analytics/
├── server/
│   ├── repositories/
│   ├── services/
│   └── auth/
└── components/
```

页面组件不得直接散落 Prisma 查询。业务写在 `src/server/services`。

## 3. TipTap 文档契约

每个块级节点必须有稳定 `nodeId`。建议节点：

```text
doc
paragraph
heading
text
blockquote
codeBlock
bulletList
orderedList
taskList
table
horizontalRule
hardBreak

imageInteractive
gallery
audio
video
formulaBlock
chart
physicsSimulation
model3d
panorama
extendedReading
attachment
quizSet
recordingTask
knowledgeGraph
callout
```

建议行内 Mark/Node：

```text
bold
italic
underline
strike
textStyle
color
highlight
superscript
subscript
code
link
textAlign
lineHeight
indent
formulaInline
knowledgeBubble
```

所有自定义节点的 `attrs` 由 Zod 判别联合校验。未知节点不得让阅读器崩溃，应显示明确的“不支持内容”降级卡片并上报错误。

## 4. 核心数据模型

SQLite 中 JSON 统一存字符串，并在服务边界通过 Zod 解析。

```text
User
- id, name, email, passwordHash, role
- createdAt, updatedAt

Book
- id, title, subtitle, description, coverAssetId
- ownerId, currentPublishedVersionId
- createdAt, updatedAt

Chapter
- id, bookId, parentId
- title, level, sortOrder
- createdAt, updatedAt

DraftDocument
- id, chapterId unique
- documentJson
- plainText
- revision
- updatedAt

BookVersion
- id, bookId, versionNumber
- snapshotJson
- note
- publishedAt
- unique(bookId, versionNumber)

Asset
- id, ownerId
- kind: IMAGE | AUDIO | VIDEO | MODEL3D | PANORAMA | PDF | DOCUMENT
- originalName, mimeType, size
- relativePath
- title, description
- metadataJson
- createdAt

Annotation
- id, userId, bookVersionId
- chapterId, nodeId
- quote, startOffset, endOffset
- color, note
- createdAt, updatedAt

ReadingState
- id, userId, bookVersionId
- lastChapterId, lastNodeId
- visitedChapterIdsJson
- activeSeconds
- updatedAt
- unique(userId, bookVersionId)

ActivityEvent
- id, userId
- bookVersionId nullable
- classroomId nullable
- chapterId nullable
- nodeId nullable
- eventType
- durationSeconds nullable
- progress nullable
- payloadJson nullable
- occurredAt
- receivedAt

ExperimentRun
- id, userId, bookVersionId
- chapterId, nodeId
- force, mass, acceleration
- samplesJson
- createdAt

QuizAttempt
- id, userId, bookVersionId
- chapterId, nodeId
- answersJson, score, maxScore, durationSeconds
- createdAt

RecordingSubmission
- id, userId, bookVersionId
- chapterId, nodeId
- assetId, durationSeconds
- createdAt

Course
- id, teacherId, bookId, name

Classroom
- id, courseId, name, joinCode

Enrollment
- id, classroomId, studentId
- unique(classroomId, studentId)

LiveSession
- id, classroomId
- status
- currentChapterId, currentNodeId
- startedAt, endedAt

LiveQuizSession
- id, liveSessionId, quizNodeId, questionId
- status, startedAt, endedAt

LiveQuizResponse
- id, liveQuizSessionId, studentId
- answerJson, isCorrect, submittedAt
- unique(liveQuizSessionId, studentId)

AttendanceSession
- id, classroomId, code, status, expiresAt, createdAt

AttendanceRecord
- id, attendanceSessionId, studentId
- status, source, signedAt
- unique(attendanceSessionId, studentId)
```

## 5. 发布快照

发布事务：

1. 读取教材、章节和全部 `DraftDocument`；
2. 对每章 TipTap JSON 运行完整 Schema 校验；
3. 收集引用的资产；
4. 验证资产存在；
5. 生成版本号；
6. 写入快照；
7. 更新 `currentPublishedVersionId`；
8. 提交事务。

快照至少包含：

```ts
{
  book: { id, title, subtitle, description, cover },
  versionNumber: number,
  publishedAt: string,
  chapters: [{
    id: string,
    parentId: string | null,
    title: string,
    level: number,
    sortOrder: number,
    document: TipTapJSON
  }],
  assets: [{
    id: string,
    kind: string,
    title: string,
    mimeType: string,
    url: string,
    metadata: unknown
  }]
}
```

阅读端只读此快照。

## 6. 服务与 API

可使用 Route Handlers 或 Server Actions，但业务必须进入服务层。

### 6.1 认证

```text
POST /api/auth/login
POST /api/auth/logout
POST /api/auth/demo-login
GET  /api/auth/me
```

Session 使用签名 httpOnly Cookie。演示快捷登录只能在 `DEMO_MODE=true` 时可用。

### 6.2 教材与编辑

```text
GET/POST                     /api/books
GET/PATCH/DELETE             /api/books/:bookId
GET/PATCH                    /api/chapters/:chapterId/document
POST                         /api/books/:bookId/chapters
PATCH/DELETE                 /api/chapters/:chapterId
POST                         /api/books/:bookId/chapters/reorder
POST                         /api/books/:bookId/import-docx
POST                         /api/books/:bookId/publish
GET                          /api/books/:bookId/versions
POST                         /api/books/:bookId/versions/:versionId/activate
```

文档保存必须带 `revision`，服务端进行乐观并发检查，避免旧请求覆盖新内容。

### 6.3 资源

```text
GET/POST                     /api/assets
GET/PATCH/DELETE             /api/assets/:assetId
GET                          /api/assets/:assetId/file
POST                         /api/assets/:assetId/record-usage
```

### 6.4 阅读与行为

```text
GET                          /api/reader/books/:bookId
GET                          /api/reader/books/:bookId/search?q=
GET/PUT                      /api/reader/books/:bookId/state
POST                         /api/events/batch
GET/POST                     /api/reader/books/:bookId/annotations
PATCH/DELETE                 /api/reader/annotations/:annotationId
POST                         /api/reader/books/:bookId/experiments
POST                         /api/reader/books/:bookId/quiz-attempts
POST                         /api/reader/books/:bookId/recordings
GET                          /api/reader/books/:bookId/report
```

### 6.5 教学

```text
GET/POST                     /api/courses
POST                         /api/courses/:courseId/classes
POST                         /api/classes/join
GET                          /api/classes/:classroomId

POST                         /api/classes/:classroomId/live/start
PATCH                        /api/classes/:classroomId/live/location
POST                         /api/classes/:classroomId/live/end
GET                          /api/classes/:classroomId/live/current

POST                         /api/classes/:classroomId/live-quiz
POST                         /api/live-quiz/:liveQuizId/respond
POST                         /api/live-quiz/:liveQuizId/end
GET                          /api/live-quiz/:liveQuizId/results

POST                         /api/classes/:classroomId/attendance
POST                         /api/attendance/:attendanceId/sign
PATCH                        /api/attendance/:attendanceId/records/:studentId

GET                          /api/classes/:classroomId/analytics
GET                          /api/classes/:classroomId/students/:studentId/report
```

## 7. 行为追踪

客户端实现统一 `trackingClient`：

- 事件进入内存队列；
- 每 5 秒或达到 20 条时批量发送；
- `visibilitychange` 和 `pagehide` 时用 `sendBeacon` 或 keepalive；
- 高频进度事件按节点节流；
- 服务端不信任客户端用户 ID，使用 Session；
- 服务端验证 `bookVersionId/chapterId/nodeId` 属于当前发布版本。

学习时长：

- 页面可见；
- 窗口有焦点；
- 最近 60 秒内有键盘、鼠标、触摸或媒体播放；
- 每 10 秒累计一次；
- 后台不累计。

## 8. 富媒体实现说明

### 音频

种子 WAV 可直接播放。若使用 WaveSurfer，确保服务端支持 Range 或客户端完整加载；测试环境中至少可正常播放、拖动和调速。

### 视频

使用本地 MP4 与 VTT。确保静态/受控路由支持 Range 请求，Chrome 能 seek。

### 3D

`model-viewer` 作为 client component 动态加载。提供 fallback poster 和明确加载错误。

### 全景

全景库也作为 client component；销毁时释放实例，避免路由切换后重复 canvas。

### 仿真

使用确定性纯函数：

```ts
acceleration = force / mass
velocity(t) = acceleration * t
position(t) = 0.5 * acceleration * t * t
```

动画只用于表现，保存结果来自纯函数采样。为纯函数写单元测试。

### 录音

浏览器生成 WebM/Opus 或可用格式，上传为资源并创建 `RecordingSubmission`。Playwright 不强制真实麦克风录音，可通过注入 fixture 或测试上传服务；人工验收需真实浏览器操作。

## 9. 仓库结构

```text
.
├── AGENTS.md
├── PRODUCT_SPEC.md
├── ARCHITECTURE.md
├── ACCEPTANCE_MATRIX.md
├── DEMO_STORYBOARD.md
├── README.md
├── PROGRESS.md
├── package.json
├── .env.example
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
├── seed/
│   └── lesson-blueprint.json
├── public/
│   └── demo/
├── storage/
│   └── uploads/.gitkeep
├── tests/
│   ├── unit/
│   ├── fixtures/
│   └── e2e/
└── src/
```

将任务包中的 `starter-assets` 复制或由 seed 脚本导入到应用可访问目录。

## 10. 命令

```text
npm run dev
npm run build
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run db:reset
npm run verify:demo
```

`verify:demo` 至少执行数据库重置、关键单测、E2E，并把截图写到：

```text
artifacts/demo-verification/
```

## 11. 自动化测试

单元测试至少覆盖：

- 所有自定义节点 Zod Schema；
- TipTap JSON 中资产引用收集；
- 发布快照和版本递增；
- 仿真计算；
- 事件聚合；
- 媒体完成率；
- 题组评分；
- 随堂题结果聚合；
- 签到过期和重复签到；
- 班级统计。

E2E 至少分为：

1. 编辑器富文本和表格；
2. 插入本地视频、3D 或仿真并发布；
3. 学生传统/数字视图切换；
4. 音视频、画廊、3D、全景和仿真交互；
5. 保存实验、答题、笔记；
6. 教师同步位置；
7. 教师推送随堂题，学生回答；
8. 教师统计出现新数据；
9. 手机阅读关键路径。

不得把 P0 E2E 标记为 skip。
