/**
 * Builds the per-ticket context the model needs — and nothing more.
 *
 * Token budget rules:
 * - Account facts: the linked book in full, or (for account-level tickets) one
 *   compact line per book. Never the whole catalogue.
 * - Conversation: the original query plus only the most recent messages, each
 *   truncated. Long threads don't grow the prompt without bound.
 * - Derived facts (next payout date, threshold status, production stage) are
 *   computed in code, so the model quotes correct numbers instead of doing date
 *   arithmetic itself.
 */
import type { Book, MessageKind, TicketCategory } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { NotFound } from "../../lib/errors.js";
import {
  PAYOUT_THRESHOLD_INR,
  PUBLISHED_STATUS,
  nextRoyaltyPayout,
  productionStage,
  toISODate,
} from "../../domain/policy.js";

const MAX_HISTORY_MESSAGES = 6;
const MAX_MESSAGE_CHARS = 1200;
const MAX_DESCRIPTION_CHARS = 3000;

const inr = (n: number | null) => (n == null ? "not set" : `₹${n.toLocaleString("en-IN")}`);
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}… [truncated]` : text);

function describeBook(b: Book, detailed: boolean): string {
  if (b.status !== PUBLISHED_STATUS) {
    const { stage, index, totalStages } = productionStage(b.status);
    return `- "${b.title}" (${b.code}, ISBN ${b.isbn}) — IN PRODUCTION, current stage: ${stage} (stage ${index + 1} of ${totalStages}). Not yet published, no sales or royalties yet.`;
  }
  const line = `- "${b.title}" (${b.code}, ISBN ${b.isbn}) — Published & Live since ${toISODate(b.publicationDate)}; ${b.copiesSold} copies sold; royalty earned ${inr(b.royaltyEarned)}, paid ${inr(b.royaltyPaid)}, pending ${inr(b.royaltyPending)}; last payout ${toISODate(b.lastRoyaltyPayoutDate) ?? "never"}.`;
  if (!detailed) return line;
  return `${line}
  MRP ${inr(b.mrp)}, author royalty per copy ${inr(b.royaltyPerCopy)}, genre ${b.genre}, printed by ${b.printPartner ?? "n/a"}, available on: ${b.availableOn.join(", ") || "none"}.`;
}

export interface TicketContext {
  ticketId: string;
  authorFirstName: string;
  subject: string;
  description: string;
  categoryHint: TicketCategory | null;
  messageCount: number;
  /** Account facts block for the prompt. */
  accountFacts: string;
  /** Recent conversation block for the prompt (may be empty). */
  conversation: string;
  /** Internal notes — confidential context for the draft, never to be quoted. */
  internalNotes: string;
}

export async function buildTicketContext(ticketId: string, today = new Date()): Promise<TicketContext> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      book: true,
      author: { include: { user: { select: { name: true } }, books: { orderBy: { title: "asc" } } } },
      messages: { orderBy: { createdAt: "asc" }, include: { sender: { select: { role: true } } } },
    },
  });
  if (!ticket) throw NotFound("Ticket");

  const { author } = ticket;
  const totalPending = author.books.reduce((sum, b) => sum + b.royaltyPending, 0);
  const payout = nextRoyaltyPayout(today);

  const books = ticket.book
    ? `Book this ticket is about:\n${describeBook(ticket.book, true)}`
    : `Ticket is account-level (no specific book). All books:\n${author.books.map((b) => describeBook(b, false)).join("\n")}`;

  const accountFacts = [
    `Author: ${author.user.name} (${author.code}), ${author.city ?? "city unknown"}, with BookLeaf since ${toISODate(author.joinedDate)}.`,
    books,
    `Royalty position: total pending across all books ${inr(totalPending)} — ${
      totalPending >= PAYOUT_THRESHOLD_INR
        ? `above the ${inr(PAYOUT_THRESHOLD_INR)} threshold, so it is due in the next payout`
        : `below the ${inr(PAYOUT_THRESHOLD_INR)} threshold, so it rolls over to the next quarter`
    }.`,
    `Next payout: earnings for ${payout.quarter} (quarter ended ${toISODate(payout.quarterEnd)}) are paid by ${toISODate(payout.payoutBy)}.`,
    `Bank details on file: not visible to support in this system — ask the author to confirm they are linked in the dashboard if relevant.`,
  ].join("\n");

  const visible = (kind: MessageKind) => kind === "REPLY";
  const replies = ticket.messages.filter((m) => visible(m.kind)).slice(-MAX_HISTORY_MESSAGES);
  const conversation = replies
    .map((m) => `[${m.sender.role === "ADMIN" ? "BookLeaf support" : "Author"}, ${toISODate(m.createdAt)}]: ${clip(m.body, MAX_MESSAGE_CHARS)}`)
    .join("\n\n");
  const internalNotes = ticket.messages
    .filter((m) => m.kind === "INTERNAL_NOTE")
    .slice(-3)
    .map((m) => `- ${clip(m.body, 500)}`)
    .join("\n");

  return {
    ticketId,
    authorFirstName: author.user.name.split(" ")[0]!,
    subject: ticket.subject,
    description: clip(ticket.description, MAX_DESCRIPTION_CHARS),
    categoryHint: ticket.category,
    messageCount: ticket.messages.length,
    accountFacts,
    conversation,
    internalNotes,
  };
}
