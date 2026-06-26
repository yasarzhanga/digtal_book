import { requireUser } from "@/server/auth/session";
import { getEditorBook } from "@/server/services/books";
import { listAssets } from "@/server/services/assets";
import { EditorClient } from "./EditorClient";

interface PageProps {
  params: Promise<{ bookId: string }>;
}

export default async function EditorBookPage({ params }: PageProps) {
  await requireUser();
  const { bookId } = await params;
  const book = getEditorBook(bookId);
  const assets = listAssets();
  return <EditorClient book={book} assets={assets} />;
}
