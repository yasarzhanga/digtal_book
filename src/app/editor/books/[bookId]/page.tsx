import { ensureBookOwner, requireEditor } from "@/server/auth/guards";
import { getEditorBookForOwner } from "@/server/services/books";
import { listReadableAssets } from "@/server/services/assets";
import { EditorClient } from "./EditorClient";

interface PageProps {
  params: Promise<{ bookId: string }>;
}

export default async function EditorBookPage({ params }: PageProps) {
  const user = await requireEditor();
  const { bookId } = await params;
  ensureBookOwner(bookId, user.id);
  const book = getEditorBookForOwner(bookId, user.id);
  const assets = listReadableAssets(user);
  return <EditorClient book={book} assets={assets} />;
}
