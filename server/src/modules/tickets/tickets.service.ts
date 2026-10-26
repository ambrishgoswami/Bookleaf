/**
 * Ticket lifecycle: creation, queue queries, admin management and messages.
 *
 * Authorization rule of thumb: route middleware decides *who can call* an
 * endpoint (role); this service decides *which records* they can touch
 * (ownership). Authors only ever reach their own tickets.
 */
import type { Prisma, TicketStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { publish } from "../../lib/events.js";
import { Conflict, Forbidden, NotFound, ValidationFailed } from "../../lib/errors.js";
import type { AuthUser } from "../auth/auth.tokens.js";
import { CATEGORY_LABELS, DEFAULT_PRIORITY, FIRST_RESPONSE_SLA_HOURS, PRIORITIES } from "../../domain/taxonomy.js";
import { adminTicketInclude, reference, slaStatus, ticketInclude, toAdminTicket, toAuthorTicket } from "./tickets.dto.js";
import { triageInBackground } from "./triage.js";
import type { CreateMessageInput, CreateTicketInput, ListTicketsInput, UpdateTicketInput } from "./tickets.schemas.js";

const ACTIVE_STATUSES: TicketStatus[] = ["OPEN", "IN_PROGRESS"];
const isAdmin = (user: AuthUser) => user.role === "ADMIN";

// ---------------------------------------------------------------------------
// Authors
// ---------------------------------------------------------------------------

export async function createTicket(user: AuthUser, input: CreateTicketInput) {
  const authorId = user.authorId!;

  if (input.bookId) {
    const owns = await prisma.book.count({ where: { id: input.bookId, authorId } });
    if (!owns) throw ValidationFailed([{ field: "bookId", message: "This book is not in your account" }]);
  }

  const ticket = await prisma.ticket.create({
    data: {
      authorId,
      bookId: input.bookId ?? null,
      subject: input.subject,
      description: input.description,
      attachmentName: input.attachmentName ?? null,
      activities: { create: { actorId: user.id, action: "created" } },
    },
    include: ticketInclude,
  });

  publish({ type: "ticket.created", ticketId: ticket.id, authorId, internal: false });
  // Classification happens after the response — creation never blocks on AI.
  triageInBackground(ticket.id);

  return toAuthorTicket(ticket);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Loads a ticket the caller may see, or 404s (never reveals others' tickets). */
export async function findAccessibleTicket(user: AuthUser, ticketId: string) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, include: adminTicketInclude });
  if (!ticket || (!isAdmin(user) && ticket.authorId !== user.authorId)) throw NotFound("Ticket");
  return ticket;
}

export async function getTicket(user: AuthUser, ticketId: string) {
  const ticket = await findAccessibleTicket(user, ticketId);
  return isAdmin(user) ? toAdminTicket(ticket) : toAuthorTicket(ticket);
}

export function buildWhere(user: AuthUser, q: ListTicketsInput): Prisma.TicketWhereInput {
  const where: Prisma.TicketWhereInput = {};
  if (!isAdmin(user)) where.authorId = user.authorId!;

  if (q.status) where.status = { in: q.status };
  if (q.category) where.category = { in: q.category };
  if (q.priority) where.priority = { in: q.priority };

  if (q.assignee === "me") where.assigneeId = user.id;
  else if (q.assignee === "unassigned") where.assigneeId = null;
  else if (q.assignee) where.assigneeId = q.assignee;

  if (q.from || q.to) {
    where.createdAt = {
      ...(q.from && { gte: new Date(`${q.from}T00:00:00Z`) }),
      ...(q.to && { lt: new Date(new Date(`${q.to}T00:00:00Z`).getTime() + 86_400_000) }), // inclusive end day
    };
  }

  if (q.q) {
    const refNumber = Number(q.q.replace(/^BL-/i, ""));
    where.OR = [
      { subject: { contains: q.q, mode: "insensitive" } },
      { description: { contains: q.q, mode: "insensitive" } },
      ...(isAdmin(user) ? [{ author: { user: { name: { contains: q.q, mode: "insensitive" as const } } } }] : []),
      ...(Number.isInteger(refNumber) && refNumber > 0 ? [{ number: refNumber }] : []),
    ];
  }

  if (q.overdue) {
    // Same rule as slaStatus(), expressed as a query: one createdAt cutoff per priority.
    const cutoff = (hours: number) => new Date(Date.now() - hours * 3_600_000);
    where.AND = [
      { status: { in: ACTIVE_STATUSES }, firstResponseAt: null },
      {
        OR: [
          ...PRIORITIES.map((p) => ({ priority: p, createdAt: { lt: cutoff(FIRST_RESPONSE_SLA_HOURS[p]) } })),
          { priority: null, createdAt: { lt: cutoff(FIRST_RESPONSE_SLA_HOURS[DEFAULT_PRIORITY]) } },
        ],
      },
    ];
  }
  return where;
}

