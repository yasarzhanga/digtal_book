import { requireUser } from "@/server/auth/session";
import { listAssignmentsForTeacher, listQuestionBank } from "@/server/services/p1";
import { AssignmentsClient } from "./AssignmentsClient";

interface PageProps {
  params: Promise<{ classroomId: string }>;
}

export default async function AssignmentsPage({ params }: PageProps) {
  const user = await requireUser();
  const { classroomId } = await params;
  const assignments = listAssignmentsForTeacher(classroomId, user.id);
  const bankItems = listQuestionBank(user.id);
  return <AssignmentsClient classroomId={classroomId} initialAssignments={assignments} bankItems={bankItems} />;
}
