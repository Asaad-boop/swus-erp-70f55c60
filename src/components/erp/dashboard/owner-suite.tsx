/**
 * OWNER SUITE — CEO-level dashboard building blocks.
 * Order follows the owner spec: Executive KPI → Attention → Performance →
 * Target/Forecast → Marketing → Order health → Inventory → Products →
 * Brand/Category → Cash → Expense → Team → Health score → Activity.
 */
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, Banknote, Boxes, CheckCircle2,
  Clock, Coins, Gauge, Landmark, Megaphone, Package, PiggyBank, Receipt,
  ShoppingCart, Smartphone, Target, TrendingUp, Truck, Users, Wallet, Zap,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { applyBrandScope } from "@/lib/erp/apply-brand-scope";
import { fetchAllRows } from "@/lib/erp/fetch-all";
import { useUsdBdtRate } from "@/hooks/erp/use-fx-rate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type OwnerRange = { from: Date; to: Date; prevFrom: Date; prevTo: Date; days: number };
type P = { brandIds: string[]; enabled: boolean; range: OwnerRange };

const BDT = (n: number) => "৳" + Math.round(n).toLocaleString("en-IN");
const compact = (n: number) =>
  Math.abs(n) >= 1e7 ? (n / 1e7).toFixed(2) + "Cr"
  : Math.abs(n) >= 1e5 ? (n / 1e5).toFixed(2) + "L"
  : Math.abs(n) >= 1e3 ? (n / 1e3).toFixed(1) + "k"
  : String(Math.round(n));
const pct = (n: number) => (Number.isFinite(n) ? n : 0).toFixed(1) + "%";
const localDate = (d: Date) => {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
};
const delta = (a: number, b: number) => (b === 0 ? (a > 0 ? 100 : 0) : ((a - b) / b) * 100);
const EXCLUDED = "(new,cancelled,returned,fake,incomplete)";

function Empty({ text }: { text: string }) {
  return <p className="py-6 text-center text-[12px] text-slate-400">{text}</p>;
}
export function SectionCard({
  title, icon: Icon, action, children, className,
}: { title: string; icon?: any; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <Card className={cn("owner-panel border-slate-200", className)}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="flex items-center gap-2 text-[13px] font-semibold text-slate-800">
          {Icon ? <Icon className="size-4 text-slate-400" /> : null}
          {title}
        </CardTitle>
        {action}
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  );
}
function Chip({ v, invert }: { v: number; invert?: boolean }) {
  const up = v >= 0;
  const good = invert ? !up : up;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums",
      good ? "text-emerald-600" : "text-rose-600")}>
      {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
      {Math.abs(v).toFixed(1)}%
    </span>
  );
}

/* ============================================================
   1. EXECUTIVE KPI
============================================================ */
async function fetchPnl(brandIds: string[], from: Date, to: Date, fx: number | undefined) {
  const fromISO = from.toISOString(), toISO = to.toISOString();
  const [rows, itemRows, ads] = await Promise.all([
    fetchAllRows((f, t) =>
      applyBrandScope(supabase.from("orders").select("total, created_at, status, actual_shipping_cost"), brandIds)
        .not("status", "in", EXCLUDED).gte("created_at", fromISO).lte("created_at", toISO)
        .order("created_at", { ascending: true }).order("id", { ascending: true }).range(f, t),
    ),
    fetchAllRows((f, t) =>
      applyBrandScope(
        supabase.from("order_items").select(
          "product_id, quantity, unit_cost_snapshot, courier_cost_allocated, packaging_cost_allocated, orders!inner(brand_id,status,created_at)",
        ), brandIds, "orders.brand_id" as any,
      ).not("orders.status", "in", EXCLUDED).gte("orders.created_at", fromISO).lte("orders.created_at", toISO)
        .order("id", { ascending: true }).range(f, t),
    ),
    fetchAllRows((f, t) => applyBrandScope(supabase.from("mkt_insights_daily").select("date, spend, spend_bdt_fifo"), brandIds)
      .gte("date", localDate(from)).lte("date", localDate(to)).order("id", { ascending: true }).range(f, t)),
  ]);
  const revenue = rows.reduce((s, r) => s + Number(r.total ?? 0), 0);
  const orders = rows.length;

  const missing = Array.from(new Set(itemRows.filter(r => !(Number(r.unit_cost_snapshot ?? 0) > 0) && r.product_id).map(r => r.product_id)));
  const fallback = new Map<string, number>();
  if (missing.length) {
    const { data: prods } = await supabase.from("products").select("id, weighted_avg_cost, cost_price").in("id", missing.slice(0, 500));
    for (const p of (prods ?? []) as any[]) {
      const c = Number(p.weighted_avg_cost ?? 0) || Number(p.cost_price ?? 0);
      if (c > 0) fallback.set(p.id, c);
    }
  }
  let cogs = 0, courier = 0, pack = 0;
  for (const r of itemRows) {
    let u = Number(r.unit_cost_snapshot ?? 0);
    if (!(u > 0) && r.product_id) u = fallback.get(r.product_id) ?? 0;
    cogs += u * Number(r.quantity ?? 0);
    courier += Number(r.courier_cost_allocated ?? 0);
    pack += Number(r.packaging_cost_allocated ?? 0);
  }
  if (courier <= 0) courier = rows.reduce((s, r) => s + Number(r.actual_shipping_cost ?? 0), 0);

  let adSpend = 0;
  const adByDay = new Map<string, number>();
  for (const r of ads) {
    const v = Number(r.spend_bdt_fifo ?? 0) || (fx ? Number(r.spend ?? 0) * fx : 0);
    adSpend += v;
    adByDay.set(String(r.date), (adByDay.get(String(r.date)) ?? 0) + v);
  }

  const gross = revenue - cogs - courier - pack;
  const net = gross - adSpend;

  const byDay = new Map<string, { revenue: number; orders: number }>();
  for (const r of rows) {
    const k = localDate(new Date(r.created_at));
    const cur = byDay.get(k) ?? { revenue: 0, orders: 0 };
    cur.revenue += Number(r.total ?? 0); cur.orders += 1;
    byDay.set(k, cur);
  }
  const grossRatio = revenue > 0 ? gross / revenue : 0;
  const netRatio = revenue > 0 ? net / revenue : 0;
  const series = Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([d, v]) => ({
    d, revenue: v.revenue, orders: v.orders,
    gross: v.revenue * grossRatio, net: v.revenue * netRatio,
    spend: adByDay.get(d) ?? 0,
  }));

  return {
    revenue, orders, cogs, courier, pack, adSpend, gross, net,
    margin: revenue > 0 ? (net / revenue) * 100 : 0,
    aov: orders > 0 ? revenue / orders : 0,
    roas: adSpend > 0 ? revenue / adSpend : 0,
    series,
  };
}

function useExecutive({ brandIds, enabled, range }: P) {
  const { data: fx } = useUsdBdtRate(brandIds);
  return useQuery({
    queryKey: ["dash-exec", brandIds.join(","), range.from.toISOString(), range.to.toISOString(), fx ?? 0],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const [cur, prev] = await Promise.all([
        fetchPnl(brandIds, range.from, range.to, fx ?? undefined),
        fetchPnl(brandIds, range.prevFrom, range.prevTo, fx ?? undefined),
      ]);
      return { cur, prev };
    },
  });
}

