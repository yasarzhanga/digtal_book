import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { test, expect, type Page } from "@playwright/test";

const bookId = "book_newton_second_law";
const classroomId = "class_physics_1";
const screenshotDir = path.resolve(process.cwd(), "artifacts/demo-verification");
const chartFixturePath = path.resolve(process.cwd(), "tmp/e2e-chart-data.xlsx");

interface LiveCurrent {
  live: { id: string; currentChapterId: string | null; currentNodeId: string | null; status: string } | null;
  quiz: { id: string; quizNodeId: string; questionId: string } | null;
  attendance: { id: string; code: string } | null;
}

test.beforeAll(async () => {
  fs.mkdirSync(screenshotDir, { recursive: true });
  fs.mkdirSync(path.dirname(chartFixturePath), { recursive: true });
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("实验趋势");
  sheet.addRow(["拉力", "加速度"]);
  sheet.addRow(["2N", 1]);
  sheet.addRow(["4N", 2]);
  sheet.addRow(["6N", 3]);
  await workbook.xlsx.writeFile(chartFixturePath);
});

async function demoLogin(page: Page, role: "editor" | "teacher" | "student") {
  await page.request.post("/api/auth/demo-login", { data: { role } });
}

test("editor uses TipTap, autosaves, inserts component and publishes", async ({ page }) => {
  await demoLogin(page, "editor");
  await page.goto(`/editor/books/${bookId}`);
  await expect(page.getByText("属性面板")).toBeVisible();
  await page.setInputFiles("input[type='file'][accept*='.docx']", path.resolve(process.cwd(), "starter-assets/imports/sample-physics.docx"));
  await expect(page.getByText(/已导入|样例已导入/)).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("原文段落拖拽排序")).toBeVisible();
  await page.locator(".ProseMirror").click();
  await page.locator(".tiptap-surface").evaluate((element) => {
    const data = new DataTransfer();
    data.setData("text/plain", "物理量\t数值\n合力\t6N");
    element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data }));
  });
  await expect(page.locator(".ProseMirror table").first()).toBeVisible();
  await page.locator(".ProseMirror p").first().click();
  await page.getByLabel("行高").selectOption("2");
  await page.getByRole("button", { name: /增加缩进/ }).click();
  await page.getByRole("button", { name: /格式刷取样/ }).click();
  await page.getByRole("button", { name: /应用格式/ }).click();
  await page.keyboard.press("Control+B");
  await page.keyboard.type(" 现场修改标题与富文本。");
  await page.getByRole("button", { name: /插入/ }).click();
  await page.getByRole("button", { name: "图片热点", exact: true }).click();
  const imageBlock = page.locator(".block-row", { hasText: "imageInteractive" }).last();
  await expect(imageBlock).toBeVisible();
  await expect(page.getByLabel("拖拽图片宽度手柄")).toBeVisible({ timeout: 15000 });
  const widthRange = page.locator(".image-quick-tools input[type='range']");
  const widthLabel = page.locator(".image-quick-tools label", { hasText: /图片宽度/ }).first();
  await expect(widthRange).toBeVisible();
  const initialWidthText = await widthLabel.textContent();
  await page.getByRole("button", { name: "缩小图片宽度" }).click({ force: true });
  await expect.poll(() => widthLabel.textContent()).not.toBe(initialWidthText);
  await page.getByRole("button", { name: /插入/ }).click();
  await page.getByRole("button", { name: /3D 模型/ }).click();
  await expect(page.getByText("model3d").last()).toBeVisible();
  await page.getByRole("button", { name: /插入/ }).click();
  await page.getByRole("button", { name: /图表/ }).click();
  const chartBlock = page.locator(".block-row", { hasText: "chart" }).last();
  await expect(chartBlock).toBeVisible();
  await chartBlock.click({ force: true });
  await expect(page.getByText("图表编辑器")).toBeVisible();
  await page.setInputFiles("input[aria-label='导入图表 Excel']", chartFixturePath);
  const chartTitleInput = page.getByRole("textbox", { name: "图表标题" });
  await expect(chartTitleInput).toHaveValue("实验趋势", { timeout: 12000 });
  await expect(page.getByText(/图表数据已导入/)).toBeVisible();
  await page.getByRole("button", { name: /插入/ }).click();
  await page.getByRole("button", { name: "公式", exact: true }).click();
  const formulaBlock = page.locator(".block-row", { hasText: "formulaBlock" }).last();
  await expect(formulaBlock).toBeVisible();
  await formulaBlock.click({ force: true });
  await expect(page.getByText("公式编辑器")).toBeVisible();
  await page.getByLabel("公式助手提示词").fill("生成牛顿第二定律公式");
  await page.getByRole("button", { name: /AI 生成公式/ }).click();
  await expect(page.getByText(/本地公式规则|外部 AI 接口|公式建议/)).toBeVisible({ timeout: 12000 });
  await expect(page.getByLabel("公式 LaTeX")).toHaveValue(/F=ma|\\frac/);
  await expect(page.locator(".save-status")).toContainText(/已保存|本地备份|正在保存/, { timeout: 8000 });
  await page.getByRole("button", { name: /发布/ }).click();
  await expect(page).toHaveURL(/\/reader\/books\//, { timeout: 10000 });
});

