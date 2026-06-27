import { ensureBookReadable, ensureClassroomBookAccess, requireStudent } from "@/server/auth/guards";
import { listAssignmentsForStudent } from "@/server/services/p1";
import { getStudentClassroomForBook } from "@/server/services/teaching";
import { StudentAssignmentsClient } from "./StudentAssignmentsClient";

interface PageProps {
  params: Promise<{ bookId: string }>;
  searchParams: Promise<{ classroomId?: string }>;
}

export default async function StudentAssignmentsPage({ params, searchParams }: PageProps) {
  const { bookId } = await params;
  const { classroomId: requestedClassroomId } = await searchParams;
  const user = await requireStudent();
  const classroomId = requestedClassroomId ?? getStudentClassroomForBook(user.id, bookId);
  ensureBookReadable(user, bookId, classroomId);
  if (classroomId) ensureClassroomBookAccess(user, classroomId, bookId);
  const assignments = classroomId ? listAssignmentsForStudent(classroomId, user.id) : [];
  return <StudentAssignmentsClient classroomId={classroomId ?? ""} initialAssignments={assignments} />;
}
