# 如何把这一任务包交给 Codex

## 1. 准备仓库

新建一个空 Git 仓库，把本任务包的全部内容复制到仓库根目录。不要只复制提示词；详细产品和验收标准都存放在 Markdown 文件中，本地素材位于 `starter-assets`。

目录至少应出现：

```text
AGENTS.md
PRODUCT_SPEC.md
ARCHITECTURE.md
ACCEPTANCE_MATRIX.md
DEMO_STORYBOARD.md
CODEX_GOAL_PROMPT.md
seed/lesson-blueprint.json
starter-assets/
```

## 2. 启动 Codex

在 Codex App、IDE 扩展或 CLI 中打开该仓库，并允许：

- 读写仓库；
- 安装 npm 依赖；
- 运行浏览器测试；
- 启动本地服务。

## 3. 发送目标

打开 `CODEX_GOAL_PROMPT.md`，复制全文发送。首行已包含 `/goal`。

目标模式会持续依据仓库内的规格和验收矩阵工作，不需要把所有要求塞在聊天上下文中。

## 4. 目标运行期间

可使用 `/goal` 查看状态。除非确实需要改变范围，不要反复发送零散功能要求；让 Codex 按 `PROGRESS.md` 和验收矩阵继续。

## 5. 完成后人工抽查

按 `DEMO_STORYBOARD.md` 从头演示一次，并检查：

- 富文本不是简化输入框；
- 音频和视频真实播放；
- 3D、全景和仿真能操作；
- 发布后学生读取的是快照；
- 学生操作后教师统计变化；
- 传统/数字对比能清楚呈现价值。
