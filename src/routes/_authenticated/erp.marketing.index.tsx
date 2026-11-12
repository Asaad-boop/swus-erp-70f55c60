import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  Clock,
  RefreshCcw,
  Sun,
  Tag,
  Wallet,
  Unlink,
  Banknote,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useBrand } from "@/contexts/brand-context";
import { BrandTabs, MarketingPageHeader } from "@/components/erp/marketing/marketing-shell";
import { LadderInline, RoasLadder, bdt, fmtRoas } from "@/components/erp/marketing/roas-ladder";
import { getMarketingOverview } from "@/lib/erp/marketing/overview.functions";
import { syncSpendCapToWallet } from "@/lib/erp/marketing/meta.functions";
import { getAlerts, type MktAlert } from "@/lib/erp/marketing/alerts.functions";
import {
  getAttributionHealth,
  getCampaignTruth,
  getMetaSpendSummary,
  type CampaignTruthRow,
} from "@/lib/erp/marketing/campaigns.functions";
import { getDailyLadder } from "@/lib/erp/marketing/daily-ladder.functions";
import {
  DECISION_META,
  addDays,
  buildLadder,
  campaignDecision,
  daysBetween,
  dhakaDate,
  expectedDeliveredRoas,
  portfolioBreakeven,
  sumTotals,
  totalsFromRow,
  type Decision,
} from "@/lib/erp/marketing/roas-ladder";

const PERIODS = ["today", "yesterday", "7d", "30d"] as const;
type Period = (typeof PERIODS)[number];

const PERIOD_LABEL: Record<Period, string> = {
  today: "আজ",
  yesterday: "গতকাল",
  "7d": "৭ দিন",
  "30d": "৩০ দিন",
};

const searchSchema = z.object({
  brand: fallback(z.string(), "all").default("all"),
  period: fallback(z.enum(PERIODS), "today").default("today"),
});

export const Route = createFileRoute("/_authenticated/erp/marketing/")({
  head: () => ({
    meta: [
      { title: "Marketing Today — Marketing ERP" },
      {
        name: "description",
        content:
          "Daily marketing view: Meta, Booked, Confirmed and Delivered ROAS, campaign decisions and what needs attention today.",
      },
    ],
  }),
  validateSearch: zodValidator(searchSchema),
  component: MarketingToday,
});

/** Period window + the equal-length window right before it (for deltas). */
function windows(period: Period) {
  const today = dhakaDate(0);
  const cur =
    period === "today"
      ? { from: today, to: today }
      : period === "yesterday"
        ? { from: addDays(today, -1), to: addDays(today, -1) }
        : { from: addDays(today, period === "7d" ? -6 : -29), to: today };
  const len = daysBetween(cur.from, cur.to);
  const prev = { from: addDays(cur.from, -len), to: addDays(cur.from, -1) };
  // Trend: at least the last 7 days, up to the selected window
  const trend = len >= 7 ? cur : { from: addDays(cur.to, -6), to: cur.to };
  // Matured window to learn delivery success (parcels from 8–37 days ago are settled)
  const matured = { from: addDays(today, -37), to: addDays(today, -8) };
  const prevLabel =
    period === "today"
      ? "গতকাল (পুরো দিন)"
      : period === "yesterday"
        ? "আগের দিন"
        : `আগের ${len} দিন`;
  return { cur, prev, trend, matured, prevLabel };
}

function agoLabel(iso: string | null | undefined) {
  if (!iso) return null;
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  const text =
    mins < 1 ? "এইমাত্র" : mins < 60 ? `${mins} মিনিট আগে` : `${Math.round(mins / 60)} ঘণ্টা আগে`;
  return { text, stale: mins > 120 };
}