/**
 * "urgency" = highest priority first (unclassified tickets surface at the top
 * because they still need a human look); within a priority, tickets still
 * awaiting a first response come before ones already answered; then oldest.
 * Postgres orders enums by declaration order: CRITICAL < HIGH < MEDIUM < LOW.
 */
const ORDER_BY: Record<ListTicketsInput["sort"], Prisma.TicketOrderByWithRelationInput[]> = {
  urgency: [
    { priority: { sort: "asc", nulls: "first" } },
    { firstResponseAt: { sort: "asc", nulls: "first" } },
    { createdAt: "asc" },
  ],
  newest: [{ createdAt: "desc" }],
  oldest: [{ createdAt: "asc" }],
  updated: [{ updatedAt: "desc" }],
};

export async function listTickets(user: AuthUser, q: ListTicketsInput) {
  const where = buildWhere(user, q);
  const skip = (q.page - 1) * q.pageSize;

  if (!isAdmin(user)) {
    const [rows, total] = await Promise.all([
      prisma.ticket.findMany({ where, include: ticketInclude, orderBy: ORDER_BY[q.sort === "urgency" ? "updated" : q.sort], skip, take: q.pageSize }),
      prisma.ticket.count({ where }),
    ]);
    return { data: rows.map(toAuthorTicket), meta: { page: q.page, pageSize: q.pageSize, total } };
  }

  // Admin queue: a lighter projection without message bodies.
  const [rows, total] = await Promise.all([
    prisma.ticket.findMany({
      where,
      orderBy: ORDER_BY[q.sort],
      skip,
      take: q.pageSize,
      include: {
        book: { select: { id: true, code: true, title: true } },
        author: { select: { id: true, code: true, user: { select: { name: true } } } },
        assignee: { select: { id: true, name: true } },
        _count: { select: { messages: { where: { kind: "REPLY" } } } },
      },
    }),
    prisma.ticket.count({ where }),
  ]);

  const data = rows.map((t) => ({
    id: t.id,
    number: t.number,
    reference: reference(t.number),
    subject: t.subject,
    status: t.status,
    category: t.category,
    categoryLabel: t.category ? CATEGORY_LABELS[t.category] : null,
    categorySource: t.categorySource,
    priority: t.priority,
    prioritySource: t.prioritySource,
    author: { id: t.author.id, code: t.author.code, name: t.author.user.name },
    book: t.book,
    assignee: t.assignee,
    replyCount: t._count.messages,
    sla: slaStatus(t),
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }));
  return { data, meta: { page: q.page, pageSize: q.pageSize, total } };
}

/** Headline numbers for the admin dashboard. */
export async function getQueueStats(adminId: string) {
  const [byStatus, active] = await Promise.all([
    prisma.ticket.groupBy({ by: ["status"], _count: true }),
    prisma.ticket.findMany({
      where: { status: { in: ACTIVE_STATUSES } },
      select: { priority: true, createdAt: true, firstResponseAt: true, status: true, assigneeId: true },
    }),
  ]);

  const statusCounts = Object.fromEntries(byStatus.map((s) => [s.status, s._count]));
  const activeByPriority = Object.fromEntries(PRIORITIES.map((p) => [p, active.filter((t) => t.priority === p).length]));

  return {
    byStatus: { OPEN: 0, IN_PROGRESS: 0, RESOLVED: 0, CLOSED: 0, ...statusCounts },
    active: {
      total: active.length,
      byPriority: { ...activeByPriority, UNCLASSIFIED: active.filter((t) => !t.priority).length },
      unassigned: active.filter((t) => !t.assigneeId).length,
      assignedToMe: active.filter((t) => t.assigneeId === adminId).length,
      overdue: active.filter((t) => slaStatus(t).overdue).length,
    },
  };
}

// ---------------------------------------------------------------------------
// Admin management
// ---------------------------------------------------------------------------

/** Field changes to apply when a ticket moves into `status`. */
function statusSideEffects(from: TicketStatus, to: TicketStatus): Prisma.TicketUpdateInput {
  if (from === to) return {};
  if (to === "RESOLVED" || to === "CLOSED") return { status: to, resolvedAt: new Date() };
  return { status: to, resolvedAt: null }; // reopened or progressed
}

