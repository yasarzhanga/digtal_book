# 数字教材平台沉浸式展示 Demo V2

本仓库实现《大学物理：牛顿第二定律实验课》的数字教材样章。它是本地单进程 Beta Demo，用真实编辑、发布、阅读、行为数据和课堂联动证明数字教材相对“纸质教材 + 外部资源链接”的优势；它不是生产云服务，也不声称具备完整商业部署能力。

## 启动

```bash
npm install
npm run db:reset
npm run dev
```

打开：

- 演示入口：`http://127.0.0.1:3000/demo`
- 编辑端：`/editor/books/book_newton_second_law`
- 学生阅读：`/reader/books/book_newton_second_law`
- 学生班级：`/student/classes`
- 教师课程：`/teacher/courses`
- 默认教师课堂：`/teacher/classes/class_physics_1/live`
- 默认班级报告：`/teacher/classes/class_physics_1/analytics`

## 演示账号

```text
editor@demo.local / demo123456
teacher@demo.local / demo123456
student@demo.local / demo123456
```

`DEMO_MODE=true` 时，`/demo` 和角色切换器会由服务端创建真实 httpOnly Session。对外部署必须设置 `DEMO_MODE=false`，更换 `SESSION_SECRET`，并禁用演示快捷登录。

## 已真实验证的 Demo 能力

- TipTap 富文本编辑：标题、段落、字形、颜色、高亮、上下标、对齐、列表、引用、代码、链接、表格、查找替换、斜杠菜单和自动保存。
- 共享内容引擎：编辑预览、正式阅读、教师阅读使用同一套 Zod Schema、发布快照和 Renderer。
- 富媒体阅读：图片热点、画廊、音频、视频、公式、图表、F=ma 仿真、3D、本地 360 全景、知识气泡、扩展阅读、PDF、题组、录音任务和知识图谱。
- 真实数据闭环：草稿、发布版本、资产、阅读状态、标注、事件、实验、题组、录音、课堂、签到和报告写入 SQLite。
- 教学联动：教师建课建班、学生邀请码入班、同步位置、随堂题、签到、班级报告和学生详情。
- P1 演示能力：作业发布与批改、题库 Excel 导入、笔记思维导图、报告导出、课程资源管理、更多仿真模板、SCORM/H5P 本地包入口和公式模板扩展。

## 本地 Demo 适配能力

- AI 问答支持 OpenAI-compatible 外部接口配置；未配置密钥时使用本地教材内容给出引用式回退回答。
- DOCX 导入使用 Mammoth 转 HTML，并按 H1/H2 拆分章节；支持预览统计、确认导入、基础格式、表格和可提取图片入库。
- 文件预览提供 PDF 原生预览、DOCX HTML 预览、XLSX 网格预览和资源学习记录。
- 云化相关仅提供本地 readiness、SQLite 备份、对象存储本地适配、PostgreSQL 迁移骨架和配置探测。
- 本地 readiness 入口 `GET/POST /api/platform/readiness` 仅限编辑者或租户 OWNER/ADMIN 模拟平台管理员角色。

## 降级预览与不应声称的能力

- CAD、DICOM、Visio、SCORM、H5P 等是“识别与降级预览”：提供元数据、受控下载、启动入口或后续接入位置，不是完整渲染器。
- SCORM/H5P 不内置完整 SCORM Runtime 或 H5P Player。
- AI 是演示学习助教，不保证联网检索或企业知识库能力；外部接口完全可选。
- 本地 Demo 不包含真实微信/短信/支付、生产 S3、生产 PostgreSQL 连接池、多租户商业隔离、OCR 公式识别、手写公式识别、完整 MathType、百余种文件转换、商业内容审核或云灾备。

## DOCX 导入边界

支持结构化章节、段落、加粗、斜体、下划线、列表、链接、表格和可提取图片。复杂浮动布局、宏、复杂 Word 域、复杂公式 OCR、MathType 高保真转换不在本地 Demo 范围；导入预览会提示图片提取和结构统计。

## Beta 10 分钟演示脚本

1. 进入 `/demo`，说明五个价值标签：内容内嵌、知识可操作、即时反馈、学习留痕、教学可见。
2. 一键进入编辑者，演示 TipTap 富文本、DOCX 导入预览与确认、插入或编辑仿真/3D，切换 390 预览并发布。
3. 切到学生，先看传统教材视图，再切数字教材视图，播放音视频、点击热点、翻画廊、旋转 3D、拖动全景、运行并保存 F=ma 仿真。
4. 完成题组，在正文中选中文字添加高亮笔记，刷新确认高亮恢复，提交录音，打开个人学习报告。
5. 切到教师，新建班级或使用默认 `PHYS01`，开始课堂并定位到仿真节点。
6. 学生通过邀请码入班，带 `classroomId` 进入阅读，点击同步教师位置。
7. 教师推送随堂题，学生作答，教师查看分布。
8. 教师发起签到并打开班级统计，确认媒体、实验、题组和课堂行为来自数据库聚合。

## 架构

```text
src/content-engine/schema      Zod 文档、节点和资产契约
src/content-engine/renderer    数字/传统共用 Renderer
src/content-engine/tracking    批量行为上报客户端
src/server/auth                Session 与统一权限守卫
src/server/services            业务服务层，页面和 API 不直接写数据库业务
src/server/db                  SQLite 连接、schema、类型
src/app/api                    请求边界和 Zod 校验
src/app/editor                 编辑工作台
src/app/reader                 学生阅读器
src/app/student                学生班级入口
src/app/teacher                教师课堂和统计
```

## Beta 验收命令与结果记录

本轮必须最终通过：

```bash
npm run db:reset
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run build
npm run verify:demo
```

2026-06-27 14:37 本轮最终实际运行并通过：

- `npm run db:reset`
- `npm run lint`
- `npm run typecheck`
- `npm run test`，34 passed
- `npm run test:e2e`，6 passed
- `npm run build`
- `npm run verify:demo`

`verify:demo` 已内部顺序执行 reset、lint、typecheck、test、e2e、build，并检查：

```text
artifacts/demo-verification/reader-1440.png
artifacts/demo-verification/reader-834.png
artifacts/demo-verification/reader-390.png
```

## 已知限制

- 录音任务依赖浏览器麦克风权限；权限拒绝时可提交示例片段验证服务链路，界面会明确说明示例片段仅用于无麦克风环境。
- 360 全景为轻量本地拖拽/缩放/全屏实现，不依赖远程全景库。
- Next 16 在中文路径下 Turbopack 构建会 panic，因此脚本显式使用 Webpack。