test("student switches modes and operates rich media, simulation, quiz, notes and recording", async ({ page }) => {
  await demoLogin(page, "student");
  await page.goto(`/reader/books/${bookId}`);
  const readerAiPanel = page.locator(".reader-ai-panel");
  await expect(readerAiPanel.getByText("AI 助教")).toBeVisible();
  await readerAiPanel.getByPlaceholder("向 AI 提问当前章节").fill("本节重点是什么？");
  await readerAiPanel.getByRole("button", { name: /问 AI/ }).click();
  await expect(readerAiPanel.locator(".reader-ai-message.assistant").first()).toBeVisible({ timeout: 12000 });
  await expect(readerAiPanel.locator(".reader-ai-citations button").first()).toBeVisible();
  await page.getByRole("button", { name: "专注模式" }).click();
  await expect(page.locator(".reader-layout")).toHaveClass(/focused/);
  await page.getByRole("button", { name: /下一节/ }).first().click();
  await expect(page.getByRole("heading", { name: "F = ma 交互实验室" })).toBeVisible();
  await page.getByRole("button", { name: /上一节/ }).first().click();
  await expect(page.getByRole("heading", { name: /牛顿第二定律/ }).first()).toBeVisible();
  await page.getByRole("button", { name: "退出专注" }).click();
  await page.getByRole("button", { name: "传统教材视图" }).click();
  await expect(page.getByText(/资源二维码/).first()).toBeVisible();
  await page.getByRole("button", { name: "数字教材视图" }).click();
  await page.locator(".hotspot").first().click();
  await expect(page.getByText("水平拉力 F")).toBeVisible();
  await page.getByRole("button", { name: "下一张" }).click();
  await page.locator("audio").first().evaluate((element) => {
    const audio = element as HTMLAudioElement;
    audio.dispatchEvent(new Event("play", { bubbles: true }));
    audio.dispatchEvent(new Event("timeupdate", { bubbles: true }));
  });
  await page.locator("video").first().evaluate((element) => {
    const video = element as HTMLVideoElement;
    video.dispatchEvent(new Event("play", { bubbles: true }));
    video.dispatchEvent(new Event("timeupdate", { bubbles: true }));
  });
  await page.getByRole("button", { name: /第二章/ }).click();
  await expect(page.getByRole("heading", { name: "F = ma 交互实验室" })).toBeVisible();
  await page.getByRole("button", { name: /开始/ }).click();
  await page.getByRole("button", { name: /保存实验数据/ }).click();
  await page.getByRole("button", { name: /图例筛选/ }).click();
  await page.getByRole("button", { name: /质量/ }).first().click();
  await page.locator(".panorama-stage").dragTo(page.locator(".panorama-stage"), { targetPosition: { x: 120, y: 140 } });
  await page.getByRole("button", { name: /第三章/ }).click();
  await page.getByLabel("3 m/s²").check();
  await page.getByLabel("加速度增大").check();
  await page.getByLabel("加速度方向与合力一致").check();
  await page.getByLabel("F-a 关系仍为线性").check();
  await page.getByLabel("错误").check();
  await page.getByPlaceholder("输入答案").fill("2.5");
  await page.getByRole("button", { name: /提交并即时判分/ }).click();
  await expect(page.getByText(/得分/)).toBeVisible();
  await page.getByRole("button", { name: "习题联动" }).click();
  await page.getByPlaceholder("搜索图谱节点").fill("随堂");
  const graphLinkPanel = page.locator(".graph-link-panel");
  await expect(graphLinkPanel.getByRole("heading", { name: "随堂练习" })).toBeVisible();
  await graphLinkPanel.getByRole("button", { name: "打开习题" }).click();
  await expect(page.locator("#chapter-practice-1-quizSet")).toBeVisible();
  await page.getByPlaceholder("给选中文本添加笔记").fill("课堂演示笔记");
  await page.getByRole("button", { name: "yellow" }).click();
  await page.getByRole("button", { name: /提交录音/ }).click();
  await page.goto(`/reader/books/${bookId}/report`);
  await expect(page.getByText("个人学习报告")).toBeVisible();
  await expect(page.getByText(/仿真实验/)).toBeVisible();
});

