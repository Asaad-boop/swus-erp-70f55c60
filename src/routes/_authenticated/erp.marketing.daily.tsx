import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { toast } from "sonner";
import {
  RefreshCcw,
  Download,
  Plus,
  AlertTriangle,
  TrendingUp,
  ArrowLeft,
  Loader2, BarChart3 as PageIcon } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useBrand } from "@/contexts/brand-context";
import { BrandTabs } from "@/components/erp/marketing/marketing-shell";

import {
  DateRangePicker,
  buildPreset,
  type MktRangeValue,
} from "@/components/erp/marketing/date-range-picker";
import {
  getDailyPerformance,
  quickAddDollarPurchase,
} from "@/lib/erp/marketing/daily.functions";

const searchSchema = z.object({
  brand: fallback(z.string(), "all").default("all"),
  from: fallback(z.string(), "").default(""),
  to: fallback(z.string(), "").default(""),
  view: fallback(z.enum(["table", "chart"]), "table").default("table"),
});

export const Route = createFileRoute("/_authenticated/erp/marketing/daily")({
  head: () => ({
    meta: [
      { title: "Daily Performance — Marketing ERP" },
      {
        name: "description",
        content:
          "Day-by-day marketing performance: real ad spend versus Meta reported spend, delivered revenue, ROAS, CPO and dollar purchase drift.",
      },
      { property: "og:title", content: "Daily Performance — Marketing ERP" },
      {
        property: "og:description",
        content: "Track daily spend drift between real dollar cost and Meta reported numbers.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: zodValidator(searchSchema),
  component: DailyPerformancePage,
});

const bdt = (n: number) => "৳" + Math.round(n).toLocaleString("en-IN");

// A row is "recent" if its date is within the last 3 days (Asia/Dhaka-ish,
// we use UTC boundary — good enough for a UX hint).
function isRecentDay(day: string): boolean {
  const t = Date.parse(day + "T00:00:00Z");
  if (!Number.isFinite(t)) return false;
  const ageMs = Date.now() - t;
  return ageMs < 3 * 86400000;
}

function DailyPerformancePage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { brands, isLoading: brandsLoading } = useBrand();

  const selection = useMemo(() => {
    if (search.brand === "all")
      return { key: "all", label: "All", ids: brands.map((b) => b.id) };
    const b = brands.find((x) => x.slug === search.brand || x.id === search.brand);
    if (b) return { key: b.slug, label: b.name, ids: [b.id] };
    return { key: "all", label: "All", ids: brands.map((b) => b.id) };
  }, [search.brand, brands]);

  // Range — default last 30 days; URL overrides if valid
  const range: MktRangeValue = useMemo(() => {
    if (search.from && search.to)
      return { presetKey: "custom", label: "Custom", from: search.from, to: search.to };
    return buildPreset("30d");
  }, [search.from, search.to]);

  const setRange = (v: MktRangeValue) =>
    navigate({
      search: (prev: any) => ({ ...prev, from: v.from, to: v.to }),
      replace: true,
    });
  const setBrand = (nextSlug: string) =>
    navigate({ search: (prev: any) => ({ ...prev, brand: nextSlug }), replace: true });
  const setView = (v: "table" | "chart") =>
    navigate({ search: (prev: any) => ({ ...prev, view: v }), replace: true });

  const fetchDaily = useServerFn(getDailyPerformance);
  const q = useQuery({
    queryKey: [
      "mkt-daily",
      selection.ids.slice().sort().join(","),
      range.from,
      range.to,
    ],
    queryFn: () =>
      fetchDaily({
        data: { brandIds: selection.ids, from: range.from, to: range.to },
      }),
    enabled: selection.ids.length > 0,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const [addOpen, setAddOpen] = useState(false);

  function exportCsv() {
    const rows = q.data?.rows ?? [];
    if (!rows.length) {
      toast.info("Kono row nei export korar mto");
      return;
    }
    const header = [
      "date",
      "spend_bdt",
      "confirmed_orders",
      "delivered_orders",
      "delivered_revenue_bdt",
      "real_roas",
      "meta_revenue_bdt",
      "meta_orders",
      "meta_roas",
      "drift_pct",
      "flags",
    ];
    const lines = [header.join(",")];
    for (const r of rows) {
      const flags = [
        r.cost_missing ? "cost_missing" : "",
        r.fx_estimated ? "fx_estimated" : "",
      ]
        .filter(Boolean)
        .join(";");
      lines.push(
        [
          r.day,
          Math.round(r.spend_bdt),
          r.confirmed_orders,
          r.delivered_orders,
          Math.round(r.delivered_revenue_bdt),
          r.real_roas != null ? r.real_roas.toFixed(2) : "",
          r.meta_revenue_bdt != null ? Math.round(r.meta_revenue_bdt) : "",
          r.meta_orders,
          r.meta_roas != null ? r.meta_roas.toFixed(2) : "",
          r.drift_pct != null ? r.drift_pct.toFixed(1) : "",
          flags,
        ].join(","),
      );
    }
    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `marketing-daily-${range.from}_${range.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <PageIcon className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-xl font-bold tracking-tight">Daily Performance</h1>
            <p className="text-xs text-muted-foreground">
              {selection.label} · {range.label} · real vs Meta drift
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BrandTabs value={selection.key} onChange={setBrand} />
          <DateRangePicker value={range} onChange={setRange} />
          <Tabs value={search.view} onValueChange={(v) => setView(v as any)}>
            <TabsList className="h-9">
              <TabsTrigger value="table" className="text-xs">Table</TabsTrigger>
              <TabsTrigger value="chart" className="text-xs">Chart</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button size="sm" variant="outline" onClick={() => q.refetch()} disabled={q.isFetching}>
            <RefreshCcw className={cn("h-3.5 w-3.5 mr-1.5", q.isFetching && "animate-spin")} />
            Refresh
          </Button>
          <Button size="sm" variant="outline" onClick={exportCsv}>
            <Download className="h-3.5 w-3.5 mr-1.5" />
            CSV
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add dollar purchase
          </Button>
        </div>
      </div>

      {q.error && (
        <Card className="border-destructive/40">
          <CardContent className="py-3 text-sm text-destructive">
            Load fail: {(q.error as Error).message}
          </CardContent>
        </Card>
      )}

      {search.view === "chart" ? (
        <ChartView loading={q.isLoading} rows={q.data?.rows ?? []} />
      ) : (
        <TableView loading={q.isLoading} rows={q.data?.rows ?? []} totals={q.data?.totals} />
      )}

      <QuickAddDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        brandIds={selection.ids}
        onDone={() => q.refetch()}
      />
    </div>
  );
}

type Row = Awaited<ReturnType<typeof getDailyPerformance>>["rows"][number];
type Totals = Awaited<ReturnType<typeof getDailyPerformance>>["totals"];

function driftClass(drift: number | null): string {
  if (drift == null) return "text-muted-foreground";
  const abs = Math.abs(drift);
  if (abs >= 40) return "text-rose-600 font-semibold";
  if (abs >= 20) return "text-amber-600 font-semibold";
  return "text-foreground";
}

function TableView({
  loading,
  rows,
  totals,
}: {
  loading: boolean;
  rows: Row[];
  totals?: Totals;
}) {
  if (loading) {
    return (
      <Card>
        <CardContent className="p-4 space-y-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Date</th>
                <th className="text-right px-3 py-2 font-medium">Spend</th>
                <th
                  className="text-right px-3 py-2 font-medium"
                  title="Attributed orders that reached confirmed status on this date (early signal — not the same as delivered)"
                >
                  Confirmed
                </th>
                <th
                  className="text-right px-3 py-2 font-medium"
                  title="Attributed orders delivered on this date. Confirmed ≠ Delivered — orders may deliver on a different day."
                >
                  Delivered
                </th>
                <th className="text-right px-3 py-2 font-medium">Delivered rev.</th>
                <th className="text-right px-3 py-2 font-medium">Real ROAS</th>
                <th className="text-right px-3 py-2 font-medium">Meta rev.</th>
                <th className="text-right px-3 py-2 font-medium">Meta ROAS</th>
                <th className="text-right px-3 py-2 font-medium">Drift</th>
                <th className="text-left px-3 py-2 font-medium">Flags</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="text-center py-6 text-muted-foreground text-xs">
                    Ei range-e kono data nei
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.day} className="border-t hover:bg-muted/30">
                  <td className="px-3 py-2 tabular-nums font-mono text-xs">{r.day}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.spend_bdt > 0 ? bdt(r.spend_bdt) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {r.confirmed_orders || "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.delivered_orders || "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.delivered_revenue_bdt > 0 ? bdt(r.delivered_revenue_bdt) : "—"}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right tabular-nums",
                      r.real_roas != null && r.real_roas >= 1
                        ? "text-emerald-600"
                        : r.real_roas != null
                          ? "text-rose-600"
                          : "text-muted-foreground",
                    )}
                  >
                    {r.real_roas != null ? (
                      r.real_roas.toFixed(2) + "x"
                    ) : r.spend_bdt > 0 && r.delivered_revenue_bdt === 0 && isRecentDay(r.day) ? (
                      <span
                        className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                        title="Delivered orders এখনও pending — ROAS পরে calculate হবে যখন orders deliver হবে"
                      >
                        Pending
                      </span>
                    ) : r.spend_bdt > 0 && r.delivered_revenue_bdt === 0 ? (
                      <span
                        className="text-muted-foreground"
                        title="Meta sync-এর আগের data — delivered revenue unavailable"
                      >
                        —
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.meta_revenue_bdt != null ? bdt(r.meta_revenue_bdt) : "—"}
                    {r.meta_orders > 0 && (
                      <span className="text-[10px] text-muted-foreground ml-1">
                        · {r.meta_orders}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.meta_roas != null ? r.meta_roas.toFixed(2) + "x" : "—"}
                  </td>
                  <td className={cn("px-3 py-2 text-right tabular-nums", driftClass(r.drift_pct))}>
                    {r.drift_pct != null
                      ? (r.drift_pct > 0 ? "+" : "") + r.drift_pct.toFixed(0) + "%"
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-left">
                    <div className="flex gap-1">
                      {r.cost_missing && (
                        <Badge
                          variant="outline"
                          className="text-[9px] px-1.5 py-0 border-amber-300 text-amber-700"
                          title="Kichu order-line-e cost snapshot nei"
                        >
                          <AlertTriangle className="h-2.5 w-2.5 mr-0.5" /> cost
                        </Badge>
                      )}
                      {r.fx_estimated && (
                        <Badge
                          variant="outline"
                          className="text-[9px] px-1.5 py-0 border-sky-300 text-sky-700"
                          title="Same-day fx unavailable → latest fx use kora hoyeche"
                        >
                          fx est.
                        </Badge>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            {totals && rows.length > 0 && (
              <tfoot className="bg-muted/50 border-t-2 font-semibold text-xs">
                <tr>
                  <td className="px-3 py-2">Total ({rows.length}d)</td>
                  <td className="px-3 py-2 text-right tabular-nums">{bdt(totals.spend_bdt)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {totals.confirmed_orders}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{totals.delivered_orders}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {bdt(totals.delivered_revenue_bdt)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {totals.spend_bdt > 0
                      ? (totals.delivered_revenue_bdt / totals.spend_bdt).toFixed(2) + "x"
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {totals.meta_revenue_bdt > 0 ? bdt(totals.meta_revenue_bdt) : "—"}
                    {totals.meta_orders > 0 && (
                      <span className="text-[10px] text-muted-foreground ml-1">
                        · {totals.meta_orders}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {totals.spend_bdt > 0 && totals.meta_revenue_bdt > 0
                      ? (totals.meta_revenue_bdt / totals.spend_bdt).toFixed(2) + "x"
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {totals.delivered_revenue_bdt > 0 && totals.meta_revenue_bdt > 0
                      ? (
                          ((totals.meta_revenue_bdt - totals.delivered_revenue_bdt) /
                            totals.delivered_revenue_bdt) *
                          100
                        ).toFixed(0) + "%"
                      : "—"}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function ChartView({ loading, rows }: { loading: boolean; rows: Row[] }) {
  if (loading) {
    return (
      <Card>
        <CardContent className="p-4">
          <Skeleton className="h-72 w-full" />
        </CardContent>
      </Card>
    );
  }
  const data = rows.slice().reverse(); // chronological
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <TrendingUp className="h-4 w-4" /> Spend vs Delivered Revenue
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="day"
                tickFormatter={(d) => (d ? d.slice(5) : "")}
                tick={{ fontSize: 10 }}
              />
              <YAxis
                tick={{ fontSize: 10 }}
                tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
              />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 6 }}
                formatter={(v: any, name: any) => [bdt(Number(v)), name]}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                type="monotone"
                name="Spend"
                dataKey="spend_bdt"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                name="Delivered rev."
                dataKey="delivered_revenue_bdt"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                name="Meta rev."
                dataKey="meta_revenue_bdt"
                stroke="#f59e0b"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// ---- Quick-add dialog ----

function todayYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function QuickAddDialog({
  open,
  onOpenChange,
  brandIds,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  brandIds: string[];
  onDone: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState("");
  const [date, setDate] = useState(todayYmd());
  const [note, setNote] = useState("");

  const addFn = useServerFn(quickAddDollarPurchase);
  const mut = useMutation({
    mutationFn: () =>
      addFn({
        data: {
          brandIds,
          usdAmount: parseFloat(amount),
          usdRate: parseFloat(rate),
          purchaseDate: date,
          note: note.trim() || undefined,
          confirm: true,
        },
      }),
    onSuccess: () => {
      toast.success("Dollar purchase confirmed");
      onDone();
      onOpenChange(false);
      setAmount("");
      setRate("");
      setNote("");
    },
    onError: (e: any) => toast.error(e?.message ?? "Save fail"),
  });

  const bdtPreview = (() => {
    const a = parseFloat(amount);
    const r = parseFloat(rate);
    if (!Number.isFinite(a) || !Number.isFinite(r)) return null;
    return a * r;
  })();

  const disabled =
    mut.isPending ||
    !amount ||
    !rate ||
    !Number.isFinite(parseFloat(amount)) ||
    !Number.isFinite(parseFloat(rate)) ||
    parseFloat(amount) <= 0 ||
    parseFloat(rate) <= 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add dollar purchase</DialogTitle>
          <DialogDescription>
            Quick log — ad account + paid-from default se auto-pick hobe. Detail dorkar hole
            Finance → Dollar Purchase page use koro.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-1">
            <Label htmlFor="qd-amount" className="text-xs">USD amount</Label>
            <Input
              id="qd-amount"
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 200"
            />
          </div>
          <div className="col-span-1">
            <Label htmlFor="qd-rate" className="text-xs">USD → BDT rate</Label>
            <Input
              id="qd-rate"
              type="number"
              step="0.01"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder="e.g. 131"
            />
          </div>
          <div className="col-span-2">
            <Label htmlFor="qd-date" className="text-xs">Purchase date</Label>
            <Input
              id="qd-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="col-span-2">
            <Label htmlFor="qd-note" className="text-xs">Note (optional)</Label>
            <Input
              id="qd-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="reference / supplier"
            />
          </div>
          {bdtPreview != null && (
            <div className="col-span-2 text-xs text-muted-foreground bg-muted/40 rounded px-2 py-1.5">
              Total: <span className="font-semibold text-foreground">{bdt(bdtPreview)}</span>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={mut.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mut.mutate()} disabled={disabled}>
            {mut.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Save & confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}