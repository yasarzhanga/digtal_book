import { requireStudent } from "@/server/auth/guards";
import { StudentClassesClient } from "../StudentClassesClient";

interface PageProps {
  searchParams: Promise<{ code?: string }>;
}

export default async function StudentJoinClassPage({ searchParams }: PageProps) {
  await requireStudent();
  const { code = "" } = await searchParams;
  return <StudentClassesClient initialClassrooms={[]} initialCode={code} />;
}
