import { requireUser } from "@/server/auth/session";
import { getStudentReport } from "@/server/services/teaching";

interface PageProps {
  params: Promise<{ classroomId: string; studentId: string }>;
}

export default async function StudentReportPage({ params }: PageProps) {
  await requireUser();
  const { classroomId, studentId } = await params;
  const report = getStudentReport(classroomId, studentId);
  return (
    <main className="workspace-page">
      <section className="page-heading">
        <p className="eyebrow">学生详情</p>
        <h1>{report.name}</h1>
      </section>
      <div className="metric-grid">
        <Metric label="阅读时长" value={`${Math.round(report.activeSeconds / 60)} 分钟`} />
        <Metric label="答题正确率" value={`${Math.round(report.quizAccuracy * 100)}%`} />
        <Metric label="实验记录" value={`${report.experimentCount} 次`} />
        <Metric label="笔记" value={`${report.noteCount} 条`} />
        <Metric label="录音提交" value={`${report.recordingCount} 次`} />
      </div>
      <section className="timeline">
        <h2>活动时间线</h2>
        {report.events.map((event, index) => <article key={`${event.eventType}-${event.occurredAt}-${index}`}><span>{new Date(event.occurredAt).toLocaleString()}</span><strong>{event.eventType}</strong></article>)}
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <article className="metric-card"><span>{label}</span><strong>{value}</strong></article>;
}
