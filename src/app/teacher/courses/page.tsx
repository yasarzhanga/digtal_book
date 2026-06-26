import { requireUser } from "@/server/auth/session";
import { listTeacherCourses } from "@/server/services/teaching";
import { TeacherCoursesClient } from "./TeacherCoursesClient";

export default async function TeacherCoursesPage() {
  const user = await requireUser();
  const courses = listTeacherCourses(user.id);
  return <TeacherCoursesClient initialCourses={courses} initialRole={user.role} />;
}