test("teacher syncs location, pushes live quiz, runs attendance and sees analytics", async ({ page }) => {
  await demoLogin(page, "teacher");
  await page.goto("/teacher/courses");
  await expect(page.getByText("课程和班级")).toBeVisible();
  await expect(page.getByLabel("入班二维码").first()).toBeVisible();
  await page.getByPlaceholder("课程名称").fill("E2E 课程");
  await page.getByPlaceholder("首个班级名称").fill("E2E 一班");
  await page.getByRole("button", { name: "创建课程" }).click();
  await expect(page.getByText("课程和班级已创建")).toBeVisible();
  await expect(page.getByText("E2E 课程")).toBeVisible();
  await page.goto(`/teacher/classes/${classroomId}/live`);
  await page.getByRole("button", { name: "开始课堂" }).click();
  await page.getByRole("button", { name: "定位到仿真实验" }).click();
  await expect(page.getByText(/chapter-operate-5-physicsSimulation/)).toBeVisible();
  await page.getByRole("button", { name: "发起随堂题" }).click();
  await page.getByRole("button", { name: "发起签到" }).click();
  await expect(page.getByText(/签到码/)).toBeVisible();

  await demoLogin(page, "student");
  await page.goto(`/reader/books/${bookId}`);
  await expect(page.getByText(/课堂进行中/)).toBeVisible({ timeout: 8000 });
  await page.getByRole("button", { name: "同步教师位置" }).click();
  await expect(page.getByRole("heading", { name: "F = ma 交互实验室" })).toBeVisible();
  await page.getByRole("button", { name: "地理签到" }).click();
  await expect(page.getByText("签到成功")).toBeVisible({ timeout: 8000 });
  const currentResponse = await page.request.get(`/api/classes/${classroomId}/live/current`);
  const current = await currentResponse.json() as LiveCurrent;
  expect(current.quiz?.id).toBeTruthy();
  await page.request.post(`/api/live-quiz/${current.quiz?.id}/respond`, { data: { answer: 2 } });

  await demoLogin(page, "teacher");
  await page.goto(`/teacher/classes/${classroomId}/live`);
  await expect(page.getByText(/已答 1/)).toBeVisible({ timeout: 8000 });
  await expect(page.locator(".attendance-list")).toContainText(/PRESENT.*m/, { timeout: 8000 });
  await page.goto(`/teacher/classes/${classroomId}/analytics`);
  await expect(page.getByText("班级数据")).toBeVisible();
  await expect(page.getByText(/仿真参与率/)).toBeVisible();
});

