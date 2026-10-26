/**
 * Ticket taxonomy — the single source of truth for categories, priorities and
 * response-time targets. Used by the API, the AI prompts and the fallback
 * classifier, so they can never drift apart.
 */
import { TicketCategory, TicketPriority } from "@prisma/client";

export const CATEGORY_LABELS: Record<TicketCategory, string> = {
  ROYALTY_PAYMENTS: "Royalty & Payments",
  ISBN_METADATA: "ISBN & Metadata Issues",
  PRINTING_QUALITY: "Printing & Quality",
  DISTRIBUTION_AVAILABILITY: "Distribution & Availability",
  BOOK_STATUS_PRODUCTION: "Book Status & Production Updates",
  GENERAL_INQUIRY: "General Inquiry",
};

export const PRIORITY_LABELS: Record<TicketPriority, string> = {
  CRITICAL: "Critical",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

/**
 * First-response targets (hours) per priority. A ticket with no admin reply
 * past its target is flagged as overdue in the queue.
 */
export const FIRST_RESPONSE_SLA_HOURS: Record<TicketPriority, number> = {
  CRITICAL: 4,
  HIGH: 24,
  MEDIUM: 48,
  LOW: 72,
};

/** Unclassified tickets are treated as Medium until triage completes. */
export const DEFAULT_PRIORITY: TicketPriority = "MEDIUM";

export const CATEGORIES = Object.keys(CATEGORY_LABELS) as TicketCategory[];
export const PRIORITIES = Object.keys(PRIORITY_LABELS) as TicketPriority[];
