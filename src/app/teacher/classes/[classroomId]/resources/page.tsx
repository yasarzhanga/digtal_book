import { requireUser } from "@/server/auth/session";
import { listCourseResourcesForClassroom } from "@/server/services/p1";
import { CourseResourcesClient } from "./CourseResourcesClient";

interface PageProps {
  params: Promise<{ classroomId: string }>;
}

export default async function CourseResourcesPage({ params }: PageProps) {
  const user = await requireUser();
  const { classroomId } = await params;
  return <CourseResourcesClient classroomId={classroomId} initialResources={listCourseResourcesForClassroom(classroomId, user.role)} />;
}
