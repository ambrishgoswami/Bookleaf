import { useQuery } from "@tanstack/react-query";
import { Bot, ShieldCheck, Wrench } from "lucide-react";
import { api } from "../../lib/api";
import type { AiStatus, DecisionSource, TicketCategory, TicketPriority, TicketStatus, UserBrief } from "../../lib/types";
import { Badge } from "../../components/ui";

export const CATEGORY_LABELS: Record<TicketCategory, string> = {
  ROYALTY_PAYMENTS: "Royalty & Payments",
  ISBN_METADATA: "ISBN & Metadata",
  PRINTING_QUALITY: "Printing & Quality",
  DISTRIBUTION_AVAILABILITY: "Distribution & Availability",
  BOOK_STATUS_PRODUCTION: "Book Status & Production",
  GENERAL_INQUIRY: "General Inquiry",
};

export const CATEGORIES = Object.keys(CATEGORY_LABELS) as TicketCategory[];
export const PRIORITIES: TicketPriority[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
export const STATUSES: TicketStatus[] = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];

const SOURCE_META: Record<DecisionSource, { label: string; title: string; icon: typeof Bot; className: string }> = {
  AI: { label: "AI", title: "Set by the AI model", icon: Bot, className: "bg-violet-100 dark:bg-violet-400/15 text-violet-700 dark:text-violet-300" },
  FALLBACK: { label: "Rules", title: "AI was unavailable — set by keyword rules. Please verify.", icon: Wrench, className: "bg-amber-100 dark:bg-amber-400/15 text-amber-800 dark:text-amber-300" },
  ADMIN: { label: "Admin", title: "Set or confirmed by an admin", icon: ShieldCheck, className: "bg-emerald-100 dark:bg-emerald-400/15 text-emerald-700 dark:text-emerald-300" },
};

/** Small tag showing who decided a category/priority. */
export function SourceTag({ source }: { source: DecisionSource | null }) {
  if (!source) return null;
  const { label, title, icon: Icon, className } = SOURCE_META[source];
  return (
    <Badge className={className} title={title}>
      <Icon className="size-3" aria-hidden /> {label}
    </Badge>
  );
}

export const useAdmins = () =>
  useQuery({
    queryKey: ["admins"],
    queryFn: () => api<{ data: (UserBrief & { email: string })[] }>("/admins"),
    staleTime: 5 * 60_000,
  });

export const useAiStatus = () =>
  useQuery({ queryKey: ["ai", "status"], queryFn: () => api<{ data: AiStatus }>("/ai/status"), refetchInterval: 60_000 });

/** Banner shown when AI features are degraded, so admins know drafts/labels need extra care. */
export function AiStatusBanner() {
  const { data } = useAiStatus();
  const status = data?.data;
  if (!status || status.available) return null;
  return (
    <div className="mb-6 flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-400/30 bg-amber-50 dark:bg-amber-400/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-300" role="status">
      <Wrench className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>
        <strong>AI assistance is {status.configured ? "temporarily unavailable" : "not configured"}.</strong> New tickets are being classified by keyword rules
        and drafts fall back to policy templates — please double-check them. Everything else works as normal.
      </p>
    </div>
  );
}
