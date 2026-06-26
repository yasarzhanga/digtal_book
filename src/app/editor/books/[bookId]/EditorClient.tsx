"use client";

import { useEffect, useMemo, useState, type ChangeEvent, type ClipboardEvent, type DragEvent, type PointerEvent } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import Superscript from "@tiptap/extension-superscript";
import Subscript from "@tiptap/extension-subscript";
import { Bold, Calculator, Code2, Columns3, FileUp, GripVertical, Highlighter, ImagePlus, IndentDecrease, IndentIncrease, Italic, LinkIcon, List, Paintbrush, Palette, Pilcrow, Plus, Redo2, Save, Slash, Strikethrough, Table2, Trash2, Underline as UnderlineIcon, Undo2, Upload, Wand2 } from "lucide-react";
import type { Asset } from "@/content-engine/schema/assets";
import type { ChapterDocument } from "@/content-engine/schema/document";
import { BookSnapshotSchema, type BookSnapshot } from "@/content-engine/schema/document";
import type { ChartNode, ContentNode } from "@/content-engine/schema/nodes";
import { ContentNodeSchema } from "@/content-engine/schema/nodes";
import { DocumentRenderer } from "@/content-engine/renderer/DocumentRenderer";
import { formulaTemplates } from "@/content-engine/utils/formula-templates";
import type { EditorBook } from "@/server/services/books";

interface EditorClientProps {
  book: EditorBook;
  assets: Asset[];
}

type SaveStatus = "已保存" | "正在保存" | "本地备份" | "保存失败" | "发布中";
type ComponentType = Exclude<ContentNode["type"], "heading" | "richText">;
interface FormatBrushState {
  color: string;
  backgroundColor: string;
  fontWeight: string;
  fontStyle: string;
  textDecoration: string;
  lineHeight: string;
  marginLeft: string;
}

