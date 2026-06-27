import { DEMO_BOOK_ID } from "@/server/db/ids";
import { requireStudent } from "@/server/auth/guards";
import { JoinClassClient } from "./JoinClassClient";

interface PageProps {
  searchParams: Promise<{ code?: string }>;
}

export default async function JoinPage({ searchParams }: PageProps) {
  await requireStudent();
  const { code = "" } = await searchParams;
  return <JoinClassClient code={code} bookId={DEMO_BOOK_ID} />;
}
