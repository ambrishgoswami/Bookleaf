import { useState } from "react";
import { Link, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BookPlus, IndianRupee, KeyRound, Mail, MapPin, Pencil, Phone, Power, Trash2 } from "lucide-react";
import { api } from "../../lib/api";
import { date, inr, number, timeAgo } from "../../lib/format";
import type { AuthorDetail, Book } from "../../lib/types";
import { ConfirmDialog, useToast } from "../../components/feedback";
import { Badge, Button, Card, EmptyState, ErrorState, PriorityBadge, Spinner, StatusBadge } from "../../components/ui";
import { AuthorFormModal, BookFormModal, PasswordRevealModal, PayoutModal } from "./authorForms";

export function AuthorDetailPage() {
  const { id } = useParams() as { id: string };
  const toast = useToast();
  const queryClient = useQueryClient();
  const key = ["author", id];
  const author = useQuery({ queryKey: key, queryFn: () => api<{ data: AuthorDetail }>(`/authors/${id}`) });

  const [editing, setEditing] = useState(false);
  const [bookForm, setBookForm] = useState<{ open: boolean; book?: Book }>({ open: false });
  const [payoutFor, setPayoutFor] = useState<Book | null>(null);
  const [deleting, setDeleting] = useState<Book | null>(null);
  const [confirmStatus, setConfirmStatus] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [password, setPassword] = useState<string | null>(null);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: key });
    queryClient.invalidateQueries({ queryKey: ["authors"] });
  };

  const toggleActive = useMutation({
    mutationFn: (isActive: boolean) => api<{ data: AuthorDetail }>(`/authors/${id}`, { method: "PATCH", body: { isActive } }),
    onSuccess: ({ data }) => {
      queryClient.setQueryData(key, { data });
      queryClient.invalidateQueries({ queryKey: ["authors"] });
      setConfirmStatus(false);
      toast(data.isActive ? `${data.name} reactivated` : `${data.name} deactivated — they can no longer log in`);
    },
    onError: (err) => toast(err.message, "error"),
  });

  const resetPassword = useMutation({
    mutationFn: () => api<{ temporaryPassword: string }>(`/authors/${id}/reset-password`, { method: "POST" }),
    onSuccess: ({ temporaryPassword }) => {
      setConfirmReset(false);
      setPassword(temporaryPassword);
    },
    onError: (err) => toast(err.message, "error"),
  });

  const deleteBook = useMutation({
    mutationFn: (bookId: string) => api(`/books/${bookId}`, { method: "DELETE" }),
    onSuccess: () => {
      toast(`"${deleting?.title}" deleted`);
      setDeleting(null);
      refresh();
    },
    onError: (err) => {
      setDeleting(null);
      toast(err.message, "error");
    },
  });

  if (author.isPending) return <Spinner />;
  if (author.error) return <ErrorState error={author.error} onRetry={author.refetch} />;
  const a = author.data.data;
  const s = a.summary;

  return (
    <>
      <Link to="/admin/authors" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> All authors
      </Link>

      <Card className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold text-foreground">{a.name}</h1>
              <Badge className="bg-muted text-muted-foreground">{a.code}</Badge>
              {a.isActive ? <Badge className="bg-emerald-100 dark:bg-emerald-400/15 text-emerald-800 dark:text-emerald-300">Active</Badge> : <Badge className="bg-muted text-muted-foreground">Deactivated</Badge>}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Mail className="size-4 text-muted-foreground/70" aria-hidden /> {a.email}
              </span>
              {a.phone && (
                <span className="inline-flex items-center gap-1">
                  <Phone className="size-4 text-muted-foreground/70" aria-hidden /> {a.phone}
                </span>
              )}
              {a.city && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-4 text-muted-foreground/70" aria-hidden /> {a.city}
                </span>
              )}
              <span className="text-muted-foreground/70">Joined {date(a.joinedDate)}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <Pencil className="size-4" aria-hidden /> Edit
            </Button>
            <Button variant="secondary" onClick={() => setConfirmReset(true)}>
              <KeyRound className="size-4" aria-hidden /> Reset password
            </Button>
            <Button variant={a.isActive ? "danger" : "primary"} onClick={() => setConfirmStatus(true)}>
              <Power className="size-4" aria-hidden /> {a.isActive ? "Deactivate" : "Reactivate"}
            </Button>
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-border/60 pt-5 sm:grid-cols-4">
          {[
            ["Copies sold", number(s.totalCopiesSold)],
            ["Royalty earned", inr(s.totalRoyaltyEarned)],
            ["Royalty paid", inr(s.totalRoyaltyPaid)],
            ["Royalty pending", inr(s.totalRoyaltyPending)],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</dt>
              <dd className="mt-1 text-xl font-semibold text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Books ({a.books.length})</h2>
          <Button onClick={() => setBookForm({ open: true })}>
            <BookPlus className="size-4" aria-hidden /> Add book
          </Button>
        </div>
        {a.books.length === 0 ? (
          <EmptyState title="No books yet" body="Add the author's first book to start tracking production and royalties." />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {a.books.map((b) => (
              <Card key={b.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{b.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {b.code} · ISBN {b.isbn} · {b.genre}
                    </p>
                  </div>
                  <Badge className={b.isPublished ? "bg-emerald-100 dark:bg-emerald-400/15 text-emerald-800 dark:text-emerald-300" : "bg-violet-100 dark:bg-violet-400/15 text-violet-800 dark:text-violet-300"}>
                    {b.isPublished ? "Live" : b.production?.stage}
                  </Badge>
                </div>
                {b.isPublished ? (
                  <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">Sold</dt>
                      <dd className="font-medium">{number(b.copiesSold)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Pending</dt>
                      <dd className="font-medium text-primary">{inr(b.royaltyPending)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Last payout</dt>
                      <dd className="font-medium">{b.lastRoyaltyPayoutDate ? date(b.lastRoyaltyPayoutDate) : "Never"}</dd>
                    </div>
                  </dl>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">
                    Step {(b.production?.index ?? 0) + 1} of {b.production?.totalStages} in production
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-1 border-t border-border/60 pt-3">
                  <Button variant="ghost" onClick={() => setBookForm({ open: true, book: b })}>
                    <Pencil className="size-4" aria-hidden /> Edit
                  </Button>
                  {b.royaltyPending > 0 && (
                    <Button variant="ghost" onClick={() => setPayoutFor(b)}>
                      <IndianRupee className="size-4" aria-hidden /> Record payout
                    </Button>
                  )}
                  {b.copiesSold === 0 && b.royaltyEarned === 0 && (
                    <Button variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => setDeleting(b)}>
                      <Trash2 className="size-4" aria-hidden /> Delete
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold text-foreground">Recent tickets</h2>
        {a.tickets.length === 0 ? (
          <p className="text-sm text-muted-foreground">No support tickets from this author.</p>
        ) : (
          <Card className="divide-y divide-border/60">
            {a.tickets.map((t) => (
              <Link key={t.id} to={`/admin/tickets/${t.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-muted/60">
                <PriorityBadge priority={t.priority} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{t.subject}</span>
                <span className="text-xs text-muted-foreground">
                  {t.reference} · {timeAgo(t.createdAt)}
                </span>
                <StatusBadge status={t.status} />
              </Link>
            ))}
          </Card>
        )}
      </section>

      <AuthorFormModal
        open={editing}
        author={a}
        onClose={() => setEditing(false)}
        onSaved={({ author: updated }) => {
          setEditing(false);
          queryClient.setQueryData(key, { data: updated });
          queryClient.invalidateQueries({ queryKey: ["authors"] });
          toast("Author updated");
        }}
      />
      <BookFormModal
        open={bookForm.open}
        book={bookForm.book}
        authorId={a.id}
        onClose={() => setBookForm({ open: false })}
        onSaved={(book) => {
          toast(bookForm.book ? `"${book.title}" updated` : `"${book.title}" added as ${book.code}`);
          setBookForm({ open: false });
          refresh();
        }}
      />
      <PayoutModal
        book={payoutFor}
        onClose={() => setPayoutFor(null)}
        onSaved={() => {
          setPayoutFor(null);
          refresh();
        }}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        danger
        title="Delete book?"
        body={
          <>
            <strong>{deleting?.title}</strong> will be permanently removed. Tickets about it are kept but no longer linked to a book.
          </>
        }
        confirmLabel="Delete book"
        loading={deleteBook.isPending}
        onConfirm={() => deleting && deleteBook.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
      <ConfirmDialog
        open={confirmStatus}
        danger={a.isActive}
        title={a.isActive ? `Deactivate ${a.name}?` : `Reactivate ${a.name}?`}
        body={
          a.isActive
            ? "They'll be logged out immediately and won't be able to log in. Their books, tickets and royalty history are kept, and you can reactivate them at any time."
            : "They'll be able to log in again with their existing password."
        }
        confirmLabel={a.isActive ? "Deactivate" : "Reactivate"}
        loading={toggleActive.isPending}
        onConfirm={() => toggleActive.mutate(!a.isActive)}
        onCancel={() => setConfirmStatus(false)}
      />
      <ConfirmDialog
        open={confirmReset}
        title="Reset password?"
        body="A new one-time password will be generated and their current password will stop working."
        confirmLabel="Reset password"
        loading={resetPassword.isPending}
        onConfirm={() => resetPassword.mutate()}
        onCancel={() => setConfirmReset(false)}
      />
      <PasswordRevealModal password={password} email={a.email} onClose={() => setPassword(null)} />
    </>
  );
}
