"use client";

import { useState } from "react";

interface CourseResource {
  id: string;
  title: string;
  description: string;
  category: string;
  visibility: string;
  asset: { id: string; kind: string; title: string; originalName: string; size: number; url: string };
}

export function CourseResourcesClient({ classroomId, initialResources }: { classroomId: string; initialResources: CourseResource[] }) {
  const [resources, setResources] = useState(initialResources);
  const [message, setMessage] = useState("");

  async function refresh() {
    const response = await fetch(`/api/classes/${classroomId}/resources`);
    if (response.ok) {
      const json = await response.json() as { resources: CourseResource[] };
      setResources(json.resources);
    }
  }

  async function upload(formData: FormData) {
    const response = await fetch(`/api/classes/${classroomId}/resources`, { method: "POST", body: formData });
    setMessage(response.ok ? "课程资源已保存" : "上传失败：请检查类型、大小或权限");
    await refresh();
  }

  return (
    <main className="workspace-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">P1 课程资源独立管理</p>
          <h1>资源、SCORM 与 H5P</h1>
        </div>
        <a className="primary-link" href={`/teacher/classes/${classroomId}/assignments`}>作业工作台</a>
      </section>
      <form className="p1-panel upload-form" action={(formData) => void upload(formData)}>
        <div className="two-col">
          <select name="kind" defaultValue="PDF">
            {["IMAGE", "AUDIO", "VIDEO", "MODEL3D", "PANORAMA", "PDF", "DOCUMENT", "SCORM", "H5P"].map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select name="category" defaultValue="REFERENCE">
            {["LESSON", "HOMEWORK", "MEDIA", "REFERENCE", "SCORM", "H5P"].map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
        <input name="title" placeholder="资源标题" />
        <input name="description" placeholder="资源说明" />
        <select name="visibility" defaultValue="CLASS">
          <option value="CLASS">学生可见</option>
          <option value="TEACHER">仅教师</option>
        </select>
        <input name="file" type="file" />
        <button className="primary-action" type="submit">上传并入库</button>
        {message ? <span>{message}</span> : null}
      </form>
      <section className="resource-grid">
        {resources.map((resource) => (
          <article className="resource-card" key={resource.id}>
            <span>{resource.category} · {resource.visibility}</span>
            <strong>{resource.title}</strong>
            <p>{resource.description}</p>
            <small>{resource.asset.kind} · {resource.asset.originalName} · {Math.round(resource.asset.size / 1024)}KB</small>
            <a className="primary-link" href={resource.asset.url} target="_blank">启动/预览</a>
          </article>
        ))}
      </section>
    </main>
  );
}
