import { ensureClassroomTeacher, requireTeacher } from "@/server/auth/guards";
import { listCourseResourcesForClassroom } from "@/server/services/p1";
import { CourseResourcesClient } from "./CourseResourcesClient";

interface PageProps {
  params: Promise<{ classroomId: string }>;
}

export default async function CourseResourcesPage({ params }: PageProps) {
  const user = await requireTeacher();
  const { classroomId } = await params;
  ensureClassroomTeacher(classroomId, user.id);
  return <CourseResourcesClient classroomId={classroomId} initialResources={listCourseResourcesForClassroom(classroomId, user.role)} />;
}
