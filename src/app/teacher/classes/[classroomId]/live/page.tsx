import { ensureClassroomTeacher, requireTeacher } from "@/server/auth/guards";
import { getCurrentSnapshot } from "@/server/services/books";
import { getClassroom, getCurrentLive } from "@/server/services/teaching";
import { TeacherLiveClient } from "./TeacherLiveClient";

interface PageProps {
  params: Promise<{ classroomId: string }>;
}

export default async function TeacherLivePage({ params }: PageProps) {
  const user = await requireTeacher();
  const { classroomId } = await params;
  ensureClassroomTeacher(classroomId, user.id);
  const classroom = getClassroom(classroomId);
  const snapshot = getCurrentSnapshot(classroom.bookId);
  const current = JSON.parse(JSON.stringify(getCurrentLive(classroomId))) as ReturnType<typeof getCurrentLive>;
  return <TeacherLiveClient classroom={classroom} snapshot={snapshot} current={current} />;
}
