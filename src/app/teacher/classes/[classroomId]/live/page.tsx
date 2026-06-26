import { redirect } from "next/navigation";

import { getCurrentUser } from "@/server/auth/session";
import { getCurrentSnapshot } from "@/server/services/books";
import { getClassroom, getCurrentLive } from "@/server/services/teaching";
import { TeacherLiveClient } from "./TeacherLiveClient";

interface PageProps {
  params: Promise<{ classroomId: string }>;
}

export default async function TeacherLivePage({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const { classroomId } = await params;
  const classroom = getClassroom(classroomId);
  const snapshot = getCurrentSnapshot(classroom.bookId);
  const current = JSON.parse(JSON.stringify(getCurrentLive(classroomId))) as ReturnType<typeof getCurrentLive>;
  return <TeacherLiveClient classroom={classroom} snapshot={snapshot} current={current} />;
}