function MarketingToday() {
  const { brand, period } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { brands } = useBrand();

  const selection = useMemo(() => {
    const all = { key: "all", label: "All Brands", ids: brands.map((b) => b.id) };
    if (brand === "all") return all;
    const b = brands.find((x) => x.slug === brand || x.id === brand);
    return b ? { key: b.slug, label: b.name, ids: [b.id] } : all;
  }, [brand, brands]);
  const ids = selection.ids;
  const idKey = ids.slice().sort().join(",");
  const enabled = ids.length > 0;

  const w = useMemo(() => windows(period), [period]);
  const setSearch = (patch: Partial<{ brand: string; period: Period }>) =>
    navigate({ search: (prev: any) => ({ ...prev, ...patch }), replace: true });

  const fetchTruth = useServerFn(getCampaignTruth);
  const fetchDaily = useServerFn(getDailyLadder);
  const fetchSpend = useServerFn(getMetaSpendSummary);

  const live = period === "today";
  const curQ = useQuery({
    queryKey: ["mkt-truth", idKey, w.cur.from, w.cur.to],
    queryFn: () => fetchTruth({ data: { brandIds: ids, ...w.cur } }),
    enabled,
    staleTime: 60_000,
    refetchInterval: live ? 5 * 60_000 : false,
  });
  const prevQ = useQuery({
    queryKey: ["mkt-truth", idKey, w.prev.from, w.prev.to],
    queryFn: () => fetchTruth({ data: { brandIds: ids, ...w.prev } }),
    enabled,
    staleTime: 5 * 60_000,
  });
  const maturedQ = useQuery({
    queryKey: ["mkt-truth", idKey, w.matured.from, w.matured.to],
    queryFn: () => fetchTruth({ data: { brandIds: ids, ...w.matured } }),
    enabled,
    staleTime: 30 * 60_000,
  });
  const dailyQ = useQuery({
    queryKey: ["mkt-daily-ladder", idKey, w.trend.from, w.trend.to],
    queryFn: () => fetchDaily({ data: { brandIds: ids, ...w.trend } }),
    enabled,
    staleTime: 5 * 60_000,
  });
  const syncQ = useQuery({
    queryKey: ["mkt-sync-status", idKey, w.cur.to],
    queryFn: () => fetchSpend({ data: { brandIds: ids, from: w.cur.to, to: w.cur.to } }),
    enabled,
    staleTime: 60_000,
  });

  const rows = useMemo(() => curQ.data ?? [], [curQ.data]);
  const activeRows = useMemo(
    () =>
      rows
        .filter((r) => (r.spend || 0) > 0 || (r.booked_order_count || 0) > 0)
        .sort((a, b) => (b.spend || 0) - (a.spend || 0)),
    [rows],
  );
  const curTotals = useMemo(() => sumTotals(rows), [rows]);
  const ladder = useMemo(
    () => (curQ.data ? buildLadder(curTotals) : undefined),
    [curQ.data, curTotals],
  );
  const prevLadder = useMemo(
    () => (prevQ.data ? buildLadder(sumTotals(prevQ.data)) : undefined),
    [prevQ.data],
  );
  const successRate = useMemo(
    () => (maturedQ.data ? buildLadder(sumTotals(maturedQ.data)).deliverySuccess : null),
    [maturedQ.data],
  );
  const breakeven = useMemo(
    () => portfolioBreakeven(maturedQ.data && maturedQ.data.length ? maturedQ.data : rows),
    [maturedQ.data, rows],
  );
  const expected = useMemo(
    () => expectedDeliveredRoas(curTotals, successRate),
    [curTotals, successRate],
  );

  const sync = agoLabel(syncQ.data?.last_sync_at ?? syncQ.data?.last_insight_at ?? null);
  const fetching = curQ.isFetching || dailyQ.isFetching;

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-4 md:p-6">
      <MarketingPageHeader
        icon={Sun}
        title="Today"
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-x-2">
            <span>
              {selection.label} ·{" "}
              {w.cur.from === w.cur.to ? w.cur.from : `${w.cur.from} → ${w.cur.to}`}
            </span>
            {sync && (
              <span
                className={cn("inline-flex items-center gap-1", sync.stale && "text-amber-600")}
              >
                <Clock className="h-3 w-3" /> Meta sync {sync.text}
              </span>
            )}
          </span>
        }
        actions={
          <>
            <BrandTabs value={selection.key} onChange={(slug) => setSearch({ brand: slug })} />
            <div className="inline-flex items-center rounded-md border bg-background p-0.5">
              {PERIODS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setSearch({ period: p })}
                  className={cn(
                    "h-7 rounded px-3 text-xs font-medium transition",
                    period === p
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {PERIOD_LABEL[p]}
                </button>
              ))}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void curQ.refetch();
                void dailyQ.refetch();
                void syncQ.refetch();
              }}
              disabled={fetching}
            >
              <RefreshCcw className={cn("mr-1.5 h-3.5 w-3.5", fetching && "animate-spin")} />
              Refresh
            </Button>
          </>
        }
      />

      <NeedsAttention brandIds={ids} range={w.cur} />

      <section className="space-y-2">
        <SectionTitle
          title="ROAS ladder"
          sub="Meta যা দাবি করে → ERP তে যা book হলো → confirm হলো → deliver হলো"
        />
        <RoasLadder
          loading={curQ.isLoading}
          ladder={ladder}
          prev={prevLadder}
          expectedDelivered={expected}
          breakeven={breakeven}
          compareLabel={w.prevLabel}
        />
        {curQ.data && <CashLine totals={curTotals} period={period} />}
      </section>

      <DailyTrend
        loading={dailyQ.isLoading}
        rows={dailyQ.data}
        breakeven={breakeven}
        error={dailyQ.error}
      />

      <CampaignDecisions loading={curQ.isLoading} rows={activeRows} successRate={successRate} />

      {curQ.error && (
        <div className="rounded-lg border border-destructive/40 px-3 py-2 text-sm text-destructive">
          ডেটা load হয়নি: {(curQ.error as Error).message}
        </div>
      )}
    </div>
  );
}

