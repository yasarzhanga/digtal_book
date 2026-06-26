import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ classroomId: string }>;
}

export default async function TeacherClassPage({ params }: PageProps) {
  const { classroomId } = await params;
  redirect(`/teacher/classes/${classroomId}/live`);
}
