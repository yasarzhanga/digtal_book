import { requireUser } from "@/server/auth/session";
import { listAssignmentsForTeacher, listQuestionBank } from "@/server/services/p1";
import { QuestionBankClient } from "./QuestionBankClient";

interface PageProps {
  params: Promise<{ classroomId: string }>;
}

export default async function QuestionBankPage({ params }: PageProps) {
  const user = await requireUser();
  const { classroomId } = await params;
  listAssignmentsForTeacher(classroomId, user.id);
  return <QuestionBankClient classroomId={classroomId} initialItems={listQuestionBank(user.id)} />;
}
