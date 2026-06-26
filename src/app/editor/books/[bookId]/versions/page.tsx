import { requireUser } from "@/server/auth/session";
import { getVersions } from "@/server/services/books";
import { VersionsClient } from "./VersionsClient";

interface PageProps {
  params: Promise<{ bookId: string }>;
}

export default async function VersionsPage({ params }: PageProps) {
  await requireUser();
  const { bookId } = await params;
  return <VersionsClient bookId={bookId} versions={getVersions(bookId)} />;
}
