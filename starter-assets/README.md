# Starter assets

这些素材用于保证 Demo 在无外网环境下仍可完整展示富媒体：

- `images/cover.png`：教材封面；
- `images/force-diagram.png`：带热点的受力图；
- `images/gallery-force-*.png`：实验画廊；
- `images/physics-lab-panorama.jpg`：2:1 全景图；
- `audio/newton-narration.wav`：本地音频；
- `video/cart-experiment.mp4`：本地 H.264 视频；
- `video/cart-experiment.vtt`：中文字幕；
- `models/force-cart.glb`：本地 3D 模型；
- `attachments/newton-experiment-guide.pdf`：在线预览附件；
- `imports/sample-physics.docx`：DOCX 导入夹具。

Codex 应在 seed/reset 流程中把这些文件导入应用的资源表，并复制到应用可读取的位置。不得用远程 URL 替换。
