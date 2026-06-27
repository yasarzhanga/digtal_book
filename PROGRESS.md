# PROGRESS

更新时间：2026-06-27

## 当前状态

- 已阅读并以 `AGENTS.md`、`PRODUCT_SPEC.md`、`ARCHITECTURE.md`、`ACCEPTANCE_MATRIX.md`、`DEMO_STORYBOARD.md`、`seed/lesson-blueprint.json` 为验收基线。
- 已完成 Next App Router、TypeScript strict、Zod、TipTap、SQLite、Vitest、Playwright 工程。
- 已完成共享 `content-engine`、SQLite 种子数据、认证 Session、草稿保存与事务化发布、富媒体纵向链路、阅读器、教学端、报告聚合与验证截图。
- P1 已继续完成：作业发布与批改、题库 Excel 导入、笔记思维导图、报告 XLSX/SVG 导出、课程资源独立管理、更多仿真模板、SCORM/H5P 资源包、公式模板扩展。
- P1 追加完成：AI 问答模块，支持外部 OpenAI-compatible 接口配置，并以本地教材发布内容作为引用上下文；阅读端右侧栏已把 AI 助教作为主体组件，未配置密钥时提供本地参考回答。
- 对照 `数字教材技术方案.doc` 的第一阶段增强已启动：阅读端专注模式、章节边界换章、选中文字 AI 工具入口、AI SSE 流式响应、资源/文件检索与资源学习事件已完成并进入测试。
- 第二阶段编辑器核心增强已完成本轮闭环：真实 DOCX 上传导入、章节拖拽排序、富媒体组件拖拽排序、原文段落拖拽排序、Word/HTML 安全粘贴、Excel/TSV 粘贴成表格、行高、缩进、格式刷、图片宽度/对齐快捷属性、图片拖拽缩放、表格列等宽/自适应/斜线表头快捷工具、Markdown 快捷输入提示已完成，并进入 E2E 覆盖。
- 第三阶段题库/试卷产品化已完成本轮闭环：题型扩展到排序题、配对题、解答题；题内富媒体进入题目 Schema、Excel 导入、AI 上下文、教材题组和作业题；作业保存大题结构；教师端支持拖拽组卷、调整顺序、分配大题、发布与批改；学生端按大题作答并提交排序/配对/解答题。
- 第四阶段图表/公式/仿真增强已完成本轮闭环：图表属性编辑器、Excel 图表导入、公式 LaTeX 编辑器、符号面板、模板套用、参数示例、外部 AI 公式助手和本地规则回退已进入编辑发布 E2E。
- 第五阶段脑图和知识图谱升级已完成本轮闭环：笔记脑图可编辑并持久化到 SQLite，刷新恢复；知识图谱支持关系图/学习路径/习题联动三模式、节点搜索、原文定位和题组跳转。
- 第六阶段文件在线预览体系已完成本轮闭环：资源预览服务、预览 API、资源详情页、阅读器附件内嵌预览、PDF 原生预览、DOCX 本地 HTML 转换、XLSX 网格预览、SCORM/H5P 启动降级、CAD/DICOM/Visio 专业格式识别与安全降级均已进入测试。
- 第七阶段教学系统生产化已完成本轮闭环：课程/班级 CRUD、二维码入班链接、`/join` 入班页、地理位置签到、签到距离记录、资源学习明细和 XLSX 导出已接入教师端并进入 E2E。
- 第八阶段云化和安全相关仅作为本地 Demo readiness：`proxy.ts` 安全头、租户 RBAC 服务、平台队列、SQLite 备份、对象存储本地适配、外部登录配置状态、PostgreSQL 迁移骨架和云化说明已进入测试；不声称为生产云服务。
- 资源检索已补齐文件内容索引：DOCX/XLSX/TEXT/VTT 上传和种子会生成 `metadata.searchText`，资源中心和教材搜索可按文件正文命中；已修复 DOCX 导入刷新竞态和富媒体自动保存标记。
- 权限与数据边界修复已完成：资产下载/预览/列表、教材版本读写、编辑/教师/阅读页面、学习事件、统计聚合、课程创建和 readiness 备份入口均已补统一守卫和负向测试。

