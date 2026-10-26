import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { CalendarClock, Info, MessageSquarePlus } from "lucide-react";
import { api } from "../../lib/api";
import { date, inr, number } from "../../lib/format";
import type { Book, BooksResponse } from "../../lib/types";
import { Badge, Card, EmptyState, ErrorState, PageHeader, Spinner } from "../../components/ui";

export function BooksPage() {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["books"],
    queryFn: () => api<BooksResponse>("/books"),
  });

  if (isPending) return <Spinner label="Loading your books…" />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const { summary } = data;
  return (
    <>
      <PageHeader
        title="My Books"
        subtitle={`${summary.totalBooks} ${summary.totalBooks === 1 ? "book" : "books"} · ${summary.publishedBooks} published`}
      />

      {data.data.length === 0 ? (
        <EmptyState title="No books yet" body="Once your manuscript is received, your book will appear here with its production status." />
      ) : (
        <>
          <RoyaltySummary summary={summary} />
          <div className="mt-8 grid gap-5 lg:grid-cols-2">
            {data.data.map((book) => (
              <BookCard key={book.id} book={book} />
            ))}
          </div>
        </>
      )}
    </>
  );
}

function RoyaltySummary({ summary }: { summary: BooksResponse["summary"] }) {
  const { payout } = summary;
  const stats = [
    { label: "Copies sold", value: number(summary.totalCopiesSold) },
    { label: "Royalty earned", value: inr(summary.totalRoyaltyEarned) },
    { label: "Royalty paid", value: inr(summary.totalRoyaltyPaid) },
    { label: "Royalty pending", value: inr(summary.totalRoyaltyPending), highlight: true },
  ];

  return (
    <Card className="p-5">
      <dl className="grid grid-cols-2 gap-5 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label}>
            <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase">{s.label}</dt>
            <dd className={s.highlight ? "mt-1 text-2xl font-semibold text-brand-700" : "mt-1 text-2xl font-semibold text-slate-900"}>
              {s.value}
            </dd>
          </div>
        ))}
      </dl>

      {summary.totalRoyaltyPending > 0 && (
        <div className="mt-5 flex items-start gap-2.5 rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-800">
          <CalendarClock className="mt-0.5 size-4 shrink-0" aria-hidden />
          {payout.meetsThreshold ? (
            <p>
              Your pending royalty is above the {inr(payout.thresholdInr)} minimum. Earnings for <strong>{payout.nextQuarter}</strong> are paid by{" "}
              <strong>{date(payout.nextPayoutBy)}</strong> to the bank account linked in your dashboard.
            </p>
          ) : (
            <p>
              Your pending royalty of {inr(summary.totalRoyaltyPending)} is below the {inr(payout.thresholdInr)} minimum payout, so it rolls over
              to the next quarter and is paid once your total crosses {inr(payout.thresholdInr)}.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

function BookCard({ book }: { book: Book }) {
  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{book.title}</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {book.genre} · ISBN {book.isbn}
          </p>
        </div>
        <Badge className={book.isPublished ? "bg-emerald-100 text-emerald-800" : "bg-violet-100 text-violet-800"}>
          {book.isPublished ? "Published & Live" : "In Production"}
        </Badge>
      </div>

      {book.isPublished ? <PublishedDetails book={book} /> : <ProductionProgress book={book} />}

      <div className="mt-auto pt-4">
        <Link
          to={`/new-ticket?book=${book.id}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:text-brand-800"
        >
          <MessageSquarePlus className="size-4" aria-hidden /> Ask about this book
        </Link>
      </div>
    </Card>
  );
}

function PublishedDetails({ book }: { book: Book }) {
  const paidPct = book.royaltyEarned > 0 ? Math.round((book.royaltyPaid / book.royaltyEarned) * 100) : 0;
  const facts = [
    ["Published", date(book.publicationDate)],
    ["MRP", inr(book.mrp)],
    ["Royalty / copy", inr(book.royaltyPerCopy)],
    ["Copies sold", number(book.copiesSold)],
    ["Last payout", book.lastRoyaltyPayoutDate ? date(book.lastRoyaltyPayoutDate) : "No payout yet"],
    ["Printed by", book.printPartner ?? "—"],
  ];

  return (
    <>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt className="text-slate-500">{label}</dt>
            <dd className="font-medium text-slate-800">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 rounded-lg bg-slate-50 p-3">
        <div className="flex justify-between text-sm">
          <span className="text-slate-600">
            Royalty earned <strong className="text-slate-900">{inr(book.royaltyEarned)}</strong>
          </span>
          <span className="text-slate-600">
            Pending <strong className={book.royaltyPending > 0 ? "text-brand-700" : "text-slate-900"}>{inr(book.royaltyPending)}</strong>
          </span>
        </div>
        <div
          className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"
          role="progressbar"
          aria-valuenow={paidPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Share of royalty paid"
        >
          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${paidPct}%` }} />
        </div>
        <p className="mt-1.5 text-xs text-slate-500">
          {inr(book.royaltyPaid)} paid ({paidPct}%){book.royaltyEarned === 0 && " — royalties appear here once copies sell"}
        </p>
      </div>

      {book.availableOn.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {book.availableOn.map((p) => (
            <Badge key={p} className="bg-white text-slate-600 ring-1 ring-slate-200">
              {p}
            </Badge>
          ))}
        </div>
      )}
    </>
  );
}

const STAGES = ["Manuscript", "Editing", "Cover Design", "Typesetting", "Proofreading", "ISBN", "Printing", "Distribution", "Live"];

function ProductionProgress({ book }: { book: Book }) {
  const current = book.production?.index ?? -1;
  return (
    <div className="mt-4">
      <p className="text-sm text-slate-700">
        Current stage: <strong>{book.production?.stage ?? book.status}</strong>
        {current >= 0 && (
          <span className="text-slate-500">
            {" "}
            (step {current + 1} of {STAGES.length})
          </span>
        )}
      </p>
      <ol className="mt-3 flex gap-1" aria-label="Production progress">
        {STAGES.map((s, i) => (
          <li key={s} className="flex-1" title={s}>
            <div className={i < current ? "h-1.5 rounded-full bg-emerald-500" : i === current ? "h-1.5 rounded-full bg-violet-500" : "h-1.5 rounded-full bg-slate-200"} />
            <span className={i === current ? "mt-1 hidden text-[10px] font-medium text-violet-700 sm:block" : "mt-1 hidden text-[10px] text-slate-400 sm:block"}>
              {s}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-4 flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
        <Info className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden />
        Pricing, sales and royalties will appear here once your book is published. You'll get an email at every stage.
      </p>
    </div>
  );
}
