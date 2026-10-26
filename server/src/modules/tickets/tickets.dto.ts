/**
 * Ticket → API shapes. Authors and admins get different projections of the
 * same ticket: authors never receive internal notes, priority, AI reasoning or
 * the audit trail.
 */
import type { Prisma, TicketPriority } from "@prisma/client";
import { CATEGORY_LABELS, DEFAULT_PRIORITY, FIRST_RESPONSE_SLA_HOURS } from "../../domain/taxonomy.js";

export const reference = (number: number) => `BL-${number}`;

const userBrief = { select: { id: true, name: true, role: true } } as const;

export const ticketInclude = {
  book: { select: { id: true, code: true, title: true, status: true } },
  author: { select: { id: true, code: true, user: { select: { name: true, email: true } } } },
  assignee: userBrief,
  messages: { orderBy: { createdAt: "asc" }, include: { sender: userBrief } },
  // File metadata only — the bytes are served by the download endpoint.
  attachments: {
    orderBy: { createdAt: "asc" },
    select: { id: true, filename: true, mimeType: true, sizeBytes: true, createdAt: true, uploadedBy: userBrief },
  },
} satisfies Prisma.TicketInclude;

export const adminTicketInclude = {
  ...ticketInclude,
  activities: { orderBy: { createdAt: "asc" }, include: { actor: userBrief } },
} satisfies Prisma.TicketInclude;

type TicketWithRelations = Prisma.TicketGetPayload<{ include: typeof ticketInclude }>;
type AdminTicket = Prisma.TicketGetPayload<{ include: typeof adminTicketInclude }>;

/** First-response SLA: overdue = still unanswered past the target for its priority. */
export function slaStatus(
  t: { priority: TicketPriority | null; createdAt: Date; firstResponseAt: Date | null; status: string },
  now = new Date(),
) {
  const targetHours = FIRST_RESPONSE_SLA_HOURS[t.priority ?? DEFAULT_PRIORITY];
  const dueAt = new Date(t.createdAt.getTime() + targetHours * 3_600_000);
  const active = t.status === "OPEN" || t.status === "IN_PROGRESS";
  return {
    targetHours,
    firstResponseDueAt: dueAt.toISOString(),
    overdue: active && !t.firstResponseAt && now > dueAt,
    ageHours: Math.floor((now.getTime() - t.createdAt.getTime()) / 3_600_000),
  };
}

function baseFields(t: TicketWithRelations) {
  return {
    id: t.id,
    number: t.number,
    reference: reference(t.number),
    subject: t.subject,
    description: t.description,
    attachmentName: t.attachmentName,
    attachments: t.attachments.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
    status: t.status,
    category: t.category,
    categoryLabel: t.category ? CATEGORY_LABELS[t.category] : null,
    book: t.book,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    resolvedAt: t.resolvedAt?.toISOString() ?? null,
    rating: t.rating,
    ratingComment: t.ratingComment,
  };
}

const toMessage = (m: TicketWithRelations["messages"][number]) => ({
  id: m.id,
  kind: m.kind,
  body: m.body,
  aiAssisted: m.aiAssisted,
  sender: m.sender,
  createdAt: m.createdAt.toISOString(),
});

export function toAuthorTicket(t: TicketWithRelations) {
  const replies = t.messages.filter((m) => m.kind === "REPLY");
  return {
    ...baseFields(t),
    // Authors see who is handling their ticket by first name only.
    handledBy: t.assignee ? t.assignee.name.split(" ")[0] : null,
    // Admin replies the author hasn't opened yet.
    unreadCount: replies.filter((m) => m.sender.role === "ADMIN" && (!t.authorLastReadAt || m.createdAt > t.authorLastReadAt)).length,
    messages: replies.map((m) => ({ ...toMessage(m), aiAssisted: undefined })),
  };
}

export function toAdminTicket(t: AdminTicket) {
  return {
    ...baseFields(t),
    author: { id: t.author.id, code: t.author.code, name: t.author.user.name, email: t.author.user.email },
    priority: t.priority,
    categorySource: t.categorySource,
    prioritySource: t.prioritySource,
    aiReasoning: t.aiReasoning,
    assignee: t.assignee,
    firstResponseAt: t.firstResponseAt?.toISOString() ?? null,
    sla: slaStatus(t),
    messages: t.messages.map(toMessage),
    activities: t.activities.map((a) => ({
      id: a.id,
      action: a.action,
      fromValue: a.fromValue,
      toValue: a.toValue,
      actor: a.actor,
      createdAt: a.createdAt.toISOString(),
    })),
  };
}