## Beta 加固冲刺

| 检查点 | 目标 | 已完成代码 | 验证命令/证据 | 失败项 | 剩余风险 |
|---|---|---|---|---|---|
| 1. 验证口径可信 | `verify:demo` 内部执行 reset/lint/typecheck/test/e2e/build 并检查三尺寸截图 | `scripts/verify-demo.ts` 已改为顺序执行完整命令链 | `npm run verify:demo` 于 2026-06-27 11:25 通过，内部完成 reset/lint/typecheck/test/e2e/build 和截图检查 | 暂无 | 无 |
| 2. 权限和归属 | 编辑、教师、学生 API 有统一角色与归属校验 | `src/server/auth/guards.ts`；编辑/教师/学生核心 API 已接入守卫；`DEMO_MODE` 仅显式 true 开启 | `npm run test`，权限用例覆盖学生不能发布/开课、编辑者不能签到、未入班不能答题签到 | 暂无 | 仍需 E2E 验证角色流程 |
| 3. DOCX 快速组稿 | H1/H2 拆章节、预览统计、确认导入、表格和图片处理 | `src/server/services/books.ts`、导入 API、编辑器导入面板 | `npm run test` 覆盖上传导入；E2E 已补预览和确认路径 | 暂无 | 复杂 Word 浮动布局和公式 OCR 明确为 Demo 外 |
| 4. 标注与学习数据 | 标注绑定真实 `.rich-text` offset，刷新恢复；学习时长用前台活跃心跳；媒体取每节点最大进度 | `annotations.ts`、`ReaderClient.tsx`、`DocumentRenderer.tsx`、报告聚合服务 | `npm run test` 覆盖 offset、心跳和媒体最大进度；`npm run test:e2e` 覆盖真实选区、刷新恢复和笔记回跳 | 暂无 | 无 |
| 5. 教学链路泛化 | 学生可入新班级，阅读器从 query/班级上下文获取 classroomId | `/student/classes`、动态 `classroomId` 阅读入口、教师/学生 E2E 流程 | `npm run test:e2e` 覆盖新建班级、邀请码入班、同步、随堂题、签到和统计 | 暂无 | 无 |
| 6. 富媒体瑕疵 | 图表导出文案一致、pie 真饼图、3D 重置视角、全景全屏、录音 chunks、资源降级文案 | `chart.ts`、`DocumentRenderer.tsx`、`previews.ts`、`EditorClient.tsx`、CSS | `npm run test` 覆盖饼图和降级文案；`npm run test:e2e` 覆盖下载 SVG、3D 重置、热点、全景按钮和录音提交 | 暂无 | 无 |
| 7. 文档和演示体验 | README/PROGRESS 区分已验证、演示级适配、降级预览和非生产能力 | `README.md`、本节 | README 已回填 2026-06-27 最终命令结果；截图已生成到 `artifacts/demo-verification` | 暂无 | 无 |

## 验收矩阵进度

| 编号 | 状态 | 代码证据 | 验证证据 | 剩余/阻塞 |
|---|---|---|---|---|
| A01-A08 | 完成 | TipTap 工具栏、表格、查找替换、斜杠菜单 | `npm run test:e2e` | 无 |
| A09-A14 | 完成 | 章节列表、节点复制删除、自动保存、发布、三端预览 | `npm run test:e2e`；截图 | 无 |
| B01-B03 | 完成 | 资源库、上传校验、引用扫描、DOCX 导入 | `npm run test`；`npm run test:e2e` | 无 |
| C01-C18 | 完成 | 18 类内容节点的 Schema、编辑属性、发布、数字渲染、传统降级、追踪 | `npm run test`；`npm run test:e2e` | 无 |
| D01-D08 | 完成 | 阅读器、传统/数字切换、搜索、资源中心、笔记、TTS、报告 | `npm run test`；`npm run test:e2e` | 无 |
| E01-E08 | 完成 | 演示登录、课程班级、同步定位、随堂题、签到、班级/学生报告 | `npm run test`；`npm run test:e2e` | 无 |
| F01-F05 | 完成 | 响应式布局、错误状态、真实统计、审计与 3 尺寸截图 | `npm run verify:demo` | 无 |

