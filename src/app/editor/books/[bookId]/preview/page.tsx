import { ensureBookOwner, requireEditor } from "@/server/auth/guards";
import { getCurrentSnapshot } from "@/server/services/books";
import { PreviewClient } from "./PreviewClient";

interface PageProps {
  params: Promise<{ bookId: string }>;
}

export default async function EditorPreviewPage({ params }: PageProps) {
  const user = await requireEditor();
  const { bookId } = await params;
  ensureBookOwner(bookId, user.id);
  const snapshot = getCurrentSnapshot(bookId);
  return <PreviewClient snapshot={snapshot} bookId={bookId} />;
}
