import { ensureBookOwner, requireEditor } from "@/server/auth/guards";
import { getVersions } from "@/server/services/books";
import { VersionsClient } from "./VersionsClient";

interface PageProps {
  params: Promise<{ bookId: string }>;
}

export default async function VersionsPage({ params }: PageProps) {
  const user = await requireEditor();
  const { bookId } = await params;
  ensureBookOwner(bookId, user.id);
  return <VersionsClient bookId={bookId} versions={getVersions(bookId)} />;
}
