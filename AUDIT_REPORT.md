# AUDIT_REPORT

审计日期：2026-06-27  
审计范围：`src/app/api` 全部 Route Handler、`src/app/**/page.tsx` 页面路由、`src/server/services` 服务层、`tests`。  
审计方式：静态读取与模式扫描；本轮按要求只做审计，未修改业务代码，未重新运行测试命令。

## 结论摘要

- API 层大部分编辑、教学、课堂、作业接口已经具备角色校验和归属校验，核心守卫集中在 `src/server/auth/guards.ts`。
- 最高风险不在 P0 功能是否可操作，而在访问控制边界不一致：部分页面路由绕过 API 直接调用服务，且只做 `requireUser`；部分 reader/book API 只校验登录或学生身份，没有校验该用户是否有权访问对应 `bookId/bookVersionId/classroomId`。
- 资产文件下载 `/api/assets/[assetId]/file` 当前无登录校验，且资源包含学生录音、课程资源和上传文件，属于优先修复项。
- 学习行为事件没有信任客户端 `userId`，这一点正确；但事件中的 `bookVersionId/classroomId` 仍由客户端提供，缺少用户可写范围校验，存在统计污染风险。
- 当前 README 对云化、SCORM/H5P、CAD/DICOM/Visio、AI、DOCX 等能力有降级说明，未发现继续宣称生产级完整能力的核心文案；但 UI 中部分标题仍容易让演示对象误解为完整运行时支持。

## 测试编号

| 编号 | 文件/范围 | 当前覆盖 |
|---|---|---|
| U1 | `tests/unit/core.test.ts` / content engine and publishing | Schema、发布、草稿 revision、DOCX 导入 |
| U2 | `tests/unit/core.test.ts` / learning interactions | 仿真、题组、学习事件、标注、媒体进度、搜索 |
| U3 | `tests/unit/core.test.ts` / teaching loop | 课程班级、入班、随堂题、签到、班级统计、资源明细导出 |
| U4 | `tests/unit/core.test.ts` / security guards | DEMO_MODE、编辑者/教师/学生守卫、未入班课堂动作 |
| U5 | `tests/unit/core.test.ts` / P1 workflows | AI、本地回退、作业、题库导入、资源、导出、脑图、公式、预览 |
| U6 | `tests/unit/core.test.ts` / cloud readiness | 本地对象存储、备份、租户 RBAC、PostgreSQL 迁移骨架 |
| E1 | `tests/e2e/demo.spec.ts` / editor | TipTap、DOCX、图表、公式、发布 |
| E2 | `tests/e2e/demo.spec.ts` / reader | AI 右栏、媒体、仿真、3D、全景、题组、笔记、录音、报告 |
| E3 | `tests/e2e/demo.spec.ts` / teacher | 建班入班、同步、随堂题、签到、统计 |
| E4 | `tests/e2e/demo.spec.ts` / P1 | 作业、题库、资源、导出、脑图、仿真模板、AI |
| E5 | `tests/e2e/demo.spec.ts` / screenshots | 1440/834/390 截图 |
| GAP | 缺失 | 多数 Route Handler 无直接负向 API 集成测试；页面级权限也缺少专门测试 |

## API 权限与归属矩阵

状态含义：通过 = 角色与归属边界基本匹配；部分 = 有校验但范围不完整；缺失 = 关键边界未校验；公开/会话 = 登录相关接口按预期公开或仅返回当前会话。

