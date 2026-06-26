# 数字教材平台沉浸式展示 Demo V2

本仓库实现《大学物理：牛顿第二定律实验课》的数字教材样章。它不是 PDF 展示页，而是一个可编辑、可发布、可阅读、可追踪、可课堂联动的单进程 Demo。

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
- 教师课堂：`/teacher/classes/class_physics_1/live`
- 班级报告：`/teacher/classes/class_physics_1/analytics`
- P1 作业：`/teacher/classes/class_physics_1/assignments`、`/reader/books/book_newton_second_law/assignments`
- P1 题库：`/teacher/classes/class_physics_1/question-bank`
- P1 课程资源：`/teacher/classes/class_physics_1/resources`
- P1 思维导图/仿真模板：`/reader/books/book_newton_second_law/mindmap`、`/reader/books/book_newton_second_law/simulations`

## 演示账号

```text
editor@demo.local / demo123456
teacher@demo.local / demo123456
student@demo.local / demo123456
```

`DEMO_MODE=true` 时，`/demo` 和顶栏角色切换器会通过服务端 httpOnly Session 做真实快捷登录。

## 已实现的 P0 范围

- TipTap 富文本编辑器：标题、段落、字形、颜色、高亮、上下标、对齐、列表、引用、代码、链接、表格、查找替换、斜杠菜单。
- 共享内容引擎：Zod 节点 Schema、资产引用扫描、编辑配置、发布快照、数字 Renderer、传统降级 Renderer、事件追踪。
- 富媒体节点：图片热点、画廊、音频、视频、公式、交互图表、F=ma 仿真、3D、小车模型、360 全景、知识气泡、扩展阅读、PDF、题组、录音任务、知识图谱、提示块。
- 草稿保存与发布：800ms 自动保存、revision 防旧请求覆盖、localStorage 本地备份、事务化发布、版本切换。
- 资源库：本地 starter-assets 导入、分类/搜索、上传校验、受控文件路由、Range 支持、防目录穿越、引用扫描。
- 阅读器：传统/数字同位置切换、搜索、资源中心、笔记、朗读、阅读记忆、学习轨迹、个人报告。
- 教师端：默认课程/班级、邀请码、课堂开始/结束、同步位置、随堂题、签到、班级报告、学生详情。
- 数据闭环：SQLite 持久化用户、教材、版本、资产、事件、实验、题组、录音、签到、课堂数据；报告从服务聚合查询。

## 架构

```text
src/content-engine/schema      Zod 文档、节点和资产契约
src/content-engine/renderer    数字/传统共用 Renderer
src/content-engine/tracking    批量行为上报客户端
src/server/services            业务服务层，页面和 API 不直接写数据库业务
src/server/db                  Node SQLite 连接、schema、类型
src/app/api                    请求边界和 Zod 校验
src/app/editor                 编辑工作台
src/app/reader                 学生阅读器
src/app/teacher                教师课堂和统计
```

## 验证

必须通过：

```bash
npm run db:reset
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run build
npm run verify:demo
```

`npm run verify:demo` 会重置数据库、跑单测、跑 E2E，并检查截图：

```text
artifacts/demo-verification/reader-1440.png
artifacts/demo-verification/reader-834.png
artifacts/demo-verification/reader-390.png
```

## 已实现的 P1 范围

- 作业发布与批改：教师从题库创建作业、发布/截止、查看提交、评分和反馈；学生提交四类题型与文字解释。
- 题库 Excel 批量导入：提供 XLSX 模板下载，服务端解析单选、多选、判断、填空并入库。
- 笔记生成思维导图：从 Annotation 表聚合章节、笔记和知识概念，提供图形页与 JSON API。
- 报告导出：个人学习报告和班级报告支持 XLSX 与 SVG 导出。
- 课程资源独立管理：课程级资源表、教师上传管理、学生资源中心合并展示。
- 更多仿真模板：F=ma 小车、抛体运动、弹簧振子、摩擦与净力，运行结果写入数据库事件和模板运行表。
- SCORM/H5P：资产类型、上传校验、本地示例包、课程资源启动/预览入口。
- 公式模板扩展：编辑器公式属性面板可快速套用力学、能量、波、电学公式模板。

## 演示脚本

1. 进入 `/demo`，说明五个价值标签。
2. 一键进入编辑者，在 TipTap 中修改文本样式、插入 3D 或仿真，切换 390 预览并发布。
3. 切到学生，先看传统教材视图，再切数字教材视图，播放音视频、点图片热点、翻画廊、旋转 3D、拖动全景、运行并保存 F=ma 仿真。
4. 完成题组，添加笔记，提交录音，打开个人学习报告。
5. 切到教师，开始课堂，定位到仿真实验。
6. 学生同步教师位置。
7. 教师推送随堂题，学生作答，教师查看分布。
8. 教师发起签到并打开班级报告。

## 已知限制

- 录音任务依赖浏览器麦克风权限；权限拒绝时页面提供明确提示，并仍可提交示例片段验证服务链路。
- 360 全景为轻量本地拖拽/缩放实现，不依赖远程库。
- SCORM/H5P Demo 以本地包上传、存储、下载/启动链路为重点，不内置完整 SCORM Runtime 或 H5P Player。
- 使用 Node 内置 SQLite 而非 Prisma，以避开 Node 25 本机原生依赖风险；业务仍全部在服务层。
- Next 16 在中文路径下 Turbopack 构建会 panic，因此脚本显式使用 Webpack。
