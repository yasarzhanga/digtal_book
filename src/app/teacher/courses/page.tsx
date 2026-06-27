import { requireTeacher } from "@/server/auth/guards";
import { listTeacherCourses } from "@/server/services/teaching";
import { TeacherCoursesClient } from "./TeacherCoursesClient";

export default async function TeacherCoursesPage() {
  const user = await requireTeacher();
  const courses = listTeacherCourses(user.id);
  return <TeacherCoursesClient initialCourses={courses} initialRole={user.role} />;
}