| API | 方法 | 角色要求 | 归属/范围校验 | 现状 | 缺失风险 | 对应测试 |
|---|---:|---|---|---|---|---|
| `/api/assets/[assetId]/file` | GET | 无 | 仅 `getAssetFile` 防目录穿越 | 缺失 | 未登录用户可读取任意已知 assetId 文件；学生录音、课程资源、上传附件可能泄露 | U5 间接预览；GAP 负向 |
| `/api/assets/[assetId]/preview` | GET | 登录用户 | 无资产 owner/引用范围校验 | 部分 | 任意登录用户可预览任意资产元数据或转换内容 | U5/E4 间接；GAP 负向 |
| `/api/assets/[assetId]` | GET/DELETE | EDITOR/TEACHER | DELETE 有 `ensureAssetOwner`；GET 无 owner | 部分 | GET 可查看任意资产引用关系；DELETE 安全性较好 | U5 间接；GAP 负向 |
| `/api/assets` | GET/POST | EDITOR/TEACHER | POST 绑定上传 owner；GET `listAssets()` 全量 | 部分 | 多编辑者/教师场景下资产目录互相可见 | U5/E1；GAP 负向 |
| `/api/assignments/[assignmentId]/submit` | POST | STUDENT | 服务校验作业发布状态和学生入班 | 通过 | 低；需补 route 负向测试 | U5/E4 |
| `/api/attendance/[attendanceId]/records/[studentId]` | PATCH | TEACHER | `ensureAttendanceTeacher` | 通过 | 低 | U3/U4/E3 |
| `/api/attendance/[attendanceId]/sign` | POST | STUDENT | `ensureAttendanceStudent`、签到码校验 | 通过 | 低 | U3/U4/E3 |
| `/api/auth/demo-login` | POST | DEMO_MODE | `demoLogin` 仅显式 `DEMO_MODE=true` | 通过 | 低；生产环境依赖配置正确 | U4/E1-E4 |
| `/api/auth/login` | POST | 公开 | 密码登录服务 | 公开/会话 | 低；需补登录限速/审计不属于当前 Demo | E2/E3 间接 |
| `/api/auth/logout` | POST | 公开 | 清理会话 Cookie | 公开/会话 | 低 | E2/E3 间接 |
| `/api/auth/me` | GET | 当前会话 | `getCurrentUser` | 公开/会话 | 低 | E2/E3 间接 |
| `/api/books/[bookId]/chapters/reorder` | POST | EDITOR | `ensureBookOwner` | 通过 | 低 | E1/U1 |
| `/api/books/[bookId]/chart-import` | POST | EDITOR | `ensureBookOwner` | 通过 | 低 | U5/E1 |
| `/api/books/[bookId]/import-docx` | POST | EDITOR | `ensureBookOwner` | 通过 | 低 | U1/E1 |
| `/api/books/[bookId]/publish` | POST | EDITOR | `ensureBookOwner`；发布事务在服务层 | 通过 | 低 | U1/E1 |
| `/api/books/[bookId]` | GET | EDITOR | `ensureBookOwner` | 通过 | 低 | U4/E1 |
| `/api/books/[bookId]/versions/[versionId]/activate` | POST | EDITOR | `ensureBookOwner`；服务确认 version 属于 book | 通过 | 低 | U1 |
| `/api/books/[bookId]/versions` | GET | EDITOR | `ensureBookOwner` | 通过 | 低 | E1 间接 |
| `/api/books` | GET | EDITOR | 无 owner 过滤，`listBooks()` 全量 | 部分 | 多编辑者场景下可见全部教材列表 | U4 间接；GAP 负向 |
| `/api/chapters/[chapterId]/document` | PATCH | EDITOR | `ensureChapterBookOwner` | 通过 | 低 | U1/E1 |
| `/api/chapters/[chapterId]` | PATCH | EDITOR | `ensureChapterBookOwner` | 通过 | 低 | E1 间接 |
| `/api/classes/[classroomId]/analytics/export` | GET | TEACHER | `ensureClassroomTeacher` | 通过 | 低 | U3/U5/E4 |
| `/api/classes/[classroomId]/analytics` | GET | TEACHER | `ensureClassroomTeacher` | 通过 | 低 | U3/E3 |
| `/api/classes/[classroomId]/assignments/[assignmentId]/close` | POST | TEACHER | `ensureClassroomTeacher`；服务按 assignment | 通过 | 低；需补 assignment 属于 classroom 的 route 负向 | U5 |
| `/api/classes/[classroomId]/assignments/[assignmentId]/publish` | POST | TEACHER | `ensureClassroomTeacher`；服务按 assignment | 通过 | 低；需补 route 负向 | U5/E4 |
| `/api/classes/[classroomId]/assignments/[assignmentId]/submissions/[submissionId]` | PATCH | TEACHER | `ensureClassroomTeacher`；服务批改 | 通过 | 低；需补 submission/classroom 不匹配测试 | U5/E4 |
| `/api/classes/[classroomId]/assignments/[assignmentId]/submissions` | GET | TEACHER | `ensureClassroomTeacher` | 通过 | 低 | U5/E4 |
| `/api/classes/[classroomId]/assignments` | GET/POST | GET: TEACHER/STUDENT；POST: TEACHER | GET 分支校验教师归属或学生入班；POST 校验教师归属 | 通过 | 低 | U5/E4 |
| `/api/classes/[classroomId]/attendance` | GET/POST | TEACHER | `ensureClassroomTeacher` | 通过 | 低 | U3/E3 |
| `/api/classes/[classroomId]/live-quiz` | POST | TEACHER | `ensureClassroomTeacher` | 通过 | 低 | U3/E3 |
| `/api/classes/[classroomId]/live/current` | GET | TEACHER/STUDENT | 教师归属或学生入班分支 | 通过 | 低 | U4/E3 |
| `/api/classes/[classroomId]/live/end` | POST | TEACHER | `ensureClassroomTeacher` | 通过 | 低 | E3 |
| `/api/classes/[classroomId]/live/location` | PATCH | TEACHER | `ensureClassroomTeacher` | 通过 | 低 | E3 |
| `/api/classes/[classroomId]/live/start` | POST | TEACHER | `ensureClassroomTeacher` | 通过 | 低 | E3 |
| `/api/classes/[classroomId]/question-bank` | GET/POST | TEACHER | `ensureClassroomTeacher` | 通过 | 低 | U5/E4 |
| `/api/classes/[classroomId]/question-bank/template` | GET | TEACHER | `ensureClassroomTeacher` | 通过 | 低 | E4 |
| `/api/classes/[classroomId]/resources/learning` | GET | TEACHER | `ensureClassroomTeacher` | 通过 | 低 | U3/E4 |
| `/api/classes/[classroomId]/resources` | GET/POST | GET: TEACHER/STUDENT；POST: TEACHER | GET 分支校验教师归属或学生入班；POST 校验教师归属 | 通过 | 低 | U5/E4 |
| `/api/classes/[classroomId]` | GET/PATCH/DELETE | GET: TEACHER/STUDENT；PATCH/DELETE: TEACHER | GET 分支校验；写操作由服务层校验教师归属 | 通过 | 低 | U3/E3 |
| `/api/classes/[classroomId]/students/[studentId]/report` | GET | TEACHER | `ensureClassroomTeacher`；服务确认学生在班 | 通过 | 学生报告聚合当前统计未限定到该班教材，教师可能看到该学生跨教材历史 | U3/E3 |
| `/api/classes/join` | POST | STUDENT | 通过邀请码加入；服务幂等 | 通过 | 低 | U3/E3 |
| `/api/courses/[courseId]/classrooms` | POST | TEACHER | 服务 `ensureCourseTeacher` | 通过 | 低 | U3 |
| `/api/courses/[courseId]` | PATCH/DELETE | TEACHER | 服务 `ensureCourseTeacher` | 通过 | 低 | U3 |
| `/api/courses` | GET/POST | TEACHER | GET 按 teacherId；POST 未校验 `bookId` 可教学范围 | 部分 | 教师可用猜到的 `bookId` 创建课程，绕过教材授权/发布状态 | U3；GAP 负向 |
| `/api/events/batch` | POST | 登录用户 | 服务端使用 session userId；未校验 event 的 bookVersionId/classroomId 可写范围 | 部分 | 用户可向无权版本/班级写学习事件，污染个人/班级统计 | U2；GAP 负向 |
| `/api/formula-assistant` | POST | 登录用户 | 无教材/角色范围；仅公式建议 | 部分 | 低到中；可被学生调用编辑辅助能力，需限流和角色策略 | U5/E1 |
| `/api/formula-templates` | GET | 登录用户 | 无 | 通过 | 低，模板为公开学习资源 | U5 |
| `/api/live-quiz/[liveQuizId]/end` | POST | TEACHER | `ensureLiveQuizTeacher` | 通过 | 低 | U4/E3 |
| `/api/live-quiz/[liveQuizId]/respond` | POST | STUDENT | `ensureLiveQuizStudent` | 通过 | 低 | U4/E3 |
| `/api/live-quiz/[liveQuizId]/results` | GET | TEACHER | `ensureLiveQuizTeacher` | 通过 | 低 | U3/E3 |
| `/api/platform/readiness` | GET/POST | GET: 非 STUDENT；POST: EDITOR/TEACHER | 无管理员/租户 owner 级别限制 | 部分 | 任意教师可查看备份列表并触发本地 DB backup；生产化前需升为平台管理员权限 | U6/E4 |
| `/api/reader/annotations/[annotationId]` | PATCH/DELETE | STUDENT | SQL 按 `id AND userId` 更新/删除 | 通过 | 低；未返回未命中错误但不会越权修改 | U2/E2 |
| `/api/reader/books/[bookId]/ai` | GET/POST | 登录用户 | 无 book/classroom 访问校验；AI 服务校验当前版本但不校验用户可读 | 部分 | 任意登录用户可对任意已知 bookId 发问/查看自己在该版本的对话 | U5/E2/E4 |
| `/api/reader/books/[bookId]/annotations` | GET/POST | STUDENT | GET 按 userId+当前 version；POST 接收客户端 bookVersionId，未绑定 URL bookId | 部分 | 学生可为任意版本写标注，污染笔记/报告 | U2/E2 |
| `/api/reader/books/[bookId]/experiments` | POST | STUDENT | 无 URL bookId/version 绑定；输入携带 bookVersionId | 部分 | 学生可向任意版本写实验记录 | U2/E2 |
| `/api/reader/books/[bookId]/mindmap` | GET/PUT | STUDENT | 按 userId+bookId；无教材访问/入班校验 | 部分 | 任意学生可读写任意已知教材的个人脑图 | U5/E4 |
| `/api/reader/books/[bookId]/quiz-attempts` | POST | STUDENT | 用 URL bookId 快照查题；写入仍使用客户端 bookVersionId | 部分 | 可把某书答题结果写到另一个版本统计 | U2/E2 |
| `/api/reader/books/[bookId]/recordings` | POST | STUDENT | 录音 asset owner 正确；提交记录未绑定 URL bookId/version | 部分 | 可向任意版本写录音任务记录；文件下载另受资产文件公开问题影响 | U2/E2 |
| `/api/reader/books/[bookId]/report/export` | GET | STUDENT | 按 session userId；无教材访问/入班校验 | 部分 | 任意学生可导出自己在任意已知 bookId 的空/已有报告 | U5/E4 |
| `/api/reader/books/[bookId]/report` | GET | STUDENT | 按 session userId；无教材访问/入班校验 | 部分 | 任意学生可查询自己在任意已知 bookId 的报告 | U2/E2 |
| `/api/reader/books/[bookId]/resources` | GET | 登录用户 | 无教材访问校验 | 部分 | 任意登录用户可聚合任意已知教材资源清单 | U2/E2 |
| `/api/reader/books/[bookId]` | GET | 登录用户 | 无教材访问校验；读取当前发布快照 | 部分 | 任意登录用户可读取任意已知 published book 快照 | E2；GAP 负向 |
| `/api/reader/books/[bookId]/search` | GET | 登录用户 | 无教材访问校验 | 部分 | 任意登录用户可检索任意已知教材正文/资源索引 | U2/E2 |
| `/api/reader/books/[bookId]/simulation-templates` | GET/POST | STUDENT | GET 全局模板；POST 默认 URL 当前 version，但也可传客户端 bookVersionId | 部分 | 可写入任意版本仿真模板运行记录 | U5/E4 |
| `/api/reader/books/[bookId]/state` | PUT | STUDENT | Route 未读取 URL `bookId`；完全信任输入中的 bookVersionId/chapterId | 部分 | 阅读状态可写入任意版本，污染学习轨迹 | U2/E2 |

