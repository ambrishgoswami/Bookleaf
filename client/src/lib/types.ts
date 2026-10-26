/** API response shapes — mirror the server DTOs. */

export type Role = "AUTHOR" | "ADMIN";
export type TicketStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
export type TicketPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type TicketCategory =
  | "ROYALTY_PAYMENTS"
  | "ISBN_METADATA"
  | "PRINTING_QUALITY"
  | "DISTRIBUTION_AVAILABILITY"
  | "BOOK_STATUS_PRODUCTION"
  | "GENERAL_INQUIRY";
export type DecisionSource = "AI" | "FALLBACK" | "ADMIN";

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  author: { id: string; code: string; city: string | null; joinedDate: string } | null;
}

export interface Book {
  id: string;
  code: string;
  title: string;
  isbn: string;
  genre: string;
  status: string;
  isPublished: boolean;
  production: { stage: string; index: number; totalStages: number } | null;
  publicationDate: string | null;
  mrp: number | null;
  royaltyPerCopy: number | null;
  copiesSold: number;
  royaltyEarned: number;
  royaltyPaid: number;
  royaltyPending: number;
  lastRoyaltyPayoutDate: string | null;
  printPartner: string | null;
  availableOn: string[];
}

export interface BooksResponse {
  data: Book[];
  summary: {
    totalBooks: number;
    publishedBooks: number;
    totalCopiesSold: number;
    totalRoyaltyEarned: number;
    totalRoyaltyPaid: number;
    totalRoyaltyPending: number;
    payout: { thresholdInr: number; meetsThreshold: boolean; nextQuarter: string; nextPayoutBy: string };
  };
}

export interface UserBrief {
  id: string;
  name: string;
  role: Role;
}

export interface Message {
  id: string;
  kind: "REPLY" | "INTERNAL_NOTE";
  body: string;
  aiAssisted?: boolean;
  sender: UserBrief;
  createdAt: string;
}

interface TicketBase {
  id: string;
  number: number;
  reference: string;
  subject: string;
  status: TicketStatus;
  category: TicketCategory | null;
  categoryLabel: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthorTicket extends TicketBase {
  description: string;
  attachmentName: string | null;
  book: { id: string; code: string; title: string; status: string } | null;
  resolvedAt: string | null;
  handledBy: string | null;
  messages: Message[];
}

export interface Sla {
  targetHours: number;
  firstResponseDueAt: string;
  overdue: boolean;
  ageHours: number;
}

export interface AdminTicketListItem extends TicketBase {
  categorySource: DecisionSource | null;
  priority: TicketPriority | null;
  prioritySource: DecisionSource | null;
  author: { id: string; code: string; name: string };
  book: { id: string; code: string; title: string } | null;
  assignee: { id: string; name: string } | null;
  replyCount: number;
  sla: Sla;
}

export interface Activity {
  id: string;
  action: string;
  fromValue: string | null;
  toValue: string | null;
  actor: UserBrief | null;
  createdAt: string;
}

export interface AdminTicket extends Omit<AuthorTicket, "handledBy"> {
  author: { id: string; code: string; name: string; email: string };
  priority: TicketPriority | null;
  categorySource: DecisionSource | null;
  prioritySource: DecisionSource | null;
  aiReasoning: string | null;
  assignee: UserBrief | null;
  firstResponseAt: string | null;
  sla: Sla;
  activities: Activity[];
}

export interface Paginated<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number };
}

export interface Draft {
  source: "AI" | "TEMPLATE";
  body: string;
  suggestedActions: string[];
  model: string | null;
  generatedAt: string;
  cached: boolean;
  aiError: string | null;
}

export interface QueueStats {
  byStatus: Record<TicketStatus, number>;
  active: {
    total: number;
    byPriority: Record<TicketPriority | "UNCLASSIFIED", number>;
    unassigned: number;
    assignedToMe: number;
    overdue: number;
  };
}

export interface AiStatus {
  configured: boolean;
  model: string;
  available: boolean;
  circuitOpenUntil: string | null;
}
