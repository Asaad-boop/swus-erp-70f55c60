import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueries, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Truck, CheckCircle2, Clock, AlertCircle, TrendingUp, Upload, ListChecks,
  Package, ShieldCheck, ArrowRight, Wallet,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
} from "recharts";
import { useBrand } from "@/contexts/brand-context";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BrandBadge } from "@/components/erp/brand-badge";
import { fmtBdt } from "@/lib/erp/finance";
import { getReconciliationStats } from "@/lib/erp/reconciliation-stats.functions";
import { getReconciliationDashboard } from "@/lib/erp/reconciliation-queue.functions";
import { SettlementUploadDialog } from "@/components/erp/finance/settlement-upload-dialog";
import { SettlementLinesDialog } from "@/components/erp/finance/settlement-lines-dialog";
import type { RemittanceRow } from "@/components/erp/finance/remittance-form";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/erp/reconciliation/")({
  head: () => ({ meta: [{ title: "COD Reconciliation — ERP" }] }),
  component: OverviewPage,
});

const REVIEW_ACTIONS = [
  { value: "partial_delivery", label: "Partial Delivery" },
  { value: "partial_return", label: "Partial Return" },
  { value: "exchange", label: "Exchange" },
  { value: "internal_adjust", label: "Internal Adjustment" },
];

type ReviewLine = {
  id: string;
  remittance_id: string;
  brand_id: string;
  matched_order_id: string | null;
  merchant_order_id: string | null;
  consignment_id: string | null;
  collected_amount: number | null;
  expected_amount: number | null;
  variance: number | null;
  created_at: string;
};

type OrderCtx = {
  id: string;
  invoice_no: string | null;
  total: number | null;
  advance_amount: number | null;
  delivered_at: string | null;
  status: string | null;
};