## 页面路由审计

| 页面 | 当前校验 | 服务层归属情况 | 风险 |
|---|---|---|---|
| `/`、`/login` | 公开 | 无敏感数据 | 低 |
| `/demo` | 页面公开；按钮依赖 demo-login | DEMO_MODE 在服务层限制 | 低 |
| `/editor/books` | `requireUser` | `listBooks()` 全量，无角色/owner 参数 | 高：学生/教师可进入并看到教材列表 |
| `/editor/books/[bookId]` | `requireUser` | `getEditorBook(bookId)` 无 owner 参数，返回草稿 | 高：任意登录用户可读编辑草稿 |
| `/editor/books/[bookId]/assets` | `requireUser` | `listAssets()` 全量 | 高：任意登录用户可读资产目录和引用 |
| `/editor/books/[bookId]/preview` | `requireUser` | 复用 reader snapshot，未校验 editor owner | 中高 |
| `/editor/books/[bookId]/versions` | `requireUser` | 版本列表无 owner 参数 | 中高 |
| `/join`、`/student/classes`、`/student/classes/join` | `requireStudent` | 学生服务按 userId | 低 |
| `/reader/books/[bookId]` | 登录用户；仅有 classroomId 时校验教师/学生 | 无 classroomId 时任意登录用户可读 published snapshot | 中：如果教材应按课程授权，需要收紧 |
| `/reader/books/[bookId]/ai` | `requireUser` | AI API 无 book access；页面无补充 | 中 |
| `/reader/books/[bookId]/notes` | `requireUser` | 只按 userId+version 查注释；无 book access | 中 |
| `/reader/books/[bookId]/experiments` | `requireUser` | 只按 userId+version 查报告；无 book access | 中 |
| `/reader/books/[bookId]/mindmap` | `requireUser` | API 要求 student；页面可被非学生进入后再失败/空态 | 中 |
| `/reader/books/[bookId]/report` | `requireStudent` | 只按 userId+bookId；无入班校验 | 中 |
| `/reader/books/[bookId]/resources` | `requireUser`；带 classroomId 时校验 | 无 classroomId 时任意登录用户可读资源 | 中 |
| `/reader/books/[bookId]/resources/[assetId]` | `requireUser`；带 classroomId 时校验 | 预览 asset 未绑定 book/class | 中高 |
| `/reader/books/[bookId]/assignments` | `requireStudent` + 入班校验 | 边界较完整 | 低 |
| `/reader/books/[bookId]/simulations` | `requireStudent` + 入班校验 | 边界较完整 | 低 |
| `/teacher/courses` | `requireUser` | `listTeacherCourses(user.id)`；API 写操作会挡住 | 低到中：学生可看到教师页空壳 |
| `/teacher/classes/[classroomId]` | 无，直接 redirect | 目标页决定风险 | 中 |
| `/teacher/classes/[classroomId]/live` | `getCurrentUser` | `getClassroom/getCurrentLive` 无教师归属参数 | 高：任意登录用户可看课堂状态和教材快照 |
| `/teacher/classes/[classroomId]/analytics` | `requireUser` | `getClassAnalytics/getResourceLearningDetails` 无教师归属参数 | 高：任意登录用户可看班级统计 |
| `/teacher/classes/[classroomId]/students/[studentId]` | `requireUser` | `getStudentReport` 只校验学生在班，不校验访问者是教师 | 高：任意登录用户可看学生详情 |
| `/teacher/classes/[classroomId]/resources` | `requireUser` | `listCourseResourcesForClassroom` 不校验教师/学生归属 | 高：任意登录用户可看课程资源 |
| `/teacher/classes/[classroomId]/assignments` | `requireUser` | `listAssignmentsForTeacher` 内部 `ensureClassroomTeacher` | 低到中：页面入口角色松，但服务会挡住 |
| `/teacher/classes/[classroomId]/question-bank` | `requireUser` | 先调用 `listAssignmentsForTeacher` 做教师归属校验 | 低到中 |

