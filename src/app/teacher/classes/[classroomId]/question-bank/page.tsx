import { ensureClassroomTeacher, requireTeacher } from "@/server/auth/guards";
import { listAssignmentsForTeacher, listQuestionBank } from "@/server/services/p1";
import { QuestionBankClient } from "./QuestionBankClient";

interface PageProps {
  params: Promise<{ classroomId: string }>;
}

export default async function QuestionBankPage({ params }: PageProps) {
  const user = await requireTeacher();
  const { classroomId } = await params;
  ensureClassroomTeacher(classroomId, user.id);
  listAssignmentsForTeacher(classroomId, user.id);
  return <QuestionBankClient classroomId={classroomId} initialItems={listQuestionBank(user.id)} />;
}
