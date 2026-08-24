import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Scale,
  RefreshCcw,
  Download,
  Search,
  Wand2,
  TrendingUp,
  TrendingDown,
  ChevronRight,
  AlertTriangle,
  ArrowUpDown,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { useBrand } from "@/contexts/brand-context";
import { BrandTabs } from "@/components/erp/marketing/marketing-shell";
import {
  DateRangePicker,
  buildPreset,
  type MktRangeValue,
} from "@/components/erp/marketing/date-range-picker";
import {
  getCampaignTruth,
  rerunCampaignMatching,
  type CampaignTruthRow,
} from "@/lib/erp/marketing/campaigns.functions";

export const Route = createFileRoute("/_authenticated/erp/marketing/truth")({
  head: () => ({
    meta: [
      { title: "Campaign Profit Truth — Marketing ERP" },
      {
        name: "description",
        content:
          "Every synced campaign's Meta reported purchases against real ERP orders, delivered revenue, COGS, ad spend and true net profit.",
      },
      { property: "og:title", content: "Campaign Profit Truth — Marketing ERP" },
      {
        property: "og:description",
        content: "Meta purchases vs real orders, plus true net profit per campaign.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CampaignTruthPage,
});

const bdt = (n: number) => "৳" + Math.round(n).toLocaleString("en-IN");
const num = (n: number) => n.toLocaleString("en-IN");

type MatchStatus = CampaignTruthRow["match_status"];
type Verdict = CampaignTruthRow["verdict"];

function matchLabel(s: MatchStatus) {
  if (s === "linked") return "Matched";
  if (s === "partial") return "Partial";
  if (s === "utm_only") return "UTM only";
  return "No orders";
}

function matchTone(s: MatchStatus) {
  if (s === "linked") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-600";
  if (s === "partial") return "border-amber-500/40 bg-amber-500/10 text-amber-600";
  if (s === "utm_only") return "border-sky-500/40 bg-sky-500/10 text-sky-600";
  return "border-rose-500/40 bg-rose-500/10 text-rose-600";
}

const VERDICTS: { key: Verdict; label: string; tone: string }[] = [
  { key: "scaling", label: "Scale করার মতো", tone: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600" },
  { key: "profitable", label: "Profitable", tone: "border-teal-500/40 bg-teal-500/10 text-teal-600" },
  { key: "breakeven", label: "Break-even", tone: "border-amber-500/40 bg-amber-500/10 text-amber-600" },
  { key: "losing", label: "Loss করছে", tone: "border-rose-500/40 bg-rose-500/10 text-rose-600" },
  { key: "no_data", label: "No data", tone: "border-muted bg-muted/40 text-muted-foreground" },
];

const verdictMeta = (v: Verdict) => VERDICTS.find((x) => x.key === v) ?? VERDICTS[4];

type SortKey =
  | "spend"
  | "delivered_revenue"
  | "gross_profit"
  | "net_profit"
  | "orders"
  | "actual_roas"
  | "profit_roas"
  | "net_margin";

function CampaignTruthPage() {
  const { brands } = useBrand();
  const [brandKey, setBrandKey] = useState("all");
  const [range, setRange] = useState<MktRangeValue>(() => buildPreset("30d"));
  const [search, setSearch] = useState("");
  const [verdictFilter, setVerdictFilter] = useState<Verdict | "all">("all");
  const [minSpend, setMinSpend] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>("spend");
  const [sortDesc, setSortDesc] = useState(true);
  const [openRow, setOpenRow] = useState<string | null>(null);

  const brandIds = useMemo(() => {
    if (brandKey === "all") return brands.map((b) => b.id);
    const b = brands.find((x) => x.slug === brandKey || x.id === brandKey);
    return b ? [b.id] : brands.map((x) => x.id);
  }, [brandKey, brands]);

  const fetchTruth = useServerFn(getCampaignTruth);
  const q = useQuery({
    queryKey: ["mkt-campaign-truth", brandIds.slice().sort().join(","), range.from, range.to],
    queryFn: () => fetchTruth({ data: { brandIds, from: range.from, to: range.to } }),
    enabled: brandIds.length > 0,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

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
      if (verdictFilter !== "all" && r.verdict !== verdictFilter) return false;
      if (!s) return true;
      return r.name.toLowerCase().includes(s) || (r.external_id ?? "").includes(s);
    });
    const dir = sortDesc ? -1 : 1;
    return out.sort((a, b) => (Number(a[sortKey]) - Number(b[sortKey])) * dir);
  }, [all, search, verdictFilter, minSpend, sortKey, sortDesc]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (a, r) => {
          a.spend += r.spend;
          a.metaP += r.meta_purchases;
          a.orders += r.orders;
          a.delivered += r.delivered_orders;
          a.rev += r.delivered_revenue;
          a.cogs += r.cogs;
          a.opex += r.operating_cost;
          a.gp += r.gross_profit;
          a.net += r.net_profit;
          a.linked += r.attributed_orders;
          a.unmatched += r.unlinked_orders;
          a.missingCost += r.cost_missing_units;
          return a;
        },
        {
          spend: 0,
          metaP: 0,
          orders: 0,
          delivered: 0,
          rev: 0,
          cogs: 0,
          opex: 0,
          gp: 0,
          net: 0,
          linked: 0,
          unmatched: 0,
          missingCost: 0,
        },
      ),
    [rows],
  );

  const verdictCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of all) m[r.verdict] = (m[r.verdict] ?? 0) + 1;
    return m;
  }, [all]);

  const matchHealth =
    totals.linked + totals.unmatched > 0
      ? Math.round((100 * totals.linked) / (totals.linked + totals.unmatched))
      : 0;

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDesc((d) => !d);
    else {
      setSortKey(k);
      setSortDesc(true);
    }
  };

  const exportCsv = () => {
    const head = [
      "Campaign",
      "Campaign ID",
      "Status",
      "Verdict",
      "Match status",
      "Attributed orders",
      "Unmatched orders",
      "Spend",
      "Meta purchases",
      "Meta value",
      "Meta ROAS",
      "Real orders",
      "Delivered",
      "Returned",
      "Cancelled",
      "Delivered revenue",
      "COGS",
      "Operating cost",
      "Gross profit",
      "Net profit",
      "Net margin %",
      "Actual ROAS",
      "Profit ROAS",
      "Break-even ROAS",
      "CAC",
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
        r.unlinked_orders,
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

  const kpis = [
    { l: "Ad spend", v: bdt(totals.spend), sub: `${num(totals.metaP)} Meta purchases` },
    {
      l: "Delivered revenue",
      v: bdt(totals.rev),
      sub: `${num(totals.delivered)} / ${num(totals.orders)} orders delivered`,
    },
    { l: "Gross profit", v: bdt(totals.gp), sub: `COGS ${bdt(totals.cogs)} · Opex ${bdt(totals.opex)}` },
    {
      l: "Net profit (after ads)",
      v: bdt(totals.net),
      sub: totals.rev > 0 ? `${((totals.net / totals.rev) * 100).toFixed(1)}% margin` : "—",
      tone: totals.net >= 0 ? "text-emerald-600" : "text-rose-600",
    },
    {
      l: "Profit ROAS",
      v: totals.spend > 0 ? (totals.gp / totals.spend).toFixed(2) + "x" : "—",
      sub: totals.spend > 0 ? `Revenue ROAS ${(totals.rev / totals.spend).toFixed(2)}x` : "—",
    },
  ];

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-4 md:p-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-background p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary/15 p-2.5 text-primary">
              <Scale className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-semibold leading-tight">Campaign Profit Truth</h1>
              <p className="text-xs text-muted-foreground">
                Meta যা বলছে বনাম বাস্তবে কত order, কত delivered revenue আর ad spend বাদ দিয়ে আসল
                profit কত
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <BrandTabs value={brandKey} onChange={setBrandKey} />
            <DateRangePicker value={range} onChange={setRange} />
            <Button
              size="sm"
              onClick={() => rerun.mutate()}
              disabled={rerun.isPending || brandIds.length === 0}
            >
              <Wand2 className="mr-1.5 h-3.5 w-3.5" />
              {rerun.isPending ? "Matching…" : "Re-run matching"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => q.refetch()}>
              <RefreshCcw className={`mr-1.5 h-3.5 w-3.5 ${q.isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={rows.length === 0}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              CSV
            </Button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
          {kpis.map((k) => (
            <div key={k.l} className="rounded-xl border bg-card/70 p-3 backdrop-blur">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{k.l}</div>
              <div className={`mt-1 text-xl font-semibold tabular-nums ${k.tone ?? ""}`}>{k.v}</div>
              <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{k.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Data health */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 p-3">
          <div className="min-w-[220px] flex-1">
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-medium">Attribution health</span>
              <span className="tabular-nums text-muted-foreground">
                {num(totals.linked)} linked · {num(totals.unmatched)} unmatched ({matchHealth}%)
              </span>
            </div>
            <Progress value={matchHealth} className="h-2" />
          </div>
          {totals.missingCost > 0 && (
            <div className="flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5" />
              {num(totals.missingCost)} unit-এর cost price নেই — profit কম/বেশি দেখাতে পারে
            </div>
          )}
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Campaign name বা campaign id…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button
          variant={verdictFilter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setVerdictFilter("all")}
        >
          All ({all.length})
        </Button>
        {VERDICTS.map((v) => (
          <Button
            key={v.key}
            variant={verdictFilter === v.key ? "default" : "outline"}
            size="sm"
            onClick={() => setVerdictFilter(v.key)}
          >
            {v.label} ({verdictCounts[v.key] ?? 0})
          </Button>
        ))}
        <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          Min spend
          <Input
            type="number"
            className="h-8 w-24"
            value={minSpend || ""}
            placeholder="0"
            onChange={(e) => setMinSpend(Number(e.target.value) || 0)}
          />
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {q.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 7 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              এই filter/range-এ কোনো campaign নেই।
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-muted/70 text-[11px] uppercase tracking-wide text-muted-foreground backdrop-blur">
                  <tr>
                    <th className="p-2 text-left">Campaign</th>
                    <th className="p-2 text-left">Verdict</th>
                    <SortTh k="spend" label="Spend" {...{ sortKey, sortDesc, toggleSort }} />
                    <th className="p-2 text-right">Meta purch.</th>
                    <SortTh k="orders" label="Real orders" {...{ sortKey, sortDesc, toggleSort }} />
                    <th className="p-2 text-right">Match</th>
                    <th className="p-2 text-right">Delivered</th>
                    <SortTh
                      k="delivered_revenue"
                      label="Delivered rev"
                      {...{ sortKey, sortDesc, toggleSort }}
                    />
                    <SortTh k="gross_profit" label="Gross profit" {...{ sortKey, sortDesc, toggleSort }} />
                    <SortTh k="net_profit" label="Net profit" {...{ sortKey, sortDesc, toggleSort }} />
                    <SortTh k="net_margin" label="Margin" {...{ sortKey, sortDesc, toggleSort }} />
                    <SortTh k="actual_roas" label="ROAS" {...{ sortKey, sortDesc, toggleSort }} />
                    <SortTh k="profit_roas" label="Profit ROAS" {...{ sortKey, sortDesc, toggleSort }} />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const vm = verdictMeta(r.verdict);
                    const open = openRow === r.id;
                    return (
                      <Fragment key={r.id}>
                        <tr
                          className="cursor-pointer border-t hover:bg-muted/30"
                          onClick={() => setOpenRow(open ? null : r.id)}
                        >
                          <td className="max-w-[280px] p-2">
                            <div className="flex items-center gap-1.5">
                              <ChevronRight
                                className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
                              />
                              <div className="min-w-0">
                                <div className="truncate font-medium">{r.name}</div>
                                <div className="flex items-center gap-1.5">
                                  <Badge variant="outline" className="h-4 px-1 text-[10px]">
                                    {r.status}
                                  </Badge>
                                  <span className="truncate font-mono text-[10px] text-muted-foreground">
                                    {r.external_id ?? "—"}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="p-2">
                            <Badge variant="outline" className={`h-5 px-1.5 text-[10px] ${vm.tone}`}>
                              {vm.label}
                            </Badge>
                          </td>
                          <td className="p-2 text-right tabular-nums">{bdt(r.spend)}</td>
                          <td className="p-2 text-right tabular-nums text-muted-foreground">
                            {r.meta_purchases}
                          </td>
                          <td className="p-2 text-right font-medium tabular-nums">
                            {r.orders}
                            <span
                              className={`ml-1 text-[10px] ${r.purchase_gap >= 0 ? "text-emerald-600" : "text-rose-600"}`}
                            >
                              {r.purchase_gap > 0 ? "+" : ""}
                              {r.purchase_gap}
                            </span>
                          </td>
                          <td className="p-2 text-right">
                            <div className="flex flex-col items-end gap-0.5">
                              <Badge
                                variant="outline"
                                className={`h-4 px-1 text-[10px] ${matchTone(r.match_status)}`}
                              >
                                {matchLabel(r.match_status)}
                              </Badge>
                              <span className="text-[10px] tabular-nums text-muted-foreground">
                                {r.attributed_orders}/{r.unlinked_orders}
                              </span>
                            </div>
                          </td>
                          <td className="p-2 text-right tabular-nums">
                            {r.delivered_orders}
                            <span className="ml-1 text-[10px] text-muted-foreground">
                              {r.delivery_rate}%
                            </span>
                          </td>
                          <td className="p-2 text-right tabular-nums">{bdt(r.delivered_revenue)}</td>
                          <td className="p-2 text-right tabular-nums">{bdt(r.gross_profit)}</td>
                          <td
                            className={`p-2 text-right font-semibold tabular-nums ${r.net_profit >= 0 ? "text-emerald-600" : "text-rose-600"}`}
                          >
                            <span className="inline-flex items-center gap-1">
                              {r.net_profit >= 0 ? (
                                <TrendingUp className="h-3 w-3" />
                              ) : (
                                <TrendingDown className="h-3 w-3" />
                              )}
                              {bdt(r.net_profit)}
                            </span>
                          </td>
                          <td
                            className={`p-2 text-right tabular-nums ${r.net_margin >= 0 ? "text-emerald-600" : "text-rose-600"}`}
                          >
                            {r.net_margin.toFixed(1)}%
                          </td>
                          <td className="p-2 text-right tabular-nums">{r.actual_roas.toFixed(2)}x</td>
                          <td
                            className={`p-2 text-right font-medium tabular-nums ${r.profit_roas >= 1 ? "text-emerald-600" : "text-rose-600"}`}
                          >
                            {r.profit_roas.toFixed(2)}x
                          </td>
                        </tr>
                        {open && (
                          <tr className="border-t bg-muted/20">
                            <td colSpan={13} className="p-3">
                              <ProfitBridge row={r} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
                <tfoot className="border-t-2 bg-muted/40 text-xs font-semibold">
                  <tr>
                    <td className="p-2">Total ({rows.length})</td>
                    <td />
                    <td className="p-2 text-right tabular-nums">{bdt(totals.spend)}</td>
                    <td className="p-2 text-right tabular-nums">{num(totals.metaP)}</td>
                    <td className="p-2 text-right tabular-nums">{num(totals.orders)}</td>
                    <td />
                    <td className="p-2 text-right tabular-nums">{num(totals.delivered)}</td>
                    <td className="p-2 text-right tabular-nums">{bdt(totals.rev)}</td>
                    <td className="p-2 text-right tabular-nums">{bdt(totals.gp)}</td>
                    <td
                      className={`p-2 text-right tabular-nums ${totals.net >= 0 ? "text-emerald-600" : "text-rose-600"}`}
                    >
                      {bdt(totals.net)}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {totals.rev > 0 ? ((totals.net / totals.rev) * 100).toFixed(1) + "%" : "—"}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {totals.spend > 0 ? (totals.rev / totals.spend).toFixed(2) + "x" : "—"}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {totals.spend > 0 ? (totals.gp / totals.spend).toFixed(2) + "x" : "—"}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SortTh({
  k,
  label,
  sortKey,
  sortDesc,
  toggleSort,
}: {
  k: SortKey;
  label: string;
  sortKey: SortKey;
  sortDesc: boolean;
  toggleSort: (k: SortKey) => void;
}) {
  const active = sortKey === k;
  return (
    <th className="p-2 text-right">
      <button
        type="button"
        onClick={() => toggleSort(k)}
        className={`inline-flex items-center gap-1 uppercase ${active ? "text-foreground" : ""}`}
      >
        {label}
        <ArrowUpDown className="h-3 w-3 opacity-60" />
        {active && <span className="text-[9px]">{sortDesc ? "↓" : "↑"}</span>}
      </button>
    </th>
  );
}

function ProfitBridge({ row }: { row: CampaignTruthRow }) {
  const steps = [
    { l: "Delivered revenue", v: row.delivered_revenue, tone: "text-foreground" },
    { l: "− COGS", v: -row.cogs, tone: "text-rose-600" },
    { l: "− Courier/packaging/refund", v: -row.operating_cost, tone: "text-rose-600" },
    { l: "= Gross profit", v: row.gross_profit, tone: "text-foreground font-semibold" },
    { l: "− Ad spend", v: -row.spend, tone: "text-rose-600" },
    {
      l: "= Net profit",
      v: row.net_profit,
      tone: row.net_profit >= 0 ? "text-emerald-600 font-semibold" : "text-rose-600 font-semibold",
    },
  ];
  return (
    <div className="grid gap-3 md:grid-cols-[2fr_1fr]">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {steps.map((s) => (
          <div key={s.l} className="rounded-lg border bg-background p-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{s.l}</div>
            <div className={`mt-0.5 text-sm tabular-nums ${s.tone}`}>{bdt(s.v)}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <Stat l="Break-even ROAS" v={row.breakeven_roas ? row.breakeven_roas.toFixed(2) + "x" : "—"} />
        <Stat l="CAC (delivered)" v={row.cac ? bdt(row.cac) : "—"} />
        <Stat l="CPA (all orders)" v={row.cpa ? bdt(row.cpa) : "—"} />
        <Stat
          l="Return / cancel"
          v={`${row.returned_orders} / ${row.cancelled_orders}`}
        />
        <Stat l="In progress" v={String(row.in_progress_orders)} />
        <Stat
          l="Meta value"
          v={bdt(row.meta_purchase_value)}
        />
      </div>
    </div>
  );
}

function Stat({ l, v }: { l: string; v: string }) {
  return (
    <div className="rounded-lg border bg-background p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{l}</div>
      <div className="mt-0.5 tabular-nums">{v}</div>
    </div>
  );
}