test("P1 assignment, question bank, resource, report export and template pages work", async ({ page }) => {
  test.setTimeout(90_000);
  await demoLogin(page, "teacher");
  await page.goto(`/teacher/classes/${classroomId}/assignments`);
  await expect(page.getByText("课后作业工作台")).toBeVisible();
  await expect(page.getByText("拖拽组卷")).toBeVisible();
  await expect(page.getByText("试卷结构")).toBeVisible();
  await expect(page.getByText("排序题").first()).toBeVisible();
  await expect(page.getByText("配对题").first()).toBeVisible();
  await expect(page.getByText("解答题").first()).toBeVisible();
  await page.getByRole("button", { name: "查看提交" }).first().click();
  await expect(page.getByText(/陈同学|示例学生/).first()).toBeVisible();
  await page.getByRole("button", { name: "下移题目" }).first().click();
  await page.getByRole("button", { name: "从题库创建作业" }).click();
  await expect(page.getByText(/试卷作业已创建/)).toBeVisible();
  await page.goto(`/teacher/classes/${classroomId}/question-bank`);
  await expect(page.getByText("题库管理")).toBeVisible();
  await expect(page.getByText("Rubric").first()).toBeVisible();
  const templateResponse = await page.request.get(`/api/classes/${classroomId}/question-bank/template`);
  expect(templateResponse.ok()).toBe(true);
  await page.goto(`/teacher/classes/${classroomId}/resources`);
  await expect(page.getByText("资源、SCORM 与 H5P")).toBeVisible();
  await expect(page.getByText(/SCORM 微课包/)).toBeVisible();
  await expect(page.getByText(/H5P 互动题包/)).toBeVisible();
  await page.goto(`/reader/books/${bookId}/resources`);
  await page.getByPlaceholder("搜索资源标题、类型、文件名或文件内容").fill("实验目的");
  await expect(page.getByText("DOCX 教材原稿")).toBeVisible();
  await page.goto(`/reader/books/${bookId}/resources/asset_docx`);
  await expect(page.getByText(/Office\/WPS 文档转 HTML 预览/)).toBeVisible();
  await expect(page.getByText(/牛顿第二定律/).first()).toBeVisible();
  const classExport = await page.request.get(`/api/classes/${classroomId}/analytics/export?format=xlsx`);
  expect(classExport.ok()).toBe(true);

  await demoLogin(page, "student");
  await page.goto(`/reader/books/${bookId}/resources`);
  await page.getByPlaceholder("搜索资源标题、类型、文件名或文件内容").fill("cart-experiment");
  await expect(page.getByText(/实验视频|VIDEO/).first()).toBeVisible();
  await page.getByPlaceholder("搜索资源标题、类型、文件名或文件内容").fill("实验指导书");
  await page.locator(`a[href="/reader/books/${bookId}/resources/asset_guide"]`).click();
  await expect(page.getByText(/PDF 原生预览/)).toBeVisible();
  await expect(page.locator(".file-preview iframe")).toBeVisible();
  await demoLogin(page, "teacher");
  await page.goto(`/teacher/classes/${classroomId}/analytics`);
  await expect(page.getByText("资源学习明细")).toBeVisible();
  const resourceExport = await page.request.get(`/api/classes/${classroomId}/resources/learning?format=xlsx`);
  expect(resourceExport.ok()).toBe(true);
  const readiness = await page.request.get("/api/platform/readiness");
  expect(readiness.ok()).toBe(true);
  const readinessJson = await readiness.json() as { readiness: { rbac: { ready: boolean }; backup: { ready: boolean } } };
  expect(readinessJson.readiness.rbac.ready).toBe(true);
  expect(readinessJson.readiness.backup.ready).toBe(true);
  const backupResponse = await page.request.post("/api/platform/readiness");
  expect(backupResponse.ok()).toBe(true);
  await demoLogin(page, "student");
  await page.goto(`/reader/books/${bookId}/assignments`);
  await expect(page.getByText("作业与反馈")).toBeVisible();
  await expect(page.getByText(/课后作业/)).toBeVisible();
  await expect(page.getByText("二、实验操作")).toBeVisible();
  await expect(page.getByText("排序题").first()).toBeVisible();
  await expect(page.getByText("配对题").first()).toBeVisible();
  await expect(page.getByText("解答题").first()).toBeVisible();
  await page.goto(`/reader/books/${bookId}/mindmap`);
  await expect(page.getByText("我的知识网络")).toBeVisible();
  await expect(page.getByText("编辑脑图")).toBeVisible();
  await page.getByRole("button", { name: /添加节点/ }).click();
  await page.getByLabel("节点名称").fill("阶段五脑图节点");
  await page.getByRole("button", { name: /保存脑图/ }).click();
  await expect(page.getByText("已保存到数据库")).toBeVisible();
  await page.reload();
  await expect(page.getByText("阶段五脑图节点")).toBeVisible();
  await page.goto(`/reader/books/${bookId}/simulations`);
  await expect(page.getByText("可复用物理实验")).toBeVisible();
  await page.getByRole("button", { name: /运行并保存/ }).click();
  await expect(page.getByText(/加速度|飞行时间/).first()).toBeVisible();
  await page.goto(`/reader/books/${bookId}/ai`);
  await expect(page.getByRole("heading", { name: "AI 问答" })).toBeVisible();
  await page.getByPlaceholder("输入关于当前教材的问题").fill("F=ma 中质量变大会怎样影响加速度？");
  await page.getByRole("button", { name: /发送/ }).click();
  await expect(page.locator(".ai-message.assistant").first()).toBeVisible({ timeout: 12000 });
  await expect(page.locator(".ai-citations a").first()).toBeVisible();
  await page.reload();
  await expect(page.locator(".ai-message.assistant").first()).toBeVisible();
  const personalExport = await page.request.get(`/api/reader/books/${bookId}/report/export?format=svg`);
  expect(personalExport.ok()).toBe(true);
});

test("captures responsive verification screenshots", async ({ page }) => {
  await demoLogin(page, "student");
  const sizes = [
    { width: 1440, height: 960, name: "reader-1440.png" },
    { width: 834, height: 1112, name: "reader-834.png" },
    { width: 390, height: 844, name: "reader-390.png" }
  ];
  for (const size of sizes) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto(`/reader/books/${bookId}`);
    await expect(page.getByText("数字教材视图")).toBeVisible();
    await page.screenshot({ path: path.join(screenshotDir, size.name), fullPage: true });
  }
});
