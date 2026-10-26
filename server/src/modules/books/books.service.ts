import type { Book } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { Conflict, NotFound, ValidationFailed } from "../../lib/errors.js";
import { nextCode } from "../../lib/codes.js";
import type { AuthUser } from "../auth/auth.tokens.js";
import {
  PAYOUT_THRESHOLD_INR,
  PRODUCTION_STAGES,
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

// ---------------------------------------------------------------------------
// Admin: create / update / delete / record payout
// ---------------------------------------------------------------------------

/** Valid book statuses: one per production stage, plus "Published & Live". */
export const BOOK_STATUSES = PRODUCTION_STAGES.map((s) => (s === PUBLISHED_STATUS ? s : `In Production - ${s}`));

export interface BookInput {
  title: string;
  isbn: string;
  genre: string;
  status: string;
  publicationDate: string | null;
  mrp: number | null;
  royaltyPerCopy: number | null;
  copiesSold: number;
  royaltyEarned: number;
  royaltyPaid: number;
  printPartner: string | null;
  availableOn: string[];
}

/**
 * Business rules shared by create and update. Pending royalty is always derived
 * (earned − paid) so the three figures can never disagree.
 */
function validateBook(b: BookInput) {
  const errors: { field: string; message: string }[] = [];
  if (b.status === PUBLISHED_STATUS) {
    if (!b.publicationDate) errors.push({ field: "publicationDate", message: "Published books need a publication date" });
    if (b.mrp == null) errors.push({ field: "mrp", message: "Published books need an MRP" });
    if (b.royaltyPerCopy == null) errors.push({ field: "royaltyPerCopy", message: "Published books need a royalty per copy" });
  } else if (b.copiesSold > 0 || b.royaltyEarned > 0) {
    errors.push({ field: "status", message: "A book with sales must be Published & Live" });
  }
  if (b.mrp != null && b.royaltyPerCopy != null && b.royaltyPerCopy > b.mrp) {
    errors.push({ field: "royaltyPerCopy", message: "Royalty per copy can't exceed the MRP" });
  }
  if (b.royaltyPaid > b.royaltyEarned) errors.push({ field: "royaltyPaid", message: "Royalty paid can't exceed royalty earned" });
  if (errors.length) throw ValidationFailed(errors);
}

const toData = (b: BookInput) => ({
  title: b.title,
  isbn: b.isbn,
  genre: b.genre,
  status: b.status,
  publicationDate: b.publicationDate ? new Date(b.publicationDate) : null,
  mrp: b.mrp,
  royaltyPerCopy: b.royaltyPerCopy,
  copiesSold: b.copiesSold,
  royaltyEarned: b.royaltyEarned,
  royaltyPaid: b.royaltyPaid,
  royaltyPending: b.royaltyEarned - b.royaltyPaid,
  printPartner: b.printPartner,
  availableOn: b.availableOn,
});

export async function createBook(authorId: string, input: BookInput) {
  if (!(await prisma.author.count({ where: { id: authorId } }))) {
    throw ValidationFailed([{ field: "authorId", message: "Author not found" }]);
  }
  validateBook(input);
  const codes = await prisma.book.findMany({ select: { code: true } });
  const book = await prisma.book.create({
    data: { ...toData(input), authorId, code: nextCode("BK", codes.map((c) => c.code)) },
  });
  return toBookDto(book);
}

export async function updateBook(bookId: string, patch: Partial<BookInput>) {
  const existing = await prisma.book.findUnique({ where: { id: bookId } });
  if (!existing) throw NotFound("Book");

  const current = toBookDto(existing);
  const merged: BookInput = {
    title: current.title,
    isbn: current.isbn,
    genre: current.genre,
    status: current.status,
    publicationDate: current.publicationDate,
    mrp: current.mrp,
    royaltyPerCopy: current.royaltyPerCopy,
    copiesSold: current.copiesSold,
    royaltyEarned: current.royaltyEarned,
    royaltyPaid: current.royaltyPaid,
    printPartner: current.printPartner,
    availableOn: current.availableOn,
    ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
  };
  validateBook(merged);
  return toBookDto(await prisma.book.update({ where: { id: bookId }, data: toData(merged) }));
}

/** Only books without sales history can be deleted — royalty records must be kept. */
export async function deleteBook(bookId: string) {
  const book = await prisma.book.findUnique({ where: { id: bookId }, select: { copiesSold: true, royaltyEarned: true } });
  if (!book) throw NotFound("Book");
  if (book.copiesSold > 0 || book.royaltyEarned > 0) {
    throw Conflict("This book has sales and royalty history, so it can't be deleted. Change its status instead.");
  }
  await prisma.book.delete({ where: { id: bookId } });
}

/** Records a royalty payout: moves `amount` from pending to paid. */
export async function recordPayout(bookId: string, amount: number, date: string | undefined) {
  // The balance check is part of the UPDATE itself, so two concurrent payouts
  // can never push pending royalty below zero.
  const { count } = await prisma.book.updateMany({
    where: { id: bookId, royaltyPending: { gte: amount } },
    data: {
      royaltyPaid: { increment: amount },
      royaltyPending: { decrement: amount },
      lastRoyaltyPayoutDate: new Date(date ?? new Date().toISOString().slice(0, 10)),
    },
  });
  const book = await prisma.book.findUnique({ where: { id: bookId } });
  if (!book) throw NotFound("Book");
  if (!count) {
    throw ValidationFailed([{ field: "amount", message: `Amount exceeds the pending royalty (₹${book.royaltyPending.toLocaleString("en-IN")})` }]);
  }
  return toBookDto(book);
}
