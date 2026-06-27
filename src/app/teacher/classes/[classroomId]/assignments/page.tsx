import { ensureClassroomTeacher, requireTeacher } from "@/server/auth/guards";
import { listAssignmentsForTeacher, listQuestionBank } from "@/server/services/p1";
import { AssignmentsClient } from "./AssignmentsClient";

interface PageProps {
  params: Promise<{ classroomId: string }>;
}

export default async function AssignmentsPage({ params }: PageProps) {
  const user = await requireTeacher();
  const { classroomId } = await params;
  ensureClassroomTeacher(classroomId, user.id);
  const assignments = listAssignmentsForTeacher(classroomId, user.id);
  const bankItems = listQuestionBank(user.id);
  return <AssignmentsClient classroomId={classroomId} initialAssignments={assignments} bankItems={bankItems} />;
}