## 服务层边界备注

- `src/server/services/books.ts` 的 `getEditorBook()`、`listBooks()` 不带 user 参数；API 用守卫弥补，但页面直接调用时会泄露草稿与版本信息。
- `src/server/services/assets.ts` 的 `getAssetFile()` 做了目录穿越防护和文件存在性校验，但不负责权限；调用方 `/api/assets/[assetId]/file` 当前也没有权限。
- `src/server/services/reader.ts` 多个写入服务按 `userId` 写个人数据，但没有验证 `bookVersionId/chapterId/nodeId` 是否属于 URL 中的 `bookId` 当前发布版本。
- `src/server/services/events.ts` 正确使用服务端 session userId；仍需补 `bookVersionId/classroomId` 可写范围校验。
- `src/server/services/teaching.ts` 的 `createCourseWithClassroom()` 未校验传入 `bookId` 是否为可教学/已发布/授权教材。
- `src/server/services/p1.ts` 中 `listCourseResourcesForClassroom()` 依赖调用者先做权限；API 已做，页面未完全做。
- `src/server/services/cloud.ts` 本地 readiness 能力有测试，但 API 权限是 EDITOR/TEACHER，不是平台管理员/租户 owner 粒度。

## 原技术参数能力实现级别

| 原技术参数能力 | 当前级别 | 证据/说明 |
|---|---|---|
| B/S 跨终端编辑、预览、阅读 | 已实现 | Next App Router；1440/834/390 E2E 截图；README/PROGRESS 记录 |
| Word/DOCX 导入章节、格式、图片、表格、链接 | 已实现 | `mammoth` 导入、预览统计、确认写草稿；复杂浮动布局降级 |
| Word 高保真版式、复杂域、公式 OCR、MathType 完整转换 | Demo 降级 | README 明确不在本地 Demo 范围 |
| TipTap 富文本 H1-H6、字号、样式、列表、表格、快捷键 | 已实现 | E1 与编辑器代码覆盖；真实 TipTap 而非简单 contenteditable |
| 格式刷、行高、缩进、Word/HTML 粘贴、Markdown 快捷 | 已实现 | PROGRESS 第二阶段记录，E2E 覆盖核心路径 |
| 表格增删、合并拆分、等宽、自适应、Excel/TSV 粘贴、斜线表头快捷 | 已实现 | P0 表格 + P1 增强；复杂商业表格能力仍非完整办公套件 |
| 图片热点、放大、拖拽宽度、画廊 | 已实现 | content-engine 节点、编辑属性、reader 交互、E2 |
| 音频/视频本地播放、字幕/文字稿、倍速、进度事件 | 已实现 | 本地素材、reader 事件与报告聚合 |
| 公式 LaTeX、KaTeX、模板、参数演示、复制 | 已实现 | `formula-templates`、公式属性面板、E1/U5 |
| 公式图片识别、手写识别、完整 MathType、生产级 AI 公式识别 | 未实现 | README 明确排除 OCR/手写/完整 MathType |
| 交互图表折线/柱状/饼图、Excel 导入、图例/悬停/导出 SVG | 已实现 | U5/E1；图表数据来自服务/节点，不是硬编码统计 |
| 词云、多系列复杂图表、完整图表撤销栈、PNG 高保真导出 | Demo 降级 | 当前为演示图表编辑器，不等同商业 BI |
| F=ma 仿真真实计算、运行保存、个人报告 | 已实现 | U2/E2；`acceleration/sampleMotion` 和 DB 记录 |
| 更多仿真模板 | 已实现 | 抛体、弹簧、摩擦等 P1 模板与保存记录 |
| 3D GLB 模型、旋转、缩放、热点、重置 | 已实现 | 本地 `force-cart.glb`，E2 覆盖 |
| 360 全景、拖动、缩放、热点、全屏/重置 | 已实现 | 本地全景图，E2 覆盖 |
| 知识气泡、扩展阅读、提示块 | 已实现 | content-engine 节点和 reader 事件 |
| PDF 在线预览 | 已实现 | PDF iframe/受控路由；E4 覆盖 |
| DOCX/XLSX 本地预览 | Demo 降级 | DOCX 转 HTML、XLSX 网格；非完整 Office/WPS 渲染 |
| PPTX/OFD/RTF/XMind/邮件/压缩包/TIFF/PSD/EPS/CAD/DICOM/Visio 等 100+ 文件在线浏览 | Demo 降级 / 未实现 | CAD/DICOM/Visio 仅识别与降级预览；README 已明确不支持完整百余种转换 |
| SCORM/H5P | Demo 降级 | 资产类型、上传、入口、下载；无完整 SCORM Runtime/H5P Player |
| 四类 P0 题型 | 已实现 | 单选、多选、判断、填空；U2/E2 |
| P1 排序、配对、解答题、题内媒体、大题结构 | 已实现 | U5/E4 |
| 作业发布、提交、批改、反馈 | 已实现 | Assignment 表、教师/学生页、U5/E4 |
| 题库 Excel 批量导入与模板下载 | 已实现 | `exceljs` 服务、模板 API、U5/E4 |
| 录音任务 MediaRecorder、提交、报告 | 已实现 | reader 录音提交和报告聚合；受浏览器权限影响 |
| 知识图谱关系图/路径/题组联动 | 已实现 | PROGRESS 第五阶段，E2 |
| 笔记生成可编辑思维导图 | 已实现 | MindMapState、GET/PUT、U5/E4 |
| AI 问答外部接口 + 本地教材引用 | 已实现 | OpenAI-compatible 配置、本地回退、SSE、U5/E2/E4 |
| AI 企业知识库、联网检索、生产级问答治理 | Demo 降级 | README 已说明外部接口可选，非企业知识库 |
| 阅读设置：字号、行高、主题、内容宽度、专注模式 | 已实现 | reader UI 与用户截图修复历史 |
| 全文/资源搜索 | 已实现 | 正文和资源 metadata.searchText；U2 |
| 传统教材与数字教材同发布版本切换 | 已实现 | ReaderClient 同一 snapshot 渲染传统/数字模式 |
| 学习行为、个人报告、班级报告来自 DB | 已实现 | ActivityEvent/ReadingState/QuizAttempt 等聚合；U2/U3 |
| 教师同步位置、随堂题、签到 | 已实现 | LiveSession/LiveQuiz/Attendance；E3 |
| 地理位置签到/距离记录 | 已实现 | Demo 级 geolocation；U3/E3 |
| 资源学习明细和导出 | 已实现 | `getResourceLearningDetails`、XLSX 导出；U3/E4 |
| 报告 XLSX/SVG 导出 | 已实现 | P1 workbook/SVG 服务；U5/E4 |
| 课程资源独立管理 | 已实现 | CourseResource、资源页、API；权限页面需修 |
| 课程/班级 CRUD、邀请码/二维码入班 | 已实现 | U3/E3 |
| 云存储、PostgreSQL、租户、备份、队列 | Demo 降级 | 本地 readiness、迁移骨架、SQLite backup；非生产云服务 |
| 真实短信/微信/外部身份登录 | 未实现 | README 明确不包含 |
| OV SSL、生产域名、商业云灾备 | 未实现 | 本地 Demo 不交付生产证书/云灾备 |
| 双层 PDF 出版导出、带目录和媒体打包 | 未实现 | README/PRODUCT_SPEC 明确不做 |
| 作者操作审计日志 | Demo 降级 | 学习事件完整；编辑操作日志未形成独立审计台账 |
| 多人实时协同编辑 | 未实现 | 明确不在 P0/P1 |
| 文案误导项 | Demo 降级 | 当前 README 有清晰边界；UI 标题如“资源、SCORM 与 H5P”“Office/WPS 文档转 HTML 预览”建议继续加“降级/入口”提示，避免误解为完整运行时 |

