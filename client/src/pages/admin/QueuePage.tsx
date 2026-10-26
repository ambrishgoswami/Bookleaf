import { useState } from "react";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router";
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Search, UserCheck, X, XCircle } from "lucide-react";
import { api } from "../../lib/api";
import { useToast } from "../../components/feedback";
import { timeAgo } from "../../lib/format";
import type { AdminTicketListItem, Paginated } from "../../lib/types";
import { Button, Card, EmptyState, ErrorState, Input, PageHeader, PriorityBadge, Select, Spinner, STATUS_LABELS, StatusBadge, cx } from "../../components/ui";
import { AiStatusBanner, CATEGORIES, CATEGORY_LABELS, PRIORITIES, SourceTag, STATUSES, useAdmins } from "./shared";

const ACTIVE = "OPEN,IN_PROGRESS";
const PAGE_SIZE = 20;

/**
 * Filters live in the URL so a filtered view can be bookmarked or shared
 * ("all critical unassigned tickets") and survives a refresh.
 */
export function QueuePage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const admins = useAdmins();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const bulk = useMutation({
    mutationFn: (op: { action: "assign_to_me" } | { action: "set_status"; status: "RESOLVED" | "CLOSED" }) =>
      api<{ data: { updated: number; failed: string[] } }>("/tickets/bulk", { method: "POST", body: { ids: [...selected], ...op } }),
    onSuccess: ({ data }) => {
      toast(data.failed.length ? `Updated ${data.updated}; ${data.failed.length} could not be changed` : `Updated ${data.updated} tickets`, data.failed.length ? "error" : "success");
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
    onError: (err) => toast(err.message, "error"),
  });

  const filters = {
    status: params.get("status") ?? ACTIVE,
    category: params.get("category") ?? "",
    priority: params.get("priority") ?? "",
    assignee: params.get("assignee") ?? "",
    from: params.get("from") ?? "",
    to: params.get("to") ?? "",
    q: params.get("q") ?? "",
    overdue: params.get("overdue") === "1",
    sort: params.get("sort") ?? "urgency",
    page: Number(params.get("page") ?? 1),
  };

  const query = new URLSearchParams({ sort: filters.sort, page: String(filters.page), pageSize: String(PAGE_SIZE) });
  if (filters.status !== "ALL") query.set("status", filters.status);
  for (const key of ["category", "priority", "assignee", "from", "to", "q"] as const) if (filters[key]) query.set(key, filters[key]);
  if (filters.overdue) query.set("overdue", "true");

  const list = useQuery({
    queryKey: ["tickets", "admin", query.toString()],
    queryFn: () => api<Paginated<AdminTicketListItem>>(`/tickets?${query}`),
    placeholderData: keepPreviousData,
  });

  function update(next: Record<string, string | null>) {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) (v ? p.set(k, v) : p.delete(k));
    if (!("page" in next)) p.delete("page"); // any filter change resets pagination
    setParams(p, { replace: true });
  }

  const hasFilters = [...params.keys()].some((k) => k !== "page" && k !== "sort");
  const total = list.data?.meta.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader title="Ticket queue" subtitle="Most urgent first: highest priority, unanswered before answered, then oldest. Overdue tickets are flagged in red." />
      <AiStatusBanner />

      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="relative lg:col-span-2">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground/70" aria-hidden />
            <Input
              aria-label="Search"
              placeholder="Search subject, author or BL-1001…"
              className="pl-9"
              defaultValue={filters.q}
              onKeyDown={(e) => e.key === "Enter" && update({ q: e.currentTarget.value.trim() || null })}
              onBlur={(e) => e.target.value.trim() !== filters.q && update({ q: e.target.value.trim() || null })}
            />
          </div>
          <Select aria-label="Status" value={filters.status} onChange={(e) => update({ status: e.target.value === ACTIVE ? null : e.target.value })}>
            <option value={ACTIVE}>Active (Open + In Progress)</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
            <option value="ALL">All statuses</option>
          </Select>
          <Select aria-label="Priority" value={filters.priority} onChange={(e) => update({ priority: e.target.value || null })}>
            <option value="">All priorities</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p[0] + p.slice(1).toLowerCase()}
              </option>
            ))}
          </Select>
          <Select aria-label="Category" value={filters.category} onChange={(e) => update({ category: e.target.value || null })}>
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </Select>
          <Select aria-label="Assignee" value={filters.assignee} onChange={(e) => update({ assignee: e.target.value || null })}>
            <option value="">Anyone</option>
            <option value="me">Assigned to me</option>
            <option value="unassigned">Unassigned</option>
            {admins.data?.data.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2 text-muted-foreground">
            From <Input type="date" className="w-auto py-1" value={filters.from} onChange={(e) => update({ from: e.target.value || null })} />
          </label>
          <label className="flex items-center gap-2 text-muted-foreground">
            To <Input type="date" className="w-auto py-1" value={filters.to} onChange={(e) => update({ to: e.target.value || null })} />
          </label>
          <label className="flex items-center gap-2 text-muted-foreground">
            <input type="checkbox" className="size-4 accent-red-600" checked={filters.overdue} onChange={(e) => update({ overdue: e.target.checked ? "1" : null })} />
            Overdue only
          </label>
          <label className="ml-auto flex items-center gap-2 text-muted-foreground">
            Sort
            <Select className="w-auto py-1" value={filters.sort} onChange={(e) => update({ sort: e.target.value === "urgency" ? null : e.target.value })}>
              <option value="urgency">Most urgent</option>
              <option value="oldest">Oldest first</option>
              <option value="newest">Newest first</option>
              <option value="updated">Recently updated</option>
            </Select>
          </label>
          {hasFilters && (
            <Button variant="ghost" onClick={() => setParams({}, { replace: true })}>
              <X className="size-4" aria-hidden /> Clear filters
            </Button>
          )}
        </div>
      </Card>

      {selected.size > 0 && (
        <div className="sticky top-16 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-popover px-3 py-2 shadow-md" role="toolbar" aria-label="Bulk actions">
          <span className="mr-1 text-sm font-medium">{selected.size} selected</span>
          <Button variant="secondary" className="h-8" loading={bulk.isPending} onClick={() => bulk.mutate({ action: "assign_to_me" })}>
            <UserCheck className="size-4" aria-hidden /> Assign to me
          </Button>
          <Button variant="secondary" className="h-8" disabled={bulk.isPending} onClick={() => bulk.mutate({ action: "set_status", status: "RESOLVED" })}>
            <CheckCircle2 className="size-4" aria-hidden /> Mark resolved
          </Button>
          <Button variant="secondary" className="h-8" disabled={bulk.isPending} onClick={() => bulk.mutate({ action: "set_status", status: "CLOSED" })}>
            <XCircle className="size-4" aria-hidden /> Close
          </Button>
          <Button variant="ghost" className="ml-auto h-8" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      )}

      {list.isPending ? (
        <Spinner />
      ) : list.error ? (
        <ErrorState error={list.error} onRetry={list.refetch} />
      ) : list.data.data.length === 0 ? (
        <EmptyState title="No tickets match these filters" body={hasFilters ? "Try widening the filters." : "The queue is empty."} />
      ) : (
        <Card className={cx("overflow-hidden", list.isPlaceholderData && "opacity-60")}>
          {/* Phones: one card per ticket */}
          <ul className="divide-y divide-border/60 md:hidden">
            {list.data.data.map((t) => (
              <li key={t.id}>
                <Link to={`/admin/tickets/${t.id}`} className={cx("block px-4 py-3", t.sla.overdue && "bg-red-50/60")}>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <PriorityBadge priority={t.priority} />
                    <StatusBadge status={t.status} />
                    {t.sla.overdue && (
                      <span className="flex items-center gap-1 text-xs font-medium text-red-600">
                        <AlertCircle className="size-3" aria-hidden /> Overdue
                      </span>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground">{timeAgo(t.createdAt)}</span>
                  </div>
                  <p className="mt-1.5 font-medium text-foreground">{t.subject}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t.reference} · {t.author.name} · {t.categoryLabel ?? "Classifying…"}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t.assignee ? `Assigned to ${t.assignee.name}` : "Unassigned"}</p>
                </Link>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase">
                <tr>
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      className="size-4 cursor-pointer accent-primary"
                      aria-label="Select all on this page"
                      checked={list.data.data.length > 0 && list.data.data.every((t) => selected.has(t.id))}
                      onChange={(e) => setSelected(e.target.checked ? new Set(list.data.data.map((t) => t.id)) : new Set())}
                    />
                  </th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Ticket</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Assignee</th>
                  <th className="px-4 py-3">Age</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {list.data.data.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => navigate(`/admin/tickets/${t.id}`)}
                    className={cx("cursor-pointer hover:bg-muted/60", t.sla.overdue && "bg-red-50/60", selected.has(t.id) && "bg-muted")}
                  >
                    <td className="px-4 py-3 align-top" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" className="size-4 cursor-pointer accent-primary" aria-label={`Select ${t.reference}`} checked={selected.has(t.id)} onChange={() => toggle(t.id)} />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-col items-start gap-1">
                        <PriorityBadge priority={t.priority} />
                        <SourceTag source={t.prioritySource} />
                      </div>
                    </td>
                    <td className="max-w-md px-4 py-3 align-top">
                      <Link to={`/admin/tickets/${t.id}`} className="font-medium text-foreground hover:text-primary" onClick={(e) => e.stopPropagation()}>
                        {t.subject}
                      </Link>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {t.reference} · {t.author.name} · {t.book?.title ?? "Account-level"}
                      </p>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <p className="text-foreground/90">{t.categoryLabel ?? "—"}</p>
                      <SourceTag source={t.categorySource} />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <StatusBadge status={t.status} />
                    </td>
                    <td className="px-4 py-3 align-top text-muted-foreground">{t.assignee?.name ?? <span className="text-muted-foreground/70">Unassigned</span>}</td>
                    <td className="px-4 py-3 align-top whitespace-nowrap">
                      <span className="text-muted-foreground">{timeAgo(t.createdAt)}</span>
                      {t.sla.overdue && (
                        <span className="mt-0.5 flex items-center gap-1 text-xs font-medium text-red-600" title={`First response target: ${t.sla.targetHours}h`}>
                          <AlertCircle className="size-3" aria-hidden /> Overdue
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-border/60 px-4 py-3 text-sm text-muted-foreground">
            <span>
              {total} {total === 1 ? "ticket" : "tickets"}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="ghost" disabled={filters.page <= 1} onClick={() => update({ page: String(filters.page - 1) })} aria-label="Previous page">
                <ChevronLeft className="size-4" />
              </Button>
              <span>
                Page {filters.page} of {pages}
              </span>
              <Button variant="ghost" disabled={filters.page >= pages} onClick={() => update({ page: String(filters.page + 1) })} aria-label="Next page">
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </Card>
      )}
    </>
  );
}