## P1 进度

| 范围 | 状态 | 代码证据 | 验证证据 | 剩余/阻塞 |
|---|---|---|---|---|
| 作业发布与批改 | 完成 | `Assignment*` 表、`src/server/services/p1.ts`、教师/学生作业页 | `npm run test` | 无 |
| 题库 Excel 批量导入 | 完成 | `exceljs` 解析、模板导出、题库页 | `npm run test` | 无 |
| 笔记生成思维导图 | 完成 | `buildNotesMindMap`、阅读端思维导图页 | `npm run typecheck` | 无 |
| 报告导出 | 完成 | 个人/班级 XLSX 与 SVG export API | `npm run test` | 无 |
| 课程资源独立管理 | 完成 | `CourseResource` 表、资源管理页、学生资源中心合并展示 | `npm run test` | 无 |
| 更多仿真模板 | 完成 | 抛体、弹簧、摩擦、F=ma 模板与保存记录 | `npm run test` | 无 |
| SCORM/H5P | 完成 | `SCORM/H5P` 资产类型、上传规则、本地示例包、启动/预览链接 | `npm run test` | 无 |
| 公式模板扩展 | 完成 | 8 个公式模板、编辑器公式属性面板快速套用 | `npm run typecheck` | 无 |
| AI 问答模块 | 完成 | `AiConversation/AiMessage` 表、外部 AI 服务配置、阅读端右侧 AI 主体组件、独立问答页 | `npm run test`；`npm run test:e2e`；`npm run verify:demo` | 无 |

## 技术方案差距开发计划进度

| 阶段 | 状态 | 已完成 | 下一步 |
|---|---|---|---|
| 1. 阅读端与 AI 体验增强 | 完成 | 专注模式、专注态上一节/下一节、手机顶部/底部滑动换章、选中文字 AI 工具入口、右侧 AI SSE 流式显示、AI 历史会话、资源文件名与 DOCX/XLSX/TEXT/VTT 内容检索、资源打开事件 | 无 |
| 2. 编辑器核心增强 | 完成 | 真实 `.docx` 上传导入、样例 DOCX 兼容导入、章节拖拽排序、富媒体组件拖拽排序、原文段落拖拽排序、Word/HTML 安全粘贴、Excel/TSV 粘贴为表格、行高/缩进/格式刷、图片宽度/对齐快捷属性、图片拖拽式缩放、表格列等宽/自适应/斜线表头快捷工具、Markdown 快捷提示 | 进入阶段 3 题库/试卷产品化 |
| 3. 题库/试卷产品化 | 完成 | 排序题、配对题、解答题、题内富媒体、大题结构、拖拽组卷、试卷化作业发布、学生作答、教师批改、Excel 模板与导入扩展 | 进入阶段 4 图表/公式/仿真增强 |
| 4. 图表/公式/仿真增强 | 完成 | 图表属性编辑器、Excel 图表导入 API/服务、图表数据行增删改、公式 LaTeX 编辑器、符号面板、模板套用、参数示例、外部 AI 公式助手与本地规则回退、编辑发布 E2E 覆盖 | 进入阶段 5 脑图和知识图谱升级 |
| 5. 脑图和知识图谱升级 | 完成 | `MindMapState` 表、脑图 Zod Schema、GET/PUT API、可编辑脑图页面、图谱关系图/学习路径/习题联动模式、图谱搜索与定位 | 进入阶段 6 文件在线预览体系 |
| 6. 文件在线预览体系 | 完成 | `previews` 服务、`/api/assets/[assetId]/preview`、资源详情页、阅读器附件预览、PDF iframe、DOCX HTML、XLSX 网格、SCORM/H5P 包降级、CAD/DICOM/Visio 识别降级 | 进入阶段 7 教学系统生产化 |
| 7. 教学系统生产化 | 完成 | 课程/班级 CRUD API 与教师页、二维码入班链接、`/join` 入班页、地理签到 Schema/DB/API/学生按钮、教师签到距离、资源学习明细服务/API/班级报告/XLSX 导出 | 无 |
| 8. 云化和安全 readiness | 演示级完成 | `Tenant/TenantMembership/PlatformJob/BackupRecord` 表、租户 RBAC 服务、队列服务、SQLite 备份、对象存储本地适配、`/api/platform/readiness`、`proxy.ts` 安全头、外部短信/微信配置探测、PostgreSQL 迁移骨架、`docs/CLOUD_READINESS.md` | 生产远端 PostgreSQL/S3/SMS/微信真实 SDK 接入需部署环境和密钥；不作为生产云服务声明 |