## 按风险排序的修复清单

1. 保护资产文件下载：`/api/assets/[assetId]/file` 必须要求登录，并按教材发布资源、课程资源、学生本人录音或资产 owner 校验访问；同时为 PDF/audio/video range 请求保留可播放能力。
2. 为 reader 建立统一 `ensureBookReadable(user, bookId, classroomId?)` 和 `ensureBookVersionWritable(user, bookVersionId)`：所有 reader API、AI、搜索、资源、报告、状态、标注、实验、录音、仿真模板都复用，不再各自信任 URL 或客户端版本。
3. 页面路由补齐角色与归属校验：编辑器页面改为 `requireEditor + ensureBookOwner`；教师 live/analytics/student/resources 页面改为 `requireTeacher + ensureClassroomTeacher`；资源详情绑定 book/class。
4. 修改服务层敏感读取函数签名：`getEditorBook/listBooks/listAssets/listCourseResourcesForClassroom/getClassAnalytics/getCurrentLive/getStudentReport` 增加 user/role 参数或只暴露已校验 wrapper，避免页面直接绕过 API。
5. 修复学习事件统计污染：`recordEvents` 写入前校验每条事件的 `bookVersionId/classroomId` 与当前用户可访问范围；对高频事件保留批量校验和限流。
6. 修复 reader 写入的版本绑定：标注、阅读状态、实验、答题、录音、仿真模板 POST/PUT 必须从 URL `bookId` 推导当前 version 或验证 input version 属于该 book；不再接受不匹配的客户端 `bookVersionId`。
7. 课程创建校验 `bookId`：教师只能基于已发布、允许教学的教材创建课程；如存在编辑者/教师协作模型，需要明确授权表。
8. 收紧平台 readiness/backup：从 EDITOR/TEACHER 提升为平台管理员或租户 OWNER；备份列表按租户或环境权限过滤。
9. 资产列表和引用接口按 owner/引用范围过滤：`GET /api/assets` 和 `GET /api/assets/[assetId]` 不应跨 owner 返回全部资产。
10. 补充 route 负向集成测试：覆盖未登录、错角色、错 owner、未入班、错 bookVersionId、错 classroomId、错 assetId 等路径；把页面级权限纳入 Playwright。
11. 学生报告聚合限定到班级教材范围：教师查看某班学生时，只统计该班课程 book/version 的数据，避免跨课程历史混入。
12. UI 文案降级标识继续加强：SCORM/H5P、CAD/DICOM/Visio、Office/WPS 预览、云 readiness 页面在标题旁直接显示“演示级/降级预览/入口”，降低验收误读。

