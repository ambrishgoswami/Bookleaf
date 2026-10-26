import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { AlertCircle, Bot, Clock, Download, Inbox, UserCheck, UserX } from "lucide-react";
import { api, apiDownload } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { timeAgo } from "../../lib/format";
import type { AdminTicketListItem, Analytics, Paginated, QueueStats, TicketPriority } from "../../lib/types";
import { Button, Card, EmptyState, ErrorState, PageHeader, PriorityBadge, Spinner, StatusBadge, cx } from "../../components/ui";
import { BarList, ColumnChart } from "../../components/charts";
import { useToast } from "../../components/feedback";
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
  LOW: "bg-muted-foreground/30",
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
    { label: "Active tickets", value: s.active.total, icon: Inbox, to: "/admin/tickets", tone: "text-foreground" },
    { label: "Overdue first response", value: s.active.overdue, icon: Clock, to: "/admin/tickets?overdue=1", tone: s.active.overdue ? "text-red-600" : "text-foreground" },
    { label: "Unassigned", value: s.active.unassigned, icon: UserX, to: "/admin/tickets?assignee=unassigned", tone: "text-foreground" },
    { label: "Assigned to me", value: s.active.assignedToMe, icon: UserCheck, to: "/admin/tickets?assignee=me", tone: "text-foreground" },
  ];

  return (
    <>
      <PageHeader title={`Good to see you, ${user?.name.split(" ")[0]}`} subtitle="Here's where the support queue stands right now." />
      <AiStatusBanner />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map(({ label, value, icon: Icon, to, tone }) => (
          <Link key={label} to={to}>
            <Card className="p-5 transition-shadow hover:shadow-md">
              <div className="flex items-center justify-between text-muted-foreground">
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
            <h2 className="font-semibold text-foreground">Needs attention</h2>
            <Link to="/admin/tickets" className="text-sm text-primary hover:underline">
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
            <ul className="divide-y divide-border/60">
              {urgent.data.data.map((t) => (
                <li key={t.id}>
                  <Link to={`/admin/tickets/${t.id}`} className="flex items-center gap-3 py-3 hover:bg-muted/60">
                    <PriorityBadge priority={t.priority} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{t.subject}</p>
                      <p className="text-xs text-muted-foreground">
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
            <h2 className="mb-4 font-semibold text-foreground">Active by priority</h2>
            <ul className="space-y-2.5">
              {PRIORITIES.map((p) => {
                const count = s.active.byPriority[p] ?? 0;
                const pct = s.active.total ? (count / s.active.total) * 100 : 0;
                return (
                  <li key={p}>
                    <Link to={`/admin/tickets?priority=${p}`} className="block">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{p[0] + p.slice(1).toLowerCase()}</span>
                        <span className="font-medium">{count}</span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-muted">
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

      <AnalyticsSection />
    </>
  );
}

const RANGES = [7, 30, 90] as const;
const hours = (h: number | null) => (h == null ? "—" : h < 1 ? `${Math.round(h * 60)}m` : h < 48 ? `${h}h` : `${Math.round(h / 24)}d`);
const pct = (n: number | null) => (n == null ? "—" : `${n}%`);

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Support performance over a selectable window. */
function AnalyticsSection() {
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const analytics = useQuery({ queryKey: ["tickets", "analytics", days], queryFn: () => api<{ data: Analytics }>(`/tickets/analytics?days=${days}`) });
  const [exporting, setExporting] = useState(false);
  const toast = useToast();

  async function exportCsv() {
    setExporting(true);
    try {
      await apiDownload("/tickets/export.csv?status=OPEN,IN_PROGRESS,RESOLVED,CLOSED", `bookleaf-tickets-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Export failed", "error");
    } finally {
      setExporting(false);
    }
  }

  const a = analytics.data?.data;
  const draftShare = a && a.ai.repliesSent ? Math.round((a.ai.repliesFromDraft / a.ai.repliesSent) * 100) : null;
  const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

  return (
    <section className="mt-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Support performance</h2>
          <p className="text-sm text-muted-foreground">Tickets created in the last {days} days.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border p-0.5" role="tablist" aria-label="Time range">
            {RANGES.map((r) => (
              <button
                key={r}
                role="tab"
                aria-selected={days === r}
                onClick={() => setDays(r)}
                className={cx("rounded px-2.5 py-1 text-sm", days === r ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {r}d
              </button>
            ))}
          </div>
          <Button variant="secondary" onClick={exportCsv} loading={exporting}>
            <Download className="size-4" aria-hidden /> Export CSV
          </Button>
        </div>
      </div>

      {analytics.isPending ? (
        <Spinner />
      ) : analytics.error ? (
        <ErrorState error={analytics.error} onRetry={analytics.refetch} />
      ) : (
        a && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <Kpi label="Tickets created" value={String(a.totals.created)} hint={`${a.totals.resolved} resolved`} />
              <Kpi label="Median first response" value={hours(a.firstResponseHours.median)} hint={`avg ${hours(a.firstResponseHours.average)}`} />
              <Kpi label="Median resolution" value={hours(a.resolutionHours.median)} hint={`avg ${hours(a.resolutionHours.average)}`} />
              <Kpi label="SLA breaches" value={pct(a.sla.breachRate)} hint={`${a.sla.breached} of ${a.sla.eligible}`} />
              <Kpi label="CSAT" value={a.csat.average == null ? "—" : `${a.csat.average} / 5`} hint={`${a.csat.responses} ratings`} />
              <Kpi label="Replies from AI draft" value={pct(draftShare)} hint={`AI overrides ${pct(a.ai.overrideRate)}`} />
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <Card className="p-5 lg:col-span-2">
                <h3 className="mb-3 text-base font-semibold">New tickets per day</h3>
                <ColumnChart caption={`New tickets per day, last ${days} days`} data={a.volume.map((v) => ({ label: shortDate(v.date), tick: shortDate(v.date), value: v.created }))} />
              </Card>
              <Card className="p-5">
                <h3 className="mb-3 text-base font-semibold">Tickets by category</h3>
                <BarList caption="Tickets by category" data={[...a.byCategory].sort((x, y) => y.count - x.count).map((c) => ({ label: c.label, value: c.count }))} />
              </Card>
            </div>

            <Card className="p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-base font-semibold">Author satisfaction</h3>
                <p className="text-sm text-muted-foreground">
                  {a.csat.responses ? `${a.csat.average} average from ${a.csat.responses} ratings` : "No ratings yet — authors are asked to rate once a ticket is resolved."}
                </p>
              </div>
              {a.csat.responses > 0 && (
                <div className="mt-4 max-w-xl">
                  <BarList
                    caption="CSAT rating distribution"
                    data={[...a.csat.distribution].reverse().map((d) => ({ label: `${"★".repeat(d.score)} ${d.score}`, value: d.count }))}
                  />
                </div>
              )}
            </Card>
          </div>
        )
      )}
    </section>
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
        <h2 className="flex items-center gap-2 font-semibold text-foreground">
          <Bot className="size-4 text-violet-600" aria-hidden /> AI assistant
        </h2>
        <span className={cx("text-xs font-medium", status.data?.data.available ? "text-emerald-600" : "text-amber-600")}>
          {status.data?.data.available ? "Online" : "Degraded"}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-muted-foreground">Calls (30d)</dt>
          <dd className="font-medium">{totalCalls}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Est. cost</dt>
          <dd className="font-medium">${cost.toFixed(4)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Failed calls</dt>
          <dd className="font-medium">{failures}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Admin overrides</dt>
          <dd className="font-medium">
            {sources.ADMIN ?? 0}/{classified}
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-muted-foreground">Model: {status.data?.data.model ?? "—"}</p>
    </Card>
  );
}