## Beta 必跑命令

- [x] `npm run db:reset`（2026-06-27 14:32 通过；`verify:demo` 内部再次通过）
- [x] `npm run lint`（2026-06-27 14:32 通过；`verify:demo` 内部再次通过）
- [x] `npm run typecheck`（2026-06-27 14:32 通过；`verify:demo` 内部再次通过）
- [x] `npm run test`（2026-06-27 14:31 通过，34 passed；`verify:demo` 内部再次通过）
- [x] `npm run test:e2e`（2026-06-27 14:29 通过，6 passed；`verify:demo` 内部再次通过）
- [x] `npm run build`（2026-06-27 14:31 通过；`verify:demo` 内部再次通过）
- [x] `npm run verify:demo`（2026-06-27 14:37 通过；内部执行 reset/lint/typecheck/test/e2e/build 并检查三尺寸截图）

## 已知限制

- 远端 PostgreSQL 运行时连接池、S3-compatible SDK、短信登录和微信登录需要真实部署环境、域名和密钥；当前仓库提供可测试的本地适配、配置探测、迁移骨架和文档，不伪装外部服务。
- PDF 正文暂未做完整 OCR/文本抽取；PDF 可预览、可打开追踪，搜索主要覆盖标题、文件名和资源描述。

## 权限与数据边界修复

启动时间：2026-06-27

目标：基于 `AUDIT_REPORT.md` 只修高风险和中高风险访问控制问题，不新增业务能力，不做 UI 美化。

| 审计修复项 | 状态 | 本轮修复证据 | 验证证据 | 剩余风险 |
|---|---|---|---|---|
| 1. 保护资产文件下载、预览、列表和引用接口 | 完成 | `ensureAssetReadable`、`listReadableAssets`、`getVisibleAssetReferences` 已接入资产 API | `npm run test`；`npm run test:e2e` 负向覆盖未登录、学生越权和他人录音资产 | 无 |
| 2. 建立教材可读、版本可读/可写、班级教材访问守卫 | 完成 | `ensureBookReadable`、`ensureBookVersionWritable`、`ensureClassroomBookAccess`、`ensureVersionNode` | `npm run test` 覆盖可读、旧版本写入和节点/章节越界 | 无 |
| 3. 补齐编辑器、教师、reader 页面路由权限 | 完成 | 编辑器页面校验 owner，教师页面校验 classroom teacher，reader 页面校验可读教材/班级 | `npm run test:e2e` 覆盖学生访问编辑/教师页被拒绝 | 无 |
| 4. 收紧敏感服务层读取函数或新增安全 wrapper | 完成 | `getEditorBookForOwner`、`listBooksForOwner`、安全资产 wrapper 和统计按课堂/版本过滤 | `npm run test`；`npm run verify:demo` | 无 |
| 5. 防止学习统计污染和错误版本写入 | 完成 | `recordEventsForUser`、reader 写入接口校验当前发布版本和节点归属，班级统计按当前教材版本聚合 | `npm run test`；`npm run test:e2e` 覆盖错误版本和未入班事件写入被拒绝 | 无 |
| 6. 课程创建 bookId 校验和 platform readiness 权限 | 完成 | `createCourseWithClassroom` 限 Demo 已发布教材；`POST /api/platform/readiness` 限编辑者 | `npm run test`；`npm run test:e2e` 覆盖教师备份被拒绝和非法教材建课失败 | Demo 仍是单本教材授权模型，不声明生产授权系统 |
| 7. 负向测试和完整验证命令 | 完成 | 单元和 E2E 新增资产、页面、事件、版本、课程和 readiness 负向覆盖 | `npm run verify:demo` 于 2026-06-27 14:37 通过，内部执行 reset/lint/typecheck/test/e2e/build 并检查三尺寸截图 | 无 |
