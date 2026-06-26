"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

interface TeacherCourseRow {
  id: string;
  name: string;
  bookId: string;
  classroomId: string;
  classroomName: string;
  joinCode: string;
}

export function TeacherCoursesClient({ initialCourses, initialRole }: { initialCourses: TeacherCourseRow[]; initialRole: string }) {
  const [courses, setCourses] = useState(initialCourses);
  const [role, setRole] = useState(initialRole);
  const [origin, setOrigin] = useState("");
  const [message, setMessage] = useState("");
  const groupedCourses = useMemo(() => {
    const groups = new Map<string, TeacherCourseRow[]>();
    for (const course of courses) {
      groups.set(course.id, [...(groups.get(course.id) ?? []), course]);
    }
    return [...groups.entries()].map(([courseId, rows]) => ({ courseId, rows }));
  }, [courses]);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  async function refresh() {
    const response = await fetch("/api/courses");
    if (response.ok) {
      const json = await response.json() as { courses: TeacherCourseRow[] };
      setCourses(json.courses);
    }
  }

  async function createCourse(formData: FormData) {
    if (role !== "TEACHER") {
      setMessage("当前不是教师身份，请先切换为教师后再创建课程。");
      return;
    }
    const response = await fetch("/api/courses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(formData.get("name") ?? ""),
        classroomName: String(formData.get("classroomName") ?? "")
      })
    });
    setMessage(response.ok ? "课程和班级已创建" : await errorMessage(response, "创建失败"));
    await refresh();
  }

  async function switchToTeacher() {
    const response = await fetch("/api/auth/demo-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "teacher" })
    });
    if (!response.ok) {
      setMessage("切换教师身份失败，请重新登录教师账号。");
      return;
    }
    setRole("TEACHER");
    setMessage("已切换为教师身份，可以创建课程。");
    await refresh();
  }

  async function renameCourse(courseId: string, formData: FormData) {
    const response = await fetch(`/api/courses/${courseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: String(formData.get("name") ?? "") })
    });
    setMessage(response.ok ? "课程已更新" : "课程更新失败");
    await refresh();
  }

  async function addClassroom(courseId: string, formData: FormData) {
    const response = await fetch(`/api/courses/${courseId}/classrooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: String(formData.get("name") ?? "") })
    });
    setMessage(response.ok ? "班级已创建" : "班级创建失败");
    await refresh();
  }

  async function renameClassroom(classroomId: string, formData: FormData) {
    const response = await fetch(`/api/classes/${classroomId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: String(formData.get("name") ?? "") })
    });
    setMessage(response.ok ? "班级已更新" : "班级更新失败");
    await refresh();
  }

  async function deleteClassroom(classroomId: string) {
    const response = await fetch(`/api/classes/${classroomId}`, { method: "DELETE" });
    setMessage(response.ok ? "班级已删除" : "班级删除失败");
    await refresh();
  }

  async function deleteCourse(courseId: string) {
    const response = await fetch(`/api/courses/${courseId}`, { method: "DELETE" });
    setMessage(response.ok ? "课程已删除" : "课程删除失败");
    await refresh();
  }

  return (
    <main className="workspace-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">教师端</p>
          <h1>课程和班级</h1>
        </div>
      </section>

      <form className="p1-panel course-create-form" action={(formData) => void createCourse(formData)}>
        <input name="name" placeholder="课程名称" required />
        <input name="classroomName" placeholder="首个班级名称" required />
        <button className="primary-action" type="submit">创建课程</button>
        {role !== "TEACHER" ? <button type="button" onClick={() => void switchToTeacher()}>切换教师身份</button> : null}
        {message ? <span>{message}</span> : null}
      </form>

      <section className="course-admin-list">
        {groupedCourses.map(({ courseId, rows }) => {
          const first = rows[0];
          if (!first) return null;
          return (
            <article className="course-admin-card" key={courseId}>
              <header>
                <div>
                  <span>课程</span>
                  <strong>{first.name}</strong>
                </div>
                <form action={(formData) => void renameCourse(courseId, formData)}>
                  <input name="name" defaultValue={first.name} aria-label={`${first.name} 课程名称`} />
                  <button type="submit">更新课程</button>
                </form>
              </header>
              <form className="inline-create" action={(formData) => void addClassroom(courseId, formData)}>
                <input name="name" placeholder="新增班级名称" required />
                <button type="submit">新增班级</button>
              </form>
              <button type="button" onClick={() => void deleteCourse(courseId)}>删除课程</button>
              <div className="classroom-admin-grid">
                {rows.map((course) => {
                  const joinUrl = `${origin || "http://127.0.0.1:3000"}/join?code=${course.joinCode}`;
                  return (
                    <section className="classroom-admin-card" key={course.classroomId}>
                      <div>
                        <span>班级</span>
                        <strong>{course.classroomName}</strong>
                        <small>邀请码 {course.joinCode}</small>
                      </div>
                      <QRCodeSVG aria-label="入班二维码" value={joinUrl} size={92} />
                      <input readOnly value={joinUrl} aria-label="入班链接" />
                      <div className="inline-actions">
                        <Link className="primary-link" href={`/teacher/classes/${course.classroomId}/live`} prefetch={false}>进入课堂</Link>
                        <Link className="primary-link" href={`/teacher/classes/${course.classroomId}/analytics`} prefetch={false}>学习报告</Link>
                      </div>
                      <form action={(formData) => void renameClassroom(course.classroomId, formData)}>
                        <input name="name" defaultValue={course.classroomName} aria-label={`${course.classroomName} 班级名称`} />
                        <button type="submit">更新班级</button>
                      </form>
                      <button type="button" onClick={() => void deleteClassroom(course.classroomId)}>删除班级</button>
                    </section>
                  );
                })}
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}

async function errorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const json = await response.json() as { error?: string };
    if (json.error === "TEACHER_ROLE_REQUIRED_FORBIDDEN") {
      return "当前不是教师身份，请先切换为教师后再创建课程。";
    }
    return json.error ? `${fallback}: ${json.error}` : fallback;
  } catch {
    return fallback;
  }
}
