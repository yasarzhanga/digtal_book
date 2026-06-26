import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { getReaderSnapshot } from "@/server/services/reader";
import { ReaderClient } from "./ReaderClient";

interface PageProps {
  params: Promise<{ bookId: string }>;
}

export default async function ReaderPage({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  const { bookId } = await params;
  const snapshot = getReaderSnapshot(bookId);
  return <ReaderClient bookId={bookId} snapshot={snapshot} />;
}
