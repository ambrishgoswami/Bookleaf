import type { Book } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { NotFound } from "../../lib/errors.js";
import type { AuthUser } from "../auth/auth.tokens.js";
import {
  PAYOUT_THRESHOLD_INR,
  PUBLISHED_STATUS,
  nextRoyaltyPayout,
  productionStage,
  toISODate,
} from "../../domain/policy.js";

/** API representation of a book. Derived fields save every client re-deriving them. */
export function toBookDto(book: Book) {
  const isPublished = book.status === PUBLISHED_STATUS;
  return {
    id: book.id,
    code: book.code,
    title: book.title,
    isbn: book.isbn,
    genre: book.genre,
    status: book.status,
    isPublished,
    production: isPublished ? null : productionStage(book.status),
    publicationDate: toISODate(book.publicationDate),
    mrp: book.mrp,
    royaltyPerCopy: book.royaltyPerCopy,
    copiesSold: book.copiesSold,
    royaltyEarned: book.royaltyEarned,
    royaltyPaid: book.royaltyPaid,
    royaltyPending: book.royaltyPending,
    lastRoyaltyPayoutDate: toISODate(book.lastRoyaltyPayoutDate),
    printPartner: book.printPartner,
    availableOn: book.availableOn,
  };
}

export type BookDto = ReturnType<typeof toBookDto>;

/** Author-level royalty position — the threshold applies to the accumulated total. */
export function summarize(books: BookDto[], today = new Date()) {
  const sum = (pick: (b: BookDto) => number) => books.reduce((acc, b) => acc + pick(b), 0);
  const totalRoyaltyPending = sum((b) => b.royaltyPending);
  const payout = nextRoyaltyPayout(today);

  return {
    totalBooks: books.length,
    publishedBooks: books.filter((b) => b.isPublished).length,
    totalCopiesSold: sum((b) => b.copiesSold),
    totalRoyaltyEarned: sum((b) => b.royaltyEarned),
    totalRoyaltyPaid: sum((b) => b.royaltyPaid),
    totalRoyaltyPending,
    payout: {
      thresholdInr: PAYOUT_THRESHOLD_INR,
      meetsThreshold: totalRoyaltyPending >= PAYOUT_THRESHOLD_INR,
      nextQuarter: payout.quarter,
      nextPayoutBy: toISODate(payout.payoutBy),
    },
  };
}

/**
 * Lists books visible to the caller. Authors are always scoped to their own
 * books; admins see everything and may filter by author.
 */
export async function listBooks(user: AuthUser, filter: { authorId?: string }) {
  const authorId = user.role === "AUTHOR" ? user.authorId! : filter.authorId;
  const books = await prisma.book.findMany({
    where: authorId ? { authorId } : undefined,
    orderBy: [{ publicationDate: { sort: "desc", nulls: "first" } }, { title: "asc" }],
  });
  const data = books.map(toBookDto);
  return { data, summary: summarize(data) };
}

export async function getBook(user: AuthUser, bookId: string) {
  const book = await prisma.book.findUnique({ where: { id: bookId } });
  // 404 (not 403) for other authors' books, so IDs can't be probed for existence.
  if (!book || (user.role === "AUTHOR" && book.authorId !== user.authorId)) throw NotFound("Book");
  return toBookDto(book);
}
