import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, CheckCircle2, MessagesSquare, Plus, Search, SendHorizontal, Star } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { timeAgo } from "../../lib/format";
import type { AuthorTicket, Paginated, TicketStatus } from "../../lib/types";
import { MessageThread } from "../../components/MessageThread";
import { Attachments } from "../../components/Attachments";
import { ConfirmDialog, useToast } from "../../components/feedback";
import { Badge, Button, ErrorState, Spinner, StatusBadge, cx } from "../../components/ui";

const FILTERS: { label: string; value: TicketStatus | "" }[] = [
  { label: "All", value: "" },
  { label: "Open", value: "OPEN" },
  { label: "In progress", value: "IN_PROGRESS" },
  { label: "Resolved", value: "RESOLVED" },
  { label: "Closed", value: "CLOSED" },
];

const bookInitials = (title?: string) =>
  (title ?? "General")
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

export function TicketsPage() {
  const { id } = useParams();
  const [status, setStatus] = useState<TicketStatus | "">("");
  const [q, setQ] = useState("");

  const list = useQuery({
    queryKey: ["tickets", "author", status],
    queryFn: () => api<Paginated<AuthorTicket>>(`/tickets?pageSize=100${status ? `&status=${status}` : ""}`),
  });

  const needle = q.trim().toLowerCase();
  const tickets = (list.data?.data ?? []).filter(
    (t) => !needle || [t.subject, t.reference, t.book?.title ?? ""].some((s) => s.toLowerCase().includes(needle)),
  );

  return (
    // Inbox: list + conversation in one framed panel.
    <div className="mx-auto flex max-w-6xl flex-col rounded-2xl border border-[#727272]/60 bg-background p-4 sm:p-6">
      <div className={cx("mb-4 flex shrink-0 flex-wrap items-center gap-3", id && "max-lg:hidden")}>
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-brand bg-background px-4 py-2">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search your tickets"
            className="min-w-0 flex-1 bg-transparent font-display text-sm text-foreground outline-none placeholder:text-muted-foreground"
            aria-label="Search tickets"
          />
        </label>
        <Link to="/new-ticket">
          <Button variant="brand" className="rounded-[7px]">
            <Plus className="size-4" aria-hidden /> New query
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(260px,_2fr)_3fr]">
        {/* On phones: the list OR the conversation. */}
        <section className={cx("min-w-0", id && "max-lg:hidden")} aria-label="Tickets">
          <div className="no-scrollbar mb-3 flex gap-1.5 overflow-x-auto" role="tablist">
            {FILTERS.map((f) => (
              <button
                key={f.label}
                role="tab"
                aria-selected={status === f.value}
                onClick={() => setStatus(f.value)}
                className={cx(
                  "shrink-0 rounded-[7px] px-3 py-1 font-display text-sm font-semibold transition-colors",
                  status === f.value ? "bg-brand text-brand-foreground" : "bg-[#393939] text-[#d2d2d2] hover:brightness-110",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {list.isPending ? (
            <Spinner />
          ) : list.error ? (
            <ErrorState error={list.error} onRetry={list.refetch} />
          ) : tickets.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-[#2a2a2a] bg-[#1e1e1e] p-8 text-center">
              <span className="flex size-16 items-center justify-center rounded-full bg-[#282828]">
                <MessagesSquare className="size-7 text-muted-foreground" aria-hidden />
              </span>
              <p className="font-display text-lg">{needle || status ? "Nothing matches" : "No tickets yet"}</p>
              <p className="max-w-xs text-sm text-muted-foreground">
                {needle || status ? "Try another search or filter." : "Questions about royalties, ISBNs, printing or your book's status? We're here to help."}
              </p>
            </div>
          ) : (
            <ul className="space-y-1">
              {tickets.map((t) => {
                const last = t.messages.at(-1);
                const preview = last ? `${last.sender.role === "ADMIN" ? "BookLeaf: " : "You: "}${last.body}` : t.description;
                const unread = t.unreadCount ?? 0;
                return (
                  <li key={t.id}>
                    <Link
                      to={`/tickets/${t.id}`}
                      className={cx("flex gap-3 rounded-xl px-3 py-3 transition-colors", t.id === id ? "bg-[#282828]" : "hover:bg-[#232323]")}
                    >
                      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-soft font-display text-sm font-semibold text-[#282828]">
                        {bookInitials(t.book?.title)}
                      </span>
                      <span className="min-w-0 flex-1 border-b border-[#2a2a2a] pb-2.5">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className={cx("truncate font-display text-[15px]", unread ? "font-bold text-foreground" : "font-semibold text-[#d2d2d2]")}>{t.subject}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(t.updatedAt)}</span>
                        </span>
                        <span className="mt-0.5 flex items-center justify-between gap-2">
                          <span className="truncate text-sm text-muted-foreground">{preview}</span>
                          {unread > 0 ? (
                            <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-brand px-1.5 text-[0.68rem] font-bold text-brand-foreground">{unread}</span>
                          ) : (
                            <StatusBadge status={t.status} />
                          )}
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground/70">
                          {t.reference} · {t.book?.title ?? "General / Account"}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="min-w-0" aria-label="Conversation">
          {id ? (
            <TicketDetail id={id} />
          ) : (
            <div className="hidden h-full min-h-80 flex-col items-center justify-center gap-3 rounded-2xl border border-[#2a2a2a] bg-[#1e1e1e] p-8 text-center lg:flex">
              <span className="flex size-16 items-center justify-center rounded-full bg-[#282828]">
                <MessagesSquare className="size-7 text-muted-foreground" aria-hidden />
              </span>
              <p className="font-display text-lg">Select a conversation</p>
              <p className="max-w-xs text-sm text-muted-foreground">Replies from our team appear here instantly — no need to refresh.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

const STATUS_EXPLAINER: Record<TicketStatus, string> = {
  OPEN: "We've received your query and a member of our team will pick it up shortly.",
  IN_PROGRESS: "Our team is working on this. We'll update you here.",
  RESOLVED: "We've marked this as resolved. If you still need help, just reply — the ticket will reopen.",
  CLOSED: "This ticket is closed. If you need more help, please raise a new query.",
};

function TicketDetail({ id }: { id: string }) {
  const { user } = useAuth();
  const location = useLocation();
  const justCreated = (location.state as { created?: string } | null)?.created;
  const queryClient = useQueryClient();
  const toast = useToast();
  const [reply, setReply] = useState("");
  const [confirmResolve, setConfirmResolve] = useState(false);

  const ticket = useQuery({ queryKey: ["ticket", id], queryFn: () => api<{ data: AuthorTicket }>(`/tickets/${id}`) });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["ticket", id] });
    queryClient.invalidateQueries({ queryKey: ["tickets"] });
  };

  // Opening the conversation (or a reply arriving while it's open) marks it read.
  const unread = ticket.data?.data.unreadCount ?? 0;
  useEffect(() => {
    if (unread > 0) void api(`/tickets/${id}/read`, { method: "POST" }).then(refresh, () => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, unread]);

  const send = useMutation({
    mutationFn: () => api(`/tickets/${id}/messages`, { method: "POST", body: { body: reply } }),
    onSuccess: () => {
      setReply("");
      refresh();
    },
  });

  const resolve = useMutation({
    mutationFn: () => api(`/tickets/${id}`, { method: "PATCH", body: { status: "RESOLVED" } }),
    onSuccess: () => {
      setConfirmResolve(false);
      toast("Glad we could help! Ticket marked as resolved.");
      refresh();
    },
    onError: (err) => toast(err.message, "error"),
  });

  if (ticket.isPending) return <Spinner />;
  if (ticket.error) return <ErrorState error={ticket.error} onRetry={ticket.refetch} />;
  const t = ticket.data.data;
  const active = t.status === "OPEN" || t.status === "IN_PROGRESS";

  function submit(e: FormEvent) {
    e.preventDefault();
    if (reply.trim()) send.mutate();
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-[#2a2a2a] bg-[#1e1e1e]">
      <div className="border-b border-[#2a2a2a] p-5">
        <Link to="/tickets" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground lg:hidden">
          <ArrowLeft className="size-4" aria-hidden /> All tickets
        </Link>
        {justCreated === t.reference && (
          <p className="mb-3 flex items-center gap-2 rounded-[7px] bg-brand/10 px-3 py-2 text-sm text-brand">
            <CheckCircle2 className="size-4" aria-hidden /> Ticket {t.reference} submitted. You'll see our reply here as soon as it's sent.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">{t.reference}</span>
          <StatusBadge status={t.status} />
          {t.categoryLabel && <Badge className="bg-white/5 text-[#d2d2d2]">{t.categoryLabel}</Badge>}
        </div>
        <h2 className="mt-2 font-display text-2xl font-semibold">{t.subject}</h2>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <BookOpen className="size-3.5" aria-hidden /> {t.book?.title ?? "General / Account Level"}
          </span>
          {t.handledBy && <span>Handled by {t.handledBy}</span>}
        </p>
        <p className="mt-3 rounded-[7px] bg-white/5 px-3 py-2 text-sm text-[#d2d2d2]">{STATUS_EXPLAINER[t.status]}</p>
      </div>

      <div className="p-5">
        <MessageThread
          viewer="AUTHOR"
          original={{ authorName: user?.name ?? "You", body: t.description, createdAt: t.createdAt, attachmentName: t.attachments.length ? null : t.attachmentName }}
          messages={t.messages}
        />
      </div>

      <div className="border-t border-[#2a2a2a] p-5">
        <Attachments ticketId={t.id} attachments={t.attachments} canUpload={t.status !== "CLOSED"} />
      </div>

      {(t.status === "RESOLVED" || t.status === "CLOSED") && <RatingPanel ticket={t} onRated={refresh} />}

      {t.status !== "CLOSED" && (
        <form onSubmit={submit} className="border-t border-[#2a2a2a] p-4">
          <div className="flex items-end gap-2 rounded-3xl bg-[#343434] px-4 py-2">
            <label htmlFor="reply" className="sr-only">
              Reply
            </label>
            <textarea
              id="reply"
              rows={1}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(e);
              }}
              placeholder={t.status === "RESOLVED" ? "Still need help? Reply to reopen this ticket…" : "Write a message…"}
              className="field-sizing-content max-h-40 min-h-6 min-w-0 flex-1 resize-none bg-transparent py-1 font-display text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
            />
            <button type="submit" disabled={!reply.trim() || send.isPending} className="pb-1 text-brand transition-opacity disabled:opacity-40" aria-label="Send reply">
              <SendHorizontal className="size-5" />
            </button>
          </div>
          {send.error && <p className="mt-2 px-1 text-xs text-destructive">{send.error.message}</p>}
          <div className="mt-2 flex items-center justify-between px-1 text-xs text-muted-foreground">
            <span>Ctrl + Enter to send</span>
            {active && (
              <button type="button" onClick={() => setConfirmResolve(true)} className="inline-flex items-center gap-1 font-medium text-brand hover:underline">
                <CheckCircle2 className="size-3.5" aria-hidden /> My issue is resolved
              </button>
            )}
          </div>
        </form>
      )}

      <ConfirmDialog
        open={confirmResolve}
        title="Mark this ticket as resolved?"
        body="We'll close the loop on our side. If anything comes up later, just reply here and the ticket will reopen."
        confirmLabel="Yes, it's resolved"
        loading={resolve.isPending}
        onConfirm={() => resolve.mutate()}
        onCancel={() => setConfirmResolve(false)}
      />
    </div>
  );
}

/** CSAT: one tap to rate, optional comment. Editable after submitting. */
function RatingPanel({ ticket, onRated }: { ticket: AuthorTicket; onRated: () => void }) {
  const toast = useToast();
  const [score, setScore] = useState(ticket.rating ?? 0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState(ticket.ratingComment ?? "");
  const [editing, setEditing] = useState(ticket.rating == null);

  const rate = useMutation({
    mutationFn: () => api(`/tickets/${ticket.id}/rating`, { method: "POST", body: { rating: score, comment } }),
    onSuccess: () => {
      setEditing(false);
      toast("Thanks for your feedback!");
      onRated();
    },
    onError: (err) => toast(err.message, "error"),
  });

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-3 border-t border-[#2a2a2a] px-5 py-3 text-sm">
        <span className="flex items-center gap-1 text-muted-foreground">
          You rated this
          {[1, 2, 3, 4, 5].map((n) => (
            <Star key={n} className={cx("size-4", n <= (ticket.rating ?? 0) ? "fill-brand text-brand" : "text-muted-foreground/40")} aria-hidden />
          ))}
        </span>
        <button onClick={() => setEditing(true)} className="text-xs font-medium text-brand hover:underline">
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="border-t border-[#2a2a2a] p-5">
      <p className="font-display text-lg font-semibold">How did we do?</p>
      <p className="text-sm text-muted-foreground">Your rating helps us improve author support.</p>
      <div className="mt-3 flex gap-1" role="radiogroup" aria-label="Rating" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            role="radio"
            aria-checked={score === n}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            onMouseEnter={() => setHover(n)}
            onClick={() => setScore(n)}
            className="rounded p-0.5 transition-transform hover:scale-110"
          >
            <Star className={cx("size-7", n <= (hover || score) ? "fill-brand text-brand" : "text-muted-foreground/50")} />
          </button>
        ))}
      </div>
      {score > 0 && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={1000}
            placeholder="Anything we could do better? (optional)"
            className="h-9 min-w-0 flex-1 rounded-[7px] border border-white/10 bg-transparent px-3 text-sm outline-none focus:border-brand"
          />
          <Button variant="brand" className="rounded-[7px]" loading={rate.isPending} onClick={() => rate.mutate()}>
            Submit rating
          </Button>
        </div>
      )}
    </div>
  );
}