export function ExecutiveKpi(props: P & { compareLabel?: string }) {
  const { data, isLoading } = useExecutive(props);
  const c = data?.cur, p = data?.prev;
  const tiles = [
    { label: "Revenue", value: BDT(c?.revenue ?? 0), d: delta(c?.revenue ?? 0, p?.revenue ?? 0), key: "revenue", icon: Banknote, tone: "text-sky-600 bg-sky-50 border-sky-200", spark: "#0ea5e9", sparkFill: "#f0f9ff" },
    { label: "Gross Profit", value: BDT(c?.gross ?? 0), d: delta(c?.gross ?? 0, p?.gross ?? 0), key: "gross", icon: TrendingUp, tone: "text-teal-600 bg-teal-50 border-teal-200", spark: "#14b8a6", sparkFill: "#f0fdfa" },
    { label: "Net Profit", value: BDT(c?.net ?? 0), d: delta(c?.net ?? 0, p?.net ?? 0), key: "net", danger: (c?.net ?? 0) < 0, icon: PiggyBank, tone: "text-emerald-600 bg-emerald-50 border-emerald-200", spark: "#10b981", sparkFill: "#ecfdf5" },
    { label: "Profit Margin", value: pct(c?.margin ?? 0), d: (c?.margin ?? 0) - (p?.margin ?? 0), key: "net", raw: true, icon: Gauge, tone: "text-violet-600 bg-violet-50 border-violet-200", spark: "#8b5cf6", sparkFill: "#f5f3ff" },
    { label: "Orders", value: String(c?.orders ?? 0), d: delta(c?.orders ?? 0, p?.orders ?? 0), key: "orders", icon: ShoppingCart, tone: "text-indigo-600 bg-indigo-50 border-indigo-200", spark: "#6366f1", sparkFill: "#eef2ff" },
    { label: "AOV", value: BDT(c?.aov ?? 0), d: delta(c?.aov ?? 0, p?.aov ?? 0), key: "revenue", icon: Receipt, tone: "text-cyan-600 bg-cyan-50 border-cyan-200", spark: "#06b6d4", sparkFill: "#ecfeff" },
    { label: "Marketing Spend", value: BDT(c?.adSpend ?? 0), d: delta(c?.adSpend ?? 0, p?.adSpend ?? 0), key: "spend", invert: true, icon: Megaphone, tone: "text-amber-600 bg-amber-50 border-amber-200", spark: "#f59e0b", sparkFill: "#fffbeb" },
    { label: "ROAS", value: (c?.roas ?? 0).toFixed(2) + "x", d: delta(c?.roas ?? 0, p?.roas ?? 0), key: "revenue", icon: Target, tone: "text-fuchsia-600 bg-fuchsia-50 border-fuchsia-200", spark: "#d946ef", sparkFill: "#fdf4ff" },
  ];
  return (
    <div className="owner-kpi-grid grid grid-cols-2 gap-3 md:grid-cols-4">
      {tiles.map((t) => (
        <div key={t.label} className={cn("owner-kpi-card rounded-lg border bg-white p-3 transition-colors", t.tone.split(" ")[2])}>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-[10.5px] font-medium uppercase tracking-wider text-slate-500">{t.label}</span>
            <span className={cn("inline-flex size-6 items-center justify-center rounded-md", t.tone)}>
              <t.icon className="size-3.5" />
            </span>
          </div>
          {isLoading ? <Skeleton className="h-7 w-24" /> : (
            <div className={cn("text-[22px] font-semibold leading-none tracking-tight tabular-nums",
              t.danger ? "text-rose-600" : "text-slate-900")}>{t.value}</div>
          )}
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              {isLoading ? null : t.raw
                ? <span className={cn("text-[11px] font-medium tabular-nums", t.d >= 0 ? "text-emerald-600" : "text-rose-600")}>
                    {t.d >= 0 ? "+" : ""}{t.d.toFixed(1)} pt
                  </span>
                : <Chip v={t.d} invert={t.invert} />}
              <span className="truncate text-[11px] text-slate-400">{props.compareLabel ?? "vs prev"}</span>
            </div>
            <div className="h-6 w-14 shrink-0">
              {(c?.series?.length ?? 0) > 1 && (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={c!.series}>
                    <Area type="monotone" dataKey={t.key} stroke={t.spark} fill={t.sparkFill} strokeWidth={1.5} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   2. NEEDS YOUR ATTENTION
============================================================ */
type Alert = { id: string; sev: "critical" | "warn" | "info"; title: string; detail: string; to?: string };

export function NeedsYourAttention({ brandIds, enabled, range }: P) {
  const { data: fx } = useUsdBdtRate(brandIds);
  const { data, isLoading } = useQuery({
    queryKey: ["dash-attention", brandIds.join(","), range.from.toISOString(), range.to.toISOString(), fx ?? 0],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<Alert[]> => {
      const fromISO = range.from.toISOString(), toISO = range.to.toISOString();
      const today = localDate(new Date());
      const soon = localDate(new Date(Date.now() + 7 * 86400e3));
      const [prods, pendingShip, statuses, bills, cod, accounts, sync, items] = await Promise.all([
        applyBrandScope(supabase.from("products").select("id, available_stock, stock, low_stock_threshold, reorder_point, is_active"), brandIds)
          .eq("is_active", true),
        applyBrandScope(supabase.from("orders").select("id", { count: "exact", head: true }), brandIds)
          .in("status", ["confirmed", "packaging", "packed", "ready_to_ship"]),
        applyBrandScope(supabase.from("orders").select("status"), brandIds).gte("created_at", fromISO).lte("created_at", toISO),
        applyBrandScope(supabase.from("erp_bills").select("amount, paid_amount, due_date, status"), brandIds)
          .neq("status", "paid").lte("due_date", soon),
        applyBrandScope(supabase.from("orders").select("total, partial_amount"), brandIds)
          .eq("payment_method", "cod").neq("payment_status", "paid")
          .in("status", ["shipped", "in_transit", "delivered", "partial_delivered"]),
        applyBrandScope(supabase.from("erp_accounts").select("name, current_balance"), brandIds, "brand_id", { includeNull: true })
          .eq("is_active", true),
        applyBrandScope(supabase.from("mkt_sync_log").select("kind, error, started_at"), brandIds)
          .eq("status", "error").gte("started_at", new Date(Date.now() - 86400e3).toISOString()).limit(5),
        applyBrandScope(
          supabase.from("order_items").select("product_id, name, quantity, line_total, unit_price, price, unit_cost_snapshot, courier_cost_allocated, packaging_cost_allocated, orders!inner(brand_id,status,created_at)"),
          brandIds, "orders.brand_id" as any,
        ).not("orders.status", "in", EXCLUDED).gte("orders.created_at", fromISO).lte("orders.created_at", toISO),
      ]);

      const out: Alert[] = [];
      const pr = (prods.data ?? []) as any[];
      const stockOf = (r: any) => Number(r.available_stock ?? r.stock ?? 0);
      const outSku = pr.filter(r => stockOf(r) <= 0).length;
      const lowSku = pr.filter(r => {
        const s = stockOf(r); const t = Number(r.reorder_point ?? 0) || Number(r.low_stock_threshold ?? 0) || 5;
        return s > 0 && s <= t;
      }).length;
      if (outSku > 0) out.push({ id: "oos", sev: "critical", title: "Out of stock", detail: `${outSku} active SKU stock-out`, to: "/erp/inventory" });
      if (lowSku > 0) out.push({ id: "low", sev: "warn", title: "Low stock", detail: `${lowSku} SKU reorder threshold-এ`, to: "/erp/inventory" });

      const ps = pendingShip.count ?? 0;
      if (ps > 0) out.push({ id: "ship", sev: ps > 30 ? "critical" : "warn", title: "Pending shipments", detail: `${ps} order এখনো dispatch হয়নি`, to: "/erp/orders/web" });

      const st = (statuses.data ?? []) as any[];
      const total = st.length;
      const cancelled = st.filter(r => r.status === "cancelled").length;
      const returned = st.filter(r => String(r.status).includes("return")).length;
      const cancelRate = total ? (cancelled / total) * 100 : 0;
      const returnRate = total ? (returned / total) * 100 : 0;
      if (cancelRate > 15) out.push({ id: "cancel", sev: "critical", title: "High cancellation", detail: `${pct(cancelRate)} cancel rate (${cancelled} order)`, to: "/erp/orders/web" });
      if (returnRate > 8) out.push({ id: "return", sev: "warn", title: "High return", detail: `${pct(returnRate)} return rate`, to: "/erp/returns" });

      const dueAmt = ((bills.data ?? []) as any[]).reduce((s, b) => s + Math.max(0, Number(b.amount ?? 0) - Number(b.paid_amount ?? 0)), 0);
      if (dueAmt > 0) out.push({ id: "bills", sev: "warn", title: "Supplier payment due", detail: `${BDT(dueAmt)} — ৭ দিনের মধ্যে`, to: "/erp/suppliers" });

      const codAmt = ((cod.data ?? []) as any[]).reduce((s, r) => s + Math.max(0, Number(r.total ?? 0) - Number(r.partial_amount ?? 0)), 0);
      if (codAmt > 0) out.push({ id: "cod", sev: "info", title: "Courier / COD due", detail: `${BDT(codAmt)} collect বাকি`, to: "/erp/reconciliation" });

      const acc = (accounts.data ?? []) as any[];
      const cash = acc.reduce((s, a) => s + Number(a.current_balance ?? 0), 0);
      const neg = acc.filter(a => Number(a.current_balance ?? 0) < 0);
      if (neg.length) out.push({ id: "negacct", sev: "critical", title: "Cash flow warning", detail: `${neg.length} account negative (${neg[0].name})`, to: "/erp/finance/wallets" });
      else if (cash > 0 && cash < 50000) out.push({ id: "lowcash", sev: "warn", title: "Cash flow warning", detail: `Total cash ${BDT(cash)} — low buffer`, to: "/erp/finance/wallets" });

      const sy = (sync.data ?? []) as any[];
      if (sy.length) out.push({ id: "sync", sev: "warn", title: "Sync error", detail: `${sy.length} marketing sync failed (24h)`, to: "/erp/marketing" });

      // negative margin products
      const agg = new Map<string, { name: string; rev: number; cost: number }>();
      for (const r of (items.data ?? []) as any[]) {
        const key = String(r.product_id ?? r.name);
        const qty = Number(r.quantity ?? 0);
        const rev = Number(r.line_total ?? 0) || Number(r.unit_price ?? r.price ?? 0) * qty;
        const cost = Number(r.unit_cost_snapshot ?? 0) * qty + Number(r.courier_cost_allocated ?? 0) + Number(r.packaging_cost_allocated ?? 0);
        const cur = agg.get(key) ?? { name: r.name ?? "—", rev: 0, cost: 0 };
        cur.rev += rev; cur.cost += cost;
        agg.set(key, cur);
      }
      const negMargin = Array.from(agg.values()).filter(v => v.rev > 0 && v.rev - v.cost < 0);
      if (negMargin.length) out.push({ id: "negmargin", sev: "critical", title: "Negative margin products", detail: `${negMargin.length} product লোকসানে বিক্রি হচ্ছে`, to: "/erp/products" });

      const order = { critical: 0, warn: 1, info: 2 } as const;
      return out.sort((a, b) => order[a.sev] - order[b.sev]);
    },
  });

  const sevStyle = {
    critical: "border-rose-200 bg-rose-50/60 text-rose-700",
    warn: "border-amber-200 bg-amber-50/60 text-amber-700",
    info: "border-slate-200 bg-slate-50 text-slate-600",
  };

  return (
    <SectionCard
      title="Needs your attention"
      icon={AlertTriangle}
      action={<span className="text-[11px] text-slate-400">{data?.length ?? 0} signal</span>}
    >
      {isLoading ? <Skeleton className="h-24" /> : !data?.length ? (
        <div className="flex items-center gap-2 py-4 text-[13px] text-emerald-600">
          <CheckCircle2 className="size-4" /> সব ঠিক আছে — এখন কোনো action লাগছে না।
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
          {data.map((a) => (
            <div key={a.id} className={cn("flex items-start justify-between gap-3 rounded-lg border p-2.5", sevStyle[a.sev])}>
              <div className="min-w-0">
                <div className="text-[12.5px] font-semibold">{a.title}</div>
                <div className="truncate text-[11.5px] opacity-80">{a.detail}</div>
              </div>
              {a.to ? (
                <Link to={a.to as any} className="shrink-0 text-[11px] font-medium underline-offset-2 hover:underline">Resolve →</Link>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

/* ============================================================
   3. BUSINESS PERFORMANCE — Revenue | Profit | Orders
============================================================ */
export function PerformanceTrend(props: P) {
  const { data, isLoading } = useExecutive(props);
  const [metric, setMetric] = useState<"revenue" | "net" | "orders">("revenue");
  const series = data?.cur.series ?? [];
  const conf = {
    revenue: { label: "Revenue", color: "#4f46e5", fmt: (v: number) => BDT(v) },
    net: { label: "Net Profit", color: "#059669", fmt: (v: number) => BDT(v) },
    orders: { label: "Orders", color: "#d97706", fmt: (v: number) => String(Math.round(v)) },
  }[metric];

  return (
    <SectionCard
      title="Business performance"
      icon={TrendingUp}
      action={
        <div className="flex gap-1 rounded-md bg-slate-100 p-0.5">
          {(["revenue", "net", "orders"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMetric(m)}
              className={cn("rounded px-2 py-1 text-[11px] font-medium capitalize",
                metric === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}>
              {m === "net" ? "Profit" : m}
            </button>
          ))}
        </div>
      }
    >
      {isLoading ? <Skeleton className="h-56" /> : series.length === 0 ? <Empty text="এই রেঞ্জে কোনো order নেই।" /> : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 6, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
              <XAxis dataKey="d" tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false}
                tickFormatter={(v) => String(v).slice(5)} />
              <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false}
                tickFormatter={(v) => (metric === "orders" ? String(v) : compact(Number(v)))} />
              <Tooltip formatter={(v: any) => conf.fmt(Number(v))} labelFormatter={(l) => String(l)} />
              <Area type="monotone" dataKey={metric} stroke={conf.color} fill={conf.color} fillOpacity={0.12} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </SectionCard>
  );
}

/* ============================================================
   4. TARGET & FORECAST
============================================================ */
const TARGET_KEYS = ["revenue", "orders", "profit"] as const;
type TargetKey = typeof TARGET_KEYS[number];

export function TargetForecast({ brandIds, enabled }: { brandIds: string[]; enabled: boolean }) {
  const now = new Date();
  const mStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const mEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  const { data: fx } = useUsdBdtRate(brandIds);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<TargetKey, string>>({ revenue: "", orders: "", profit: "" });

  const q = useQuery({
    queryKey: ["dash-target", brandIds.join(","), localDate(mStart), fx ?? 0],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const [pnl, goals, budget] = await Promise.all([
        fetchPnl(brandIds, mStart, now, fx ?? undefined),
        applyBrandScope(supabase.from("hub_goals").select("id, metric_key, target_value, period_start, period_end"), brandIds)
          .lte("period_start", localDate(mEnd)).gte("period_end", localDate(mStart)),
        applyBrandScope(supabase.from("mkt_budgets").select("planned_spend, period_start, period_end"), brandIds)
          .lte("period_start", localDate(mEnd)).gte("period_end", localDate(mStart)),
      ]);
      const targets: Record<string, number> = {};
      for (const g of (goals.data ?? []) as any[]) {
        const k = String(g.metric_key ?? "").toLowerCase();
        if ((TARGET_KEYS as readonly string[]).includes(k)) targets[k] = Number(g.target_value ?? 0);
      }
      const plannedSpend = ((budget.data ?? []) as any[]).reduce((s, b) => s + Number(b.planned_spend ?? 0), 0);
      return { pnl, targets, plannedSpend };
    },
  });

  const daysInMonth = mEnd.getDate();
  const dayNow = Math.min(now.getDate(), daysInMonth);
  const projFactor = daysInMonth / Math.max(1, dayNow);
  const p = q.data?.pnl;
  const actual: Record<TargetKey, number> = {
    revenue: p?.revenue ?? 0, orders: p?.orders ?? 0, profit: p?.net ?? 0,
  };

  const save = async () => {
    for (const k of TARGET_KEYS) {
      const raw = draft[k];
      if (!raw) continue;
      const value = Number(raw);
      if (!Number.isFinite(value)) continue;
      const brand_id = brandIds.length === 1 ? brandIds[0] : brandIds[0];
      const existing = null;
      await supabase.from("hub_goals").insert({
        brand_id, kind: "target", title: `${k} target ${localDate(mStart).slice(0, 7)}`,
        metric_key: k, target_value: value,
        period_start: localDate(mStart), period_end: localDate(mEnd),
      } as never);
      void existing;
    }
    setEditing(false);
    q.refetch();
  };

  const rows: { key: TargetKey; label: string; fmt: (n: number) => string }[] = [
    { key: "revenue", label: "Revenue", fmt: BDT },
    { key: "orders", label: "Orders", fmt: (n) => String(Math.round(n)) },
    { key: "profit", label: "Net Profit", fmt: BDT },
  ];

  return (
    <SectionCard
      title="Target vs actual & forecast"
      icon={Target}
      action={
        <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => setEditing(e => !e)}>
          {editing ? "Cancel" : "Set targets"}
        </Button>
      }
    >
      {q.isLoading ? <Skeleton className="h-32" /> : (
        <div className="space-y-3">
          {rows.map((r) => {
            const target = q.data?.targets[r.key] ?? 0;
            const act = actual[r.key];
            const achieved = target > 0 ? (act / target) * 100 : 0;
            const projected = act * projFactor;
            const projPct = target > 0 ? (projected / target) * 100 : 0;
            return (
              <div key={r.key}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-[12px]">
                  <span className="font-medium text-slate-700">{r.label}</span>
                  <span className="tabular-nums text-slate-500">
                    {r.fmt(act)} {target > 0 ? <>/ {r.fmt(target)} · <span className="font-semibold text-slate-800">{achieved.toFixed(0)}%</span></> : <span className="italic text-slate-400">no target</span>}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className={cn("h-full rounded-full", achieved >= 100 ? "bg-emerald-500" : achieved >= 60 ? "bg-indigo-500" : "bg-amber-500")}
                    style={{ width: `${Math.min(100, Math.max(0, achieved))}%` }} />
                </div>
                <div className="mt-1 text-[11px] text-slate-400">
                  Projected month-end: <span className="font-medium text-slate-600">{r.fmt(projected)}</span>
                  {target > 0 ? ` · ${projPct.toFixed(0)}% of target` : ""}
                </div>
              </div>
            );
          })}
          <div className="flex items-baseline justify-between border-t border-dashed border-slate-200 pt-2 text-[12px]">
            <span className="text-slate-500">Marketing budget vs spend</span>
            <span className="tabular-nums text-slate-700">
              {BDT(p?.adSpend ?? 0)} {(q.data?.plannedSpend ?? 0) > 0 ? `/ ${BDT(q.data!.plannedSpend)}` : ""}
            </span>
          </div>
          {editing && (
            <div className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5 sm:grid-cols-4">
              {TARGET_KEYS.map((k) => (
                <input key={k} inputMode="decimal" placeholder={`${k} target`} value={draft[k]}
                  onChange={(e) => setDraft(d => ({ ...d, [k]: e.target.value }))}
                  className="h-8 rounded-md border border-slate-200 bg-white px-2 text-[12px] outline-none focus:border-indigo-400" />
              ))}
              <Button size="sm" className="h-8 text-[12px]" onClick={save}>Save month targets</Button>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}

/* ============================================================
   5. MARKETING PERFORMANCE
============================================================ */
export function MarketingPerformance({ brandIds, enabled, range }: P) {
  const { data: fx } = useUsdBdtRate(brandIds);
  const { data, isLoading } = useQuery({
    queryKey: ["dash-mktperf", brandIds.join(","), range.from.toISOString(), range.to.toISOString(), fx ?? 0],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const fromISO = range.from.toISOString(), toISO = range.to.toISOString();
      const [ads, rows] = await Promise.all([
        fetchAllRows((f, t) => applyBrandScope(supabase.from("mkt_insights_daily").select("spend, spend_bdt_fifo, meta_purchase_value, meta_purchases"), brandIds)
          .gte("date", localDate(range.from)).lte("date", localDate(range.to)).order("id", { ascending: true }).range(f, t)),
        fetchAllRows((f, t) =>
          applyBrandScope(supabase.from("orders").select("total, source, utm_source"), brandIds)
            .not("status", "in", EXCLUDED).gte("created_at", fromISO).lte("created_at", toISO)
            .order("created_at", { ascending: true }).order("id", { ascending: true }).range(f, t),
        ),
      ]);
      let spend = 0;
      for (const r of ads) spend += Number(r.spend_bdt_fifo ?? 0) || (fx ? Number(r.spend ?? 0) * fx : 0);
      const revenue = rows.reduce((s, r) => s + Number(r.total ?? 0), 0);
      const isPaid = (r: any) => {
        const u = String(r.utm_source ?? "").toLowerCase();
        return !!u && !["organic", "direct", "(direct)"].includes(u);
      };
      const paid = rows.filter(isPaid);
      const organic = rows.filter(r => !isPaid(r));
      const paidRev = paid.reduce((s, r) => s + Number(r.total ?? 0), 0);
      const organicRev = organic.reduce((s, r) => s + Number(r.total ?? 0), 0);

      const channels = new Map<string, { orders: number; revenue: number }>();
      for (const r of rows) {
        const key = (String(r.utm_source ?? "").toLowerCase() || "organic").replace("facebook", "meta");
        const cur = channels.get(key) ?? { orders: 0, revenue: 0 };
        cur.orders += 1; cur.revenue += Number(r.total ?? 0);
        channels.set(key, cur);
      }
      return {
        spend, revenue, paidRev, organicRev,
        paidOrders: paid.length, organicOrders: organic.length,
        roas: spend > 0 ? paidRev / spend : 0,
        mer: spend > 0 ? revenue / spend : 0,
        cac: paid.length > 0 ? spend / paid.length : 0,
        channels: Array.from(channels.entries()).map(([k, v]) => ({ key: k, ...v })).sort((a, b) => b.revenue - a.revenue).slice(0, 6),
      };
    },
  });

  const stats = [
    { l: "Ad Spend", v: BDT(data?.spend ?? 0) },
    { l: "Paid Revenue", v: BDT(data?.paidRev ?? 0) },
    { l: "ROAS", v: (data?.roas ?? 0).toFixed(2) + "x" },
    { l: "MER", v: (data?.mer ?? 0).toFixed(2) + "x" },
    { l: "CAC", v: BDT(data?.cac ?? 0) },
    { l: "Paid Orders", v: String(data?.paidOrders ?? 0) },
    { l: "Organic Orders", v: String(data?.organicOrders ?? 0) },
    { l: "Organic Revenue", v: BDT(data?.organicRev ?? 0) },
  ];

  return (
    <SectionCard title="Marketing performance" icon={Megaphone}
      action={<Link to="/erp/marketing" className="text-[11px] text-indigo-600 hover:underline">Marketing →</Link>}>
      {isLoading ? <Skeleton className="h-32" /> : (
        <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {stats.map(s => (
              <div key={s.l} className="rounded-md border border-slate-200 p-2.5">
                <div className="text-[10px] uppercase tracking-wider text-slate-500">{s.l}</div>
                <div className="mt-0.5 text-[15px] font-semibold tabular-nums text-slate-900">{s.v}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-slate-400">
                  <th className="py-1.5">Channel</th><th className="py-1.5 text-right">Orders</th>
                  <th className="py-1.5 text-right">Revenue</th><th className="py-1.5 text-right">Share</th>
                </tr>
              </thead>
              <tbody>
                {(data?.channels ?? []).map((c) => (
                  <tr key={c.key} className="border-t border-slate-100">
                    <td className="py-1.5 capitalize text-slate-700">{c.key}</td>
                    <td className="py-1.5 text-right tabular-nums">{c.orders}</td>
                    <td className="py-1.5 text-right tabular-nums">{BDT(c.revenue)}</td>
                    <td className="py-1.5 text-right tabular-nums text-slate-500">
                      {pct((data?.revenue ?? 0) > 0 ? (c.revenue / data!.revenue) * 100 : 0)}
                    </td>
                  </tr>
                ))}
                {!data?.channels.length && <tr><td colSpan={4}><Empty text="Channel data নেই।" /></td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </SectionCard>
  );
}

/* ============================================================
   6. ORDER & SALES HEALTH
============================================================ */
export function OrderHealth({ brandIds, enabled, range }: P) {
  const { data, isLoading } = useQuery({
    queryKey: ["dash-orderhealth", brandIds.join(","), range.from.toISOString(), range.to.toISOString()],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: rows } = await applyBrandScope(supabase.from("orders").select("status, created_at"), brandIds)
        .gte("created_at", range.from.toISOString()).lte("created_at", range.to.toISOString());
      const list = (rows ?? []) as any[];
      const count = (...s: string[]) => list.filter(r => s.includes(String(r.status))).length;
      const total = list.length;
      const delivered = count("delivered", "partial_delivered", "completed");
      const returned = list.filter(r => String(r.status).includes("return")).length;
      const cancelled = count("cancelled");
      const { count: delayed } = await applyBrandScope(supabase.from("orders").select("id", { count: "exact", head: true }), brandIds)
        .in("status", ["shipped", "in_transit"]).lt("created_at", new Date(Date.now() - 7 * 86400e3).toISOString());
      return {
        total,
        pending: count("new", "incomplete", "on_hold", "advance_payment_pending"),
        confirmed: count("confirmed"),
        processing: count("packaging", "ready_to_pack"),
        packed: count("packed", "ready_to_ship", "courier_entry"),
        shipped: count("shipped", "in_transit"),
        delivered, cancelled, returned,
        cancelRate: total ? (cancelled / total) * 100 : 0,
        returnRate: total ? (returned / total) * 100 : 0,
        successRate: delivered + returned > 0 ? (delivered / (delivered + returned)) * 100 : 0,
        delayed: delayed ?? 0,
      };
    },
  });

  const flow = [
    { l: "Pending", v: data?.pending, tone: "text-amber-600" },
    { l: "Confirmed", v: data?.confirmed, tone: "text-indigo-600" },
    { l: "Processing", v: data?.processing, tone: "text-indigo-600" },
    { l: "Packed", v: data?.packed, tone: "text-blue-600" },
    { l: "Shipped", v: data?.shipped, tone: "text-blue-600" },
    { l: "Delivered", v: data?.delivered, tone: "text-emerald-600" },
    { l: "Cancelled", v: data?.cancelled, tone: "text-rose-600" },
    { l: "Returned", v: data?.returned, tone: "text-rose-600" },
  ];
  const rates = [
    { l: "Cancellation rate", v: pct(data?.cancelRate ?? 0), bad: (data?.cancelRate ?? 0) > 15 },
    { l: "Return rate", v: pct(data?.returnRate ?? 0), bad: (data?.returnRate ?? 0) > 8 },
    { l: "Delivery success", v: pct(data?.successRate ?? 0), bad: (data?.successRate ?? 100) < 85 },
    { l: "Delayed shipment", v: String(data?.delayed ?? 0), bad: (data?.delayed ?? 0) > 0 },
  ];

  return (
    <SectionCard title="Order & sales health" icon={ShoppingCart}>
      {isLoading ? <Skeleton className="h-28" /> : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
            {flow.map(f => (
              <div key={f.l} className="rounded-md border border-slate-200 p-2">
                <div className="text-[10px] uppercase tracking-wider text-slate-500">{f.l}</div>
                <div className={cn("text-[17px] font-semibold tabular-nums", f.tone)}>{f.v ?? 0}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
            {rates.map(r => (
              <div key={r.l} className={cn("rounded-md border p-2", r.bad ? "border-rose-200 bg-rose-50/50" : "border-slate-200")}>
                <div className="text-[10px] uppercase tracking-wider text-slate-500">{r.l}</div>
                <div className={cn("text-[15px] font-semibold tabular-nums", r.bad ? "text-rose-600" : "text-slate-900")}>{r.v}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </SectionCard>
  );
}

/* ============================================================
   7. INVENTORY INTELLIGENCE
============================================================ */
export function InventoryIntelligence({ brandIds, enabled, range }: P) {
  const [tab, setTab] = useState<"reorder" | "fast" | "slow" | "dead" | "over">("reorder");
  const { data, isLoading } = useQuery({
    queryKey: ["dash-invintel", brandIds.join(","), range.from.toISOString(), range.to.toISOString()],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const [prods, items] = await Promise.all([
        applyBrandScope(supabase.from("products").select(
          "id, title, sku, stock, available_stock, reorder_point, reorder_qty, low_stock_threshold, weighted_avg_cost, cost_price, is_active",
        ), brandIds).eq("is_active", true),
        applyBrandScope(
          supabase.from("order_items").select("product_id, quantity, orders!inner(brand_id,status,created_at)"),
          brandIds, "orders.brand_id" as any,
        ).not("orders.status", "in", EXCLUDED)
          .gte("orders.created_at", range.from.toISOString()).lte("orders.created_at", range.to.toISOString()),
      ]);
      const sold = new Map<string, number>();
      for (const r of (items.data ?? []) as any[]) {
        if (!r.product_id) continue;
        sold.set(r.product_id, (sold.get(r.product_id) ?? 0) + Number(r.quantity ?? 0));
      }
      const days = Math.max(1, range.days);
      const list = ((prods.data ?? []) as any[]).map((p) => {
        const stock = Number(p.available_stock ?? p.stock ?? 0);
        const unitCost = Number(p.weighted_avg_cost ?? 0) || Number(p.cost_price ?? 0);
        const soldQty = sold.get(p.id) ?? 0;
        const daily = soldQty / days;
        const threshold = Number(p.reorder_point ?? 0) || Number(p.low_stock_threshold ?? 0) || 5;
        const daysLeft = daily > 0 ? stock / daily : stock > 0 ? Infinity : 0;
        let cls: "reorder" | "fast" | "slow" | "dead" | "over" = "slow";
        if (soldQty === 0 && stock > 0) cls = "dead";
        else if (stock <= threshold) cls = "reorder";
        else if (daily > 0 && daysLeft > 90) cls = "over";
        else if (daily >= 1) cls = "fast";
        return {
          id: p.id, title: p.title, sku: p.sku, stock, unitCost, soldQty, daily, threshold, daysLeft, cls,
          suggested: Number(p.reorder_qty ?? 0) || Math.max(threshold * 2, Math.ceil(daily * 30)),
          value: stock * unitCost,
        };
      });
      return {
        list,
        totalValue: list.reduce((s, p) => s + p.value, 0),
        totalUnits: list.reduce((s, p) => s + p.stock, 0),
        activeSku: list.length,
        lowSku: list.filter(p => p.stock > 0 && p.stock <= p.threshold).length,
        outSku: list.filter(p => p.stock <= 0).length,
        overSku: list.filter(p => p.cls === "over").length,
        deadSku: list.filter(p => p.cls === "dead").length,
        avgDaysOfStock: (() => {
          const ok = list.filter(p => Number.isFinite(p.daysLeft) && p.daysLeft > 0);
          return ok.length ? ok.reduce((s, p) => s + p.daysLeft, 0) / ok.length : 0;
        })(),
        reorderCount: list.filter(p => p.cls === "reorder").length,
      };
    },
  });

  const kpis = [
    { l: "Inventory value", v: BDT(data?.totalValue ?? 0) },
    { l: "Stock units", v: (data?.totalUnits ?? 0).toLocaleString("en-IN") },
    { l: "Active SKU", v: String(data?.activeSku ?? 0) },
    { l: "Low stock", v: String(data?.lowSku ?? 0) },
    { l: "Out of stock", v: String(data?.outSku ?? 0) },
    { l: "Overstock", v: String(data?.overSku ?? 0) },
    { l: "Dead stock", v: String(data?.deadSku ?? 0) },
    { l: "Avg days of stock", v: (data?.avgDaysOfStock ?? 0).toFixed(0) + "d" },
  ];
  const tabs = [
    { k: "reorder", l: "Reorder now" }, { k: "fast", l: "Fast moving" },
    { k: "slow", l: "Slow moving" }, { k: "dead", l: "Dead stock" }, { k: "over", l: "Overstock" },
  ] as const;
  const rows = (data?.list ?? []).filter(p => p.cls === tab)
    .sort((a, b) => (tab === "reorder" ? a.daysLeft - b.daysLeft : b.soldQty - a.soldQty)).slice(0, 8);

  return (
    <SectionCard title="Inventory intelligence" icon={Boxes}
      action={<Link to="/erp/inventory" className="text-[11px] text-indigo-600 hover:underline">Inventory →</Link>}>
      {isLoading ? <Skeleton className="h-40" /> : (
        <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
            {kpis.map(k => (
              <div key={k.l} className="rounded-md border border-slate-200 p-2">
                <div className="text-[10px] uppercase tracking-wider text-slate-500">{k.l}</div>
                <div className="text-[15px] font-semibold tabular-nums text-slate-900">{k.v}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-1 overflow-x-auto rounded-md bg-slate-100 p-0.5">
            {tabs.map(t => (
              <button key={t.k} type="button" onClick={() => setTab(t.k)}
                className={cn("shrink-0 rounded px-2.5 py-1 text-[11px] font-medium",
                  tab === t.k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}>{t.l}</button>
            ))}
          </div>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-slate-400">
                  <th className="py-1.5">Product</th>
                  <th className="py-1.5 text-right">Stock</th>
                  <th className="py-1.5 text-right">Daily sales</th>
                  <th className="py-1.5 text-right">Days left</th>
                  <th className="py-1.5 text-right">Suggested</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(p => (
                  <tr key={p.id} className="border-t border-slate-100">
                    <td className="max-w-[240px] truncate py-1.5 text-slate-700">{p.title}</td>
                    <td className="py-1.5 text-right tabular-nums">{p.stock}</td>
                    <td className="py-1.5 text-right tabular-nums">{p.daily.toFixed(1)}</td>
                    <td className={cn("py-1.5 text-right tabular-nums", p.daysLeft < 7 && "font-semibold text-rose-600")}>
                      {Number.isFinite(p.daysLeft) ? Math.round(p.daysLeft) + "d" : "—"}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-slate-500">{tab === "reorder" ? p.suggested : "—"}</td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={5}><Empty text="এই bucket-এ কোনো product নেই।" /></td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </SectionCard>
  );
}

/* ============================================================
   8/9. PRODUCT + CATEGORY PERFORMANCE
============================================================ */
export function ProductPerformance({ brandIds, enabled, range }: P) {
  const [sort, setSort] = useState<"revenue" | "profit" | "units" | "margin">("revenue");
  const { data, isLoading } = useQuery({
    queryKey: ["dash-prodperf", brandIds.join(","), range.from.toISOString(), range.to.toISOString()],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: items } = await applyBrandScope(
        supabase.from("order_items").select(
          "product_id, name, quantity, line_total, unit_price, price, unit_cost_snapshot, courier_cost_allocated, packaging_cost_allocated, orders!inner(brand_id,status,created_at)",
        ), brandIds, "orders.brand_id" as any,
      ).not("orders.status", "in", EXCLUDED)
        .gte("orders.created_at", range.from.toISOString()).lte("orders.created_at", range.to.toISOString());

      const agg = new Map<string, { id: string | null; name: string; revenue: number; cost: number; units: number }>();
      for (const r of (items ?? []) as any[]) {
        const key = String(r.product_id ?? r.name ?? "—");
        const qty = Number(r.quantity ?? 0);
        const rev = Number(r.line_total ?? 0) || Number(r.unit_price ?? r.price ?? 0) * qty;
        const cost = Number(r.unit_cost_snapshot ?? 0) * qty + Number(r.courier_cost_allocated ?? 0) + Number(r.packaging_cost_allocated ?? 0);
        const cur = agg.get(key) ?? { id: r.product_id ?? null, name: r.name ?? "—", revenue: 0, cost: 0, units: 0 };
        cur.revenue += rev; cur.cost += cost; cur.units += qty;
        agg.set(key, cur);
      }
      const list = Array.from(agg.values()).map(v => ({
        ...v, profit: v.revenue - v.cost,
        margin: v.revenue > 0 ? ((v.revenue - v.cost) / v.revenue) * 100 : 0,
      }));

      // category rollup
      const ids = list.map(l => l.id).filter(Boolean) as string[];
      const catOf = new Map<string, string>();
      if (ids.length) {
        const { data: prods } = await supabase.from("products").select("id, categories(name)").in("id", ids.slice(0, 800));
        for (const p of (prods ?? []) as any[]) catOf.set(p.id, p.categories?.name ?? "Uncategorised");
      }
      const cats = new Map<string, { revenue: number; profit: number; units: number }>();
      for (const l of list) {
        const c = (l.id && catOf.get(l.id)) || "Uncategorised";
        const cur = cats.get(c) ?? { revenue: 0, profit: 0, units: 0 };
        cur.revenue += l.revenue; cur.profit += l.profit; cur.units += l.units;
        cats.set(c, cur);
      }
      return {
        list,
        categories: Array.from(cats.entries()).map(([name, v]) => ({ name, ...v, margin: v.revenue > 0 ? (v.profit / v.revenue) * 100 : 0 }))
          .sort((a, b) => b.revenue - a.revenue).slice(0, 8),
      };
    },
  });

  const sorted = useMemo(() => {
    const l = [...(data?.list ?? [])];
    l.sort((a, b) => (sort === "units" ? b.units - a.units : sort === "margin" ? b.margin - a.margin : sort === "profit" ? b.profit - a.profit : b.revenue - a.revenue));
    return l.slice(0, 10);
  }, [data, sort]);
  const losers = useMemo(() => [...(data?.list ?? [])].filter(p => p.profit < 0).sort((a, b) => a.profit - b.profit).slice(0, 5), [data]);

  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
      <SectionCard className="xl:col-span-2" title="Product performance" icon={Package}
        action={
          <div className="flex gap-1 rounded-md bg-slate-100 p-0.5">
            {(["revenue", "profit", "units", "margin"] as const).map(s => (
              <button key={s} type="button" onClick={() => setSort(s)}
                className={cn("rounded px-2 py-1 text-[11px] font-medium capitalize",
                  sort === s ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}>{s}</button>
            ))}
          </div>
        }>
        {isLoading ? <Skeleton className="h-48" /> : !sorted.length ? <Empty text="এই রেঞ্জে sale নেই।" /> : (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-slate-400">
                <th className="py-1.5">Product</th><th className="py-1.5 text-right">Units</th>
                <th className="py-1.5 text-right">Revenue</th><th className="py-1.5 text-right">Profit</th>
                <th className="py-1.5 text-right">Margin</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="max-w-[260px] truncate py-1.5 text-slate-700">{p.name}</td>
                  <td className="py-1.5 text-right tabular-nums">{p.units}</td>
                  <td className="py-1.5 text-right tabular-nums">{BDT(p.revenue)}</td>
                  <td className={cn("py-1.5 text-right tabular-nums", p.profit < 0 ? "text-rose-600" : "text-emerald-600")}>{BDT(p.profit)}</td>
                  <td className="py-1.5 text-right tabular-nums text-slate-500">{pct(p.margin)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      <div className="space-y-3">
        <SectionCard title="Loss making" icon={AlertTriangle}>
          {isLoading ? <Skeleton className="h-24" /> : !losers.length ? <Empty text="কোনো loss-making product নেই ✅" /> : (
            <div className="space-y-1.5">
              {losers.map((p, i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-[12px]">
                  <span className="truncate text-slate-700">{p.name}</span>
                  <span className="shrink-0 tabular-nums font-medium text-rose-600">{BDT(p.profit)}</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
        <SectionCard title="Category performance" icon={Boxes}>
          {isLoading ? <Skeleton className="h-24" /> : !data?.categories.length ? <Empty text="Category data নেই।" /> : (
            <div className="space-y-1.5">
              {data.categories.map(c => (
                <div key={c.name} className="flex items-center justify-between gap-2 text-[12px]">
                  <span className="truncate text-slate-700">{c.name}</span>
                  <span className="shrink-0 tabular-nums text-slate-500">
                    {BDT(c.revenue)} · <span className={c.profit >= 0 ? "text-emerald-600" : "text-rose-600"}>{pct(c.margin)}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

/* ============================================================
   10. CASH & FINANCE
============================================================ */
export function CashAndFinance({ brandIds, enabled, range }: P) {
  const { data, isLoading } = useQuery({
    queryKey: ["dash-cashfin", brandIds.join(","), range.from.toISOString(), range.to.toISOString()],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const [accounts, txns, bills, cod] = await Promise.all([
        applyBrandScope(supabase.from("erp_accounts").select("name, current_balance, wallet_type, account_type, account_subtype"), brandIds, "brand_id", { includeNull: true })
          .eq("is_active", true),
        applyBrandScope(supabase.from("erp_transactions").select("txn_type, amount, transaction_date"), brandIds)
          .gte("transaction_date", localDate(range.from)).lte("transaction_date", localDate(range.to)),
        applyBrandScope(supabase.from("erp_bills").select("amount, paid_amount, status"), brandIds).neq("status", "paid"),
        applyBrandScope(supabase.from("orders").select("total, partial_amount"), brandIds)
          .eq("payment_method", "cod").neq("payment_status", "paid")
          .in("status", ["shipped", "in_transit", "delivered", "partial_delivered"]),
      ]);
      const acc = (accounts.data ?? []) as any[];
      const bucket = (r: any) => {
        const w = String(r.wallet_type ?? "").toLowerCase();
        const t = String(r.account_type ?? "").toLowerCase();
        const s = String(r.account_subtype ?? "").toLowerCase();
        const n = String(r.name ?? "").toLowerCase();
        if (n.includes("bkash") || t === "bkash" || s === "bkash") return "bkash";
        if (n.includes("nagad") || t === "nagad" || s === "nagad") return "nagad";
        if (w === "bank" || t === "bank") return "bank";
        if (w === "cash" || t === "cash") return "cash";
        return "other";
      };
      const buckets: Record<string, number> = { bank: 0, bkash: 0, nagad: 0, cash: 0, other: 0 };
      for (const r of acc) buckets[bucket(r)] += Number(r.current_balance ?? 0);
      const total = Object.values(buckets).reduce((s, v) => s + v, 0);
      let cashIn = 0, cashOut = 0;
      for (const t of (txns.data ?? []) as any[]) {
        const amt = Number(t.amount ?? 0);
        if (String(t.txn_type) === "income") cashIn += amt;
        else if (String(t.txn_type) === "expense") cashOut += amt;
      }
      const ap = ((bills.data ?? []) as any[]).reduce((s, b) => s + Math.max(0, Number(b.amount ?? 0) - Number(b.paid_amount ?? 0)), 0);
      const ar = ((cod.data ?? []) as any[]).reduce((s, r) => s + Math.max(0, Number(r.total ?? 0) - Number(r.partial_amount ?? 0)), 0);
      return { buckets, total, cashIn, cashOut, net: cashIn - cashOut, ap, ar };
    },
  });

  const rows = [
    { l: "Bank", v: data?.buckets.bank ?? 0, icon: Landmark },
    { l: "bKash", v: data?.buckets.bkash ?? 0, icon: Smartphone },
    { l: "Nagad", v: data?.buckets.nagad ?? 0, icon: Smartphone },
    { l: "Physical cash", v: data?.buckets.cash ?? 0, icon: Coins },
    { l: "Other", v: data?.buckets.other ?? 0, icon: Wallet },
  ];
  const flow = [
    { l: "Cash in", v: BDT(data?.cashIn ?? 0), tone: "text-emerald-600" },
    { l: "Cash out", v: BDT(data?.cashOut ?? 0), tone: "text-rose-600" },
    { l: "Net cash flow", v: BDT(data?.net ?? 0), tone: (data?.net ?? 0) >= 0 ? "text-emerald-600" : "text-rose-600" },
    { l: "Receivable (COD)", v: BDT(data?.ar ?? 0), tone: "text-slate-900" },
    { l: "Payable (supplier)", v: BDT(data?.ap ?? 0), tone: "text-slate-900" },
  ];

  return (
    <SectionCard title="Cash & finance" icon={Wallet}
      action={<Link to="/erp/finance/wallets" className="text-[11px] text-indigo-600 hover:underline">Wallets →</Link>}>
      {isLoading ? <Skeleton className="h-32" /> : (
        <>
          <div className="text-[26px] font-semibold leading-none tabular-nums text-slate-900">{BDT(data?.total ?? 0)}</div>
          <div className="mt-0.5 text-[11px] text-slate-400">Total cash position</div>
          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">
            {rows.filter(r => r.v !== 0).map(r => (
              <div key={r.l} className="rounded-md border border-slate-200 p-2">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500">
                  <r.icon className="size-3" />{r.l}
                </div>
                <div className={cn("text-[14px] font-semibold tabular-nums", r.v < 0 ? "text-rose-600" : "text-slate-900")}>{BDT(r.v)}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">
            {flow.map(f => (
              <div key={f.l} className="rounded-md bg-slate-50 p-2">
                <div className="text-[10px] uppercase tracking-wider text-slate-500">{f.l}</div>
                <div className={cn("text-[14px] font-semibold tabular-nums", f.tone)}>{f.v}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </SectionCard>
  );
}

/* ============================================================
   11. EXPENSE OVERVIEW
============================================================ */
export function ExpenseOverview({ brandIds, enabled }: { brandIds: string[]; enabled: boolean }) {
  const { data, isLoading } = useQuery({
    queryKey: ["dash-expense", brandIds.join(",")],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const now = new Date();
      const mStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const lStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      const [cur, prev, cats] = await Promise.all([
        applyBrandScope(supabase.from("erp_transactions").select("amount, category_id"), brandIds)
          .eq("txn_type", "expense").gte("transaction_date", localDate(mStart)).lte("transaction_date", localDate(now)),
        applyBrandScope(supabase.from("erp_transactions").select("amount"), brandIds)
          .eq("txn_type", "expense").gte("transaction_date", localDate(lStart)).lte("transaction_date", localDate(lEnd)),
        applyBrandScope(supabase.from("erp_expense_categories").select("id, name"), brandIds, "brand_id", { includeNull: true }),
      ]);
      const nameOf = new Map<string, string>(((cats.data ?? []) as any[]).map(c => [c.id, c.name]));
      const byCat = new Map<string, number>();
      let total = 0;
      for (const t of (cur.data ?? []) as any[]) {
        const amt = Number(t.amount ?? 0);
        total += amt;
        const k = nameOf.get(t.category_id) ?? "Other";
        byCat.set(k, (byCat.get(k) ?? 0) + amt);
      }
      const prevTotal = ((prev.data ?? []) as any[]).reduce((s, t) => s + Number(t.amount ?? 0), 0);
      return {
        total, prevTotal,
        rows: Array.from(byCat.entries()).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount).slice(0, 10),
      };
    },
  });

  return (
    <SectionCard title="Expenses (this month)" icon={Receipt}
      action={<Link to="/erp/finance" className="text-[11px] text-indigo-600 hover:underline">Expenses →</Link>}>
      {isLoading ? <Skeleton className="h-32" /> : (
        <>
          <div className="flex items-baseline gap-3">
            <span className="text-[24px] font-semibold tabular-nums text-slate-900">{BDT(data?.total ?? 0)}</span>
            <Chip v={delta(data?.total ?? 0, data?.prevTotal ?? 0)} invert />
            <span className="text-[11px] text-slate-400">vs last month {BDT(data?.prevTotal ?? 0)}</span>
          </div>
          {!data?.rows.length ? <Empty text="এই মাসে কোনো expense entry নেই।" /> : (
            <div className="mt-3 space-y-1.5">
              {data.rows.map(r => {
                const share = (data.total > 0 ? r.amount / data.total : 0) * 100;
                return (
                  <div key={r.name}>
                    <div className="flex items-baseline justify-between text-[12px]">
                      <span className="truncate text-slate-700">{r.name}</span>
                      <span className="tabular-nums text-slate-600">{BDT(r.amount)} <span className="text-slate-400">{share.toFixed(0)}%</span></span>
                    </div>
                    <div className="mt-0.5 h-1.5 rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-indigo-400" style={{ width: `${share}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </SectionCard>
  );
}

/* ============================================================
   12. TEAM / OPERATIONS SUMMARY
============================================================ */
export function TeamOpsSummary({ brandIds, enabled }: { brandIds: string[]; enabled: boolean }) {
  const { data, isLoading } = useQuery({
    queryKey: ["dash-teamops", brandIds.join(",")],
    enabled,
    staleTime: 120_000,
    queryFn: async () => {
      const today = localDate(new Date());
      const [att, emp, tasks, packed] = await Promise.all([
        supabase.from("hr_attendance").select("status, late_minutes, overtime_minutes").eq("work_date", today),
        supabase.from("hr_employees").select("id", { count: "exact", head: true }).eq("status", "active"),
        applyBrandScope(supabase.from("hub_tasks").select("id", { count: "exact", head: true }), brandIds).neq("status", "done"),
        applyBrandScope(supabase.from("orders").select("id", { count: "exact", head: true }), brandIds)
          .in("status", ["packed", "ready_to_ship", "shipped", "in_transit", "delivered"])
          .gte("updated_at", today + "T00:00:00.000Z"),
      ]);
      const rows = (att.data ?? []) as any[];
      return {
        present: rows.filter(r => ["present", "late", "half_day"].includes(String(r.status))).length,
        late: rows.filter(r => Number(r.late_minutes ?? 0) > 0).length,
        ot: Math.round(rows.reduce((s, r) => s + Number(r.overtime_minutes ?? 0), 0) / 60),
        headcount: emp.count ?? 0,
        pendingTasks: tasks.count ?? 0,
        processedToday: packed.count ?? 0,
      };
    },
  });

  const cells = [
    { l: "Headcount", v: data?.headcount ?? 0 },
    { l: "Present today", v: data?.present ?? 0 },
    { l: "Late", v: data?.late ?? 0 },
    { l: "Overtime (h)", v: data?.ot ?? 0 },
    { l: "Pending tasks", v: data?.pendingTasks ?? 0 },
    { l: "Orders processed", v: data?.processedToday ?? 0 },
  ];
  return (
    <SectionCard title="Team & operations" icon={Users}
      action={<Link to="/erp/hr/attendance" className="text-[11px] text-indigo-600 hover:underline">HR →</Link>}>
      {isLoading ? <Skeleton className="h-20" /> : (
        <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
          {cells.map(c => (
            <div key={c.l} className="rounded-md border border-slate-200 p-2">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">{c.l}</div>
              <div className="text-[16px] font-semibold tabular-nums text-slate-900">{c.v}</div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

/* ============================================================
   13. BUSINESS HEALTH SCORE
============================================================ */
export function BusinessHealthScore(props: P) {
  const exec = useExecutive(props);
  const { brandIds, enabled, range } = props;
  const { data, isLoading } = useQuery({
    queryKey: ["dash-health", brandIds.join(","), range.from.toISOString(), range.to.toISOString()],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const [orders, prods, accounts, pending] = await Promise.all([
        applyBrandScope(supabase.from("orders").select("status"), brandIds)
          .gte("created_at", range.from.toISOString()).lte("created_at", range.to.toISOString()),
        applyBrandScope(supabase.from("products").select("available_stock, stock, reorder_point, low_stock_threshold"), brandIds).eq("is_active", true),
        applyBrandScope(supabase.from("erp_accounts").select("current_balance"), brandIds, "brand_id", { includeNull: true }).eq("is_active", true),
        applyBrandScope(supabase.from("orders").select("id", { count: "exact", head: true }), brandIds)
          .in("status", ["confirmed", "packaging", "packed", "ready_to_ship"]),
      ]);
      const list = (orders.data ?? []) as any[];
      const total = list.length || 1;
      const delivered = list.filter(r => ["delivered", "partial_delivered", "completed"].includes(String(r.status))).length;
      const cancelled = list.filter(r => String(r.status) === "cancelled").length;
      const returned = list.filter(r => String(r.status).includes("return")).length;
      const pr = (prods.data ?? []) as any[];
      const outRatio = pr.length ? pr.filter(p => Number(p.available_stock ?? p.stock ?? 0) <= 0).length / pr.length : 0;
      const cash = ((accounts.data ?? []) as any[]).reduce((s, a) => s + Number(a.current_balance ?? 0), 0);
      return {
        deliveryRate: (delivered / total) * 100,
        cancelRate: (cancelled / total) * 100,
        returnRate: (returned / total) * 100,
        outRatio: outRatio * 100,
        cash,
        pending: pending.count ?? 0,
        orders: list.length,
      };
    },
  });

  const cur = exec.data?.cur, prev = exec.data?.prev;
  const clamp = (n: number) => Math.max(0, Math.min(100, n));
  const parts = [
    { l: "Sales health", s: clamp(50 + delta(cur?.revenue ?? 0, prev?.revenue ?? 0)) },
    { l: "Profit health", s: clamp(((cur?.margin ?? 0) / 25) * 100) },
    { l: "Marketing health", s: clamp(((cur?.roas ?? 0) / 3) * 100) },
    { l: "Inventory health", s: clamp(100 - (data?.outRatio ?? 0) * 2) },
    { l: "Cash flow health", s: clamp(((data?.cash ?? 0) / 500000) * 100) },
    { l: "Operations health", s: clamp(100 - (data?.cancelRate ?? 0) * 2 - (data?.returnRate ?? 0) * 2) },
  ];
  const score = Math.round(parts.reduce((s, p) => s + p.s, 0) / parts.length);
  const tone = score >= 75 ? "text-emerald-600" : score >= 50 ? "text-amber-600" : "text-rose-600";

  return (
    <SectionCard title="Business health score" icon={Gauge}>
      {isLoading || exec.isLoading ? <Skeleton className="h-28" /> : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[160px_1fr]">
          <div className="flex flex-col items-center justify-center rounded-lg bg-slate-50 p-3">
            <div className={cn("text-[40px] font-bold leading-none tabular-nums", tone)}>{score}</div>
            <div className="mt-1 text-[11px] uppercase tracking-wider text-slate-500">out of 100</div>
          </div>
          <div className="space-y-2">
            {parts.map(p => (
              <div key={p.l}>
                <div className="flex items-baseline justify-between text-[12px]">
                  <span className="text-slate-600">{p.l}</span>
                  <span className="tabular-nums font-medium text-slate-800">{Math.round(p.s)}</span>
                </div>
                <div className="mt-0.5 h-1.5 rounded-full bg-slate-100">
                  <div className={cn("h-full rounded-full", p.s >= 75 ? "bg-emerald-500" : p.s >= 50 ? "bg-amber-500" : "bg-rose-500")}
                    style={{ width: `${p.s}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </SectionCard>
  );
}

/* ============================================================
   14. RECENT ACTIVITY
============================================================ */
export function RecentActivity({ brandIds, enabled }: { brandIds: string[]; enabled: boolean }) {
  const { data, isLoading } = useQuery({
    queryKey: ["dash-recent", brandIds.join(",")],
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const [orders, txns, moves] = await Promise.all([
        applyBrandScope(supabase.from("orders").select("id, invoice_no, customer_name, total, status, created_at"), brandIds)
          .order("created_at", { ascending: false }).limit(6),
        applyBrandScope(supabase.from("erp_transactions").select("id, txn_type, amount, description, created_at"), brandIds)
          .order("created_at", { ascending: false }).limit(6),
        applyBrandScope(supabase.from("stock_movements").select("id, movement_type, quantity, created_at, products(title)"), brandIds)
          .order("created_at", { ascending: false }).limit(6),
      ]);
      return {
        orders: (orders.data ?? []) as any[],
        txns: (txns.data ?? []) as any[],
        moves: (moves.data ?? []) as any[],
      };
    },
  });
  const ago = (d: string) => {
    const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
    return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`;
  };
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <SectionCard title="Recent orders" icon={ShoppingCart}>
        {isLoading ? <Skeleton className="h-24" /> : !data?.orders.length ? <Empty text="No orders." /> : (
          <div className="space-y-1.5 text-[12px]">
            {data.orders.map(o => (
              <div key={o.id} className="flex items-center justify-between gap-2">
                <span className="truncate text-slate-700">{o.invoice_no ?? "—"} · {o.customer_name ?? "—"}</span>
                <span className="shrink-0 tabular-nums text-slate-500">{BDT(Number(o.total ?? 0))} · {ago(o.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
      <SectionCard title="Recent payments & expenses" icon={Banknote}>
        {isLoading ? <Skeleton className="h-24" /> : !data?.txns.length ? <Empty text="No transactions." /> : (
          <div className="space-y-1.5 text-[12px]">
            {data.txns.map(t => (
              <div key={t.id} className="flex items-center justify-between gap-2">
                <span className="truncate text-slate-700">{t.description || t.txn_type}</span>
                <span className={cn("shrink-0 tabular-nums", String(t.txn_type) === "income" ? "text-emerald-600" : "text-rose-600")}>
                  {BDT(Number(t.amount ?? 0))} · {ago(t.created_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
      <SectionCard title="Recent inventory moves" icon={Boxes}>
        {isLoading ? <Skeleton className="h-24" /> : !data?.moves.length ? <Empty text="No stock movement." /> : (
          <div className="space-y-1.5 text-[12px]">
            {data.moves.map(m => (
              <div key={m.id} className="flex items-center justify-between gap-2">
                <span className="truncate text-slate-700">{m.products?.title ?? "—"}</span>
                <span className="shrink-0 tabular-nums text-slate-500">{m.movement_type} {m.quantity} · {ago(m.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
