import { requireUser } from "@/server/auth/session";
import { ensureBookReadable } from "@/server/auth/guards";
import { getReaderSnapshot } from "@/server/services/reader";
import { isAiProviderConfigured, listAiConversations } from "@/server/services/ai";
import { AiTutorClient } from "./AiTutorClient";

interface PageProps {
  params: Promise<{ bookId: string }>;
}

export default async function AiTutorPage({ params }: PageProps) {
  const user = await requireUser();
  const { bookId } = await params;
  ensureBookReadable(user, bookId);
  const snapshot = getReaderSnapshot(bookId);
  const conversations = listAiConversations(user.id, snapshot.versionId);
  return (
    <AiTutorClient
      bookId={bookId}
      bookTitle={snapshot.book.title}
      bookVersionId={snapshot.versionId}
      initialConversations={conversations}
      providerConfigured={isAiProviderConfigured()}
    />
  );
}
