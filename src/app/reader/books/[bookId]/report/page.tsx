import { requireStudent } from "@/server/auth/guards";
import { getPersonalReport, getReaderSnapshot } from "@/server/services/reader";

interface PageProps {
  params: Promise<{ bookId: string }>;
}

export default async function ReportPage({ params }: PageProps) {
  const user = await requireStudent();
  const { bookId } = await params;
  const snapshot = getReaderSnapshot(bookId);
  const report = getPersonalReport(user.id, snapshot.versionId);
  return (
    <main className="workspace-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">数据库实时聚合</p>
          <h1>个人学习报告</h1>
        </div>
        <div className="inline-actions">
          <a className="primary-link" href={`/api/reader/books/${bookId}/report/export?format=xlsx`}>导出 XLSX</a>
          <a className="primary-link" href={`/api/reader/books/${bookId}/report/export?format=svg`}>导出 SVG</a>
        </div>
      </section>
      <div className="metric-grid">
        <Metric label="有效阅读" value={`${Math.round(report.activeSeconds / 60)} 分钟`} />
        <Metric label="章节进度" value={`${report.visitedChapters}/3`} />
        <Metric label="音频完成率" value={`${Math.round(report.audioCompletionRate * 100)}%`} />
        <Metric label="视频完成率" value={`${Math.round(report.videoCompletionRate * 100)}%`} />
        <Metric label="3D/全景交互" value={`${report.modelPanoramaInteractions} 次`} />
        <Metric label="仿真实验运行" value={`${report.simulationRuns} 次`} />
        <Metric label="实验保存" value={`${report.simulationSaveCount} 次`} />
        <Metric label="笔记" value={`${report.noteCount} 条`} />
        <Metric label="录音提交" value={`${report.recordingCount} 次`} />
      </div>
      <section className="timeline">
        <h2>学习轨迹</h2>
        {report.recentActivities.map((item, index) => <article key={`${item.occurredAt}-${item.eventType}-${index}`}><span>{new Date(item.occurredAt).toLocaleTimeString()}</span><strong>{item.eventType}</strong><small>{item.nodeId}</small></article>)}
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <article className="metric-card"><span>{label}</span><strong>{value}</strong></article>;
}
