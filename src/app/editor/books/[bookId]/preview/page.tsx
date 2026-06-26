import { requireUser } from "@/server/auth/session";
import { getCurrentSnapshot } from "@/server/services/books";
import { PreviewClient } from "./PreviewClient";

interface PageProps {
  params: Promise<{ bookId: string }>;
}

export default async function EditorPreviewPage({ params }: PageProps) {
  await requireUser();
  const { bookId } = await params;
  const snapshot = getCurrentSnapshot(bookId);
  return <PreviewClient snapshot={snapshot} bookId={bookId} />;
}
