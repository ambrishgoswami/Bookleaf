/**
 * Ticket engagement and reporting:
 * - read state + unread counts for authors
 * - CSAT ratings
 * - admin analytics, CSV export and bulk actions
 */
import type { TicketPriority, TicketStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { publish } from "../../lib/events.js";
import { Conflict, ValidationFailed } from "../../lib/errors.js";
import { toCsv } from "../../lib/csv.js";
import type { AuthUser } from "../auth/auth.tokens.js";
import { CATEGORY_LABELS, CATEGORIES, FIRST_RESPONSE_SLA_HOURS, DEFAULT_PRIORITY, PRIORITIES } from "../../domain/taxonomy.js";
import { reference, slaStatus } from "./tickets.dto.js";
import { buildWhere, findAccessibleTicket, updateTicket } from "./tickets.service.js";
import type { ListTicketsInput } from "./tickets.schemas.js";

// ---------------------------------------------------------------------------
// Read state (authors)
// ---------------------------------------------------------------------------

export async function markRead(user: AuthUser, ticketId: string) {
  await findAccessibleTicket(user, ticketId);
  await prisma.ticket.update({ where: { id: ticketId }, data: { authorLastReadAt: new Date() } });
}

/** Admin replies the author hasn't seen yet, across all their tickets. */
export async function unreadCount(user: AuthUser) {
  const tickets = await prisma.ticket.findMany({
    where: { authorId: user.authorId! },
    select: {
      authorLastReadAt: true,
      messages: { where: { kind: "REPLY", sender: { role: "ADMIN" } }, select: { createdAt: true } },
    },
  });
  let count = 0;
  let tickets_ = 0;
  for (const t of tickets) {
    const unread = t.messages.filter((m) => !t.authorLastReadAt || m.createdAt > t.authorLastReadAt).length;
    count += unread;
    if (unread) tickets_++;
  }
  return { messages: count, tickets: tickets_ };
}

// ---------------------------------------------------------------------------
// CSAT
// ---------------------------------------------------------------------------

export async function rateTicket(user: AuthUser, ticketId: string, rating: number, comment: string | null) {
  const ticket = await findAccessibleTicket(user, ticketId);
  if (ticket.status !== "RESOLVED" && ticket.status !== "CLOSED") {
    throw Conflict("You can rate a ticket once it has been resolved");
  }
  await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      rating,
      ratingComment: comment,
      ratedAt: new Date(),
      activities: { create: { actorId: user.id, action: "rated", toValue: String(rating) } },
    },
  });
  publish({ type: "ticket.updated", ticketId, authorId: ticket.authorId, internal: true });
  return { rating, ratingComment: comment };
}

// ---------------------------------------------------------------------------
// Analytics (admin)
// ---------------------------------------------------------------------------

const HOUR = 3_600_000;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};
const round1 = (n: number | null) => (n == null ? null : Math.round(n * 10) / 10);

/**
 * Support metrics over the last `days`. Computed in application code from one
 * query — fine for thousands of tickets; at larger scale these would be SQL
 * aggregates or a reporting table.
 */
