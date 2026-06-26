import { requireUser } from "@/server/auth/session";
import { listAssignmentsForStudent } from "@/server/services/p1";
import { StudentAssignmentsClient } from "./StudentAssignmentsClient";

interface PageProps {
  params: Promise<{ bookId: string }>;
}

export default async function StudentAssignmentsPage({ params }: PageProps) {
  await params;
  const user = await requireUser();
  return <StudentAssignmentsClient classroomId="class_physics_1" initialAssignments={listAssignmentsForStudent("class_physics_1", user.id)} />;
}
