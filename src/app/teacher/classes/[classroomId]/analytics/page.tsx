import Link from "next/link";
import { requireUser } from "@/server/auth/session";
import { getClassAnalytics, getClassroom, getResourceLearningDetails } from "@/server/services/teaching";

interface PageProps {
  params: Promise<{ classroomId: string }>;
}

export default async function AnalyticsPage({ params }: PageProps) {
  await requireUser();
  const { classroomId } = await params;
  const classroom = getClassroom(classroomId);
  const analytics = getClassAnalytics(classroomId);
  const resourceLearning = getResourceLearningDetails(classroomId);
  return (
    <main className="workspace-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">班级数据</p>
          <h1>{classroom.name}</h1>
        </div>
        <div className="inline-actions">
          <a className="primary-link" href={`/api/classes/${classroomId}/analytics/export?format=xlsx`}>导出 XLSX</a>
          <a className="primary-link" href={`/api/classes/${classroomId}/analytics/export?format=svg`}>导出 SVG</a>
          <a className="primary-link" href={`/api/classes/${classroomId}/resources/learning?format=xlsx`}>导出资源明细</a>
        </div>
      </section>
      <div className="metric-grid">
        <Metric label="平均进度" value={`${Math.round(analytics.averageProgress * 100)}%`} />
        <Metric label="平均学习时长" value={`${Math.round(analytics.averageActiveSeconds / 60)} 分钟`} />
        <Metric label="音频完成率" value={`${Math.round(analytics.audioCompletionRate * 100)}%`} />
        <Metric label="视频完成率" value={`${Math.round(analytics.videoCompletionRate * 100)}%`} />
        <Metric label="仿真参与率" value={`${Math.round(analytics.simulationParticipationRate * 100)}%`} />
        <Metric label="3D/全景人数" value={`${analytics.modelPanoramaParticipants} 人`} />
        <Metric label="平均正确率" value={`${Math.round(analytics.averageQuizAccuracy * 100)}%`} />
        <Metric label="笔记/录音" value={`${analytics.noteCount}/${analytics.recordingCount}`} />
      </div>
      <section className="timeline">
        <h2>最近 7 天活动趋势</h2>
        {analytics.trend.map((item) => <article key={item.day}><span>{item.day}</span><strong>{item.count} 条事件</strong></article>)}
      </section>
      <section className="timeline">
        <h2>资源学习明细</h2>
        {resourceLearning.summaries.length ? resourceLearning.summaries.slice(0, 8).map((item) => (
          <article key={item.key}>
            <span>{item.title}</span>
            <strong>{item.openCount} 次 · {item.studentCount} 人 · {item.kind}</strong>
          </article>
        )) : <article><span>暂无资源打开记录</span><strong>等待学生访问资源中心</strong></article>}
      </section>
      <Link className="primary-link" href={`/teacher/classes/${classroomId}/students/user_student`}>查看陈同学详情</Link>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <article className="metric-card"><span>{label}</span><strong>{value}</strong></article>;
}
