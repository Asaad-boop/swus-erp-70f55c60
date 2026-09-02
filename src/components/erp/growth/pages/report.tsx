import { useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { BarChart3, Clapperboard, CheckCircle2, Eye, Wallet, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBrand } from "@/contexts/brand-context";
import {
  ContentHero,
  KpiStrip,
  Kpi,
  Toolbar,
  Pill,
  MiniBar,
  EmptyState,
  LoadingGrid,
  ExportButton,
  downloadCsv,
  BrandTag,
  Segmented,
} from "@/components/erp/content/content-ui";
import {
  fetchItems,
  fetchPlans,
  bdt,
  ITEM_STATUSES,
  PIPELINE_STAGES,
  type ContentItem,
  type ContentPlan,
} from "@/lib/erp/content/content-data";
import { exportReportPdf } from "@/lib/erp/reports/export";
import { WeeklyScorecard } from "@/components/erp/growth/weekly-scorecard";
import { GrowthPageTabs, useTabParam, type PageTab } from "@/components/erp/growth/page-tabs";

const REPORT_TABS: PageTab[] = [
  { key: "scorecard", label: "Weekly Scorecard", icon: BarChart3 },
  { key: "content", label: "Brand Content Report", icon: Clapperboard },
];

export function ReportShell() {
  const tab = useTabParam(REPORT_TABS);
  return (
    <div>
      <div className="border-b border-border/50 bg-card/30 px-4 py-2.5 sm:px-6">
        <GrowthPageTabs base="/erp/growth/report" tabs={REPORT_TABS} active={tab} />
      </div>
      {tab === "content" ? (
        <BrandReport />
      ) : (
        <div className="mx-auto max-w-[1500px] p-3 md:p-6">
          <WeeklyScorecard />
        </div>
      )}
    </div>
  );
}

type Row = {
  brandId: string | null;
  brandName: string;
  total: number;
  published: number;
  approved: number;
  inProduction: number;
  rejected: number;
  target: number;
  plans: number;
  cost: number;
  views: number;
  orders: number;
  avgDaysToPublish: number | null;
  byStage: Record<string, number>;
  byStatus: Record<string, number>;
};

const IN_PROD = new Set(["briefed", "shooting", "editing", "submitted", "in_review"]);

function monthKey(d: string) {
  return d.slice(0, 7);
}

function BrandReport() {
  const { brandIds, brands, isLoading: brandLoading } = useBrand();
  const [range, setRange] = useState<"30" | "90" | "365" | "all">("90");

  const items = useQuery({
    queryKey: ["content-report-items", brandIds],
    queryFn: () => fetchItems(brandIds),
    enabled: brandIds.length > 0,
  });
  const plans = useQuery({
    queryKey: ["content-report-plans", brandIds],
    queryFn: () => fetchPlans(brandIds),
    enabled: brandIds.length > 0,
  });

  const loading = brandLoading || items.isLoading || plans.isLoading;

  const cutoff = useMemo(() => {
    if (range === "all") return 0;
    return Date.now() - Number(range) * 86400000;
  }, [range]);

  const scoped = useMemo(
    () => (items.data ?? []).filter((i) => new Date(i.created_at).getTime() >= cutoff),
    [items.data, cutoff],
  );
  const scopedPlans = useMemo(
    () => (plans.data ?? []).filter((p) => new Date(p.created_at).getTime() >= cutoff),
    [plans.data, cutoff],
  );

  const rows = useMemo(() => {
    const map = new Map<string, Row>();
    const nameOf = (id: string | null) =>
      id ? (brands.find((b) => b.id === id)?.name ?? "Unknown brand") : "No brand";
    const get = (id: string | null) => {
      const key = id ?? "__none__";
      let r = map.get(key);
      if (!r) {
        r = {
          brandId: id,
          brandName: nameOf(id),
          total: 0,
          published: 0,
          approved: 0,
          inProduction: 0,
          rejected: 0,
          target: 0,
          plans: 0,
          cost: 0,
          views: 0,
          orders: 0,
          avgDaysToPublish: null,
          byStage: {},
          byStatus: {},
        };
        map.set(key, r);
      }
      return r;
    };

    const lead = new Map<string, number[]>();
    for (const i of scoped as ContentItem[]) {
      const r = get(i.brand_id);
      r.total += 1;
      r.cost += Number(i.cost || 0);
      r.views += Number(i.views || 0);
      r.orders += Number(i.attributed_orders || 0);
      r.byStage[i.stage] = (r.byStage[i.stage] ?? 0) + 1;
      r.byStatus[i.status] = (r.byStatus[i.status] ?? 0) + 1;
      if (i.status === "published" || i.published_at) r.published += 1;
      else if (i.status === "approved") r.approved += 1;
      else if (i.status === "rejected") r.rejected += 1;
      else if (IN_PROD.has(i.status)) r.inProduction += 1;
      if (i.published_at) {
        const days =
          (new Date(i.published_at).getTime() - new Date(i.created_at).getTime()) / 86400000;
        if (Number.isFinite(days) && days >= 0) {
          const key = i.brand_id ?? "__none__";
          lead.set(key, [...(lead.get(key) ?? []), days]);
        }
      }
    }
    for (const p of scopedPlans as ContentPlan[]) {
      const r = get(p.brand_id);
      r.plans += 1;
      r.target += Number(p.target_count || 0);
    }
    for (const [key, arr] of lead) {
      const r = map.get(key);
      if (r && arr.length) r.avgDaysToPublish = arr.reduce((a, b) => a + b, 0) / arr.length;
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [scoped, scopedPlans, brands]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (a, r) => ({
          total: a.total + r.total,
          published: a.published + r.published,
          inProduction: a.inProduction + r.inProduction,
          approved: a.approved + r.approved,
          target: a.target + r.target,
          cost: a.cost + r.cost,
          views: a.views + r.views,
          orders: a.orders + r.orders,
        }),
        { total: 0, published: 0, inProduction: 0, approved: 0, target: 0, cost: 0, views: 0, orders: 0 },
      ),
    [rows],
  );

  // Monthly timeline of created vs published
  const timeline = useMemo(() => {
    const m = new Map<string, { created: number; published: number }>();
    for (const i of scoped) {
      const c = monthKey(i.created_at);
      const e = m.get(c) ?? { created: 0, published: 0 };
      e.created += 1;
      m.set(c, e);
      if (i.published_at) {
        const p = monthKey(i.published_at);
        const ep = m.get(p) ?? { created: 0, published: 0 };
        ep.published += 1;
        m.set(p, ep);
      }
    }
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(-12);
  }, [scoped]);

  const aoa = useMemo(() => {
    const head = [
      "Brand",
      "Plans",
      "Target videos",
      "Total videos",
      "Published",
      "Approved",
      "In production",
      "Rejected",
      "Progress %",
      "Avg days to publish",
      "Cost (BDT)",
      "Views",
      "Attributed orders",
    ];
    const body = rows.map((r) => [
      r.brandName,
      r.plans,
      r.target,
      r.total,
      r.published,
      r.approved,
      r.inProduction,
      r.rejected,
      r.target > 0 ? Math.round((r.published / r.target) * 100) : "",
      r.avgDaysToPublish == null ? "" : Number(r.avgDaysToPublish.toFixed(1)),
      Math.round(r.cost),
      r.views,
      r.orders,
    ]);
    return [head, ...body];
  }, [rows]);

  const rangeLabel =
    range === "all" ? "All time" : `Last ${range} days`;

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 px-3 py-4 sm:px-6">
      <ContentHero
        icon={BarChart3}
        title="Brand Content Report"
        subtitle="প্রতি brand-এর ভিডিও সংখ্যা, status breakdown, timeline progress আর exportable summary।"
        actions={
          <>
            <ExportButton
              onClick={() => downloadCsv(`brand-content-report-${range}.csv`, aoa)}
              label="CSV"
            />
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5"
              onClick={() =>
                exportReportPdf({
                  title: "Brand Content Report",
                  subtitle: "Content Studio — videos, status & timeline",
                  rangeLabel,
                  aoa,
                  kpis: [
                    { label: "Total videos", value: String(totals.total) },
                    { label: "Published", value: String(totals.published) },
                    { label: "In production", value: String(totals.inProduction) },
                    { label: "Content cost", value: bdt(totals.cost) },
                  ],
                  note: `${rows.length} brands · ${totals.total} videos`,
                })
              }
            >
              <Printer className="h-3.5 w-3.5" />
              PDF
            </Button>
          </>
        }
      >
        <Toolbar>
          <Segmented
            value={range}
            onChange={(v) => setRange(v)}
            options={[
              { key: "30", label: "30d" },
              { key: "90", label: "90d" },
              { key: "365", label: "1y" },
              { key: "all", label: "All" },
            ]}
          />
        </Toolbar>
      </ContentHero>

      <KpiStrip cols={6}>
        <Kpi label="Total videos" value={totals.total} icon={Clapperboard} />
        <Kpi
          label="Published"
          value={totals.published}
          tone="good"
          icon={CheckCircle2}
          progress={totals.total ? totals.published / totals.total : 0}
          hint={`${totals.total ? Math.round((totals.published / totals.total) * 100) : 0}% of all`}
        />
        <Kpi label="In production" value={totals.inProduction} tone="warn" />
        <Kpi
          label="Target coverage"
          value={totals.target ? `${Math.round((totals.published / totals.target) * 100)}%` : "—"}
          hint={`${totals.published}/${totals.target} planned`}
          tone="info"
          progress={totals.target ? totals.published / totals.target : 0}
        />
        <Kpi label="Content cost" value={bdt(totals.cost)} icon={Wallet} />
        <Kpi
          label="Views / orders"
          value={totals.views.toLocaleString()}
          hint={`${totals.orders} attributed orders`}
          icon={Eye}
        />
      </KpiStrip>

      {loading ? (
        <LoadingGrid rows={5} height={72} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="কোনো content data নেই"
          description="Pipeline-এ content যোগ করলে এখানে brand-wise report দেখাবে।"
        />
      ) : (
        <>
          {/* Brand cards */}
          <div className="grid gap-3 lg:grid-cols-2">
            {rows.map((r) => {
              const progress = r.target > 0 ? r.published / r.target : r.total ? r.published / r.total : 0;
              return (
                <div
                  key={r.brandId ?? "none"}
                  className="rounded-xl border border-border/70 bg-card p-3 shadow-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <BrandTag brandId={r.brandId} />
                      <span className="text-sm font-semibold">{r.total} videos</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Pill tone="good">{r.published} published</Pill>
                      <Pill tone="warn">{r.inProduction} in production</Pill>
                      {r.rejected > 0 && <Pill tone="bad">{r.rejected} rejected</Pill>}
                    </div>
                  </div>

                  <div className="mt-2.5">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>
                        Timeline progress · {r.plans} plans, target {r.target || "—"}
                      </span>
                      <span className="tabular-nums">{Math.round(progress * 100)}%</span>
                    </div>
                    <MiniBar value={progress * 100} max={100} tone="good" className="mt-1" />
                  </div>

                  {/* Stage funnel */}
                  <div className="mt-3 grid grid-cols-5 gap-1.5">
                    {PIPELINE_STAGES.map((s) => {
                      const n = r.byStage[s.key] ?? 0;
                      return (
                        <div
                          key={s.key}
                          className="rounded-lg border border-border/60 bg-muted/30 px-2 py-1.5 text-center"
                        >
                          <p className="text-sm font-bold tabular-nums">{n}</p>
                          <p className="truncate text-[9px] uppercase tracking-wide text-muted-foreground">
                            {s.label}
                          </p>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    {ITEM_STATUSES.filter((s) => (r.byStatus[s.key] ?? 0) > 0).map((s) => (
                      <Pill key={s.key}>
                        {s.label} · {r.byStatus[s.key]}
                      </Pill>
                    ))}
                  </div>

                  <div className="mt-2.5 grid grid-cols-4 gap-2 border-t border-border/60 pt-2 text-center">
                    <Stat label="Cost" value={bdt(r.cost)} />
                    <Stat label="Views" value={r.views.toLocaleString()} />
                    <Stat label="Orders" value={String(r.orders)} />
                    <Stat
                      label="Avg publish"
                      value={r.avgDaysToPublish == null ? "—" : `${r.avgDaysToPublish.toFixed(1)}d`}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Monthly timeline */}
          {timeline.length > 0 && (
            <div className="rounded-xl border border-border/70 bg-card p-3 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Monthly timeline — created vs published
              </p>
              <div className="mt-3 flex items-end gap-2 overflow-x-auto pb-1">
                {timeline.map(([m, v]) => {
                  const max = Math.max(...timeline.map(([, t]) => Math.max(t.created, t.published)), 1);
                  return (
                    <div key={m} className="flex min-w-[52px] flex-1 flex-col items-center gap-1">
                      <div className="flex h-24 w-full items-end justify-center gap-1">
                        <div
                          className="w-3 rounded-t bg-primary/60"
                          style={{ height: `${(v.created / max) * 100}%` }}
                          title={`${v.created} created`}
                        />
                        <div
                          className="w-3 rounded-t bg-emerald-500"
                          style={{ height: `${(v.published / max) * 100}%` }}
                          title={`${v.published} published`}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground">{m.slice(2)}</span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-primary/60" /> Created
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-emerald-500" /> Published
                </span>
              </div>
            </div>
          )}

          {/* Summary table */}
          <div className="overflow-x-auto rounded-xl border border-border/70 bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  {aoa[0].map((h) => (
                    <th key={String(h)} className="whitespace-nowrap px-3 py-2 text-left font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {aoa.slice(1).map((r, idx) => (
                  <tr key={idx} className="border-t border-border/60">
                    {r.map((c, ci) => (
                      <td
                        key={ci}
                        className={`whitespace-nowrap px-3 py-1.5 ${ci === 0 ? "font-medium" : "tabular-nums text-muted-foreground"}`}
                      >
                        {c === "" || c == null ? "—" : String(c)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-xs font-semibold tabular-nums">{value}</p>
    </div>
  );
}