export async function analytics(days: number, now = new Date()) {
  const since = new Date(now.getTime() - days * 24 * HOUR);
  const tickets = await prisma.ticket.findMany({
    where: { createdAt: { gte: since } },
    select: {
      createdAt: true,
      firstResponseAt: true,
      resolvedAt: true,
      status: true,
      category: true,
      categorySource: true,
      priority: true,
      rating: true,
    },
  });
  const replies = await prisma.ticketMessage.findMany({
    where: { createdAt: { gte: since }, kind: "REPLY", sender: { role: "ADMIN" } },
    select: { aiAssisted: true },
  });

  // Daily volume (created vs resolved), oldest first.
  const dayKey = (d: Date) => d.toISOString().slice(0, 10);
  const volume = Array.from({ length: days }, (_, i) => {
    const d = new Date(now.getTime() - (days - 1 - i) * 24 * HOUR);
    return { date: dayKey(d), created: 0, resolved: 0 };
  });
  const byDay = new Map(volume.map((v) => [v.date, v]));
  for (const t of tickets) {
    const c = byDay.get(dayKey(t.createdAt));
    if (c) c.created++;
    const r = t.resolvedAt && byDay.get(dayKey(t.resolvedAt));
    if (r) r.resolved++;
  }

  const firstResponseHours = tickets.filter((t) => t.firstResponseAt).map((t) => (t.firstResponseAt!.getTime() - t.createdAt.getTime()) / HOUR);
  const resolutionHours = tickets.filter((t) => t.resolvedAt).map((t) => (t.resolvedAt!.getTime() - t.createdAt.getTime()) / HOUR);

  // SLA: answered late, or still unanswered past the target.
  const slaEligible = tickets.filter((t) => t.firstResponseAt || slaStatus(t, now).overdue);
  const breached = slaEligible.filter((t) => {
    const target = FIRST_RESPONSE_SLA_HOURS[(t.priority ?? DEFAULT_PRIORITY) as TicketPriority] * HOUR;
    return t.firstResponseAt ? t.firstResponseAt.getTime() - t.createdAt.getTime() > target : true;
  });

  const ratings = tickets.map((t) => t.rating).filter((r): r is number => r != null);
  const classified = tickets.filter((t) => t.categorySource);

  return {
    periodDays: days,
    totals: {
      created: tickets.length,
      resolved: tickets.filter((t) => t.resolvedAt).length,
      open: tickets.filter((t) => t.status === "OPEN" || t.status === "IN_PROGRESS").length,
    },
    volume,
    byCategory: CATEGORIES.map((c) => ({ category: c, label: CATEGORY_LABELS[c], count: tickets.filter((t) => t.category === c).length })),
    byPriority: PRIORITIES.map((p) => ({ priority: p, count: tickets.filter((t) => t.priority === p).length })),
    firstResponseHours: { average: round1(avg(firstResponseHours)), median: round1(median(firstResponseHours)) },
    resolutionHours: { average: round1(avg(resolutionHours)), median: round1(median(resolutionHours)) },
    sla: { eligible: slaEligible.length, breached: breached.length, breachRate: slaEligible.length ? round1((breached.length / slaEligible.length) * 100) : null },
    csat: {
      responses: ratings.length,
      average: round1(avg(ratings)),
      distribution: [1, 2, 3, 4, 5].map((score) => ({ score, count: ratings.filter((r) => r === score).length })),
    },
    ai: {
      classifiedByAi: classified.filter((t) => t.categorySource === "AI").length,
      classifiedByRules: classified.filter((t) => t.categorySource === "FALLBACK").length,
      overriddenByAdmin: classified.filter((t) => t.categorySource === "ADMIN").length,
      overrideRate: classified.length ? round1((classified.filter((t) => t.categorySource === "ADMIN").length / classified.length) * 100) : null,
      repliesSent: replies.length,
      repliesFromDraft: replies.filter((r) => r.aiAssisted).length,
    },
  };
}

// ---------------------------------------------------------------------------
// CSV export (admin)
// ---------------------------------------------------------------------------

const EXPORT_LIMIT = 5000;

export async function exportCsv(user: AuthUser, q: ListTicketsInput) {
  const rows = await prisma.ticket.findMany({
    where: buildWhere(user, q),
    orderBy: { createdAt: "desc" },
    take: EXPORT_LIMIT,
    include: {
      author: { select: { code: true, user: { select: { name: true } } } },
      book: { select: { code: true, title: true } },
      assignee: { select: { name: true } },
    },
  });
  const iso = (d: Date | null) => d?.toISOString() ?? "";
  return toCsv(
    ["Reference", "Created", "Status", "Priority", "Category", "Category set by", "Author", "Author code", "Book", "Assignee", "First response", "Resolved", "Overdue", "Rating", "Subject"],
    rows.map((t) => [
      reference(t.number),
      iso(t.createdAt),
      t.status,
      t.priority,
      t.category ? CATEGORY_LABELS[t.category] : "",
      t.categorySource,
      t.author.user.name,
      t.author.code,
      t.book ? `${t.book.title} (${t.book.code})` : "General / Account",
      t.assignee?.name ?? "",
      iso(t.firstResponseAt),
      iso(t.resolvedAt),
      slaStatus(t).overdue ? "yes" : "no",
      t.rating,
      t.subject,
    ]),
  );
}

// ---------------------------------------------------------------------------
// Bulk actions (admin)
// ---------------------------------------------------------------------------

export type BulkAction = { action: "assign_to_me" } | { action: "set_status"; status: TicketStatus };

export async function bulkUpdate(admin: AuthUser, ids: string[], op: BulkAction) {
  if (!ids.length) throw ValidationFailed([{ field: "ids", message: "Select at least one ticket" }]);
  const input = op.action === "assign_to_me" ? { assigneeId: admin.id } : { status: op.status };

  // Each ticket goes through the normal update path, so audit logs, side
  // effects and real-time events are identical to a one-by-one change.
  const results = await Promise.allSettled(ids.map((id) => updateTicket(admin, id, input)));
  return {
    updated: results.filter((r) => r.status === "fulfilled").length,
    failed: results.flatMap((r, i) => (r.status === "rejected" ? [ids[i]!] : [])),
  };
}
