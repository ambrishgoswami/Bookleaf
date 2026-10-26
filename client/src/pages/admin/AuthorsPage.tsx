import { useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ChevronRight, MapPin, Search, UserPlus } from "lucide-react";
import { api } from "../../lib/api";
import { inr } from "../../lib/format";
import type { AuthorListItem, Paginated } from "../../lib/types";
import { useToast } from "../../components/feedback";
import { Badge, Button, Card, EmptyState, ErrorState, Input, PageHeader, Spinner, cx } from "../../components/ui";
import { AuthorFormModal, PasswordRevealModal } from "./authorForms";

const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Deactivated" },
] as const;

export function AuthorsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const status = params.get("status") ?? "all";
  const [creating, setCreating] = useState(false);
  const [reveal, setReveal] = useState<{ password: string; email: string } | null>(null);

  const list = useQuery({
    queryKey: ["authors", q, status],
    queryFn: () => api<Paginated<AuthorListItem>>(`/authors?pageSize=100&status=${status}${q ? `&q=${encodeURIComponent(q)}` : ""}`),
    placeholderData: keepPreviousData,
  });

  const update = (k: string, v: string) => {
    const p = new URLSearchParams(params);
    if (v && v !== "all") p.set(k, v);
    else p.delete(k);
    setParams(p, { replace: true });
  };

  return (
    <>
      <PageHeader
        title="Authors"
        subtitle="Manage author accounts, their books and royalty payouts."
        action={
          <Button onClick={() => setCreating(true)}>
            <UserPlus className="size-4" aria-hidden /> Add author
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input
            aria-label="Search authors"
            placeholder="Search name, email, city, AUTH001 or a book title…"
            className="pl-9"
            defaultValue={q}
            onKeyDown={(e) => e.key === "Enter" && update("q", e.currentTarget.value.trim())}
            onBlur={(e) => e.target.value.trim() !== q && update("q", e.target.value.trim())}
          />
        </div>
        <div className="flex gap-1" role="tablist">
          {STATUS_TABS.map((t) => (
            <button
              key={t.value}
              role="tab"
              aria-selected={status === t.value}
              onClick={() => update("status", t.value)}
              className={cx(
                "rounded-full px-3 py-1.5 text-sm",
                status === t.value ? "bg-brand-700 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {list.isPending ? (
        <Spinner />
      ) : list.error ? (
        <ErrorState error={list.error} onRetry={list.refetch} />
      ) : list.data.data.length === 0 ? (
        <EmptyState title="No authors found" body={q ? "Try a different search." : undefined} />
      ) : (
        <>
          {/* Phones: cards */}
          <ul className={cx("space-y-2 md:hidden", list.isPlaceholderData && "opacity-60")}>
            {list.data.data.map((a) => (
              <li key={a.id}>
                <Link to={`/admin/authors/${a.id}`} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-medium text-slate-900">
                      <span className="truncate">{a.name}</span>
                      {!a.isActive && <Badge className="bg-slate-200 text-slate-600">Deactivated</Badge>}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {a.code} · {a.email}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      {a.bookCount} books · {inr(a.totalRoyaltyPending)} pending · {a.activeTickets} open tickets
                    </p>
                  </div>
                  <ChevronRight className="size-4 text-slate-400" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>

          {/* Tablets and up: table */}
          <Card className={cx("hidden overflow-hidden md:block", list.isPlaceholderData && "opacity-60")}>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium tracking-wide text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-3">Author</th>
                  <th className="px-4 py-3">City</th>
                  <th className="px-4 py-3">Books</th>
                  <th className="px-4 py-3 text-right">Royalty pending</th>
                  <th className="px-4 py-3 text-right">Open tickets</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.data.data.map((a) => (
                  <tr key={a.id} onClick={() => navigate(`/admin/authors/${a.id}`)} className="cursor-pointer hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link to={`/admin/authors/${a.id}`} className="font-medium text-slate-900 hover:text-brand-700" onClick={(e) => e.stopPropagation()}>
                        {a.name}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {a.code} · {a.email}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {a.city && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="size-3.5 text-slate-400" aria-hidden /> {a.city}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {a.bookCount} <span className="text-xs text-slate-400">({a.publishedCount} live)</span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium">{inr(a.totalRoyaltyPending)}</td>
                    <td className="px-4 py-3 text-right">{a.activeTickets || <span className="text-slate-400">0</span>}</td>
                    <td className="px-4 py-3">
                      {a.isActive ? <Badge className="bg-emerald-100 text-emerald-800">Active</Badge> : <Badge className="bg-slate-200 text-slate-600">Deactivated</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <p className="mt-3 text-sm text-slate-500">{list.data.meta.total} authors</p>
        </>
      )}

      <AuthorFormModal
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={({ author, temporaryPassword }) => {
          setCreating(false);
          queryClient.invalidateQueries({ queryKey: ["authors"] });
          toast(`${author.name} added as ${author.code}`);
          if (temporaryPassword) setReveal({ password: temporaryPassword, email: author.email });
          else navigate(`/admin/authors/${author.id}`);
        }}
      />
      <PasswordRevealModal password={reveal?.password ?? null} email={reveal?.email} onClose={() => setReveal(null)} />
    </>
  );
}
