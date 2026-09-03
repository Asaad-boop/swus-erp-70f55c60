import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  RefreshCcw,
  Download,
  Search,
  Wand2,
  TrendingUp,
  TrendingDown,
  ChevronRight,
  AlertTriangle,
  SlidersHorizontal,
  ArrowUpDown,
  LayoutGrid,
  Rows3,
  Check,
  Plus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { useBrand } from "@/contexts/brand-context";
import { BrandTabs } from "@/components/erp/marketing/marketing-shell";
import {
  DateRangePicker,
  buildPreset,
  type MktRangeValue,
} from "@/components/erp/marketing/date-range-picker";
import {
  getCampaignTruth,
  getCampaignTrend,
  getCampaignProductsSummary,
  getAttributionHealth,
  searchProductsForCampaign,
  linkCampaignProducts,
  unlinkCampaignProduct,
  rerunCampaignMatching,
  type CampaignProductsSummary,
  type CampaignTrendPoint,
  type CampaignTruthRow,
} from "@/lib/erp/marketing/campaigns.functions";
import {
  CAMPAIGN_TAGS,
  CampaignTruthDetail,
  TagChips,
} from "@/components/erp/marketing/campaign-truth-detail";

export const Route = createFileRoute("/_authenticated/erp/marketing/truth")({
  head: () => ({
    meta: [
      { title: "Campaign Profit Truth — Marketing ERP" },
      {
        name: "description",
        content:
          "Actual collected cash, real costs, and campaign profitability across every synced campaign.",
      },
      { property: "og:title", content: "Campaign Profit Truth — Marketing ERP" },
      {
        property: "og:description",
        content: "Actual collected cash, real costs, and campaign profitability.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CampaignTruthPage,
});

const bdt = (n: number) => "৳" + Math.round(n).toLocaleString("en-IN");
const signedBdt = (n: number) => (n >= 0 ? "+" : "−") + "৳" + Math.abs(Math.round(n)).toLocaleString("en-IN");
const num = (n: number) => n.toLocaleString("en-IN");

type Verdict = CampaignTruthRow["verdict"];
type TruthStatus = CampaignTruthRow["truth_status"];

const TRUTH_FILTERS: { key: TruthStatus | "all"; label: string }[] = [
  { key: "all", label: "All campaigns" },
  { key: "profitable", label: "Profitable" },
  { key: "breakeven", label: "Break-even" },
  { key: "losing", label: "Losing" },
  { key: "too_early", label: "Too early" },
];

function truthLabel(s: TruthStatus) {
  if (s === "profitable") return "Profitable";
  if (s === "breakeven") return "Break-even";
  if (s === "losing") return "Losing";
  return "Too early";
}

function truthTone(s: TruthStatus) {
  if (s === "profitable") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700";
  if (s === "breakeven") return "border-amber-500/30 bg-amber-500/10 text-amber-700";
  if (s === "losing") return "border-rose-500/30 bg-rose-500/10 text-rose-700";
  return "border-border bg-muted/50 text-muted-foreground";
}

function truthDot(s: TruthStatus) {
  if (s === "profitable") return "bg-emerald-500";
  if (s === "breakeven") return "bg-amber-500";
  if (s === "losing") return "bg-rose-500";
  return "bg-muted-foreground/50";
}

function rowAccent(s: TruthStatus) {
  if (s === "profitable") return "border-l-emerald-500/60";
  if (s === "losing") return "border-l-rose-500/60";
  if (s === "breakeven") return "border-l-amber-500/50";
  return "border-l-transparent";
}

const VERDICTS: { key: Verdict; label: string }[] = [
  { key: "scaling", label: "Scaling" },
  { key: "profitable", label: "Profitable" },
  { key: "breakeven", label: "Break-even" },
  { key: "losing", label: "Losing" },
  { key: "no_data", label: "No data" },
];

type SortKey = "impact" | "realized_profit" | "spend" | "collected" | "roas" | "delivery_rate";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "impact", label: "Financial impact" },
  { key: "realized_profit", label: "Realized profit" },
  { key: "spend", label: "Spend" },
  { key: "collected", label: "Collected" },
  { key: "roas", label: "Realized ROAS" },
  { key: "delivery_rate", label: "Delivery rate" },
];

const sortValue = (r: CampaignTruthRow, k: SortKey) => {
  if (k === "impact") return Math.abs(r.realized_profit ?? r.projected_profit ?? 0);
  if (k === "realized_profit") return r.realized_profit ?? Number.NEGATIVE_INFINITY;
  if (k === "spend") return r.spend;
  if (k === "collected") return r.collected_amount ?? -1;
  if (k === "roas") return r.realized_roas ?? Number.NEGATIVE_INFINITY;
  return r.delivery_rate;
};

type ActivityFilter = "all" | "spending" | "no_spend" | "with_orders" | "spend_no_orders";

const ACTIVITY_FILTERS: { key: ActivityFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "spending", label: "Active spending" },
  { key: "with_orders", label: "With orders" },
  { key: "spend_no_orders", label: "Spend · no order" },
  { key: "no_spend", label: "No spend" },
];

const activityMatch = (r: CampaignTruthRow, a: ActivityFilter) =>
  a === "all"
    ? true
    : a === "spending"
      ? r.spend > 0
      : a === "no_spend"
        ? r.spend <= 0
        : a === "with_orders"
          ? r.orders > 0
          : r.spend > 0 && r.orders <= 0;

type ProductFilter = "all" | "manual" | "auto" | "none";
type CoverageFilter = "all" | "high" | "low" | "pending";

/** Meta campaign status bucket: active (running), paused, or anything else. */
type MetaStatusFilter = "all" | "active" | "paused" | "other";

const metaStatusBucket = (status: string | null | undefined): MetaStatusFilter => {
  const s = (status ?? "").toLowerCase();
  if (s === "active" || s === "enabled") return "active";
  if (s === "paused") return "paused";
  return "other";
};

const META_STATUS_FILTERS: { key: MetaStatusFilter; label: string }[] = [
  { key: "all", label: "All status" },
  { key: "active", label: "Active" },
  { key: "paused", label: "Paused" },
  { key: "other", label: "Other" },
];

/** Shift a YYYY-MM-DD range back by its own length — used for period comparison. */
function previousRange(from: string, to: string) {
  const f = new Date(from + "T00:00:00Z");
  const t = new Date(to + "T00:00:00Z");
  const days = Math.max(1, Math.round((t.getTime() - f.getTime()) / 86400000) + 1);
  const pf = new Date(f.getTime() - days * 86400000);
  const pt = new Date(f.getTime() - 86400000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(pf), to: iso(pt) };
}

function CampaignTruthPage() {
  const { brands } = useBrand();
  const [brandKey, setBrandKey] = useState("all");
  const [range, setRange] = useState<MktRangeValue>(() => buildPreset("30d"));
  const [search, setSearch] = useState("");
  const [truthFilter, setTruthFilter] = useState<TruthStatus | "all">("all");
  const [minSpend, setMinSpend] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>("impact");
  const [sortDesc, setSortDesc] = useState(true);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [activity, setActivity] = useState<ActivityFilter>("all");
  const [verdictFilter, setVerdictFilter] = useState<Verdict | "all">("all");
  const [productFilter, setProductFilter] = useState<ProductFilter>("all");
  const [coverageFilter, setCoverageFilter] = useState<CoverageFilter>("all");
  const [hasOrders, setHasOrders] = useState(false);
  const [grain, setGrain] = useState<"day" | "week">("day");
  const [compare, setCompare] = useState(false);
  const [view, setView] = useState<"table" | "performance">("table");

  const brandIds = useMemo(() => {
    if (brandKey === "all") return brands.map((b) => b.id);
    const b = brands.find((x) => x.slug === brandKey || x.id === brandKey);
    return b ? [b.id] : brands.map((x) => x.id);
  }, [brandKey, brands]);

  const brandLabel =
    brandKey === "all"
      ? "All brands"
      : (brands.find((x) => x.slug === brandKey || x.id === brandKey)?.name ?? "Brand");

  const fetchTruth = useServerFn(getCampaignTruth);
  const q = useQuery({
    queryKey: ["mkt-campaign-truth", brandIds.slice().sort().join(","), range.from, range.to],
    queryFn: () => fetchTruth({ data: { brandIds, from: range.from, to: range.to } }),
    enabled: brandIds.length > 0,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const prev = useMemo(() => previousRange(range.from, range.to), [range.from, range.to]);
  const prevQ = useQuery({
    queryKey: ["mkt-campaign-truth-prev", brandIds.slice().sort().join(","), prev.from, prev.to],
    queryFn: () => fetchTruth({ data: { brandIds, from: prev.from, to: prev.to } }),
    enabled: compare && brandIds.length > 0,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const fetchHealth = useServerFn(getAttributionHealth);
  const healthQ = useQuery({
    queryKey: ["mkt-attribution-health", brandIds.slice().sort().join(","), range.from, range.to],
    queryFn: () => fetchHealth({ data: { brandIds, from: range.from, to: range.to } }),
    enabled: brandIds.length > 0,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const fetchTrend = useServerFn(getCampaignTrend);
  const trendQ = useQuery({
    queryKey: ["mkt-campaign-trend", brandIds.slice().sort().join(","), range.from, range.to, grain],
    queryFn: () => fetchTrend({ data: { brandIds, from: range.from, to: range.to, grain } }),
    enabled: brandIds.length > 0,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const trendByCampaign = useMemo(() => {
    const m = new Map<string, CampaignTrendPoint[]>();
    for (const p of trendQ.data ?? []) {
      const arr = m.get(p.campaign_id);
      if (arr) arr.push(p);
      else m.set(p.campaign_id, [p]);
    }
    return m;
  }, [trendQ.data]);

  const campaignIds = useMemo(() => (q.data ?? []).map((r) => r.id).slice(0, 500), [q.data]);
  const fetchProducts = useServerFn(getCampaignProductsSummary);
  const productsQ = useQuery({
    queryKey: ["mkt-campaign-products-summary", campaignIds.join(","), range.from, range.to],
    queryFn: () => fetchProducts({ data: { campaignIds, from: range.from, to: range.to } }),
    enabled: campaignIds.length > 0,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const productMap: CampaignProductsSummary = productsQ.data ?? {};

  const runRematch = useServerFn(rerunCampaignMatching);
  const rerun = useMutation({
    mutationFn: () => runRematch({ data: { brandIds, from: range.from, to: range.to } }),
    onSuccess: async (r) => {
      toast.success(
        `Matching done — ${r.scanned} order scan, ${r.inserted} নতুন link, ${r.updated} update`,
      );
      await q.refetch();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Re-run matching failed"),
  });

  const all: CampaignTruthRow[] = useMemo(() => q.data ?? [], [q.data]);

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    const out = all.filter((r) => {
      if (r.spend < minSpend) return false;
      if (truthFilter !== "all" && r.truth_status !== truthFilter) return false;
      if (verdictFilter !== "all" && r.verdict !== verdictFilter) return false;
      if (!activityMatch(r, activity)) return false;
      if (hasOrders && r.orders <= 0) return false;
      if (tagFilter.length > 0 && !tagFilter.every((t) => (r.tags ?? []).includes(t))) return false;
      if (productFilter !== "all") {
        const e = productMap[r.id];
        const manual = e?.manual?.length ?? 0;
        const auto = e?.auto?.length ?? 0;
        if (productFilter === "manual" && manual === 0) return false;
        if (productFilter === "auto" && !(manual === 0 && auto > 0)) return false;
        if (productFilter === "none" && (manual > 0 || auto > 0)) return false;
      }
      if (coverageFilter !== "all") {
        const c = r.truth_coverage;
        if (coverageFilter === "pending" && c !== null) return false;
        if (coverageFilter === "high" && (c === null || c < 80)) return false;
        if (coverageFilter === "low" && (c === null || c >= 80)) return false;
      }
      if (!s) return true;
      return (
        r.name.toLowerCase().includes(s) ||
        (r.external_id ?? "").includes(s) ||
        (r.note ?? "").toLowerCase().includes(s)
      );
    });
    const dir = sortDesc ? -1 : 1;
    return out.sort((a, b) => (sortValue(a, sortKey) - sortValue(b, sortKey)) * dir);
  }, [
    all,
    search,
    truthFilter,
    verdictFilter,
    minSpend,
    sortKey,
    sortDesc,
    activity,
    tagFilter,
    hasOrders,
    productFilter,
    coverageFilter,
    productMap,
  ]);

  const sumRows = (list: CampaignTruthRow[]) =>
    list.reduce(
      (a, r) => {
        a.spend += r.spend;
        a.metaP += r.meta_purchases;
        a.orders += r.orders;
        a.delivered += r.delivered_orders;
        a.cogs += r.cogs;
        a.opex += r.operating_cost;
        a.gp += r.gross_profit;
        a.net += r.net_profit;
        a.missingCost += r.cost_missing_units;
        a.booked += r.booked_value ?? 0;
        if (r.collected_amount !== null) {
          a.collected += r.collected_amount;
          a.collectedKnown = true;
        }
        if (r.expected_collectible !== null) a.expected += r.expected_collectible;
        if (r.return_charge !== null) a.returnCharge += r.return_charge;
        if (r.realized_profit !== null) {
          a.realized += r.realized_profit;
          a.realizedSpend += r.spend;
          a.realizedKnown = true;
        } else a.pendingCampaigns += 1;
        return a;
      },
      {
        spend: 0,
        metaP: 0,
        orders: 0,
        delivered: 0,
        cogs: 0,
        opex: 0,
        gp: 0,
        net: 0,
        missingCost: 0,
        booked: 0,
        collected: 0,
        expected: 0,
        returnCharge: 0,
        realized: 0,
        realizedSpend: 0,
        pendingCampaigns: 0,
        collectedKnown: false,
        realizedKnown: false,
      },
    );

  const totals = useMemo(() => sumRows(rows), [rows]);
  const prevTotals = useMemo(
    () => (compare && prevQ.data ? sumRows(prevQ.data) : null),
    [compare, prevQ.data],
  );

  const truthCounts = useMemo(() => {
    const m: Record<string, number> = { all: all.length };
    for (const r of all) m[r.truth_status] = (m[r.truth_status] ?? 0) + 1;
    return m;
  }, [all]);

  const activityCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const a of ACTIVITY_FILTERS) m[a.key] = all.filter((r) => activityMatch(r, a.key)).length;
    return m;
  }, [all]);

  const tagCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of all) for (const t of r.tags ?? []) m[t] = (m[t] ?? 0) + 1;
    return m;
  }, [all]);

  const health = healthQ.data ?? null;

  /** Coverage rollup — weighted by spend so big campaigns dominate confidence. */
  const coverage = useMemo(() => {
    const pick = (f: (r: CampaignTruthRow) => number | null) => {
      let w = 0;
      let acc = 0;
      for (const r of rows) {
        const v = f(r);
        if (v === null) continue;
        const weight = Math.max(1, r.spend);
        acc += v * weight;
        w += weight;
      }
      return w > 0 ? Math.round(acc / w) : null;
    };
    const attribution = health?.coverage_pct ?? pick((r) => r.attribution_coverage);
    const settlement = pick((r) => r.settlement_coverage);
    const cogs = pick((r) => r.cogs_coverage);
    const courier = pick((r) => r.courier_cost_coverage);
    const parts = [attribution, settlement, cogs, courier].filter((v): v is number => v !== null);
    return {
      attribution,
      settlement,
      cogs,
      courier,
      overall: parts.length ? Math.min(...parts) : null,
    };
  }, [rows, health]);

  const pendingSettlementCampaigns = useMemo(
    () => rows.filter((r) => r.collected_amount === null && r.delivered_orders > 0),
    [rows],
  );
  const pendingDelivered = pendingSettlementCampaigns.reduce((a, r) => a + r.delivered_orders, 0);

  const advancedActive =
    (activity !== "all" ? 1 : 0) +
    (verdictFilter !== "all" ? 1 : 0) +
    (productFilter !== "all" ? 1 : 0) +
    (coverageFilter !== "all" ? 1 : 0) +
    (minSpend > 0 ? 1 : 0) +
    (hasOrders ? 1 : 0) +
    (tagFilter.length > 0 ? 1 : 0) +
    (grain !== "day" ? 1 : 0);

  const resetAdvanced = () => {
    setActivity("all");
    setVerdictFilter("all");
    setProductFilter("all");
    setCoverageFilter("all");
    setMinSpend(0);
    setHasOrders(false);
    setTagFilter([]);
    setGrain("day");
  };

  const exportCsv = () => {
    const head = [
      "Campaign",
      "Campaign ID",
      "Status",
      "Verdict",
      "Match status",
      "Attributed orders",
      "Explicit attributed",
      "Auto attributed",
      "Spend",
      "Meta purchases",
      "Meta value",
      "Meta ROAS",
      "Real orders",
      "Delivered",
      "Returned",
      "Cancelled",
      "Delivered line value (projected)",
      "COGS",
      "Operating cost",
      "Projected gross profit",
      "Projected net profit",
      "Net margin %",
      "Actual ROAS",
      "Profit ROAS",
      "Break-even ROAS",
      "CAC",
      "Courier cost",
      "Packaging cost",
      "Refunds",
      "Other adj.",
      "Order value (booked)",
      "Expected collectible",
      "Actual collected",
      "Collection variance",
      "Return charge",
      "Realized profit",
      "Truth coverage %",
      "Truth status",
      "Tags",
      "Note",
    ];
    const csv = [
      head,
      ...rows.map((r) => [
        r.name,
        r.external_id ?? "",
        r.status,
        r.verdict,
        r.match_status,
        r.attributed_orders,
        r.explicit_attributed_orders,
        r.auto_attributed_orders,
        r.spend,
        r.meta_purchases,
        r.meta_purchase_value,
        r.meta_roas,
        r.orders,
        r.delivered_orders,
        r.returned_orders,
        r.cancelled_orders,
        r.delivered_revenue,
        r.cogs,
        r.operating_cost,
        r.gross_profit,
        r.net_profit,
        r.net_margin,
        r.actual_roas,
        r.profit_roas,
        r.breakeven_roas,
        r.cac,
        r.courier_cost,
        r.packaging_cost,
        r.refund_cost,
        r.other_cost,
        r.booked_value ?? "",
        r.expected_collectible ?? "Pending",
        r.collected_amount ?? "Pending",
        r.collection_variance ?? "Pending",
        r.return_charge ?? "Pending",
        r.realized_profit ?? "Pending",
        r.truth_coverage ?? "Pending",
        r.truth_status,
        (r.tags ?? []).join("|"),
        r.note ?? "",
      ]),
    ]
      .map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `campaign-profit-${range.from}-to-${range.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const realizedDelta =
    prevTotals && prevTotals.realizedKnown && Math.abs(prevTotals.realized) > 0
      ? ((totals.realized - prevTotals.realized) / Math.abs(prevTotals.realized)) * 100
      : null;

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 p-4 md:p-6">
      {/* 1 — Header */}
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 sm:flex sm:flex-wrap sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold tracking-tight md:text-xl">
            Campaign Profit Truth
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Actual collected cash, real costs, and campaign profitability.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BrandTabs value={brandKey} onChange={setBrandKey} />
          <DateRangePicker value={range} onChange={setRange} />
          <Button
            variant={compare ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setCompare((c) => !c)}
          >
            Compare
          </Button>
          <Button variant="ghost" size="sm" onClick={() => q.refetch()}>
            <RefreshCcw className={`mr-1.5 h-3.5 w-3.5 ${q.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="ghost" size="sm" onClick={exportCsv} disabled={rows.length === 0}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Export
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => rerun.mutate()}
            disabled={rerun.isPending || brandIds.length === 0}
          >
            <Wand2 className="mr-1.5 h-3.5 w-3.5" />
            {rerun.isPending ? "Matching…" : "Re-run matching"}
          </Button>
        </div>
      </header>

      {/* Context bar */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
        <span className="rounded border bg-muted/40 px-2 py-0.5 text-foreground">{brandLabel}</span>
        <span className="rounded border px-2 py-0.5">{range.label ?? "Custom range"}</span>
        <span className="rounded border px-2 py-0.5 tabular-nums">
          {range.from} → {range.to}
        </span>
        {compare && (
          <span className="rounded border border-indigo-500/30 bg-indigo-500/5 px-2 py-0.5 tabular-nums text-indigo-600">
            vs {prev.from} → {prev.to}
          </span>
        )}
        <span className="ml-auto tabular-nums">{num(rows.length)} campaigns in view</span>
      </div>

      {/* 2 — Compact truth strip */}
      <section className="rounded-xl border bg-card">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
          <div className="min-w-[170px]">
            <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              Realized net profit
            </div>
            {q.isLoading ? (
              <Skeleton className="mt-1 h-6 w-28" />
            ) : (
              <div className="flex items-baseline gap-2">
                <span
                  className={`text-xl font-semibold tabular-nums ${
                    !totals.realizedKnown
                      ? "text-muted-foreground"
                      : totals.realized >= 0
                        ? "text-emerald-600"
                        : "text-rose-600"
                  }`}
                >
                  {totals.realizedKnown ? signedBdt(totals.realized) : "Pending"}
                </span>
                {compare && realizedDelta !== null && (
                  <span
                    className={`inline-flex items-center gap-0.5 text-[11px] tabular-nums ${realizedDelta >= 0 ? "text-emerald-600" : "text-rose-600"}`}
                  >
                    {realizedDelta >= 0 ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : (
                      <TrendingDown className="h-3 w-3" />
                    )}
                    {realizedDelta.toFixed(1)}%
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px]">
            <MicroStat label="Campaigns" value={`${num(rows.length)}`} />
            <MicroStat label="Active spending" value={num(activityCounts["spending"] ?? 0)} />
            <MicroStat label="Ad spend" value={bdt(totals.spend)} />
            <MicroStat
              label="Actual collected"
              value={totals.collectedKnown ? bdt(totals.collected) : "Pending"}
            />
            <MicroStat
              label="Profit ROAS"
              value={
                totals.realizedKnown && totals.realizedSpend > 0
                  ? (totals.realized / totals.realizedSpend).toFixed(2) + "x"
                  : "—"
              }
            />
            <MicroStat label="Orders" value={`${num(totals.orders)} · ${num(totals.delivered)} del.`} />
          </div>

          <div className="ml-auto flex min-w-[150px] items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              Truth
            </span>
            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full ${
                  (coverage.overall ?? 0) >= 80
                    ? "bg-emerald-500"
                    : (coverage.overall ?? 0) >= 50
                      ? "bg-amber-500"
                      : "bg-rose-500"
                }`}
                style={{ width: `${coverage.overall ?? 0}%` }}
              />
            </div>
            <span
              className="text-xs font-medium tabular-nums"
              title={`Attribution ${coverage.attribution ?? "—"}% · Settlement ${coverage.settlement ?? "—"}% · COGS ${coverage.cogs ?? "—"}% · Courier ${coverage.courier ?? "—"}%`}
            >
              {coverage.overall === null ? "—" : `${coverage.overall}%`}
            </span>
          </div>
        </div>

        {(pendingDelivered > 0 || totals.missingCost > 0 || (health?.unattributed_orders ?? 0) > 0) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-4 py-2 text-[11px] text-muted-foreground">
            {pendingDelivered > 0 && (
              <button
                type="button"
                onClick={() => setCoverageFilter("pending")}
                className="inline-flex items-center gap-1 text-amber-700 hover:underline"
              >
                <AlertTriangle className="h-3 w-3" />
                {num(pendingDelivered)} delivered pending settlement
              </button>
            )}
            {totals.missingCost > 0 && <span>{num(totals.missingCost)} unit cost incomplete</span>}
            {health && (
              <span>
                ✋{num(health.explicit_orders)} manual · 🤖{num(health.auto_orders)} auto ·{" "}
                {num(health.unattributed_orders)} unmatched
              </span>
            )}
          </div>
        )}
      </section>


      {/* 4 — Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search campaign or ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-1 rounded-lg border p-0.5">
          {TRUTH_FILTERS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTruthFilter(t.key)}
              className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                truthFilter === t.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {t.label}
              <span className="ml-1 tabular-nums opacity-70">{truthCounts[t.key] ?? 0}</span>
            </button>
          ))}
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
              Filters
              {advancedActive > 0 && (
                <span className="ml-1.5 rounded bg-primary/10 px-1 text-[10px] tabular-nums text-primary">
                  {advancedActive} active
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[320px] space-y-3 p-3">
            <FilterGroup label="Activity">
              {ACTIVITY_FILTERS.map((a) => (
                <MiniToggle
                  key={a.key}
                  on={activity === a.key}
                  onClick={() => setActivity(a.key)}
                  label={`${a.label} (${activityCounts[a.key] ?? 0})`}
                />
              ))}
            </FilterGroup>
            <FilterGroup label="Match status">
              <MiniToggle on={verdictFilter === "all"} onClick={() => setVerdictFilter("all")} label="All" />
              {VERDICTS.map((v) => (
                <MiniToggle
                  key={v.key}
                  on={verdictFilter === v.key}
                  onClick={() => setVerdictFilter(v.key)}
                  label={v.label}
                />
              ))}
            </FilterGroup>
            <FilterGroup label="Product assignment">
              {(
                [
                  ["all", "All"],
                  ["manual", "✋ Manual linked"],
                  ["auto", "🤖 Auto suggested"],
                  ["none", "Not assigned"],
                ] as [ProductFilter, string][]
              ).map(([k, l]) => (
                <MiniToggle key={k} on={productFilter === k} onClick={() => setProductFilter(k)} label={l} />
              ))}
            </FilterGroup>
            <FilterGroup label="Truth coverage">
              {(
                [
                  ["all", "All"],
                  ["high", "≥ 80%"],
                  ["low", "< 80%"],
                  ["pending", "Pending"],
                ] as [CoverageFilter, string][]
              ).map(([k, l]) => (
                <MiniToggle key={k} on={coverageFilter === k} onClick={() => setCoverageFilter(k)} label={l} />
              ))}
            </FilterGroup>
            <FilterGroup label="Tags">
              {CAMPAIGN_TAGS.map((t) => (
                <MiniToggle
                  key={t.key}
                  on={tagFilter.includes(t.key)}
                  onClick={() =>
                    setTagFilter((cur) =>
                      cur.includes(t.key) ? cur.filter((x) => x !== t.key) : [...cur, t.key],
                    )
                  }
                  label={`${t.label} (${tagCounts[t.key] ?? 0})`}
                />
              ))}
            </FilterGroup>
            <Separator />
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                Min spend
                <Input
                  type="number"
                  className="h-8 w-24"
                  value={minSpend || ""}
                  placeholder="0"
                  onChange={(e) => setMinSpend(Number(e.target.value) || 0)}
                />
              </label>
              <MiniToggle on={hasOrders} onClick={() => setHasOrders((v) => !v)} label="Has orders" />
            </div>
            <div className="flex items-center justify-between gap-2">
              <FilterGroup label="Trend">
                <MiniToggle on={grain === "day"} onClick={() => setGrain("day")} label="Daily" />
                <MiniToggle on={grain === "week"} onClick={() => setGrain("week")} label="Weekly" />
              </FilterGroup>
              <Button variant="ghost" size="sm" onClick={resetAdvanced}>
                Reset
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        <div className="ml-auto flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm">
                <ArrowUpDown className="mr-1.5 h-3.5 w-3.5" />
                {SORTS.find((s) => s.key === sortKey)?.label}
                <span className="ml-1 text-[10px] opacity-60">{sortDesc ? "↓" : "↑"}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-52 p-1">
              {SORTS.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => (s.key === sortKey ? setSortDesc((d) => !d) : (setSortKey(s.key), setSortDesc(true)))}
                  className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs hover:bg-muted"
                >
                  {s.label}
                  {sortKey === s.key && <Check className="h-3.5 w-3.5 text-primary" />}
                </button>
              ))}
            </PopoverContent>
          </Popover>
          <div className="flex items-center rounded-lg border p-0.5">
            <button
              type="button"
              onClick={() => setView("table")}
              className={`rounded-md p-1.5 ${view === "table" ? "bg-muted text-foreground" : "text-muted-foreground"}`}
              title="Table view"
            >
              <Rows3 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setView("performance")}
              className={`rounded-md p-1.5 ${view === "performance" ? "bg-muted text-foreground" : "text-muted-foreground"}`}
              title="Performance view"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 5 — Campaign performance */}
      {q.isLoading ? (
        <div className="space-y-2 rounded-xl border bg-card p-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border bg-card p-12 text-center text-sm text-muted-foreground">
          এই filter/range-এ কোনো campaign নেই।
        </div>
      ) : view === "performance" ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                setView("table");
                setOpenRow(r.id);
              }}
              className={`rounded-xl border border-l-2 bg-card p-4 text-left transition-colors hover:bg-muted/40 ${rowAccent(r.truth_status)}`}
            >
              <div className="truncate text-sm font-semibold">{r.name}</div>
              <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {r.status} · ID <span className="font-mono tabular-nums">{r.id.slice(0, 8)}</span>
                {r.external_id ? ` · ${r.external_id}` : null}
              </div>
              <div
                className={`mt-3 text-2xl font-semibold tabular-nums ${
                  r.realized_profit === null
                    ? "text-muted-foreground"
                    : r.realized_profit >= 0
                      ? "text-emerald-600"
                      : "text-rose-600"
                }`}
              >
                {r.realized_profit === null ? "Settlement pending" : signedBdt(r.realized_profit)}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-muted-foreground">
                <div>
                  <div className="uppercase tracking-wide">Spend</div>
                  <div className="tabular-nums text-foreground">{bdt(r.spend)}</div>
                </div>
                <div>
                  <div className="uppercase tracking-wide">Collected</div>
                  <div className="tabular-nums text-foreground">
                    {r.collected_amount === null ? "Pending" : bdt(r.collected_amount)}
                  </div>
                </div>
                <div>
                  <div className="uppercase tracking-wide">Delivery</div>
                  <div className="tabular-nums text-foreground">{r.delivery_rate}%</div>
                </div>
              </div>
              <div className="mt-3">
                <Badge variant="outline" className={`h-5 px-1.5 text-[10px] ${truthTone(r.truth_status)}`}>
                  {truthLabel(r.truth_status)}
                </Badge>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="border-b bg-muted/30 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Campaign</th>
                  <th className="px-4 py-3 text-right font-medium">Spend</th>
                  <th className="px-4 py-3 text-left font-medium">Lifecycle</th>
                  <th className="px-4 py-3 text-right font-medium">Actual collected</th>
                  <th className="px-4 py-3 text-right font-medium">Realized profit</th>
                  <th className="px-4 py-3 text-right font-medium">Verdict</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => {
                  const open = openRow === r.id;
                  const margin =
                    r.realized_profit !== null && (r.collected_amount ?? 0) > 0
                      ? (r.realized_profit / (r.collected_amount as number)) * 100
                      : null;
                  return (
                    <Fragment key={r.id}>
                      <tr
                        className={`cursor-pointer border-l-2 align-top transition-colors hover:bg-muted/30 ${rowAccent(r.truth_status)} ${open ? "bg-muted/30" : ""}`}
                        onClick={() => setOpenRow(open ? null : r.id)}
                      >
                        <td className="max-w-[420px] px-4 py-3.5">
                          <div className="flex items-start gap-2.5">
                            <ChevronRight
                              className={`mt-2.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
                            />
                            <CampaignProductThumb
                              entry={productMap[r.id]}
                              loading={productsQ.isLoading}
                            />
                            <div className="min-w-0">
                              <div className="truncate font-medium leading-tight">{r.name}</div>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                                <span className="font-mono tabular-nums" title={r.id}>ID {r.id.slice(0, 8)}</span>
                                <span className="opacity-40">·</span>
                                <span className="capitalize">{r.status}</span>
                                <span className="opacity-40">·</span>
                                <CampaignProductChips
                                  entry={productMap[r.id]}
                                  loading={productsQ.isLoading}
                                />
                                <CampaignProductLinker
                                  campaignId={r.id}
                                  entry={productMap[r.id]}
                                  onChanged={() => productsQ.refetch()}
                                />
                                <TagChips tags={r.tags ?? []} />
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3.5 text-right tabular-nums">
                          <div className="font-medium">{bdt(r.spend)}</div>
                          <div className="mt-0.5 text-[11px] text-muted-foreground">
                            CPA {r.orders > 0 ? bdt(r.cpa) : "—"}
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <MiniFunnel row={r} />
                        </td>
                        <td className="px-4 py-3.5 text-right tabular-nums">
                          {r.collected_amount === null ? (
                            <>
                              <div className="text-[11px] font-medium text-amber-700">
                                Pending reconciliation
                              </div>
                              <div className="mt-0.5 text-[11px] text-muted-foreground">
                                {r.expected_collectible === null
                                  ? "Expected unknown"
                                  : `Expected ${bdt(r.expected_collectible)}`}
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="font-medium">{bdt(r.collected_amount)}</div>
                              <div className="mt-0.5 text-[11px] text-muted-foreground">
                                Expected {bdt(r.expected_collectible ?? 0)} · Var{" "}
                                {bdt(r.collection_variance ?? 0)}
                              </div>
                            </>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right tabular-nums">
                          {r.realized_profit === null ? (
                            <span className="text-[11px] text-muted-foreground">Settlement pending</span>
                          ) : (
                            <>
                              <div
                                className={`text-base font-semibold ${r.realized_profit >= 0 ? "text-emerald-600" : "text-rose-600"}`}
                              >
                                {signedBdt(r.realized_profit)}
                              </div>
                              <div className="mt-0.5 text-[11px] text-muted-foreground">
                                {margin === null ? "Margin —" : `Margin ${margin.toFixed(1)}%`}
                              </div>
                            </>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <div className="flex flex-col items-end gap-1">
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] ${truthTone(r.truth_status)}`}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${truthDot(r.truth_status)}`} />
                              {truthLabel(r.truth_status)}
                            </span>
                            <span
                              className="text-[10px] text-muted-foreground"
                              title={`Attribution ${r.attribution_coverage ?? "—"}% · Settlement ${r.settlement_coverage ?? "—"}% · COGS ${r.cogs_coverage ?? "—"}% · Courier ${r.courier_cost_coverage ?? "—"}%`}
                            >
                              {r.truth_coverage === null
                                ? "Settlement pending"
                                : `Truth ${r.truth_coverage}%`}
                            </span>
                          </div>
                        </td>
                      </tr>
                      {open && (
                        <tr className="border-l-2 border-l-primary/40 bg-muted/20">
                          <td colSpan={6} className="px-4 py-4">
                            <CampaignTruthDetail
                              row={r}
                              trend={trendByCampaign.get(r.id) ?? []}
                              brandId={brandIds.length === 1 ? brandIds[0] : null}
                              brandIds={brandIds}
                              range={{ from: range.from, to: range.to }}
                              products={productMap[r.id]}
                              onSaved={() => q.refetch()}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot className="border-t bg-muted/30 text-xs">
                <tr>
                  <td className="px-4 py-3 font-medium">Total · {rows.length} campaigns</td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">{bdt(totals.spend)}</td>
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">
                    {num(totals.orders)} booked · {num(totals.delivered)} delivered
                  </td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">
                    {totals.collectedKnown ? bdt(totals.collected) : "Pending"}
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-semibold tabular-nums ${totals.realized >= 0 ? "text-emerald-600" : "text-rose-600"}`}
                  >
                    {totals.realizedKnown ? signedBdt(totals.realized) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                    Projected {bdt(totals.net)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/** Tiny inline label/value pair used in the compact truth strip. */
function MicroStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="leading-tight">
      <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
      <div className="text-xs font-medium tabular-nums">{value}</div>
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </div>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

function MiniToggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-2 py-0.5 text-[11px] transition-colors ${
        on ? "border-primary/40 bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
      }`}
    >
      {label}
    </button>
  );
}

/** Compact lifecycle funnel — booked → confirmed → delivered, with return/cancel tail. */
function MiniFunnel({ row }: { row: CampaignTruthRow }) {
  const booked = Math.max(row.orders, 1);
  const stages = [
    { l: "Booked", n: row.orders, tone: "bg-slate-400" },
    { l: "Confirmed", n: row.confirmed_orders, tone: "bg-indigo-500" },
    { l: "Delivered", n: row.delivered_orders, tone: "bg-emerald-500" },
  ];
  return (
    <div className="min-w-[170px]">
      <div className="flex items-end gap-1">
        {stages.map((s) => (
          <div key={s.l} className="flex-1">
            <div className="text-[11px] font-medium tabular-nums">{s.n}</div>
            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full ${s.tone}`}
                style={{ width: `${Math.min(100, (s.n / booked) * 100)}%` }}
              />
            </div>
            <div className="mt-0.5 text-[10px] text-muted-foreground">{s.l}</div>
          </div>
        ))}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
        <span>Delivery {row.delivery_rate}%</span>
        {row.returned_orders > 0 && <span className="text-amber-600">↩ {row.returned_orders} returned</span>}
        {row.cancelled_orders > 0 && <span className="opacity-70">✕ {row.cancelled_orders} cancelled</span>}
      </div>
    </div>
  );
}

/** Product photo shown beside the campaign name (manual link first, else auto match). */
function CampaignProductThumb({
  entry,
  loading,
}: {
  entry: CampaignProductsSummary[string] | undefined;
  loading: boolean;
}) {
  if (loading && !entry) return <Skeleton className="h-10 w-10 shrink-0 rounded-md" />;
  const p = entry?.manual?.[0] ?? entry?.auto?.[0];
  const manual = (entry?.manual?.length ?? 0) > 0;
  if (!p?.image) {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-dashed text-[9px] text-muted-foreground">
        No img
      </div>
    );
  }
  return (
    <img
      src={p.image}
      alt={p.title}
      loading="lazy"
      title={`${manual ? "✋ Manual" : "🤖 Auto"} · ${p.title}`}
      className="h-10 w-10 shrink-0 rounded-md border object-cover"
    />
  );
}

/**
 * Product assign / link control for a campaign. Always available — even when the
 * campaign has no product yet. Manual links can be added or removed, and auto
 * suggestions can be confirmed into a manual link with one click.
 */
function CampaignProductLinker({
  campaignId,
  entry,
  onChanged,
}: {
  campaignId: string;
  entry: CampaignProductsSummary[string] | undefined;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const manual = entry?.manual ?? [];
  const auto = entry?.auto ?? [];

  const search = useServerFn(searchProductsForCampaign);
  const link = useServerFn(linkCampaignProducts);
  const unlink = useServerFn(unlinkCampaignProduct);

  const searchQ = useQuery({
    queryKey: ["mkt-product-search", term],
    queryFn: () => search({ data: { q: term } }),
    enabled: open,
    staleTime: 30_000,
  });

  const linkM = useMutation({
    mutationFn: (productId: string) => link({ data: { campaignId, productIds: [productId], weight: 1 } }),
    onSuccess: () => {
      toast.success("Product link kora hoyeche");
      onChanged();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Link failed"),
  });

  const unlinkM = useMutation({
    mutationFn: (productId: string) => unlink({ data: { campaignId, productId } }),
    onSuccess: () => {
      toast.success("Link সরানো হয়েছে");
      onChanged();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Unlink failed"),
  });

  const linkedIds = new Set(manual.map((p) => p.product_id));
  const busy = linkM.isPending || unlinkM.isPending;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 rounded border border-dashed px-1.5 py-0.5 text-[10px] text-muted-foreground transition hover:border-primary/50 hover:text-primary"
        >
          <Plus className="h-3 w-3" />
          {manual.length > 0 ? "Manage" : "Assign product"}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[320px] p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b px-3 py-2 text-[11px] font-medium">Campaign product link</div>

        {manual.length > 0 && (
          <div className="max-h-[140px] space-y-1 overflow-y-auto border-b p-2">
            {manual.map((p) => (
              <div key={p.product_id} className="flex items-center gap-2 rounded px-1 py-1 text-xs">
                <ProductAvatar src={p.image} alt={p.title} />
                <span className="min-w-0 flex-1 truncate">✋ {p.title}</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => unlinkM.mutate(p.product_id)}
                  className="text-[10px] text-muted-foreground hover:text-rose-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {auto.length > 0 && (
          <div className="space-y-1 border-b p-2">
            <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              🤖 Auto suggested
            </div>
            {auto.slice(0, 4).map((p) =>
              linkedIds.has(p.product_id) ? null : (
                <div key={p.product_id} className="flex items-center gap-2 text-xs">
                  <ProductAvatar src={p.image} alt={p.title} />
                  <span className="min-w-0 flex-1 truncate" title={p.title}>
                    {p.title}
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      {p.orders ?? 0} orders
                      {p.share !== null && p.share !== undefined ? ` · ${p.share}%` : ""}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[10px]"
                    disabled={busy}
                    onClick={() => linkM.mutate(p.product_id)}
                  >
                    Confirm
                  </Button>
                </div>
              ),
            )}
          </div>
        )}

        <div className="p-2">
          <Input
            autoFocus
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Product খুঁজুন (title / SKU)…"
            className="h-8 text-xs"
          />
          <div className="mt-2 max-h-[200px] space-y-1 overflow-y-auto">
            {searchQ.isLoading && <div className="p-2 text-[11px] text-muted-foreground">Loading…</div>}
            {(searchQ.data ?? []).map((p: { id: string; title: string; sku: string | null; image: string | null }) => (
              <button
                key={p.id}
                type="button"
                disabled={busy || linkedIds.has(p.id)}
                onClick={() => linkM.mutate(p.id)}
                className="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-xs hover:bg-muted disabled:opacity-50"
              >
                <ProductAvatar src={p.image} alt={p.title} />
                <span className="min-w-0 flex-1 truncate">
                  {p.title}
                  <span className="ml-1 text-[10px] text-muted-foreground">{p.sku ?? "no sku"}</span>
                </span>
                {linkedIds.has(p.id) ? (
                  <Check className="h-3.5 w-3.5 text-primary" />
                ) : (
                  <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </button>
            ))}
            {!searchQ.isLoading && (searchQ.data ?? []).length === 0 && (
              <div className="p-2 text-[11px] text-muted-foreground">কোনো product পাওয়া যায়নি।</div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ProductAvatar({ src, alt }: { src?: string | null; alt: string }) {
  if (!src)
    return <span className="h-6 w-6 shrink-0 rounded border border-dashed bg-muted/40" aria-hidden />;
  return <img src={src} alt={alt} loading="lazy" className="h-6 w-6 shrink-0 rounded border object-cover" />;
}

/** Linked (manual) or auto-detected products shown right under the campaign name. */
function CampaignProductChips({
  entry,
  loading,
}: {
  entry: CampaignProductsSummary[string] | undefined;
  loading: boolean;
}) {
  if (loading && !entry) return <Skeleton className="h-3.5 w-24" />;
  const manual = entry?.manual ?? [];
  const auto = entry?.auto ?? [];

  if (manual.length > 0) {
    const show = manual.slice(0, 2);
    return (
      <span className="inline-flex flex-wrap items-center gap-1">
        {show.map((p) => (
          <span
            key={p.product_id}
            title={p.sku ? `${p.title} · ${p.sku}` : p.title}
            className="max-w-[140px] truncate rounded border border-primary/25 bg-primary/5 px-1 text-[10px] text-primary"
          >
            ✋ {p.title}
          </span>
        ))}
        {manual.length > show.length && <span className="text-[10px]">+{manual.length - show.length}</span>}
      </span>
    );
  }

  if (auto.length > 0) {
    const show = auto.slice(0, 2);
    return (
      <span className="inline-flex flex-wrap items-center gap-1">
        {show.map((p) => (
          <span
            key={p.product_id}
            title={`${p.title}${p.sku ? " · " + p.sku : ""} — ${p.orders ?? 0} orders`}
            className="max-w-[140px] truncate rounded border border-dashed px-1 text-[10px]"
          >
            🤖 {p.title}
            {p.share !== null && p.share !== undefined ? ` ${p.share}%` : ""}
          </span>
        ))}
        {auto.length > show.length && <span className="text-[10px]">+{auto.length - show.length}</span>}
      </span>
    );
  }

  return <span className="text-[10px] italic">Product not assigned</span>;
}