function SectionTitle({
  title,
  sub,
  right,
}: {
  title: string;
  sub?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2 px-1">
      <div>
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

/** Cash truth line: what actually came back from the courier, and profit after everything. */
function CashLine({ totals, period }: { totals: ReturnType<typeof sumTotals>; period: Period }) {
  const recent = period === "today" || period === "yesterday";
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg border border-dashed px-3 py-2 text-xs">
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <Banknote className="h-3.5 w-3.5" /> Cash truth
      </span>
      <span>
        Courier থেকে পাওয়া{" "}
        <b className="tabular-nums">
          {totals.collected === null ? "settle হয়নি" : bdt(totals.collected)}
        </b>
      </span>
      <span>
        আসল লাভ (সব খরচ বাদে){" "}
        <b
          className={cn(
            "tabular-nums",
            totals.realized_profit === null
              ? ""
              : totals.realized_profit >= 0
                ? "text-emerald-600"
                : "text-rose-600",
          )}
        >
          {totals.realized_profit === null ? "settle হয়নি" : bdt(totals.realized_profit)}
        </b>
      </span>
      {recent && (
        <span className="text-[11px] text-muted-foreground">
          COD settle হতে কয়েকদিন লাগে, আসল লাভ দেখতে ৩০ দিন ভিউ দেখো।
        </span>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Needs attention — only shows problems, nothing when all is fine  */
/* ---------------------------------------------------------------- */

function NeedsAttention({
  brandIds,
  range,
}: {
  brandIds: string[];
  range: { from: string; to: string };
}) {
  const today = dhakaDate(0);
  const fetchOverview = useServerFn(getMarketingOverview);
  const fetchAlerts = useServerFn(getAlerts);
  const fetchHealth = useServerFn(getAttributionHealth);
  const syncCap = useServerFn(syncSpendCapToWallet);
  const key = brandIds.slice().sort().join(",");
  const enabled = brandIds.length > 0;

  const ov = useQuery({
    queryKey: ["mkt-overview", key, today],
    queryFn: () => fetchOverview({ data: { brandIds, today } }),
    enabled,
    staleTime: 60_000,
  });
  const alerts = useQuery({
    queryKey: ["mkt-alerts-strip", key],
    queryFn: () => fetchAlerts({ data: { brandIds, status: "open" as const } }),
    enabled,
    staleTime: 60_000,
  });
  const health = useQuery({
    queryKey: ["mkt-attribution-health", key, range.from, range.to],
    queryFn: () => fetchHealth({ data: { brandIds, ...range } }),
    enabled,
    staleTime: 60_000,
  });
  const cap = useMutation({
    mutationFn: () => syncCap({ data: { brandIds } }),
    onSuccess: (r: any) => {
      for (const it of r?.updated ?? [])
        toast.success(`${it.name}: cap $${Number(it.new_spend_cap_usd).toFixed(2)}`);
      for (const it of r?.skipped ?? []) toast.warning(`${it.name}: ${it.reason}`);
      void ov.refetch();
    },
    onError: (e: any) => toast.error(e?.message ?? "Spend cap sync fail"),
  });

  if (ov.isLoading) return <Skeleton className="h-10 rounded-lg" />;
  const a = ov.data?.actions;
  const open = (alerts.data ?? []) as MktAlert[];
  const high = open.filter((x) => x.severity === "high").length;
  const h = health.data;

  const items: {
    icon: React.ReactNode;
    text: string;
    to?: string;
    action?: React.ReactNode;
    tone: "warn" | "bad" | "info";
  }[] = [];
  if (a && a.active_accounts > 0 && a.stale_accounts > 0)
    items.push({
      icon: <Clock className="h-3.5 w-3.5" />,
      text: `${a.stale_accounts}/${a.active_accounts} ad account এর sync ২ ঘণ্টার বেশি পুরনো`,
      to: "/erp/marketing/settings",
      tone: "warn",
    });
  if (a && a.active_accounts === 0)
    items.push({
      icon: <Clock className="h-3.5 w-3.5" />,
      text: "কোনো ad account connect করা নেই",
      to: "/erp/marketing/settings",
      tone: "bad",
    });
  if (a && a.wallet_usd < 50 && a.active_accounts > 0)
    items.push({
      icon: <Wallet className="h-3.5 w-3.5" />,
      text: `Ad wallet কম: $${a.wallet_usd.toFixed(2)}`,
      tone: "bad",
      action: (
        <button
          type="button"
          className="underline underline-offset-2"
          onClick={() => cap.mutate()}
          disabled={cap.isPending}
        >
          {cap.isPending ? "Sync হচ্ছে…" : "Spend cap sync"}
        </button>
      ),
    });
  if (high > 0 || open.length > 0)
    items.push({
      icon: <BellRing className="h-3.5 w-3.5" />,
      text: `${open.length} টা open alert${high ? ` (${high} critical)` : ""}: ${open[0]?.title ?? ""}`,
      to: "/erp/marketing/alerts",
      tone: high ? "bad" : "warn",
    });
  if (h && h.total_orders > 0 && h.coverage_pct !== null && h.coverage_pct < 85)
    items.push({
      icon: <Unlink className="h-3.5 w-3.5" />,
      text: `${h.unattributed_orders} order কোনো campaign এ match হয়নি (match ${h.coverage_pct}%)`,
      to: "/erp/marketing/attribution",
      tone: "warn",
    });
  if (a && a.pending_attribution > 0)
    items.push({
      icon: <Tag className="h-3.5 w-3.5" />,
      text: `${a.pending_attribution} attribution review বাকি`,
      to: "/erp/marketing/attribution",
      tone: "info",
    });
  if (a && a.unassigned_campaigns > 0)
    items.push({
      icon: <AlertTriangle className="h-3.5 w-3.5" />,
      text: `${a.unassigned_campaigns} campaign কোনো brand এ assign করা নেই`,
      to: "/erp/marketing/settings",
      tone: "warn",
    });

  if (items.length === 0) return null;
  const toneCls = {
    bad: "border-rose-500/30 bg-rose-500/[0.06] text-rose-700 dark:text-rose-300",
    warn: "border-amber-500/30 bg-amber-500/[0.06] text-amber-800 dark:text-amber-300",
    info: "border-sky-500/30 bg-sky-500/[0.06] text-sky-800 dark:text-sky-300",
  } as const;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it, i) => {
        const body = (
          <>
            {it.icon}
            <span>{it.text}</span>
            {it.action}
            {it.to && <ArrowRight className="h-3 w-3 opacity-60" />}
          </>
        );
        const cls = cn(
          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs",
          toneCls[it.tone],
        );
        return it.to ? (
          <Link key={i} to={it.to} className={cn(cls, "hover:opacity-80")}>
            {body}
          </Link>
        ) : (
          <div key={i} className={cls}>
            {body}
          </div>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Daily trend                                                       */
/* ---------------------------------------------------------------- */

type DailyRows = Awaited<ReturnType<typeof getDailyLadder>>;

function DailyTrend({
  loading,
  rows,
  breakeven,
  error,
}: {
  loading: boolean;
  rows?: DailyRows;
  breakeven: number | null;
  error: unknown;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const data = useMemo(
    () =>
      (rows ?? []).map((r) => {
        const l = buildLadder(r);
        return {
          day: r.day,
          label: r.day.slice(5),
          spend: r.spend,
          meta: l.stages[0].roas || null,
          booked: l.stages[1].roas || null,
          confirmed: l.stages[2].roas || null,
          delivered: l.stages[3].roas || null,
          ladder: l,
          r,
        };
      }),
    [rows],
  );
  return (
    <section className="space-y-2">
      <SectionTitle
        title="দিন অনুযায়ী"
        sub="প্রতিদিন যে order এসেছে সেগুলোর আজকের অবস্থা। সাম্প্রতিক দিনে Delivered কম থাকবে, কারণ parcel এখনো পথে।"
        right={
          <div className="inline-flex rounded-md border p-0.5 text-[11px]">
            {(["chart", "table"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={cn(
                  "rounded px-2 py-0.5",
                  view === v ? "bg-muted font-medium" : "text-muted-foreground",
                )}
              >
                {v === "chart" ? "Chart" : "Table"}
              </button>
            ))}
          </div>
        }
      />
      <div className="rounded-lg border bg-card p-3">
        {loading ? (
          <Skeleton className="h-[220px] w-full" />
        ) : error ? (
          <p className="text-xs text-destructive">Trend load হয়নি: {(error as Error).message}</p>
        ) : data.length === 0 ? (
          <p className="text-xs text-muted-foreground">এই সময়ে কোনো ডেটা নেই।</p>
        ) : view === "chart" ? (
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" />
                <YAxis
                  tick={{ fontSize: 10 }}
                  stroke="var(--muted-foreground)"
                  tickFormatter={(v) => `${v}x`}
                />
                <ChartTooltip
                  contentStyle={{ fontSize: 11, borderRadius: 8 }}
                  formatter={(v: any, name: any) => [fmtRoas(Number(v)), name]}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {breakeven ? (
                  <ReferenceLine
                    y={breakeven}
                    stroke="var(--muted-foreground)"
                    strokeDasharray="4 4"
                    label={{ value: "Breakeven", fontSize: 10, position: "insideTopRight" }}
                  />
                ) : null}
                <Line
                  type="monotone"
                  dataKey="meta"
                  name="Meta"
                  stroke="#94a3b8"
                  strokeDasharray="3 3"
                  dot={false}
                  strokeWidth={1.5}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="booked"
                  name="Booked"
                  stroke="#60a5fa"
                  dot={false}
                  strokeWidth={1.5}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="confirmed"
                  name="Confirmed"
                  stroke="#f59e0b"
                  dot={false}
                  strokeWidth={1.5}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="delivered"
                  name="Delivered"
                  stroke="#10b981"
                  dot={{ r: 2 }}
                  strokeWidth={2.5}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase tracking-wide text-muted-foreground">
                <tr className="border-b">
                  <th className="py-1.5 text-left font-medium">দিন</th>
                  <th className="py-1.5 text-right font-medium">Spend</th>
                  <th className="py-1.5 text-right font-medium">Booked</th>
                  <th className="py-1.5 text-right font-medium">Confirmed</th>
                  <th className="py-1.5 text-right font-medium">Delivered</th>
                  <th className="py-1.5 text-right font-medium">পথে</th>
                  <th className="py-1.5 text-right font-medium">Meta › Booked › Conf › Deliv</th>
                </tr>
              </thead>
              <tbody>
                {data
                  .slice()
                  .reverse()
                  .map((d) => (
                    <tr key={d.day} className="border-b last:border-0">
                      <td className="py-1.5 tabular-nums">{d.day}</td>
                      <td className="py-1.5 text-right tabular-nums">{bdt(d.spend)}</td>
                      <td className="py-1.5 text-right tabular-nums">{d.r.booked_count}</td>
                      <td className="py-1.5 text-right tabular-nums">{d.r.confirmed_count}</td>
                      <td className="py-1.5 text-right tabular-nums">{d.r.delivered_count}</td>
                      <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                        {d.ladder.pipelineCount}
                      </td>
                      <td className="py-1.5 text-right">
                        <LadderInline ladder={d.ladder} breakeven={breakeven} />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- */
/* Campaign decisions                                                */
/* ---------------------------------------------------------------- */

const DECISION_FILTERS: {
  key: "all" | "act" | "scale" | "early";
  label: string;
  match: (d: Decision) => boolean;
}[] = [
  { key: "all", label: "সব", match: () => true },
  {
    key: "act",
    label: "Action লাগবে",
    match: (d) => d === "pause" || d === "early_weak" || d === "watch",
  },
  {
    key: "scale",
    label: "Scale করা যায়",
    match: (d) => d === "scale" || d === "keep" || d === "early_good",
  },
  { key: "early", label: "এখনো আগে", match: (d) => d === "early_good" || d === "early_weak" },
];

const toneBadge = {
  good: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  ok: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  warn: "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  bad: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  muted: "border-border bg-muted text-muted-foreground",
} as const;

function CampaignDecisions({
  loading,
  rows,
  successRate,
}: {
  loading: boolean;
  rows: CampaignTruthRow[];
  successRate: number | null;
}) {
  const [filter, setFilter] = useState<(typeof DECISION_FILTERS)[number]["key"]>("all");
  const [showAll, setShowAll] = useState(false);
  const enriched = useMemo(
    () =>
      rows.map((r) => {
        const t = totalsFromRow(r);
        const ladder = buildLadder(t);
        const exp = expectedDeliveredRoas(t, successRate);
        return { r, ladder, exp, decision: campaignDecision(r, ladder, exp) };
      }),
    [rows, successRate],
  );
  const f = DECISION_FILTERS.find((x) => x.key === filter)!;
  const list = enriched.filter((e) => f.match(e.decision));
  const shown = showAll ? list : list.slice(0, 10);
  const counts = Object.fromEntries(
    DECISION_FILTERS.map((x) => [x.key, enriched.filter((e) => x.match(e.decision)).length]),
  );

  return (
    <section className="space-y-2">
      <SectionTitle
        title="Campaign সিদ্ধান্ত"
        sub="Settle হওয়া cash থাকলে সেটা দিয়ে, না থাকলে আনুমানিক Delivered ROAS বনাম breakeven দিয়ে"
        right={
          <div className="flex flex-wrap items-center gap-1">
            {DECISION_FILTERS.map((x) => (
              <button
                key={x.key}
                type="button"
                onClick={() => setFilter(x.key)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-[11px]",
                  filter === x.key
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                {x.label} <span className="tabular-nums opacity-70">{counts[x.key]}</span>
              </button>
            ))}
            <Link
              to="/erp/marketing/truth"
              className="ml-1 inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
            >
              Campaign workspace <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        }
      />
      <div className="overflow-x-auto rounded-lg border bg-card">
        {loading ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <p className="p-4 text-xs text-muted-foreground">এই filter এ কোনো campaign নেই।</p>
        ) : (
          <table className="w-full min-w-[760px] text-xs">
            <thead className="text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr className="border-b">
                <th className="px-3 py-2 text-left font-medium">Campaign</th>
                <th className="px-2 py-2 text-right font-medium">Spend</th>
                <th
                  className="px-2 py-2 text-right font-medium"
                  title="Booked / Confirmed / Delivered / Cancelled"
                >
                  Orders B · C · D · ✕
                </th>
                <th className="px-2 py-2 text-right font-medium">Meta › Booked › Conf › Deliv</th>
                <th
                  className="px-2 py-2 text-right font-medium"
                  title="আনুমানিক Delivered ROAS (পথে থাকা order সহ)"
                >
                  ≈ Deliv
                </th>
                <th className="px-2 py-2 text-right font-medium">B/E</th>
                <th className="px-3 py-2 text-left font-medium">সিদ্ধান্ত</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(({ r, ladder, exp, decision }) => {
                const dm = DECISION_META[decision];
                return (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="max-w-[280px] px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "h-1.5 w-1.5 shrink-0 rounded-full",
                            r.is_live ? "bg-emerald-500" : "bg-muted-foreground/40",
                          )}
                          title={r.is_live ? "Live" : r.status}
                        />
                        <span className="truncate font-medium" title={r.name}>
                          {r.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{bdt(r.spend)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {r.booked_order_count} · {r.confirmed_count} · <b>{r.delivered_count}</b> ·{" "}
                      <span className="text-muted-foreground">{r.cancelled_count}</span>
                    </td>
                    <td className="px-2 py-2 text-right">
                      <LadderInline ladder={ladder} breakeven={r.breakeven_roas} />
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                      {fmtRoas(exp)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                      {fmtRoas(r.breakeven_roas)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium",
                          toneBadge[dm.tone],
                        )}
                        title={dm.hint}
                      >
                        {dm.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {list.length > 10 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="px-1 text-[11px] text-primary hover:underline"
        >
          {showAll ? "কম দেখাও" : `আরো ${list.length - 10} টা দেখাও`}
        </button>
      )}
    </section>
  );
}
