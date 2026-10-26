import { useState, type FormEvent } from "react";
import { Link, useLocation, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, CheckCircle2 } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { timeAgo } from "../../lib/format";
import type { AuthorTicket, Paginated, TicketStatus } from "../../lib/types";
import { MessageThread } from "../../components/MessageThread";
import { Attachments } from "../../components/Attachments";
import { ConfirmDialog, useToast } from "../../components/feedback";
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, Spinner, StatusBadge, Textarea, cx } from "../../components/ui";

const FILTERS: { label: string; value: TicketStatus | "" }[] = [
  { label: "All", value: "" },
  { label: "Open", value: "OPEN" },
  { label: "In Progress", value: "IN_PROGRESS" },
  { label: "Resolved", value: "RESOLVED" },
  { label: "Closed", value: "CLOSED" },
];

export function TicketsPage() {
  const { id } = useParams();
  const [status, setStatus] = useState<TicketStatus | "">("");

  const list = useQuery({
    queryKey: ["tickets", "author", status],
    queryFn: () => api<Paginated<AuthorTicket>>(`/tickets?pageSize=100${status ? `&status=${status}` : ""}`),
  });

  return (
    <>
      <PageHeader
        title="My Tickets"
        subtitle="Replies from our team appear here instantly — no need to refresh."
        action={
          <Link to="/new-ticket">
            <Button>New query</Button>
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        {/* On mobile, show the list OR the detail. */}
        <section className={cx(id && "hidden lg:block")} aria-label="Ticket list">
          <div className="mb-3 flex gap-1 overflow-x-auto" role="tablist">
            {FILTERS.map((f) => (
              <button
                key={f.label}
                role="tab"
                aria-selected={status === f.value}
                onClick={() => setStatus(f.value)}
                className={cx(
                  "rounded-full px-3 py-1 text-sm whitespace-nowrap",
                  status === f.value ? "bg-brand-700 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50",
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
          ) : list.data.data.length === 0 ? (
            <EmptyState
              title={status ? "No tickets with this status" : "No tickets yet"}
              body={status ? undefined : "Have a question about royalties, your ISBN, printing or your book's status? We're here to help."}
              action={!status && <Link to="/new-ticket"><Button>Raise a query</Button></Link>}
            />
          ) : (
            <ul className="space-y-2">
              {list.data.data.map((t) => (
                <li key={t.id}>
                  <Link
                    to={`/tickets/${t.id}`}
                    className={cx(
                      "block rounded-xl border bg-white p-4 transition-colors hover:border-brand-500",
                      t.id === id ? "border-brand-500 ring-2 ring-brand-500/20" : "border-slate-200",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-slate-500">{t.reference}</span>
                      <StatusBadge status={t.status} />
                    </div>
                    <p className="mt-1 font-medium text-slate-900">{t.subject}</p>
                    <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-500">
                      <span>{t.book?.title ?? "General / Account"}</span>
                      <span>Updated {timeAgo(t.updatedAt)}</span>
                      {t.messages.some((m) => m.sender.role === "ADMIN") && <span className="text-brand-700">● Reply from BookLeaf</span>}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Ticket detail">
          {id ? (
            <TicketDetail id={id} />
          ) : (
            <div className="hidden h-full items-center justify-center rounded-xl border border-dashed border-slate-300 p-10 text-sm text-slate-500 lg:flex">
              Select a ticket to see the conversation.
            </div>
          )}
        </section>
      </div>
    </>
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
  const [reply, setReply] = useState("");

  const ticket = useQuery({ queryKey: ["ticket", id], queryFn: () => api<{ data: AuthorTicket }>(`/tickets/${id}`) });

  const send = useMutation({
    mutationFn: () => api(`/tickets/${id}/messages`, { method: "POST", body: { body: reply } }),
    onSuccess: () => {
      setReply("");
      queryClient.invalidateQueries({ queryKey: ["ticket", id] });
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
  });

  const toast = useToast();
  const [confirmResolve, setConfirmResolve] = useState(false);
  const resolve = useMutation({
    mutationFn: () => api(`/tickets/${id}`, { method: "PATCH", body: { status: "RESOLVED" } }),
    onSuccess: () => {
      setConfirmResolve(false);
      toast("Glad we could help! Ticket marked as resolved.");
      queryClient.invalidateQueries({ queryKey: ["ticket", id] });
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
    onError: (err) => toast(err.message, "error"),
  });

  if (ticket.isPending) return <Spinner />;
  if (ticket.error) return <ErrorState error={ticket.error} onRetry={ticket.refetch} />;
  const t = ticket.data.data;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (reply.trim()) send.mutate();
  }

  return (
    <Card className="flex flex-col">
      <div className="border-b border-slate-100 p-5">
        <Link to="/tickets" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 lg:hidden">
          <ArrowLeft className="size-4" /> All tickets
        </Link>
        {justCreated === t.reference && (
          <p className="mb-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            <CheckCircle2 className="size-4" aria-hidden /> Ticket {t.reference} submitted. You'll see our reply here as soon as it's sent.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-slate-500">{t.reference}</span>
          <StatusBadge status={t.status} />
          {t.categoryLabel && <Badge className="bg-slate-100 text-slate-600">{t.categoryLabel}</Badge>}
        </div>
        <h2 className="mt-2 text-xl font-semibold text-slate-900">{t.subject}</h2>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-slate-500">
          <span className="inline-flex items-center gap-1">
            <BookOpen className="size-3.5" aria-hidden /> {t.book?.title ?? "General / Account Level"}
          </span>
          {t.handledBy && <span>Handled by {t.handledBy}</span>}
        </p>
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">{STATUS_EXPLAINER[t.status]}</p>
      </div>

      <div className="p-5">
        <MessageThread
          viewer="AUTHOR"
          original={{ authorName: user?.name ?? "You", body: t.description, createdAt: t.createdAt, attachmentName: t.attachments.length ? null : t.attachmentName }}
          messages={t.messages}
        />
      </div>

      <div className="border-t border-slate-100 p-5">
        <Attachments ticketId={t.id} attachments={t.attachments} canUpload={t.status !== "CLOSED"} />
      </div>

      {t.status !== "CLOSED" && (
        <form onSubmit={submit} className="border-t border-slate-100 p-5">
          <label htmlFor="reply" className="sr-only">
            Reply
          </label>
          <Textarea
            id="reply"
            rows={3}
            placeholder={t.status === "RESOLVED" ? "Still need help? Reply to reopen this ticket…" : "Add more details or reply to our team…"}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
          />
          {send.error && <p className="mt-2 text-sm text-red-600">{send.error.message}</p>}
          <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            {t.status === "OPEN" || t.status === "IN_PROGRESS" ? (
              <Button type="button" variant="ghost" onClick={() => setConfirmResolve(true)}>
                <CheckCircle2 className="size-4" aria-hidden /> My issue is resolved
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit" loading={send.isPending} disabled={!reply.trim()}>
              Send reply
            </Button>
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
    </Card>
  );
}
