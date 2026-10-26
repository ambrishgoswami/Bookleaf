import { z } from "zod";
import { MessageKind, TicketCategory, TicketPriority, TicketStatus } from "@prisma/client";

const trimmed = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .min(min, `${label} must be at least ${min} characters`)
    .max(max, `${label} must be at most ${max} characters`);

/** Accepts "OPEN" or "OPEN,IN_PROGRESS" in query strings. */
const csvEnum = <T extends Record<string, string>>(values: T) =>
  z
    .string()
    .transform((s) => s.split(",").map((v) => v.trim()).filter(Boolean))
    .pipe(z.array(z.enum(values)).min(1));

const isoDate = z.iso.date("Use YYYY-MM-DD");

export const CreateTicketBody = z.object({
  /** null / omitted = "General / Account Level". */
  bookId: z.string().min(1).nullish(),
  subject: trimmed(5, 150, "Subject"),
  description: trimmed(20, 5000, "Description"),
  /** File name only — binary upload is out of scope (UI-level attachment). */
  attachmentName: z.string().trim().max(255).nullish(),
});

export const ListTicketsQuery = z.object({
  status: csvEnum(TicketStatus).optional(),
  category: csvEnum(TicketCategory).optional(),
  priority: csvEnum(TicketPriority).optional(),
  /** "me", "unassigned", or an admin user id. */
  assignee: z.string().min(1).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  q: z.string().trim().max(100).optional(),
  sort: z.enum(["urgency", "newest", "oldest", "updated"]).default("urgency"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const UpdateTicketBody = z
  .object({
    status: z.enum(TicketStatus).optional(),
    category: z.enum(TicketCategory).optional(),
    priority: z.enum(TicketPriority).optional(),
    assigneeId: z.string().min(1).nullable().optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), { message: "Provide at least one field to update" });

export const CreateMessageBody = z.object({
  body: trimmed(1, 10000, "Message"),
  /** INTERNAL_NOTE is admin-only (enforced in the service). */
  kind: z.enum(MessageKind).default("REPLY"),
  /** Admin convenience: reply and change status in one action ("Send & resolve"). */
  status: z.enum(TicketStatus).optional(),
  /** Set by the admin UI when the reply started from the AI draft. */
  aiAssisted: z.boolean().default(false),
});

export const IdParams = z.object({ id: z.string().min(1) });

export type CreateTicketInput = z.infer<typeof CreateTicketBody>;
export type ListTicketsInput = z.infer<typeof ListTicketsQuery>;
export type UpdateTicketInput = z.infer<typeof UpdateTicketBody>;
export type CreateMessageInput = z.infer<typeof CreateMessageBody>;