export function EditorClient({ book, assets }: EditorClientProps) {
  const [chapters, setChapters] = useState(book.chapters);
  const [selectedChapterId, setSelectedChapterId] = useState(book.chapters[0]?.id ?? "");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [status, setStatus] = useState<SaveStatus>("已保存");
  const [slashOpen, setSlashOpen] = useState(false);
  const [previewWidth, setPreviewWidth] = useState(1440);
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [docxImportMessage, setDocxImportMessage] = useState("");
  const [formatBrush, setFormatBrush] = useState<FormatBrushState | null>(null);
  const selectedChapter = chapters.find((chapter) => chapter.id === selectedChapterId) ?? chapters[0];
  const selectedNode = selectedChapter?.document.nodes.find((node) => node.nodeId === selectedNodeId) ?? null;
  const richBlocks = useMemo(() => extractRichBlocks(selectedChapter ? richHtml(selectedChapter.document) : ""), [selectedChapter?.document]);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4, 5, 6] }, link: false, underline: false }),
      Underline,
      Link.configure({ openOnClick: false }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Superscript,
      Subscript
    ],
    content: selectedChapter ? richHtml(selectedChapter.document) : "<p></p>",
    editorProps: {
      handleKeyDown: (_view, event) => {
        if (event.key === "/") setSlashOpen(true);
        return false;
      }
    },
    onUpdate: ({ editor: activeEditor }) => {
      if (!selectedChapter) return;
      setStatus("本地备份");
      updateChapterDocument(selectedChapter.id, (document) => replaceRichText(document, activeEditor.getHTML()));
    }
  });

  useEffect(() => {
    if (editor && selectedChapter) {
      editor.commands.setContent(richHtml(selectedChapter.document));
      setSelectedNodeId(selectedChapter.document.nodes.find((node) => node.type !== "heading" && node.type !== "richText")?.nodeId ?? null);
    }
  }, [editor, selectedChapterId]);

  useEffect(() => {
    if (!selectedChapter) return;
    const key = backupKey(selectedChapter.id);
    const backup = window.localStorage.getItem(key);
    if (backup) setStatus("本地备份");
  }, [selectedChapter]);

  useEffect(() => {
    if (!selectedChapter || status !== "本地备份") return undefined;
    const timer = window.setTimeout(() => {
      void saveCurrentChapter();
    }, 800);
    return () => window.clearTimeout(timer);
  }, [selectedChapter?.document, status]);

  const snapshot = useMemo<BookSnapshot>(() => BookSnapshotSchema.parse({
    book: {
      id: book.id,
      title: book.title,
      subtitle: book.subtitle,
      description: book.description,
      coverAssetId: book.coverAssetId
    },
    versionId: book.currentPublishedVersionId ?? "draft-preview",
    versionNumber: 1,
    publishedAt: new Date().toISOString(),
    chapters: chapters.map((chapter) => ({
      id: chapter.id,
      parentId: chapter.parentId,
      title: chapter.title,
      level: chapter.level,
      sortOrder: chapter.sortOrder,
      document: chapter.document
    })),
    assets
  }), [assets, book, chapters]);

  function updateChapterDocument(chapterId: string, updater: (document: ChapterDocument) => ChapterDocument) {
    setStatus("本地备份");
    setChapters((current) => current.map((chapter) => {
      if (chapter.id !== chapterId) return chapter;
      const updated = { ...chapter, document: updater(chapter.document) };
      window.localStorage.setItem(backupKey(chapterId), JSON.stringify({ revision: updated.revision, document: updated.document }));
      return updated;
    }));
  }

  async function saveCurrentChapter(): Promise<boolean> {
    if (!selectedChapter) return false;
    setStatus("正在保存");
    try {
      const response = await fetch(`/api/chapters/${selectedChapter.id}/document`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision: selectedChapter.revision, document: selectedChapter.document })
      });
      if (!response.ok) throw new Error("save failed");
      const result = await response.json() as { revision: number; updatedAt: string };
      setChapters((current) => current.map((chapter) => chapter.id === selectedChapter.id ? { ...chapter, revision: result.revision, updatedAt: result.updatedAt } : chapter));
      window.localStorage.removeItem(backupKey(selectedChapter.id));
      setStatus("已保存");
      return true;
    } catch {
      setStatus("保存失败");
      return false;
    }
  }

  async function publish() {
    const saved = await saveCurrentChapter();
    if (!saved) return;
    setStatus("发布中");
    const response = await fetch(`/api/books/${book.id}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: `现场演示发布 ${new Date().toLocaleString()}` })
    });
    if (response.ok) {
      setStatus("已保存");
      window.location.assign(`/reader/books/${book.id}`);
    } else {
      setStatus("保存失败");
    }
  }

  async function refreshBook(nextChapterId?: string) {
    const response = await fetch(`/api/books/${book.id}`);
    if (!response.ok) {
      setStatus("保存失败");
      return;
    }
    const json = await response.json() as { book: EditorBook };
    setChapters(json.book.chapters);
    setSelectedChapterId(nextChapterId ?? json.book.chapters.at(-1)?.id ?? json.book.chapters[0]?.id ?? "");
    setStatus("已保存");
  }

  async function importDocxFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setDocxImportMessage("正在导入 DOCX");
    const formData = new FormData();
    formData.set("file", file);
    formData.set("confirm", "true");
    const response = await fetch(`/api/books/${book.id}/import-docx`, { method: "POST", body: formData });
    if (!response.ok) {
      setDocxImportMessage("导入失败：仅支持 25MB 内 .docx 文件");
      return;
    }
    const result = await response.json() as { createdChapterId?: string; chapterCount: number; mediaCount: number; tableCount: number };
    await refreshBook(result.createdChapterId);
    setDocxImportMessage(`已导入 ${result.chapterCount} 个章节线索，图片 ${result.mediaCount}，表格 ${result.tableCount}`);
  }

  async function importSampleDocx() {
    setDocxImportMessage("正在导入样例 DOCX");
    const response = await fetch(`/api/books/${book.id}/import-docx`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: true })
    });
    if (!response.ok) {
      setDocxImportMessage("样例导入失败");
      return;
    }
    const result = await response.json() as { createdChapterId?: string; chapterCount: number; mediaCount: number; tableCount: number };
    await refreshBook(result.createdChapterId);
    setDocxImportMessage(`样例已导入：章节 ${result.chapterCount}，图片 ${result.mediaCount}，表格 ${result.tableCount}`);
  }

  function insertComponent(type: ComponentType) {
    if (!selectedChapter) return;
    const node = makeDefaultNode(type, selectedChapter.id, selectedChapter.document.nodes.length, assets);
    updateChapterDocument(selectedChapter.id, (document) => ({ ...document, nodes: [...document.nodes, node] }));
    setSelectedNodeId(node.nodeId);
    setSlashOpen(false);
  }

  function updateSelectedNode(nextNode: ContentNode) {
    if (!selectedChapter) return;
    const parsed = ContentNodeSchema.parse(nextNode);
    updateChapterDocument(selectedChapter.id, (document) => ({ ...document, nodes: document.nodes.map((node) => node.nodeId === parsed.nodeId ? parsed : node) }));
    setSelectedNodeId(parsed.nodeId);
  }

  function duplicateNode(nodeId: string) {
    if (!selectedChapter) return;
    const node = selectedChapter.document.nodes.find((item) => item.nodeId === nodeId);
    if (!node) return;
    updateChapterDocument(selectedChapter.id, (document) => ({ ...document, nodes: [...document.nodes, { ...node, nodeId: `${node.nodeId}-copy-${Date.now()}` } as ContentNode] }));
  }

  function deleteNode(nodeId: string) {
    if (!selectedChapter) return;
    updateChapterDocument(selectedChapter.id, (document) => ({ ...document, nodes: document.nodes.filter((node) => node.nodeId !== nodeId) }));
  }

  async function reorderChapterByDrop(event: DragEvent<HTMLElement>, targetChapterId: string) {
    const draggedId = event.dataTransfer.getData("application/x-chapter-id");
    if (!draggedId || draggedId === targetChapterId) return;
    const currentIds = chapters.map((chapter) => chapter.id);
    const nextIds = moveBefore(currentIds, draggedId, targetChapterId);
    setChapters((current) => nextIds.map((chapterId, index) => {
      const chapter = current.find((item) => item.id === chapterId);
      if (!chapter) throw new Error("CHAPTER_REORDER_STATE_MISSING");
      return { ...chapter, sortOrder: index };
    }));
    await fetch(`/api/books/${book.id}/chapters/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chapterIds: nextIds })
    });
  }

  function reorderComponentByDrop(event: DragEvent<HTMLElement>, targetNodeId: string) {
    if (!selectedChapter) return;
    const draggedId = event.dataTransfer.getData("application/x-node-id");
    if (!draggedId || draggedId === targetNodeId) return;
    const components = selectedChapter.document.nodes.filter((node) => node.type !== "heading" && node.type !== "richText");
    const textNodes = selectedChapter.document.nodes.filter((node) => node.type === "heading" || node.type === "richText");
    const nextComponentIds = moveBefore(components.map((node) => node.nodeId), draggedId, targetNodeId);
    updateChapterDocument(selectedChapter.id, (document) => ({
      ...document,
      nodes: [...textNodes, ...nextComponentIds.map((nodeId) => {
        const node = components.find((item) => item.nodeId === nodeId);
        if (!node) throw new Error("NODE_REORDER_STATE_MISSING");
        return node;
      })]
    }));
  }

  function applyTablePreset(preset: "equal" | "adaptive" | "diagonal") {
    if (!editor) return;
    const parser = new DOMParser();
    const document = parser.parseFromString(editor.getHTML(), "text/html");
    let table = document.querySelector("table");
    if (!table) {
      editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
      return;
    }
    table.style.width = "100%";
    table.style.borderCollapse = "collapse";
    if (preset === "equal") {
      table.style.tableLayout = "fixed";
    }
    if (preset === "adaptive") {
      table.style.tableLayout = "auto";
    }
    if (preset === "diagonal") {
      const firstCell = table.querySelector("th,td");
      if (firstCell) {
        firstCell.textContent = firstCell.textContent ? `${firstCell.textContent} / 分类` : "项目 / 分类";
      }
    }
    editor.commands.setContent(document.body.innerHTML);
  }

  function handleEditorPaste(event: ClipboardEvent<HTMLDivElement>) {
    if (!editor) return;
    const html = event.clipboardData.getData("text/html");
    const text = event.clipboardData.getData("text/plain");
    if (html && /<(table|p|h[1-6]|ul|ol|strong|em|span)\b/i.test(html)) {
      event.preventDefault();
      editor.chain().focus().insertContent(sanitizePastedHtml(html)).run();
      setStatus("本地备份");
      return;
    }
    if (text.includes("\t") && text.includes("\n")) {
      event.preventDefault();
      editor.chain().focus().insertContent(tsvToTableHtml(text)).run();
      setStatus("本地备份");
    }
  }

  function reorderRichBlockByDrop(event: DragEvent<HTMLElement>, targetIndex: number) {
    if (!editor) return;
    const rawIndex = event.dataTransfer.getData("application/x-rich-block-index");
    const draggedIndex = Number(rawIndex);
    if (!Number.isInteger(draggedIndex) || draggedIndex === targetIndex) return;
    const blocks = extractRichBlockHtml(editor.getHTML());
    const dragged = blocks[draggedIndex];
    if (!dragged) return;
    const withoutDragged = blocks.filter((_block, index) => index !== draggedIndex);
    const adjustedTarget = draggedIndex < targetIndex ? targetIndex - 1 : targetIndex;
    const nextBlocks = [...withoutDragged.slice(0, adjustedTarget), dragged, ...withoutDragged.slice(adjustedTarget)];
    editor.commands.setContent(nextBlocks.join(""));
    setStatus("本地备份");
  }

  function applyLineHeight(value: string) {
    applySelectedBlockStyle({ lineHeight: value });
  }

  function adjustIndent(delta: number) {
    const block = getSelectedEditorBlock();
    const current = block ? Number.parseInt(block.style.marginLeft || "0", 10) || 0 : 0;
    applySelectedBlockStyle({ marginLeft: `${Math.max(0, current + delta)}px` });
  }

  function captureFormatBrush() {
    const block = getSelectedEditorBlock();
    if (!block) return;
    const style = window.getComputedStyle(block);
    setFormatBrush({
      color: style.color,
      backgroundColor: style.backgroundColor,
      fontWeight: style.fontWeight,
      fontStyle: style.fontStyle,
      textDecoration: style.textDecorationLine,
      lineHeight: style.lineHeight,
      marginLeft: style.marginLeft
    });
  }

  function applyFormatBrush() {
    if (!formatBrush) return;
    applySelectedBlockStyle({
      color: formatBrush.color,
      backgroundColor: formatBrush.backgroundColor === "rgba(0, 0, 0, 0)" ? "" : formatBrush.backgroundColor,
      fontWeight: formatBrush.fontWeight,
      fontStyle: formatBrush.fontStyle,
      textDecoration: formatBrush.textDecoration,
      lineHeight: formatBrush.lineHeight,
      marginLeft: formatBrush.marginLeft
    });
  }

  function applySelectedBlockStyle(style: Partial<CSSStyleDeclaration>) {
    if (!editor) return;
    const block = getSelectedEditorBlock();
    const root = document.querySelector<HTMLElement>(".tiptap-surface .ProseMirror");
    if (!root) return;
    const targets = block ? [block] : Array.from(root.children).filter(isHTMLElement);
    for (const target of targets) {
      for (const [key, value] of Object.entries(style)) {
        if (typeof value === "string") {
          target.style.setProperty(kebabCase(key), value);
        }
      }
    }
    editor.commands.setContent(root.innerHTML);
    setStatus("本地备份");
  }

  function replaceAll() {
    if (!editor || !findText) return;
    editor.commands.setContent(editor.getHTML().split(findText).join(replaceText));
  }

  if (!selectedChapter) {
    return <main className="workspace-page"><p>未找到章节。</p></main>;
  }

  return (
    <main className="editor-layout">
      <aside className="editor-sidebar">
        <h2>{book.title}</h2>
        <p>{book.subtitle}</p>
        <div className="chapter-tree">
          {chapters.map((chapter, index) => (
            <button
              className={chapter.id === selectedChapter.id ? "active" : ""}
              draggable
              key={chapter.id}
              type="button"
              onClick={() => setSelectedChapterId(chapter.id)}
              onDragOver={(event) => event.preventDefault()}
              onDragStart={(event) => event.dataTransfer.setData("application/x-chapter-id", chapter.id)}
              onDrop={(event) => void reorderChapterByDrop(event, chapter.id)}
            >
              <GripVertical size={14} /><span>{index + 1}</span>{chapter.title}
            </button>
          ))}
        </div>
        <div className="docx-import-box">
          <b><FileUp size={15} /> DOCX 导入</b>
          <label>
            上传 .docx
            <input accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" type="file" onChange={(event) => void importDocxFile(event)} />
          </label>
          <button type="button" onClick={() => void importSampleDocx()}>导入样例</button>
          {docxImportMessage ? <small>{docxImportMessage}</small> : null}
        </div>
        <div className="stats-box">
          <b>节内统计</b>
          <span>字数 {editor?.storage.characterCount?.characters?.() ?? selectedChapter.document.nodes.length * 20}</span>
          <span>组件 {selectedChapter.document.nodes.filter((node) => node.type !== "heading" && node.type !== "richText").length}</span>
        </div>
      </aside>
      <section className="editor-center">
        <div className="editor-toolbar">
          <button type="button" onClick={() => editor?.chain().focus().undo().run()} title="撤销"><Undo2 size={16} /></button>
          <button type="button" onClick={() => editor?.chain().focus().redo().run()} title="重做"><Redo2 size={16} /></button>
          <select aria-label="段落与标题" onChange={(event) => applyHeading(editor, event.target.value)}>
            <option value="paragraph">段落</option>
            {[1, 2, 3, 4, 5, 6].map((level) => <option key={level} value={`h${level}`}>H{level}</option>)}
          </select>
          <select aria-label="字号" onChange={(event) => editor?.chain().focus().setMark("textStyle", { fontSize: event.target.value }).run()}>
            <option value="16px">16</option>
            <option value="20px">20</option>
            <option value="28px">28</option>
          </select>
          <button type="button" onClick={() => editor?.chain().focus().toggleBold().run()}><Bold size={16} /></button>
          <button type="button" onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic size={16} /></button>
          <button type="button" onClick={() => editor?.chain().focus().toggleUnderline().run()}><UnderlineIcon size={16} /></button>
          <button type="button" onClick={() => editor?.chain().focus().toggleStrike().run()}><Strikethrough size={16} /></button>
          <label className="icon-input"><Palette size={16} /><input type="color" onChange={(event) => editor?.chain().focus().setColor(event.target.value).run()} /></label>
          <label className="icon-input"><Highlighter size={16} /><input type="color" onChange={(event) => editor?.chain().focus().setHighlight({ color: event.target.value }).run()} /></label>
          <button type="button" onClick={() => editor?.chain().focus().toggleSuperscript().run()}>x²</button>
          <button type="button" onClick={() => editor?.chain().focus().toggleSubscript().run()}>x₂</button>
          <button type="button" onClick={() => editor?.chain().focus().toggleCode().run()}><Code2 size={16} /></button>
          <button type="button" onClick={() => editor?.chain().focus().setTextAlign("left").run()}>左</button>
          <button type="button" onClick={() => editor?.chain().focus().setTextAlign("center").run()}>中</button>
          <button type="button" onClick={() => editor?.chain().focus().setTextAlign("right").run()}>右</button>
          <select aria-label="行高" defaultValue="" onChange={(event) => applyLineHeight(event.target.value)}>
            <option value="" disabled>行高</option>
            <option value="1.45">1.45</option>
            <option value="1.7">1.7</option>
            <option value="2">2.0</option>
          </select>
          <button type="button" onClick={() => adjustIndent(-24)} title="减少缩进"><IndentDecrease size={16} /></button>
          <button type="button" onClick={() => adjustIndent(24)} title="增加缩进"><IndentIncrease size={16} /></button>
          <button type="button" onClick={captureFormatBrush} title="格式刷取样" aria-label="格式刷取样"><Paintbrush size={16} /> 取样</button>
          <button type="button" onClick={applyFormatBrush} disabled={!formatBrush} title="应用格式刷" aria-label="应用格式刷">应用格式</button>
          <button type="button" onClick={() => editor?.chain().focus().toggleBulletList().run()}><List size={16} /></button>
          <button type="button" onClick={() => editor?.chain().focus().toggleOrderedList().run()}>1.</button>
          <button type="button" onClick={() => editor?.chain().focus().toggleTaskList().run()}>☑</button>
          <button type="button" onClick={() => editor?.chain().focus().toggleBlockquote().run()}><Pilcrow size={16} /></button>
          <button type="button" onClick={() => editor?.chain().focus().toggleCodeBlock().run()}>代码块</button>
          <button type="button" onClick={() => editor?.chain().focus().setHorizontalRule().run()}>分割线</button>
          <button type="button" onClick={() => setLink(editor)}><LinkIcon size={16} /></button>
          <button type="button" onClick={() => editor?.chain().focus().unsetAllMarks().clearNodes().run()}>清除</button>
          <button type="button" onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><Table2 size={16} /> 表格</button>
          <button type="button" onClick={() => editor?.chain().focus().addColumnAfter().run()}><Columns3 size={16} /> 列</button>
          <button type="button" onClick={() => editor?.chain().focus().addRowAfter().run()}>行</button>
          <button type="button" onClick={() => editor?.chain().focus().mergeCells().run()}>合并</button>
          <button type="button" onClick={() => editor?.chain().focus().splitCell().run()}>拆分</button>
          <button type="button" onClick={() => editor?.chain().focus().deleteTable().run()}>删表</button>
          <button type="button" onClick={() => applyTablePreset("equal")}>列等宽</button>
          <button type="button" onClick={() => applyTablePreset("adaptive")}>自适应</button>
          <button type="button" onClick={() => applyTablePreset("diagonal")}>斜线表头</button>
          <button className={slashOpen ? "active" : ""} type="button" onClick={() => setSlashOpen((value) => !value)}><Slash size={16} /> 插入</button>
          <span className={`save-status ${status}`}>{status}</span>
          <button className="primary-action" type="button" onClick={() => void publish()}><Save size={16} /> 发布</button>
        </div>
        <SlashMenu expanded={slashOpen} onInsert={insertComponent} />
        <div className="markdown-hint">
          Markdown 快捷输入：`#` 标题、`##` 二级标题、`-` 列表、`1.` 有序列表、`&gt;` 引用、``` 代码块、`---` 分割线。
        </div>
        <div className="find-bar">
          <input placeholder="查找" value={findText} onChange={(event) => setFindText(event.target.value)} />
          <input placeholder="替换为" value={replaceText} onChange={(event) => setReplaceText(event.target.value)} />
          <button type="button" onClick={replaceAll}>全部替换</button>
        </div>
        <EditorContent editor={editor} className="tiptap-surface" onPaste={handleEditorPaste} />
        <section className="paragraph-order-panel">
          <header>
            <strong>原文段落拖拽排序</strong>
            <span>{richBlocks.length} 个块</span>
          </header>
          <div>
            {richBlocks.map((block, index) => (
              <button
                draggable
                key={`${block.label}-${index}`}
                type="button"
                onDragOver={(event) => event.preventDefault()}
                onDragStart={(event) => event.dataTransfer.setData("application/x-rich-block-index", String(index))}
                onDrop={(event) => reorderRichBlockByDrop(event, index)}
              >
                <GripVertical size={14} />
                <span>{index + 1}</span>
                <b>{block.label}</b>
              </button>
            ))}
          </div>
        </section>
        <section className="block-list">
          {selectedChapter.document.nodes.filter((node) => node.type !== "heading" && node.type !== "richText").map((node) => (
            <article
              className={node.nodeId === selectedNodeId ? "block-row selected" : "block-row"}
              draggable
              key={node.nodeId}
              onClick={() => setSelectedNodeId(node.nodeId)}
              onDragOver={(event) => event.preventDefault()}
              onDragStart={(event) => event.dataTransfer.setData("application/x-node-id", node.nodeId)}
              onDrop={(event) => reorderComponentByDrop(event, node.nodeId)}
            >
              <span><GripVertical size={14} /> {node.type}</span>
              <strong>{"title" in node ? node.title : node.nodeId}</strong>
              <button type="button" onClick={(event) => { event.stopPropagation(); duplicateNode(node.nodeId); }}>复制</button>
              <button type="button" onClick={(event) => { event.stopPropagation(); deleteNode(node.nodeId); }}>删除</button>
            </article>
          ))}
        </section>
        <section className="inline-preview">
          <div className="device-tabs">
            {[1440, 834, 390].map((width) => <button className={previewWidth === width ? "active" : ""} key={width} type="button" onClick={() => setPreviewWidth(width)}>{width}</button>)}
          </div>
          <div className="preview-frame" style={{ maxWidth: `${Math.min(previewWidth, 960)}px` }}>
            <DocumentRenderer snapshot={snapshot} chapter={snapshot.chapters.find((chapter) => chapter.id === selectedChapter.id) ?? snapshot.chapters[0]} mode="digital" bookId={book.id} />
          </div>
        </section>
      </section>
      <aside className="property-panel">
        <h2>属性面板</h2>
        {selectedNode ? <NodeInspector node={selectedNode} assets={assets} bookId={book.id} onChange={updateSelectedNode} /> : <p>选择一个富媒体节点后配置。</p>}
      </aside>
    </main>
  );
}

function SlashMenu({ expanded, onInsert }: { expanded: boolean; onInsert: (type: ComponentType) => void }) {
  const items: { type: ComponentType; label: string; icon: React.ReactNode }[] = [
    { type: "imageInteractive", label: "图片热点", icon: <ImagePlus size={16} /> },
    { type: "gallery", label: "画廊", icon: <ImagePlus size={16} /> },
    { type: "audio", label: "音频", icon: <ImagePlus size={16} /> },
    { type: "video", label: "视频", icon: <ImagePlus size={16} /> },
    { type: "formulaBlock", label: "公式", icon: <ImagePlus size={16} /> },
    { type: "chart", label: "图表", icon: <ImagePlus size={16} /> },
    { type: "physicsSimulation", label: "F=ma 仿真", icon: <ImagePlus size={16} /> },
    { type: "model3d", label: "3D 模型", icon: <ImagePlus size={16} /> },
    { type: "panorama", label: "360 全景", icon: <ImagePlus size={16} /> },
    { type: "extendedReading", label: "扩展阅读", icon: <ImagePlus size={16} /> },
    { type: "attachment", label: "PDF 附件", icon: <ImagePlus size={16} /> },
    { type: "quizSet", label: "题组", icon: <ImagePlus size={16} /> },
    { type: "recordingTask", label: "录音任务", icon: <ImagePlus size={16} /> },
    { type: "knowledgeGraph", label: "知识图谱", icon: <ImagePlus size={16} /> },
    { type: "callout", label: "提示块", icon: <ImagePlus size={16} /> }
  ];
  return <div className={`slash-menu ${expanded ? "open" : "docked"}`}>{items.map((item) => <button key={item.type} type="button" onClick={() => onInsert(item.type)}>{item.icon}{item.label}</button>)}</div>;
}

function NodeInspector({ node, assets, bookId, onChange }: { node: ContentNode; assets: Asset[]; bookId: string; onChange: (node: ContentNode) => void }) {
  const [json, setJson] = useState(JSON.stringify(node, null, 2));
  const [chartImportMessage, setChartImportMessage] = useState("");
  const [formulaPrompt, setFormulaPrompt] = useState("根据 F=ma 生成适合实验说明的公式");
  const [formulaMessage, setFormulaMessage] = useState("");
  useEffect(() => setJson(JSON.stringify(node, null, 2)), [node]);
  function applyJson() {
    onChange(ContentNodeSchema.parse(JSON.parse(json) as unknown));
  }
  async function importChartFile(event: ChangeEvent<HTMLInputElement>) {
    if (node.type !== "chart") return;
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setChartImportMessage("正在导入 Excel 图表数据");
    const formData = new FormData();
    formData.set("file", file);
    const response = await fetch(`/api/books/${bookId}/chart-import`, { method: "POST", body: formData });
    if (!response.ok) {
      setChartImportMessage("导入失败：请上传首列标签、第二列数值的 .xlsx 文件");
      return;
    }
    const result = await response.json() as { chart: Omit<ChartNode, "nodeId" | "type"> };
    onChange({ ...node, ...result.chart });
    setChartImportMessage(`图表数据已导入：${result.chart.items.length} 行`);
  }
  async function askFormulaAssistant() {
    if (node.type !== "formulaBlock") return;
    setFormulaMessage("正在生成公式建议");
    const response = await fetch("/api/formula-assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: formulaPrompt, currentLatex: node.latex, context: node.caption })
    });
    if (!response.ok) {
      setFormulaMessage("公式助手暂不可用");
      return;
    }
    const result = await response.json() as { suggestion: { latex: string; caption: string; number: string; parameterDemo?: { force: number; mass: number }; message: string } };
    onChange({ ...node, latex: result.suggestion.latex, caption: result.suggestion.caption, number: result.suggestion.number, parameterDemo: result.suggestion.parameterDemo });
    setFormulaMessage(result.suggestion.message);
  }
  function updateChartItem(index: number, patch: Partial<ChartNode["items"][number]>) {
    if (node.type !== "chart") return;
    onChange({ ...node, items: node.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) });
  }
  function addChartItem() {
    if (node.type !== "chart") return;
    onChange({ ...node, items: [...node.items, { label: `数据 ${node.items.length + 1}`, value: 1 }] });
  }
  function removeChartItem(index: number) {
    if (node.type !== "chart" || node.items.length <= 1) return;
    onChange({ ...node, items: node.items.filter((_item, itemIndex) => itemIndex !== index) });
  }
  function insertFormulaSnippet(snippet: string) {
    if (node.type !== "formulaBlock") return;
    onChange({ ...node, latex: `${node.latex}${snippet}` });
  }
  function startImageResize(event: PointerEvent<HTMLButtonElement>) {
    if (node.type !== "imageInteractive") return;
    const imageNode = node;
    const startX = event.clientX;
    const startWidth = imageNode.width;
    const target = event.currentTarget;
    target.setPointerCapture?.(event.pointerId);
    function moveTo(clientX: number) {
      const nextWidth = Math.min(100, Math.max(30, Math.round(startWidth + (clientX - startX) / 4)));
      onChange({ ...imageNode, width: nextWidth });
    }
    function move(moveEvent: globalThis.PointerEvent) {
      moveTo(moveEvent.clientX);
    }
    function mouseMove(moveEvent: globalThis.MouseEvent) {
      moveTo(moveEvent.clientX);
    }
    function stop(stopEvent: globalThis.PointerEvent) {
      target.releasePointerCapture?.(stopEvent.pointerId);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("mousemove", mouseMove);
      window.removeEventListener("mouseup", mouseStop);
    }
    function mouseStop() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("mousemove", mouseMove);
      window.removeEventListener("mouseup", mouseStop);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("mousemove", mouseMove);
    window.addEventListener("mouseup", mouseStop);
  }
  const assetOptions = assets.map((asset) => <option value={asset.id} key={asset.id}>{asset.kind} · {asset.title}</option>);
  return (
    <div className="inspector-form">
      {"title" in node ? <label>标题<input value={node.title} onChange={(event) => onChange({ ...node, title: event.target.value } as ContentNode)} /></label> : null}
      {"caption" in node ? <label>图注/说明<input value={node.caption} onChange={(event) => onChange({ ...node, caption: event.target.value } as ContentNode)} /></label> : null}
      {"assetId" in node ? <label>资源<select value={node.assetId} onChange={(event) => onChange({ ...node, assetId: event.target.value } as ContentNode)}>{assetOptions}</select></label> : null}
      {node.type === "imageInteractive" ? (
        <div className="image-quick-tools">
          <label>图片宽度 {node.width}%
            <input type="range" min="30" max="100" value={node.width} onChange={(event) => onChange({ ...node, width: Number(event.target.value) })} />
          </label>
          <div className="image-width-actions" aria-label="图片宽度快捷调整">
            <button type="button" aria-label="缩小图片宽度" disabled={node.width <= 30} onClick={() => onChange({ ...node, width: Math.max(30, node.width - 8) })}>-</button>
            <button type="button" aria-label="放大图片宽度" disabled={node.width >= 100} onClick={() => onChange({ ...node, width: Math.min(100, node.width + 8) })}>+</button>
          </div>
          <div className="image-resize-track" aria-label="拖拽调整图片宽度">
            <span style={{ width: `${node.width}%` }} />
            <button style={{ left: `${node.width}%` }} type="button" onPointerDown={startImageResize} aria-label="拖拽图片宽度手柄" />
          </div>
          <label>对齐
            <select value={node.align} onChange={(event) => onChange({ ...node, align: event.target.value as "left" | "center" | "right" })}>
              <option value="left">左对齐</option>
              <option value="center">居中</option>
              <option value="right">右对齐</option>
            </select>
          </label>
          <button type="button" onClick={() => onChange({ ...node, hotspots: [...node.hotspots, { id: `${node.nodeId}-hotspot-${Date.now()}`, x: 50, y: 50, title: "新热点", body: "热点说明" }] })}>新增热点</button>
        </div>
      ) : null}
      {node.type === "chart" ? (
        <div className="chart-editor-panel">
          <header>
            <b><Calculator size={16} /> 图表编辑器</b>
            <label className="file-chip">
              <Upload size={15} /> Excel 导入
              <input aria-label="导入图表 Excel" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" type="file" onChange={(event) => void importChartFile(event)} />
            </label>
          </header>
          <div className="two-col">
            <label>图表标题<input value={node.title} onChange={(event) => onChange({ ...node, title: event.target.value })} /></label>
            <label>类型
              <select value={node.chartType} onChange={(event) => onChange({ ...node, chartType: event.target.value as "line" | "bar" | "pie" })}>
                <option value="line">折线</option>
                <option value="bar">柱状</option>
                <option value="pie">点图</option>
              </select>
            </label>
            <label>X 轴<input value={node.xLabel} onChange={(event) => onChange({ ...node, xLabel: event.target.value })} /></label>
            <label>Y 轴<input value={node.yLabel} onChange={(event) => onChange({ ...node, yLabel: event.target.value })} /></label>
            <label>主题
              <select value={node.theme} onChange={(event) => onChange({ ...node, theme: event.target.value as "light" | "dark" })}>
                <option value="light">浅色</option>
                <option value="dark">深色</option>
              </select>
            </label>
            <label>颜色<input type="color" value={node.color} onChange={(event) => onChange({ ...node, color: event.target.value })} /></label>
          </div>
          <label className="toggle-row"><input type="checkbox" checked={node.showLegend} onChange={(event) => onChange({ ...node, showLegend: event.target.checked })} /> 显示交互图例</label>
          <div className="chart-data-grid">
            {node.items.map((item, index) => (
              <div className="chart-data-row" key={`${item.label}-${index}`}>
                <input aria-label={`图表标签 ${index + 1}`} value={item.label} onChange={(event) => updateChartItem(index, { label: event.target.value })} />
                <input aria-label={`图表数值 ${index + 1}`} type="number" value={item.value} onChange={(event) => updateChartItem(index, { value: Number(event.target.value) })} />
                <button type="button" aria-label="删除图表行" onClick={() => removeChartItem(index)}><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
          <button type="button" onClick={addChartItem}><Plus size={15} /> 添加数据行</button>
          {chartImportMessage ? <small>{chartImportMessage}</small> : null}
        </div>
      ) : null}
      {node.type === "physicsSimulation" ? (
        <div className="two-col">
          <label>默认力<input type="number" value={node.force.default} onChange={(event) => onChange({ ...node, force: { ...node.force, default: Number(event.target.value) } })} /></label>
          <label>默认质量<input type="number" value={node.mass.default} onChange={(event) => onChange({ ...node, mass: { ...node.mass, default: Number(event.target.value) } })} /></label>
        </div>
      ) : null}
      {node.type === "formulaBlock" ? (
        <div className="formula-editor-panel">
          <header><b><Calculator size={16} /> 公式编辑器</b><span>KaTeX / LaTeX</span></header>
          <label>LaTeX<textarea aria-label="公式 LaTeX" value={node.latex} onChange={(event) => onChange({ ...node, latex: event.target.value })} /></label>
          <label>公式说明<input value={node.caption} onChange={(event) => onChange({ ...node, caption: event.target.value })} /></label>
          <label>编号<input value={node.number ?? ""} onChange={(event) => onChange({ ...node, number: event.target.value })} /></label>
          <div className="formula-symbol-grid">
            {["\\frac{}{}", "\\sqrt{}", "^{}", "_{}", "\\sum", "\\Delta", "\\theta", "\\lambda", "\\cdot", "\\cos"].map((snippet) => (
              <button key={snippet} type="button" onClick={() => insertFormulaSnippet(snippet)}>{snippet}</button>
            ))}
          </div>
          <div className="formula-template-palette">
            {formulaTemplates.map((template) => (
              <button key={template.id} type="button" onClick={() => onChange({ ...node, latex: template.latex, caption: template.caption, number: template.title })}>
                {template.title}
                <small>{template.latex}</small>
              </button>
            ))}
          </div>
          <div className="two-col">
            <label>参数 F<input type="number" value={node.parameterDemo?.force ?? 6} onChange={(event) => onChange({ ...node, parameterDemo: { force: Number(event.target.value), mass: node.parameterDemo?.mass ?? 2 } })} /></label>
            <label>参数 m<input type="number" min={0.1} value={node.parameterDemo?.mass ?? 2} onChange={(event) => onChange({ ...node, parameterDemo: { force: node.parameterDemo?.force ?? 6, mass: Number(event.target.value) } })} /></label>
          </div>
          <div className="formula-ai-box">
            <input aria-label="公式助手提示词" value={formulaPrompt} onChange={(event) => setFormulaPrompt(event.target.value)} />
            <button type="button" onClick={() => void askFormulaAssistant()}><Wand2 size={15} /> AI 生成公式</button>
            {formulaMessage ? <small>{formulaMessage}</small> : null}
          </div>
        </div>
      ) : null}
      <label>节点 JSON<textarea value={json} onChange={(event) => setJson(event.target.value)} /></label>
      <button type="button" onClick={applyJson}>校验并应用</button>
    </div>
  );
}

function applyHeading(editor: ReturnType<typeof useEditor>, value: string) {
  if (!editor) return;
  if (value === "paragraph") editor.chain().focus().setParagraph().run();
  else editor.chain().focus().toggleHeading({ level: Number(value.slice(1)) as 1 | 2 | 3 | 4 | 5 | 6 }).run();
}

function setLink(editor: ReturnType<typeof useEditor>) {
  const href = window.prompt("输入链接");
  if (editor && href) editor.chain().focus().setLink({ href }).run();
}

function richHtml(document: ChapterDocument): string {
  return document.nodes.filter((node) => node.type === "heading" || node.type === "richText").map((node) => node.type === "heading" ? `<h${node.level}>${node.text}</h${node.level}>` : node.html).join("");
}

function replaceRichText(document: ChapterDocument, html: string): ChapterDocument {
  const nodes = document.nodes.filter((node) => node.type !== "heading" && node.type !== "richText");
  return { ...document, nodes: [{ nodeId: `${nodes[0]?.nodeId ?? "rich"}-editor-heading`, type: "richText", html }, ...nodes] };
}

function extractRichBlocks(html: string): { label: string }[] {
  return extractRichBlockHtml(html).map((block) => ({ label: trimText(stripHtml(block), 32) || "空段落" }));
}

function extractRichBlockHtml(html: string): string[] {
  const matches = html.match(/<(p|h[1-6]|blockquote|pre|ul|ol|table)[\s\S]*?<\/\1>/gi) ?? [];
  return matches.length ? matches : (html.trim() ? [html] : []);
}

function getSelectedEditorBlock(): HTMLElement | null {
  const root = document.querySelector<HTMLElement>(".tiptap-surface .ProseMirror");
  if (!root) return null;
  const selection = window.getSelection();
  let node: Node | null = selection?.anchorNode ?? null;
  while (node && node !== root) {
    if (node instanceof HTMLElement && /^(P|H1|H2|H3|H4|H5|H6|LI|BLOCKQUOTE|PRE|TD|TH)$/i.test(node.tagName)) {
      return node;
    }
    node = node.parentNode;
  }
  const first = root.firstElementChild;
  return first instanceof HTMLElement ? first : null;
}

function sanitizePastedHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--StartFragment-->|<!--EndFragment-->/g, "")
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "")
    .replace(/\sclass\s*=\s*"Mso[^"]*"/gi, "")
    .replace(/\sstyle\s*=\s*"([^"]*)"/gi, (_match, style: string) => {
      const kept = style.split(";")
        .map((item) => item.trim())
        .filter((item) => /^(font-weight|font-style|text-decoration|text-align|color|background-color|line-height|margin-left|border|width|table-layout|border-collapse)\s*:/i.test(item))
        .join("; ");
      return kept ? ` style="${kept}"` : "";
    });
}

function tsvToTableHtml(text: string): string {
  const rows = text.trim().split(/\r?\n/).map((row) => row.split("\t"));
  return `<table style="width:100%;border-collapse:collapse"><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
}

