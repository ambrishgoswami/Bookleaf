import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowLeft, Bot, CheckSquare, Lock, RefreshCw, Send, Sparkles, Wrench } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { date, dateTime, inr, timeAgo } from "../../lib/format";
import type { Activity, AdminTicket, Book, Draft, TicketCategory, TicketPriority, TicketStatus } from "../../lib/types";
import { MessageThread } from "../../components/MessageThread";
import { Attachments } from "../../components/Attachments";
import { Badge, Button, Card, ErrorState, Input, PriorityBadge, Select, Spinner, STATUS_LABELS, StatusBadge, Textarea, cx } from "../../components/ui";
import { CATEGORIES, CATEGORY_LABELS, PRIORITIES, SourceTag, STATUSES, useAdmins } from "./shared";

type TicketPatch = Partial<{ status: TicketStatus; category: TicketCategory; priority: TicketPriority; assigneeId: string | null }>;

export function TicketWorkspace() {
  const { id } = useParams() as { id: string };
  const queryClient = useQueryClient();
  const ticket = useQuery({ queryKey: ["ticket", id], queryFn: () => api<{ data: AdminTicket }>(`/tickets/${id}`) });

  const patch = useMutation({
    mutationFn: (body: TicketPatch) => api<{ data: AdminTicket }>(`/tickets/${id}`, { method: "PATCH", body }),
    onSuccess: (res) => {
      queryClient.setQueryData(["ticket", id], res);
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
  });

  if (ticket.isPending) return <Spinner label="Loading ticket…" />;
  if (ticket.error) return <ErrorState error={ticket.error} onRetry={ticket.refetch} />;
  const t = ticket.data.data;

  return (
    <>
      <Link to="/admin/tickets" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Back to queue
      </Link>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <Card className="p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">{t.reference}</span>
              <StatusBadge status={t.status} />
              <PriorityBadge priority={t.priority} />
              {t.sla.overdue && (
                <Badge className="bg-red-100 dark:bg-red-400/15 text-red-700 dark:text-red-300">
                  <AlertCircle className="size-3" aria-hidden /> First response overdue
                </Badge>
              )}
            </div>
            <h1 className="mt-2 text-xl font-semibold text-foreground">{t.subject}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t.author.name} ({t.author.code}) · {t.book?.title ?? "General / Account Level"} · opened {timeAgo(t.createdAt)}
            </p>
          </Card>

          <Card className="p-5">
            <MessageThread
              viewer="ADMIN"
              original={{ authorName: t.author.name, body: t.description, createdAt: t.createdAt, attachmentName: t.attachmentName }}
              messages={t.messages}
            />
          </Card>

          <Card className="p-5">
            <Attachments ticketId={t.id} attachments={t.attachments} canUpload />
          </Card>

          <Composer ticket={t} />
        </div>

        <aside className="space-y-4">
          <PropertiesCard ticket={t} onChange={(body) => patch.mutate(body)} saving={patch.isPending} error={patch.error} />
          <AuthorCard ticket={t} />
          <ActivityCard activities={t.activities} />
        </aside>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Composer: AI draft → editable reply, or an internal note
// ---------------------------------------------------------------------------

const AI_ERROR_LABELS: Record<string, string> = {
  not_configured: "AI is not configured",
  circuit_open: "AI is paused after repeated failures",
  rate_limited: "AI is rate-limited right now",
  timeout: "AI took too long to respond",
  bad_request: "AI request was rejected",
};

function Composer({ ticket }: { ticket: AdminTicket }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"REPLY" | "INTERNAL_NOTE">("REPLY");
  const [body, setBody] = useState("");
  const [fromDraft, setFromDraft] = useState(false);
  const [touched, setTouched] = useState(false);
  const [guidance, setGuidance] = useState("");

  // The server returns its cached draft unless the conversation has changed,
  // so keying on message count is cheap: no new LLM call unless needed.
  const draftKey = ["draft", ticket.id, ticket.messages.length];
  const draft = useQuery({
    queryKey: draftKey,
    queryFn: () => api<{ data: Draft }>(`/tickets/${ticket.id}/draft`, { method: "POST", body: {} }),
    staleTime: Infinity,
    retry: false,
  });

  const regenerate = useMutation({
    mutationFn: () => api<{ data: Draft }>(`/tickets/${ticket.id}/draft`, { method: "POST", body: { regenerate: true, guidance: guidance.trim() || undefined } }),
    onSuccess: (res) => {
      queryClient.setQueryData(draftKey, res);
      setBody(res.data.body);
      setFromDraft(true);
      setGuidance("");
    },
  });

  // Pre-fill the reply with the draft until the admin starts editing on their own.
  useEffect(() => {
    if (draft.data && !touched && mode === "REPLY") {
      setBody(draft.data.data.body);
      setFromDraft(true);
    }
  }, [draft.data, touched, mode]);

  const send = useMutation({
    mutationFn: (status?: TicketStatus) =>
      api(`/tickets/${ticket.id}/messages`, {
        method: "POST",
        body: { body, kind: mode, status, aiAssisted: mode === "REPLY" && fromDraft },
      }),
    onSuccess: () => {
      setBody("");
      setTouched(true); // don't immediately re-insert the (now stale) draft
      setFromDraft(false);
      queryClient.invalidateQueries({ queryKey: ["ticket", ticket.id] });
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
  });

  const d = draft.data?.data;
  const switchMode = (m: typeof mode) => {
    setMode(m);
    setBody(m === "REPLY" && d ? d.body : "");
    setFromDraft(m === "REPLY" && Boolean(d));
    setTouched(m === "INTERNAL_NOTE");
  };

  return (
    <Card>
      <div className="flex border-b border-border/60" role="tablist">
        {(
          [
            ["REPLY", "Reply to author", Send],
            ["INTERNAL_NOTE", "Internal note", Lock],
          ] as const
        ).map(([value, label, Icon]) => (
          <button
            key={value}
            role="tab"
            aria-selected={mode === value}
            onClick={() => switchMode(value)}
            className={cx(
              "flex items-center gap-1.5 border-b-2 px-4 py-3 text-sm font-medium",
              mode === value ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden /> {label}
          </button>
        ))}
      </div>

      <div className="space-y-3 p-5">
        {mode === "REPLY" && (
          <DraftStatus draft={d} loading={draft.isPending || regenerate.isPending} error={draft.error ?? regenerate.error} />
        )}
        {mode === "INTERNAL_NOTE" && (
          <p className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-300">
            <Lock className="size-4" aria-hidden /> Only the BookLeaf team can see internal notes.
          </p>
        )}

        <Textarea
          aria-label={mode === "REPLY" ? "Reply to author" : "Internal note"}
          rows={mode === "REPLY" ? 12 : 4}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            setTouched(true);
            if (!e.target.value) setFromDraft(false);
          }}
          placeholder={mode === "REPLY" ? "Write your reply…" : "e.g. Checked payout file — bank details missing."}
          className={mode === "INTERNAL_NOTE" ? "border-amber-300 dark:border-amber-400/30 bg-amber-50/40" : undefined}
        />

        {mode === "REPLY" && d && d.suggestedActions.length > 0 && (
          <div className="rounded-lg bg-muted/60 px-3 py-2.5">
            <p className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">Suggested follow-ups (internal)</p>
            <ul className="space-y-1 text-sm text-foreground/90">
              {d.suggestedActions.map((a) => (
                <li key={a} className="flex items-start gap-2">
                  <CheckSquare className="mt-0.5 size-4 shrink-0 text-muted-foreground/70" aria-hidden /> {a}
                </li>
              ))}
            </ul>
          </div>
        )}

        {mode === "REPLY" && (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              aria-label="Instructions for regenerating the draft"
              placeholder="Optional: steer the AI, e.g. 'shorter' or 'mention re-sync already triggered'"
              value={guidance}
              onChange={(e) => setGuidance(e.target.value)}
              className="min-w-0 flex-1"
              maxLength={500}
            />
            <Button variant="secondary" onClick={() => regenerate.mutate()} loading={regenerate.isPending}>
              <RefreshCw className="size-4" aria-hidden /> Regenerate
            </Button>
          </div>
        )}

        {send.error && <p className="text-sm text-red-600">{send.error.message}</p>}

        <div className="flex flex-wrap justify-end gap-2 border-t border-border/60 pt-3">
          {mode === "REPLY" ? (
            <>
              <Button variant="secondary" disabled={!body.trim()} loading={send.isPending && send.variables === "RESOLVED"} onClick={() => send.mutate("RESOLVED")}>
                Send &amp; resolve
              </Button>
              <Button disabled={!body.trim()} loading={send.isPending && send.variables === undefined} onClick={() => send.mutate(undefined)}>
                <Send className="size-4" aria-hidden /> Send reply
              </Button>
            </>
          ) : (
            <Button disabled={!body.trim()} loading={send.isPending} onClick={() => send.mutate(undefined)} className="bg-amber-600 hover:bg-amber-700">
              <Lock className="size-4" aria-hidden /> Add internal note
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

function DraftStatus({ draft, loading, error }: { draft: Draft | undefined; loading: boolean; error: Error | null }) {
  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-violet-700 dark:text-violet-300">
        <Sparkles className="size-4 animate-pulse" aria-hidden /> Drafting a reply from the knowledge base and this author's account…
      </p>
    );
  }
  if (error) return <p className="text-sm text-muted-foreground">Couldn't load a draft ({error.message}). You can write the reply manually.</p>;
  if (!draft) return null;
  if (draft.source === "TEMPLATE") {
    return (
      <p className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-400/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-300">
        <Wrench className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          <strong>Policy template</strong> — {AI_ERROR_LABELS[draft.aiError ?? ""] ?? "AI draft unavailable"}. Fill in the bracketed parts before sending.
        </span>
      </p>
    );
  }
  return (
    <p className="flex items-center gap-2 text-sm text-violet-700 dark:text-violet-300">
      <Bot className="size-4" aria-hidden /> AI draft — review and edit before sending.
      <span className="text-xs text-muted-foreground/70">
        {draft.model} · {draft.cached ? "saved" : "generated"} {timeAgo(draft.generatedAt)}
      </span>
    </p>
  );
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

function PropertiesCard({ ticket: t, onChange, saving, error }: { ticket: AdminTicket; onChange: (p: TicketPatch) => void; saving: boolean; error: Error | null }) {
  const { user } = useAuth();
  const admins = useAdmins();

  return (
    <Card className={cx("space-y-4 p-4", saving && "opacity-70")}>
      <h2 className="text-sm font-semibold text-foreground">Ticket</h2>

      <label className="block text-sm">
        <span className="mb-1 block text-muted-foreground">Status</span>
        <Select value={t.status} onChange={(e) => onChange({ status: e.target.value as TicketStatus })}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
      </label>

      <label className="block text-sm">
        <span className="mb-1 flex items-center justify-between text-muted-foreground">
          Category <SourceTag source={t.categorySource} />
        </span>
        <Select value={t.category ?? ""} onChange={(e) => onChange({ category: e.target.value as TicketCategory })}>
          {!t.category && <option value="">Classifying…</option>}
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </Select>
      </label>

      <label className="block text-sm">
        <span className="mb-1 flex items-center justify-between text-muted-foreground">
          Priority <SourceTag source={t.prioritySource} />
        </span>
        <Select value={t.priority ?? ""} onChange={(e) => onChange({ priority: e.target.value as TicketPriority })}>
          {!t.priority && <option value="">Classifying…</option>}
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p[0] + p.slice(1).toLowerCase()}
            </option>
          ))}
        </Select>
      </label>

      {t.aiReasoning && t.categorySource !== "ADMIN" && (
        <p className="rounded-lg bg-violet-50 dark:bg-violet-400/10 px-3 py-2 text-xs text-violet-900 dark:text-violet-300">
          <Bot className="mr-1 inline size-3.5" aria-hidden />
          {t.aiReasoning}
        </p>
      )}

      <div className="text-sm">
        <span className="mb-1 block text-muted-foreground">Assignee</span>
        <div className="flex gap-2">
          <Select value={t.assignee?.id ?? ""} onChange={(e) => onChange({ assigneeId: e.target.value || null })}>
            <option value="">Unassigned</option>
            {admins.data?.data.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
          {t.assignee?.id !== user?.id && (
            <Button variant="secondary" className="shrink-0" onClick={() => onChange({ assigneeId: user!.id })}>
              Assign to me
            </Button>
          )}
        </div>
      </div>

      <div className="border-t border-border/60 pt-3 text-xs text-muted-foreground">
        {t.firstResponseAt ? (
          <>First response {dateTime(t.firstResponseAt)}</>
        ) : (
          <span className={t.sla.overdue ? "font-medium text-red-600" : undefined}>
            First response due {dateTime(t.sla.firstResponseDueAt)} ({t.sla.targetHours}h target)
          </span>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error.message}</p>}
    </Card>
  );
}

function AuthorCard({ ticket: t }: { ticket: AdminTicket }) {
  const book = useQuery({
    queryKey: ["book", t.book?.id],
    queryFn: () => api<{ data: Book }>(`/books/${t.book!.id}`),
    enabled: Boolean(t.book),
  });
  const b = book.data?.data;

  return (
    <Card className="space-y-3 p-4 text-sm">
      <h2 className="font-semibold text-foreground">Author</h2>
      <div>
        <p className="font-medium text-foreground">{t.author.name}</p>
        <p className="text-muted-foreground">
          {t.author.email} · {t.author.code}
        </p>
      </div>
      {t.book && (
        <div className="border-t border-border/60 pt-3">
          <p className="font-medium text-foreground">{t.book.title}</p>
          {b ? (
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
              <dt className="text-muted-foreground">Status</dt>
              <dd>{b.isPublished ? "Published & Live" : b.production?.stage ?? b.status}</dd>
              <dt className="text-muted-foreground">ISBN</dt>
              <dd>{b.isbn}</dd>
              {b.isPublished && (
                <>
                  <dt className="text-muted-foreground">Published</dt>
                  <dd>{date(b.publicationDate)}</dd>
                  <dt className="text-muted-foreground">Copies sold</dt>
                  <dd>{b.copiesSold}</dd>
                  <dt className="text-muted-foreground">Royalty pending</dt>
                  <dd className="font-medium">{inr(b.royaltyPending)}</dd>
                  <dt className="text-muted-foreground">Last payout</dt>
                  <dd>{b.lastRoyaltyPayoutDate ? date(b.lastRoyaltyPayoutDate) : "Never"}</dd>
                  <dt className="text-muted-foreground">Platforms</dt>
                  <dd>{b.availableOn.join(", ")}</dd>
                </>
              )}
            </dl>
          ) : (
            book.isPending && <p className="text-xs text-muted-foreground/70">Loading book…</p>
          )}
        </div>
      )}
    </Card>
  );
}

const ACTION_LABELS: Record<string, (a: Activity) => string> = {
  created: () => "created the ticket",
  status_changed: (a) => `changed status to ${STATUS_LABELS[a.toValue as TicketStatus] ?? a.toValue}`,
  category_overridden: (a) => `changed category to ${CATEGORY_LABELS[a.toValue as TicketCategory] ?? a.toValue}`,
  priority_overridden: (a) => `changed priority to ${a.toValue?.toLowerCase()}`,
  assigned: () => "assigned the ticket",
  unassigned: () => "unassigned the ticket",
  reopened_by_author: () => "reopened the ticket with a reply",
  resolved_by_author: () => "marked the ticket as resolved",
  attachment_added: (a) => `attached ${a.toValue}`,
};

function ActivityCard({ activities }: { activities: Activity[] }) {
  return (
    <Card className="p-4 text-sm">
      <h2 className="mb-3 font-semibold text-foreground">Activity</h2>
      <ol className="space-y-2.5 border-l border-border pl-4">
        {activities.map((a) => (
          <li key={a.id} className="relative">
            <span className="absolute top-1.5 -left-[21px] size-2 rounded-full bg-muted-foreground/30" aria-hidden />
            <p className="text-foreground/90">
              <span className="font-medium">{a.actor?.name ?? "System"}</span> {ACTION_LABELS[a.action]?.(a) ?? a.action}
            </p>
            <p className="text-xs text-muted-foreground/70">{dateTime(a.createdAt)}</p>
          </li>
        ))}
      </ol>
    </Card>
  );
}
