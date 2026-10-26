import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { AlertCircle, Bot, Clock, Inbox, UserCheck, UserX } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { timeAgo } from "../../lib/format";
import type { AdminTicketListItem, Paginated, QueueStats, TicketPriority } from "../../lib/types";
import { Card, EmptyState, ErrorState, PageHeader, PriorityBadge, Spinner, StatusBadge, cx } from "../../components/ui";
import { AiStatusBanner, PRIORITIES, useAiStatus } from "./shared";

interface AiUsage {
  periodDays: number;
  operations: { operation: string; calls: number; cacheHitRatio: number; avgLatencyMs: number; estimatedCostUsd: number | null }[];
  failures: Record<string, number>;
  classificationSources: Record<string, number>;
}

const PRIORITY_BAR: Record<TicketPriority, string> = {
  CRITICAL: "bg-red-600",
  HIGH: "bg-orange-400",
  MEDIUM: "bg-sky-400",
  LOW: "bg-slate-300",
};

export function DashboardPage() {
  const { user } = useAuth();
  const stats = useQuery({ queryKey: ["tickets", "stats"], queryFn: () => api<{ data: QueueStats }>("/tickets/stats") });
  const urgent = useQuery({
    queryKey: ["tickets", "admin", "urgent"],
    queryFn: () => api<Paginated<AdminTicketListItem>>("/tickets?status=OPEN,IN_PROGRESS&sort=urgency&pageSize=6"),
  });

  if (stats.isPending) return <Spinner />;
  if (stats.error) return <ErrorState error={stats.error} onRetry={stats.refetch} />;
  const s = stats.data.data;

  const tiles = [
    { label: "Active tickets", value: s.active.total, icon: Inbox, to: "/admin/tickets", tone: "text-slate-900" },
    { label: "Overdue first response", value: s.active.overdue, icon: Clock, to: "/admin/tickets?overdue=1", tone: s.active.overdue ? "text-red-600" : "text-slate-900" },
    { label: "Unassigned", value: s.active.unassigned, icon: UserX, to: "/admin/tickets?assignee=unassigned", tone: "text-slate-900" },
    { label: "Assigned to me", value: s.active.assignedToMe, icon: UserCheck, to: "/admin/tickets?assignee=me", tone: "text-slate-900" },
  ];

  return (
    <>
      <PageHeader title={`Good to see you, ${user?.name.split(" ")[0]}`} subtitle="Here's where the support queue stands right now." />
      <AiStatusBanner />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map(({ label, value, icon: Icon, to, tone }) => (
          <Link key={label} to={to}>
            <Card className="p-5 transition-shadow hover:shadow-md">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-sm">{label}</span>
                <Icon className="size-4" aria-hidden />
              </div>
              <p className={cx("mt-2 text-3xl font-semibold", tone)}>{value}</p>
            </Card>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Needs attention</h2>
            <Link to="/admin/tickets" className="text-sm text-brand-700 hover:underline">
              Open queue →
            </Link>
          </div>
          {urgent.isPending ? (
            <Spinner />
          ) : urgent.error ? (
            <ErrorState error={urgent.error} />
          ) : urgent.data.data.length === 0 ? (
            <EmptyState title="Queue is clear" body="No open tickets right now." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {urgent.data.data.map((t) => (
                <li key={t.id}>
                  <Link to={`/admin/tickets/${t.id}`} className="flex items-center gap-3 py-3 hover:bg-slate-50">
                    <PriorityBadge priority={t.priority} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">{t.subject}</p>
                      <p className="text-xs text-slate-500">
                        {t.reference} · {t.author.name} · {timeAgo(t.createdAt)}
                      </p>
                    </div>
                    {t.sla.overdue && (
                      <span className="flex items-center gap-1 text-xs font-medium text-red-600">
                        <AlertCircle className="size-3.5" aria-hidden /> Overdue
                      </span>
                    )}
                    <StatusBadge status={t.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-4 font-semibold text-slate-900">Active by priority</h2>
            <ul className="space-y-2.5">
              {PRIORITIES.map((p) => {
                const count = s.active.byPriority[p] ?? 0;
                const pct = s.active.total ? (count / s.active.total) * 100 : 0;
                return (
                  <li key={p}>
                    <Link to={`/admin/tickets?priority=${p}`} className="block">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">{p[0] + p.slice(1).toLowerCase()}</span>
                        <span className="font-medium">{count}</span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                        <div className={cx("h-full rounded-full", PRIORITY_BAR[p])} style={{ width: `${pct}%` }} />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
          <AiUsageCard />
        </div>
      </div>
    </>
  );
}

function AiUsageCard() {
  const status = useAiStatus();
  const usage = useQuery({ queryKey: ["ai", "usage"], queryFn: () => api<{ data: AiUsage }>("/ai/usage?days=30") });
  const u = usage.data?.data;
  const totalCalls = u?.operations.reduce((n, o) => n + o.calls, 0) ?? 0;
  const cost = u?.operations.reduce((n, o) => n + (o.estimatedCostUsd ?? 0), 0) ?? 0;
  const failures = u ? Object.values(u.failures).reduce((a, b) => a + b, 0) : 0;
  const sources = u?.classificationSources ?? {};
  const classified = (sources.AI ?? 0) + (sources.FALLBACK ?? 0) + (sources.ADMIN ?? 0);

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-semibold text-slate-900">
          <Bot className="size-4 text-violet-600" aria-hidden /> AI assistant
        </h2>
        <span className={cx("text-xs font-medium", status.data?.data.available ? "text-emerald-600" : "text-amber-600")}>
          {status.data?.data.available ? "Online" : "Degraded"}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-slate-500">Calls (30d)</dt>
          <dd className="font-medium">{totalCalls}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Est. cost</dt>
          <dd className="font-medium">${cost.toFixed(4)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Failed calls</dt>
          <dd className="font-medium">{failures}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Admin overrides</dt>
          <dd className="font-medium">
            {sources.ADMIN ?? 0}/{classified}
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-slate-500">Model: {status.data?.data.model ?? "—"}</p>
    </Card>
  );
}