function trimText(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function kebabCase(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function isHTMLElement(value: Element): value is HTMLElement {
  return value instanceof HTMLElement;
}

function backupKey(chapterId: string): string {
  return `digital-textbook-backup:${chapterId}`;
}

function assetByKind(assets: Asset[], kind: string, fallback: string): string {
  return assets.find((asset) => asset.kind === kind)?.id ?? fallback;
}

function moveBefore(items: string[], draggedId: string, targetId: string): string[] {
  const withoutDragged = items.filter((item) => item !== draggedId);
  const targetIndex = withoutDragged.indexOf(targetId);
  if (targetIndex < 0) {
    return items;
  }
  return [...withoutDragged.slice(0, targetIndex), draggedId, ...withoutDragged.slice(targetIndex)];
}

function makeDefaultNode(type: ComponentType, chapterId: string, index: number, assets: Asset[]): ContentNode {
  const nodeId = `${chapterId}-${index}-${type}-${Date.now()}`;
  const defaults: Record<ComponentType, ContentNode> = {
    callout: { nodeId, type: "callout", tone: "info", title: "提示", body: "可编辑提示内容" },
    imageInteractive: { nodeId, type: "imageInteractive", assetId: assetByKind(assets, "IMAGE", "asset_forceDiagram"), alt: "插入图片", caption: "图片说明", width: 92, align: "center", hotspots: [] },
    gallery: { nodeId, type: "gallery", assetIds: assets.filter((asset) => asset.kind === "IMAGE").slice(0, 3).map((asset) => asset.id), captions: ["图 1", "图 2", "图 3"], autoplay: false, startIndex: 0 },
    audio: { nodeId, type: "audio", assetId: assetByKind(assets, "AUDIO", "asset_narration"), title: "音频讲解", transcript: "音频文字稿", chapters: [{ time: 0, label: "开始" }], downloadable: true },
    video: { nodeId, type: "video", assetId: assetByKind(assets, "VIDEO", "asset_video"), title: "实验视频", captionAssetId: "asset_video_captions", transcript: [{ time: 0, text: "实验开始" }], caption: "视频说明" },
    formulaBlock: { nodeId, type: "formulaBlock", latex: "F=ma", number: "N-1", caption: "公式说明", parameterDemo: { force: 6, mass: 2 } },
    chart: { nodeId, type: "chart", chartType: "line", title: "交互图表", items: [{ label: "2N", value: 1 }, { label: "4N", value: 2 }], xLabel: "F", yLabel: "a", showLegend: true, theme: "light", color: "#1b7f83" },
    physicsSimulation: { nodeId, type: "physicsSimulation", title: "F=ma 仿真实验", force: { min: 1, max: 10, step: 1, default: 6 }, mass: { min: 1, max: 5, step: 0.5, default: 2 }, showTrajectory: true, showFormula: true, prompt: "拖动滑块并运行实验。" },
    model3d: { nodeId, type: "model3d", assetId: assetByKind(assets, "MODEL3D", "asset_cart3d"), title: "3D 小车", description: "拖拽旋转查看模型", autoRotate: true, hotspots: [{ position: "0m 0.5m 0m", title: "质量", body: "质量影响加速度" }] },
    panorama: { nodeId, type: "panorama", assetId: assetByKind(assets, "PANORAMA", "asset_panorama"), title: "360 实验室", initialYaw: 0, initialPitch: 0, hotspots: [{ yaw: 0, pitch: 0, title: "实验台", body: "实验器材区域" }] },
    extendedReading: { nodeId, type: "extendedReading", title: "扩展阅读", summary: "生活中的物理", body: "扩展阅读正文", tags: ["扩展"] },
    attachment: { nodeId, type: "attachment", assetId: assetByKind(assets, "PDF", "asset_guide"), title: "实验指导书", preview: true },
    quizSet: { nodeId, type: "quizSet", title: "练习题组", allowRetry: true, questions: [{ id: "q-new", type: "single", question: "F=ma 中 a 与 F 的关系是？", options: ["正比", "反比"], correct: [0], explanation: "质量不变时成正比。", score: 10, media: [] }] },
    recordingTask: { nodeId, type: "recordingTask", title: "录音表达", prompt: "用自己的话解释定律。", recommendedSeconds: 60 },
    knowledgeGraph: { nodeId, type: "knowledgeGraph", title: "知识图谱", nodes: [{ id: "force", type: "concept", label: "合力 F", target: "chapter-operate" }, { id: "law", type: "formula", label: "F=ma", target: "chapter-operate" }], edges: [{ source: "force", target: "law", label: "决定" }] }
  };
  return ContentNodeSchema.parse(defaults[type]);
}
