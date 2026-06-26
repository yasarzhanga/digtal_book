import Link from "next/link";
import { requireUser } from "@/server/auth/session";
import { listBooks } from "@/server/services/books";

export default async function EditorBooksPage() {
  await requireUser();
  const books = listBooks();
  return (
    <main className="workspace-page">
      <section className="page-heading">
        <p className="eyebrow">编辑者工作台</p>
        <h1>教材列表</h1>
      </section>
      <div className="book-list">
        {books.map((book) => (
          <Link className="book-row" href={`/editor/books/${book.id}`} key={book.id}>
            <strong>{book.title}</strong>
            <span>{book.subtitle}</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