export async function updateTicket(admin: AuthUser, ticketId: string, input: UpdateTicketInput) {
  const ticket = await findAccessibleTicket(admin, ticketId);

  if (input.assigneeId) {
    const assignee = await prisma.user.findUnique({ where: { id: input.assigneeId }, select: { role: true } });
    if (assignee?.role !== "ADMIN") {
      throw ValidationFailed([{ field: "assigneeId", message: "Tickets can only be assigned to admins" }]);
    }
  }

  const data: Prisma.TicketUpdateInput = {};
  const activities: Prisma.TicketActivityCreateManyTicketInput[] = [];
  const log = (action: string, fromValue: string | null, toValue: string | null) =>
    activities.push({ actorId: admin.id, action, fromValue, toValue });

  if (input.status && input.status !== ticket.status) {
    Object.assign(data, statusSideEffects(ticket.status, input.status));
    log("status_changed", ticket.status, input.status);
  }
  // Overrides are recorded even if the value is unchanged: confirming the AI's
  // choice is a signal too (source flips to ADMIN).
  if (input.category) {
    data.category = input.category;
    data.categorySource = "ADMIN";
    if (input.category !== ticket.category) log("category_overridden", ticket.category, input.category);
  }
  if (input.priority) {
    data.priority = input.priority;
    data.prioritySource = "ADMIN";
    if (input.priority !== ticket.priority) log("priority_overridden", ticket.priority, input.priority);
  }
  if (input.assigneeId !== undefined && input.assigneeId !== ticket.assigneeId) {
    data.assignee = input.assigneeId ? { connect: { id: input.assigneeId } } : { disconnect: true };
    log(input.assigneeId ? "assigned" : "unassigned", ticket.assigneeId, input.assigneeId);
  }

  const updated = await prisma.ticket.update({
    where: { id: ticketId },
    data: { ...data, activities: { createMany: { data: activities } } },
    include: adminTicketInclude,
  });

  // Priority is admin-only; status, category and assignee show on the author view.
  const authorVisible = Boolean(data.status || data.assignee || data.category);
  publish({ type: "ticket.updated", ticketId, authorId: ticket.authorId, internal: !authorVisible });
  return toAdminTicket(updated);
}

/** The author confirms their issue is solved. Reopens automatically if they reply later. */
export async function resolveByAuthor(user: AuthUser, ticketId: string) {
  const ticket = await findAccessibleTicket(user, ticketId);
  if (ticket.status === "RESOLVED" || ticket.status === "CLOSED") throw Conflict("This ticket is already resolved");

  const updated = await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      ...statusSideEffects(ticket.status, "RESOLVED"),
      activities: { create: { actorId: user.id, action: "resolved_by_author", fromValue: ticket.status, toValue: "RESOLVED" } },
    },
    include: ticketInclude,
  });
  publish({ type: "ticket.updated", ticketId, authorId: ticket.authorId, internal: false });
  return toAuthorTicket(updated);
}

export async function listAdmins() {
  return prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } });
}

// ---------------------------------------------------------------------------
// Messages (replies + internal notes)
// ---------------------------------------------------------------------------

export async function addMessage(user: AuthUser, ticketId: string, input: CreateMessageInput) {
  const ticket = await findAccessibleTicket(user, ticketId);
  const admin = isAdmin(user);

  if (!admin && (input.kind === "INTERNAL_NOTE" || input.status)) {
    throw Forbidden("Authors can only send replies");
  }
  if (!admin && ticket.status === "CLOSED") {
    throw Conflict("This ticket is closed. Please raise a new ticket if you still need help.");
  }

  const isReply = input.kind === "REPLY";
  const ticketData: Prisma.TicketUpdateInput = {};
  const activities: Prisma.TicketActivityCreateManyTicketInput[] = [];

  if (admin && isReply) {
    ticketData.firstResponseAt = ticket.firstResponseAt ?? new Date();
    // Replying implies work has started, unless the admin chose a status explicitly.
    const nextStatus = input.status ?? (ticket.status === "OPEN" ? "IN_PROGRESS" : ticket.status);
    Object.assign(ticketData, statusSideEffects(ticket.status, nextStatus));
    if (nextStatus !== ticket.status) activities.push({ actorId: user.id, action: "status_changed", fromValue: ticket.status, toValue: nextStatus });
    // Whoever answers an unassigned ticket picks it up.
    if (!ticket.assigneeId) {
      ticketData.assignee = { connect: { id: user.id } };
      activities.push({ actorId: user.id, action: "assigned", fromValue: null, toValue: user.id });
    }
  } else if (admin && input.status && input.status !== ticket.status) {
    Object.assign(ticketData, statusSideEffects(ticket.status, input.status));
    activities.push({ actorId: user.id, action: "status_changed", fromValue: ticket.status, toValue: input.status });
  } else if (!admin && ticket.status === "RESOLVED") {
    // An author follow-up on a resolved ticket reopens it.
    Object.assign(ticketData, statusSideEffects(ticket.status, "OPEN"));
    activities.push({ actorId: user.id, action: "reopened_by_author", fromValue: "RESOLVED", toValue: "OPEN" });
  }

  const [message] = await prisma.$transaction([
    prisma.ticketMessage.create({
      data: { ticketId, senderId: user.id, kind: input.kind, body: input.body, aiAssisted: admin && input.aiAssisted },
    }),
    prisma.ticket.update({
      where: { id: ticketId },
      data: { ...ticketData, updatedAt: new Date(), activities: { createMany: { data: activities } } },
    }),
  ]);

  publish({ type: "message.created", ticketId, authorId: ticket.authorId, internal: !isReply });
  return { id: message.id, kind: message.kind, body: message.body, createdAt: message.createdAt.toISOString() };
}
