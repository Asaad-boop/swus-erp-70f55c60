import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  Lightbulb,
  Loader2,
  Minus,
  Plus,
  Target,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useBrand } from "@/contexts/brand-context";
import { GrowthHeader, InsufficientData, useGrowthRange } from "@/components/erp/growth/growth-filters";
import {
  getCommandCenter,
  listActionTasks,
  createActionTask,
  completeActionTask,
  type CommandCenter,
} from "@/lib/erp/growth/command.functions";
import type { GrowthAlert } from "@/lib/erp/growth/growth-intel.server";

export const Route = createFileRoute("/_authenticated/erp/growth/")({
  component: CommandCenterPage,
});

const bdt = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : `৳${Math.round(n).toLocaleString("en-BD")}`;
const numFmt = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : Math.round(n).toLocaleString("en-BD");

function Delta({ cur, prev, invert }: { cur: number | null; prev: number | null; invert?: boolean }) {
  if (cur === null || prev === null || prev === 0) return <span className="text-[11px] text-muted-foreground">no comparison</span>;
  const d = ((cur - prev) / Math.abs(prev)) * 100;
  const good = invert ? d < 0 : d > 0;
  const Icon = d === 0 ? Minus : d > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${
        d === 0 ? "text-muted-foreground" : good ? "text-emerald-600" : "text-rose-600"
      }`}
    >
      <Icon className="h-3 w-3" />
      {Math.abs(d).toFixed(1)}%
    </span>
  );
}

function Kpi({
  label,
  value,
  cur,
  prev,
  invert,
}: {
  label: string;
  value: string;
  cur: number | null;
  prev: number | null;
  invert?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-lg font-semibold tabular-nums">{value}</p>
      <Delta cur={cur} prev={prev} invert={invert} />
    </div>
  );
}

function AlertCard({ a, onTask }: { a: GrowthAlert; onTask: (a: GrowthAlert) => void }) {
  const tone =
    a.severity === "critical"
      ? "border-rose-500/40 bg-rose-500/5"
      : a.severity === "warning"
        ? "border-amber-500/40 bg-amber-500/5"
        : a.severity === "success"
          ? "border-emerald-500/40 bg-emerald-500/5"
          : "border-border bg-card";
  return (
    <div className={`rounded-lg border p-3 ${tone}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold leading-snug">{a.title}</p>
        <Badge variant="outline" className="shrink-0 text-[10px] uppercase">
          {a.severity}
        </Badge>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{a.problem}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Why: </span>
        {a.why}
      </p>
      <p className="mt-1 text-xs">
        <span className="font-medium">Do: </span>
        {a.recommended_action}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {a.supporting_metrics.map((m) => (
          <span key={m.label} className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {m.label}: <span className="font-medium text-foreground">{m.value}</span>
          </span>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onTask(a)}>
          <Plus className="mr-1 h-3 w-3" /> Create task
        </Button>
        {a.route && (
          <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
            <Link to={a.route}>
              Investigate <ChevronRight className="ml-0.5 h-3 w-3" />
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}

function CommandCenterPage() {
  const { brandIds, activeBrand, isAllBrands, isLoading: loading } = useBrand();
  const { range, setRange } = useGrowthRange();
  const qc = useQueryClient();
  const fetchCC = useServerFn(getCommandCenter);
  const fetchTasks = useServerFn(listActionTasks);
  const addTask = useServerFn(createActionTask);
  const doneTask = useServerFn(completeActionTask);
  const [scoreOpen, setScoreOpen] = React.useState(false);

  const enabled = !loading && brandIds.length > 0;
  const key = [brandIds, range.from, range.to];

  const cc = useQuery<CommandCenter>({
    queryKey: ["growth-command", ...key],
    enabled,
    queryFn: () => fetchCC({ data: { brandIds, from: range.from, to: range.to } }),
  });

  const tasks = useQuery({
    queryKey: ["growth-actions", brandIds],
    enabled,
    queryFn: () => fetchTasks({ data: { brandIds } }),
  });

  const createFromAlert = useMutation({
    mutationFn: (a: GrowthAlert) =>
      addTask({
        data: {
          brandId: activeBrand?.id ?? brandIds[0]!,
          title: a.title,
          details: `${a.problem}\n\nWhy: ${a.why}\n\nAction: ${a.recommended_action}`,
          priority: a.severity === "critical" ? "urgent" : "high",
          linkLabel: a.type,
        },
      }),
    onSuccess: () => {
      toast.success("Task added to the board");
      qc.invalidateQueries({ queryKey: ["growth-actions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const complete = useMutation({
    mutationFn: (id: string) => doneTask({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["growth-actions"] }),
  });

  const d = cc.data;
  const problems = (d?.alerts ?? []).filter((a) => a.kind === "problem");
  const opportunities = (d?.alerts ?? []).filter((a) => a.kind === "opportunity");

  return (
    <div className="pb-16">
      <GrowthHeader
        title="Command Center"
        subtitle={d ? `${d.period.from} → ${d.period.to} vs ${d.period.prevFrom} → ${d.period.prevTo}` : "Loading period"}
        range={range}
        onRangeChange={setRange}
      />

      {cc.isLoading && (
        <div className="flex items-center gap-2 px-6 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading canonical growth data…
        </div>
      )}
      {cc.isError && (
        <div className="px-6 py-10 text-sm text-rose-600">Could not load: {(cc.error as Error).message}</div>
      )}

      {d && (
        <div className="mx-auto max-w-[1500px] space-y-5 px-4 py-5 md:px-6">
          {/* KPI STRIP */}
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 xl:grid-cols-8">
            <Kpi label="Revenue" value={bdt(d.current.revenue)} cur={d.current.revenue} prev={d.previous.revenue} />
            <Kpi label="Orders" value={numFmt(d.current.orders)} cur={d.current.orders} prev={d.previous.orders} />
            <Kpi label="Profit" value={bdt(d.current.profit)} cur={d.current.profit} prev={d.previous.profit} />
            <Kpi label="Ad spend" value={bdt(d.current.ad_spend)} cur={d.current.ad_spend} prev={d.previous.ad_spend} invert />
            <Kpi label="CPA" value={d.current.cpa === null ? "—" : bdt(d.current.cpa)} cur={d.current.cpa} prev={d.previous.cpa} invert />
            <Kpi
              label="ROAS"
              value={d.current.roas === null ? "—" : `${d.current.roas.toFixed(2)}x`}
              cur={d.current.roas}
              prev={d.previous.roas}
            />
            <Kpi label="AOV" value={d.current.aov === null ? "—" : bdt(d.current.aov)} cur={d.current.aov} prev={d.previous.aov} />
            <Kpi
              label="Conv. rate"
              value={d.current.cvr === null ? "—" : `${d.current.cvr.toFixed(2)}%`}
              cur={d.current.cvr}
              prev={d.previous.cvr}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {/* GOAL */}
            <Card className="shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Target className="h-4 w-4" /> Monthly goal
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!d.goal ? (
                  <InsufficientData note="No revenue goal set for this month. Set one in Goals & Plan." />
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-baseline justify-between">
                      <span className="font-display text-2xl font-semibold tabular-nums">{bdt(d.goal.achieved)}</span>
                      <span className="text-xs text-muted-foreground">of {bdt(d.goal.target)}</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${Math.min(100, (d.goal.achieved / d.goal.target) * 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Forecast at current pace: <span className="font-medium text-foreground">{bdt(d.goal.expected)}</span>
                      {d.goal.pacePct !== null && ` (${d.goal.pacePct.toFixed(0)}% of target)`}
                    </p>
                    <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                      <Link to="/erp/growth/goals">Manage goals</Link>
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* GROWTH SCORE */}
            <Card className="shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Growth score</CardTitle>
              </CardHeader>
              <CardContent>
                {d.score.score === null ? (
                  <InsufficientData note="Not enough comparable data in this period." />
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-baseline gap-2">
                      <span className="font-display text-3xl font-semibold tabular-nums">{d.score.score}</span>
                      <span className="text-xs text-muted-foreground">/ 100 · {d.score.grade}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Strongest: <span className="font-medium text-foreground">{d.score.strength?.label}</span> ·
                      Weakest: <span className="font-medium text-foreground">{d.score.weakness?.label}</span>
                    </p>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setScoreOpen(true)}>
                      How is this calculated?
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* WINNERS */}
            <Card className="shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">What is working</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {d.products.length === 0 && d.campaigns.length === 0 ? (
                  <InsufficientData note="No delivered sales in this period." />
                ) : (
                  <>
                    {d.products[0] && (
                      <div className="rounded-md border border-border p-2">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Top product</p>
                        <p className="truncate text-sm font-medium">{d.products[0].title}</p>
                        <p className="text-xs text-muted-foreground">
                          {bdt(d.products[0].gross_profit)} profit · {d.products[0].delivered_units} units
                        </p>
                      </div>
                    )}
                    {d.campaigns[0] && (
                      <div className="rounded-md border border-border p-2">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Top campaign</p>
                        <p className="truncate text-sm font-medium">{d.campaigns[0].name}</p>
                        <p className="text-xs text-muted-foreground">
                          {bdt(d.campaigns[0].gross_profit)} profit · {bdt(d.campaigns[0].spend)} spend
                        </p>
                      </div>
                    )}
                    {d.content.filter((c) => c.attributed_orders > 0)[0] && (
                      <div className="rounded-md border border-border p-2">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Top content</p>
                        <p className="truncate text-sm font-medium">
                          {d.content.filter((c) => c.attributed_orders > 0)[0]!.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {d.content.filter((c) => c.attributed_orders > 0)[0]!.attributed_orders} attributed orders
                        </p>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* PROBLEMS + OPPORTUNITIES */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <AlertTriangle className="h-4 w-4 text-amber-500" /> What is going wrong ({problems.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {problems.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                    No problem detected against the previous period.
                  </div>
                ) : (
                  problems.map((a) => <AlertCard key={a.id} a={a} onTask={(x) => createFromAlert.mutate(x)} />)
                )}
              </CardContent>
            </Card>

            <Card className="shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Lightbulb className="h-4 w-4 text-emerald-500" /> Opportunities ({opportunities.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {opportunities.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                    No scalable winner found in this period.
                  </div>
                ) : (
                  opportunities.map((a) => <AlertCard key={a.id} a={a} onTask={(x) => createFromAlert.mutate(x)} />)
                )}
              </CardContent>
            </Card>
          </div>

          {/* TODAY'S ACTIONS */}
          <Card className="shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Today&apos;s actions</CardTitle>
            </CardHeader>
            <CardContent>
              {tasks.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : (tasks.data ?? []).length === 0 ? (
                <InsufficientData note="No open task. Create one from a problem or opportunity above." />
              ) : (
                <ul className="divide-y divide-border">
                  {(tasks.data ?? []).map((t) => (
                    <li key={t.id} className="flex items-start gap-3 py-2">
                      <button
                        type="button"
                        onClick={() => complete.mutate(t.id)}
                        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border hover:bg-accent"
                        aria-label="Mark done"
                      >
                        <Check className="h-3 w-3 opacity-40" />
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{t.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {t.priority ?? "normal"}
                          {t.due_date ? ` · due ${t.due_date}` : ""}
                          {t.link_label ? ` · ${t.link_label}` : ""}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <p className="text-[11px] text-muted-foreground">
            All figures come from canonical ERP sources (mkt_dashboard_kpis, growth_day_pulse, get_sku_profit,
            get_campaign_profit) for {isAllBrands ? "all accessible brands" : (activeBrand?.name ?? "the active brand")}.
          </p>
        </div>
      )}

      <Dialog open={scoreOpen} onOpenChange={setScoreOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Growth score breakdown</DialogTitle>
            <DialogDescription>Weighted average of the components with sufficient data.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {(d?.score.components ?? []).map((c) => (
              <div key={c.key} className="rounded-md border border-border p-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{c.label}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {c.sufficient ? `${Math.round(c.score)} / 100 · weight ${c.weight}%` : "Insufficient data"}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{c.detail}</p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
