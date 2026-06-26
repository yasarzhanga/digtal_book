# AGENTS.md

## Mission

把本仓库实现为 `PRODUCT_SPEC.md` 定义的数字教材沉浸式展示 Demo。核心不是页面数量，而是用真实富文本、富媒体、仿真、学习数据和课堂联动证明数字教材相对纸质教材加外部资源的优势。

## Required reading

开始编码前完整阅读：

1. `PRODUCT_SPEC.md`
2. `ARCHITECTURE.md`
3. `ACCEPTANCE_MATRIX.md`
4. `DEMO_STORYBOARD.md`
5. `seed/lesson-blueprint.json`

这些文件是唯一验收基线。

## Execution rules

1. 仓库为空时自行初始化，不等待用户选择框架。
2. 先创建简短 `PROGRESS.md`，按验收矩阵编号记录完成、验证、剩余和阻塞。
3. 优先建立共享 `content-engine`，再做页面；禁止编辑端和阅读端各写一套内容组件。
4. 每个富媒体节点必须完成 Schema、编辑、属性面板、序列化、发布、阅读、传统降级、追踪和测试的纵向链路。
5. 富文本必须使用成熟编辑器；不得用简单 contenteditable 欺骗验收。
6. 所有本地示例素材都在 `starter-assets`；不得用依赖互联网的示例 URL。
7. 业务逻辑放服务层；页面和 Route Handler 不得直接散落 Prisma 业务代码。
8. 所有请求边界和节点 attrs 使用 Zod。
9. TypeScript strict；禁止无理由 `any`、`@ts-ignore`、关闭 lint、跳过测试。
10. 核心数据写 SQLite；图表从数据库查询；不可用前端常量冒充统计。
11. 可见按钮必须有效。未实现的 P1 不显示成可点击入口。
12. `DEMO_MODE` 快捷登录必须由服务端建立真实 Session。
13. 资产路径必须防目录穿越；上传类型和大小必须校验；密码哈希；Cookie httpOnly。
14. 编辑停止约 800ms 自动保存，必须有 revision 防旧请求覆盖新请求。
15. 发布必须事务化，失败不能切换当前版本。
16. 高频行为批量上报；服务端不信任客户端 userId。
17. 每完成一个纵向组件，立即写测试并在编辑器、阅读器中实际验证。
18. 使用 Playwright 打开真实页面，操作媒体和仿真，并生成 1440/834/390 截图。
19. 可使用子代理做独立代码审查、视觉审查或测试审查，但主代理负责最终集成和所有验证。
20. P0 全部通过前不做 P1。

## Recommended checkpoints

1. 工程、数据库、认证、种子素材；
2. TipTap 基础富文本、表格、保存和发布；
3. 资源库与 DOCX 导入；
4. 图片、画廊、音频、视频、公式、图表；
5. 3D、全景、仿真、知识气泡、扩展阅读；
6. 题组、录音、知识图谱；
7. 阅读设置、搜索、资源中心、笔记、传统/数字对比；
8. 事件追踪、个人报告；
9. 教师同步、随堂题、签到和班级报告；
10. 响应式、错误处理、E2E、构建与 README。

## Verification commands

任务结束前必须实际运行并修复到全部成功：

```text
npm run db:reset
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run build
npm run verify:demo
```

不得只声称通过。

## Hard blocker policy

只有无法通过代码解决的环境权限或系统能力问题才可暂停。暂停时必须提供：

- 失败命令；
- 关键错误；
- 已尝试方法；
- 最小可执行解决办法；
- `PROGRESS.md` 中的准确剩余项。

一般性库选择、UI 细节和实现方式不是提问理由，选择最简单、可测试的方案继续。

## Final response

最终回复必须列出：

- 已实现的 P0；
- 实际运行的命令及结果；
- 启动命令和三个演示账号；
- 演示脚本入口；
- 验证截图位置；
- 未实现的 P1；
- 已知限制；
- 任何人工验收项。
