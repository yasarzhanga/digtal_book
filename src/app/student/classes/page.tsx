import { requireStudent } from "@/server/auth/guards";
import { listStudentClassrooms } from "@/server/services/teaching";
import { StudentClassesClient } from "./StudentClassesClient";

export default async function StudentClassesPage() {
  const user = await requireStudent();
  return <StudentClassesClient initialClassrooms={listStudentClassrooms(user.id)} />;
}