function OverviewPage() {
  const { brandIds, isLoading: brandLoading, brands } = useBrand();
  const qc = useQueryClient();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [linesFor, setLinesFor] = useState<RemittanceRow | null>(null);

  const statsFn = useServerFn(getReconciliationStats);
  const dashFn = useServerFn(getReconciliationDashboard);

  // Per-brand fan-out (backend unchanged: single brand id per call).
  const statsQueries = useQueries({
    queries: brandIds.map((bid) => ({
      queryKey: ["reconciliation-stats", bid],
      queryFn: () => statsFn({ data: { brandId: bid } }),
      enabled: !!bid,
    })),
  });
  const dashQueries = useQueries({
    queries: brandIds.map((bid) => ({
      queryKey: ["reconciliation-dashboard", bid],
      queryFn: () => dashFn({ data: { brandId: bid } }),
      enabled: !!bid,
    })),
  });

  const statsLoading = statsQueries.some((q) => q.isLoading);
  const dashLoading = dashQueries.some((q) => q.isLoading);

  const orderStatus = useMemo(() => {
    const agg: Record<string, number> = {};
    let total = 0;
    for (const q of statsQueries) {
      const s = q.data;
      if (!s) continue;
      total += s.totals.totalOrders;
      for (const [k, v] of Object.entries(s.orderStatus)) agg[k] = (agg[k] ?? 0) + (v as number);
    }
    return { agg, total };
  }, [statsQueries]);

  const kpis = useMemo(() => {
    const k = { pendingTotal: 0, pendingCount: 0, reconciledTotal: 0, outstandingTotal: 0, outstandingCount: 0, netCod: 0 };
    for (const q of dashQueries) {
      const d = q.data?.kpis;
      if (!d) continue;
      k.pendingTotal += d.pendingTotal;
      k.pendingCount += d.pendingCount;
      k.reconciledTotal += d.reconciledTotal;
      k.outstandingTotal += d.outstandingTotal;
      k.outstandingCount += d.outstandingCount;
      k.netCod += d.netCod;
    }
    return k;
  }, [dashQueries]);

  // 7-day chart — aggregate last 7 of the 30-day series across brands
  const chart7 = useMemo(() => {
    const map = new Map<string, { date: string; expected: number; collected: number }>();
    for (const q of dashQueries) {
      const rows = q.data?.dailySeries ?? [];
      for (const r of rows) {
        const prev = map.get(r.date) ?? { date: r.date, expected: 0, collected: 0 };
        prev.expected += r.expected;
        prev.collected += r.collected;
        map.set(r.date, prev);
      }
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date)).slice(-7);
  }, [dashQueries]);

  // Needs-review settlement lines (brand-scoped)
  const reviewQ = useQuery({
    queryKey: ["settlement-needs-review", brandIds.join(",")],
    enabled: brandIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("erp_courier_settlement_lines")
        .select("id,remittance_id,brand_id,matched_order_id,merchant_order_id,consignment_id,collected_amount,expected_amount,variance,created_at")
        .eq("match_status", "needs_review")
        .in("brand_id", brandIds)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as ReviewLine[];
    },
  });
  const reviewLines = reviewQ.data ?? [];

  // Exact needs-review count (list above is capped at 50 rows).
  const reviewCountQ = useQuery({
    queryKey: ["settlement-needs-review-count", brandIds.join(",")],
    enabled: brandIds.length > 0,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("erp_courier_settlement_lines")
        .select("id", { count: "exact", head: true })
        .eq("match_status", "needs_review")
        .in("brand_id", brandIds);
      if (error) throw error;
      return count ?? 0;
    },
  });
  const reviewCount = reviewCountQ.data ?? reviewLines.length;

  const reviewOrderIds = useMemo(
    () => Array.from(new Set(reviewLines.map((r) => r.matched_order_id).filter((x): x is string => !!x))),
    [reviewLines],
  );
  const reviewCtxQ = useQuery({
    queryKey: ["settlement-review-orders", reviewOrderIds.join(",")],
    enabled: reviewOrderIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id,invoice_no,total,advance_amount,delivered_at,status")
        .in("id", reviewOrderIds);
      if (error) throw error;
      const m = new Map<string, OrderCtx>();
      for (const o of (data ?? []) as OrderCtx[]) m.set(o.id, o);
      return m;
    },
  });
  const ctxMap = reviewCtxQ.data ?? new Map<string, OrderCtx>();

  // Advance-covered: orders with advance_amount > 0 and reconciled (MTD)
  const advanceQ = useQuery({
    queryKey: ["advance-covered-mtd", brandIds.join(",")],
    enabled: brandIds.length > 0,
    queryFn: async () => {
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      const { count, error } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .in("brand_id", brandIds)
        .gt("advance_amount", 0)
        .eq("reconciliation_status", "reconciled")
        .gte("delivered_at", monthStart);
      if (error) throw error;
      return { count: count ?? 0 };
    },
  });
  const advanceCount = advanceQ.data?.count ?? 0;

  // Recent settlement batches
  const batchesQ = useQuery({
    queryKey: ["recent-settlement-batches", brandIds.join(",")],
    enabled: brandIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("erp_cod_remittances")
        .select("*")
        .in("brand_id", brandIds)
        .order("remittance_date", { ascending: false })
        .limit(3);
      if (error) throw error;
      return (data ?? []) as RemittanceRow[];
    },
  });
  const batches = batchesQ.data ?? [];

  const actionMut = useMutation({
    mutationFn: async ({ lineId, action }: { lineId: string; action: string }) => {
      const { error } = await supabase.rpc("apply_settlement_variance_action", { _line_id: lineId, _action: action });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Order status updated");
      qc.invalidateQueries({ queryKey: ["settlement-needs-review"] });
      qc.invalidateQueries({ queryKey: ["settlement-needs-review-count"] });
      qc.invalidateQueries({ queryKey: ["settlement-review-orders"] });
      qc.invalidateQueries({ queryKey: ["reconciliation-dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const activeBrandForUpload = brandIds.length === 1 ? brandIds[0] : null;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">COD Reconciliation</h1>
          <p className="text-sm text-muted-foreground">
            Courier settlement, pending COD ar review queue — active brand context anujayi.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/erp/reconciliation/pending"><Clock className="h-4 w-4 mr-1.5" /> Pending queue</Link>
          </Button>
          <Button size="sm" onClick={() => setUploadOpen(true)} disabled={brandIds.length === 0}>
            <Upload className="h-4 w-4 mr-1.5" /> Upload settlement
          </Button>
        </div>
      </header>

      {brandIds.length === 0 && !brandLoading && (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No active brands.</CardContent></Card>
      )}

      {/* KPI strip */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi title="Pending COD" value={fmtBdt(kpis.pendingTotal)} sub={`${kpis.pendingCount} orders`} icon={<Clock className="h-4 w-4" />} loading={dashLoading} />
        <Kpi title="Reconciled (MTD)" value={fmtBdt(kpis.reconciledTotal)} icon={<CheckCircle2 className="h-4 w-4" />} loading={dashLoading} tone="good" />
        <Kpi title="Needs review" value={String(reviewCount)} sub="settlement lines" icon={<AlertCircle className="h-4 w-4" />} loading={reviewCountQ.isLoading} tone="warn" />
        <Kpi title="Net to bank (MTD)" value={fmtBdt(kpis.netCod)} icon={<TrendingUp className="h-4 w-4" />} loading={dashLoading} />
        <Kpi title="Advance covered" value={String(advanceCount)} sub="orders (MTD)" icon={<Wallet className="h-4 w-4" />} loading={advanceQ.isLoading} />
      </div>

      {/* Needs review — prominent */}
      <section className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-700">
            Needs Review · {reviewCount}
          </h2>
          <p className="text-xs text-muted-foreground">
            Variance settlement lines waiting on a decision.
            {reviewCount > reviewLines.length && ` (showing ${reviewLines.length})`}
          </p>
        </div>
        {reviewQ.isLoading ? (
          <Card><CardContent className="py-6 text-center text-sm text-muted-foreground">Loading…</CardContent></Card>
        ) : reviewLines.length === 0 ? (
          <Card className="border-emerald-500/30 bg-emerald-500/5">
            <CardContent className="py-6 text-center text-sm text-emerald-700 dark:text-emerald-300 flex items-center justify-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> Kono review-pending settlement line nei.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-2">
            {reviewLines.map((r) => {
              const ctx = r.matched_order_id ? ctxMap.get(r.matched_order_id) : undefined;
              const days = ctx?.delivered_at
                ? Math.floor((Date.now() - new Date(ctx.delivered_at).getTime()) / 86400000)
                : null;
              const variance = Number(r.variance ?? 0);
              return (
                <Card key={r.id} className="border-amber-500/40 bg-amber-500/5">
                  <CardContent className="p-3 flex flex-wrap items-center gap-3">
                    <div className="min-w-[160px] space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-semibold">
                          {ctx?.invoice_no ?? r.merchant_order_id ?? "—"}
                        </span>
                        <BrandBadge brandId={r.brand_id} variant="compact" />
                      </div>
                      <div className="text-[10px] text-muted-foreground font-mono">{r.consignment_id ?? ""}</div>
                      {days != null && (
                        <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          <Clock className="h-3 w-3" /> {days}d
                        </span>
                      )}
                    </div>
                    <div className="flex gap-4 text-xs tabular-nums flex-1 min-w-[260px]">
                      <Metric label="Expected" value={r.expected_amount != null ? fmtBdt(r.expected_amount) : "—"} />
                      <Metric label="Collected" value={r.collected_amount != null ? fmtBdt(r.collected_amount) : "—"} />
                      <Metric
                        label="Variance"
                        value={`${variance >= 0 ? "+" : ""}${fmtBdt(variance)}`}
                        cls={variance < 0 ? "text-red-600 font-semibold" : variance > 0 ? "text-emerald-600 font-semibold" : ""}
                      />
                    </div>
                    <div className="flex items-center gap-2 ml-auto">
                      <Select
                        onValueChange={(v) => actionMut.mutate({ lineId: r.id, action: v })}
                        disabled={actionMut.isPending || !r.matched_order_id}
                      >
                        <SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue placeholder="Pick reason…" /></SelectTrigger>
                        <SelectContent>
                          {REVIEW_ACTIONS.map((a) => <SelectItem key={a.value} value={a.value} className="text-xs">{a.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Chart + Batches */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-semibold">Collected vs Expected · last 7 days</h3>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                {brandIds.length === brands.length ? "All brands" : `${brandIds.length} brand${brandIds.length > 1 ? "s" : ""}`}
              </span>
            </div>
            <div className="h-56 w-full">
              {dashLoading ? (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Loading…</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chart7}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="date" tickFormatter={(d) => String(d).slice(5)} className="text-xs" />
                    <YAxis tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} className="text-xs" />
                    <Tooltip formatter={(v: number) => fmtBdt(Number(v))} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="expected" name="Expected" fill="var(--muted-foreground)" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="collected" name="Collected" fill="var(--primary)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-semibold">Recent settlements</h3>
              <Link to="/erp/finance/receivables" search={{ tab: "cod" }} className="text-xs text-primary hover:underline">View all</Link>
            </div>
            {batchesQ.isLoading ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : batches.length === 0 ? (
              <div className="text-sm text-muted-foreground">No settlement batches yet.</div>
            ) : (
              <ul className="divide-y">
                {batches.map((b) => (
                  <li key={b.id} className="py-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium capitalize truncate">{b.courier} · {b.remittance_date}</div>
                      <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                        <BrandBadge brandId={b.brand_id} variant="compact" />
                        <span className="capitalize">{b.status}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold tabular-nums">{fmtBdt(b.amount)}</div>
                      <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => setLinesFor(b)}>
                        <ListChecks className="h-3 w-3 mr-1" /> Lines
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Order status tiles */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Order status</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="In transit" value={orderStatus.agg["in_transit"] ?? 0} icon={<Truck className="h-4 w-4" />} loading={statsLoading} />
          <StatTile label="Delivered" value={orderStatus.agg["delivered"] ?? 0} icon={<CheckCircle2 className="h-4 w-4" />} loading={statsLoading} />
          <StatTile label="Completed" value={orderStatus.agg["completed"] ?? 0} icon={<ShieldCheck className="h-4 w-4" />} loading={statsLoading} />
          <StatTile
            label="Returned"
            value={(orderStatus.agg["returned"] ?? 0) + (orderStatus.agg["full_return"] ?? 0) + (orderStatus.agg["partial_return"] ?? 0)}
            icon={<Package className="h-4 w-4" />}
            loading={statsLoading}
          />
        </div>
        <div className="text-[11px] text-muted-foreground">
          Total orders: <span className="font-medium">{orderStatus.total}</span>
          <Link to="/erp/orders" className="ml-3 text-primary hover:underline inline-flex items-center gap-1">
            View orders <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </section>

      <SettlementUploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        brandId={activeBrandForUpload}
        brandIds={brandIds}
      />
      <SettlementLinesDialog remittance={linesFor} onClose={() => setLinesFor(null)} />
    </div>
  );
}

function Kpi({
  title, value, sub, icon, loading, tone,
}: {
  title: string; value: string; sub?: string; icon: React.ReactNode; loading?: boolean;
  tone?: "good" | "warn" | "bad";
}) {
  const toneCard = tone === "warn" ? "border-amber-500/40 bg-amber-500/5"
    : tone === "good" ? "border-emerald-500/30"
    : tone === "bad" ? "border-red-500/40 bg-red-500/5"
    : "";
  const toneText = tone === "warn" ? "text-amber-700 dark:text-amber-300"
    : tone === "good" ? "text-emerald-700 dark:text-emerald-300"
    : tone === "bad" ? "text-red-700 dark:text-red-300"
    : "";
  return (
    <Card className={toneCard}>
      <CardContent className="p-4 space-y-1">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{title}</div>
          <span className={cn("text-muted-foreground", toneText)}>{icon}</span>
        </div>
        <div className={cn("text-xl font-bold tabular-nums", toneText)}>{loading ? "…" : value}</div>
        {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={cn("tabular-nums", cls)}>{value}</span>
    </div>
  );
}

function StatTile({ label, value, icon, loading }: { label: string; value: number; icon?: React.ReactNode; loading?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4 space-y-1">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{label}</div>
          <span className="text-muted-foreground">{icon}</span>
        </div>
        <div className="text-2xl font-bold tabular-nums">{loading ? "…" : value}</div>
      </CardContent>
    </Card>
  );
}