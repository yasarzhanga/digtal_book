import { ensureStudentEnrolled, requireStudent } from "@/server/auth/guards";
import { getSimulationTemplates, listSimulationTemplateRuns } from "@/server/services/p1";
import { getStudentClassroomForBook } from "@/server/services/teaching";
import { SimulationTemplatesClient } from "./SimulationTemplatesClient";

interface PageProps {
  params: Promise<{ bookId: string }>;
  searchParams: Promise<{ classroomId?: string }>;
}

export default async function SimulationTemplatesPage({ params, searchParams }: PageProps) {
  const user = await requireStudent();
  const { bookId } = await params;
  const { classroomId: requestedClassroomId } = await searchParams;
  const classroomId = requestedClassroomId ?? getStudentClassroomForBook(user.id, bookId) ?? undefined;
  if (classroomId) ensureStudentEnrolled(classroomId, user.id);
  return <SimulationTemplatesClient bookId={bookId} classroomId={classroomId} templates={getSimulationTemplates()} initialRuns={listSimulationTemplateRuns(user.id)} />;
}
