import { redirect } from "next/navigation";
import { ensureClassroomTeacher, ensureStudentEnrolled } from "@/server/auth/guards";
import { getCurrentUser } from "@/server/auth/session";
import { getReaderSnapshot } from "@/server/services/reader";
import { getStudentClassroomForBook } from "@/server/services/teaching";
import { ReaderClient } from "./ReaderClient";

interface PageProps {
  params: Promise<{ bookId: string }>;
  searchParams: Promise<{ classroomId?: string }>;
}

export default async function ReaderPage({ params, searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  const { bookId } = await params;
  const query = await searchParams;
  const classroomId = query.classroomId ?? (user.role === "STUDENT" ? getStudentClassroomForBook(user.id, bookId) ?? undefined : undefined);
  if (classroomId && user.role === "STUDENT") ensureStudentEnrolled(classroomId, user.id);
  if (classroomId && user.role === "TEACHER") ensureClassroomTeacher(classroomId, user.id);
  const snapshot = getReaderSnapshot(bookId);
  return <ReaderClient bookId={bookId} snapshot={snapshot} initialClassroomId={classroomId} />;
}
