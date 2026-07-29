import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  ShoppingCart, CheckCircle2, Truck, Wallet, Banknote, AlertTriangle, XCircle,
  TrendingUp, UserPlus, Repeat, RefreshCw, ArrowUpRight, ArrowDownRight,
  Package, Boxes, Megaphone, Activity, Users, Sparkles,
  ChevronDown, ChevronUp,
  ChevronLeft, ChevronRight, CalendarDays, Clock,
} from "lucide-react";
import { Landmark, Smartphone, Coins, ArrowDownLeft, ArrowUpRight as ArrowOut } from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  Line, ComposedChart, PieChart, Pie, Cell, BarChart, Bar, LineChart, ReferenceLine,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useBrand, type Brand } from "@/contexts/brand-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { DateRangePicker, buildPreset, type MktRangeValue } from "@/components/erp/marketing/date-range-picker";
import { applyBrandScope } from "@/lib/erp/apply-brand-scope";
import { moneyTier } from "@/lib/erp/money-tier";
import { cn } from "@/lib/utils";
import { useCurrentRole } from "@/hooks/use-current-role";
import { hasAnyBackoffice } from "@/lib/erp/access";
import {
  NetProfitCard, CashPositionCard, CodRemittancePipelineCard, RoasComparisonCard,
  AdWalletBalanceCard, StuckOrdersCard, ReturnRateByProductCard, CourierPerformanceCard,
  AbandonedCartRecoveryCard, NewVsReturningCard,
} from "@/components/erp/dashboard/widgets";
import { WebsiteOrdersOverview } from "@/components/erp/dashboard/website-orders-overview";

export const Route = createFileRoute("/_authenticated/erp/")({
  head: () => ({ meta: [{ title: "Dashboard — SynqWithUs ERP" }] }),
  component: DashboardPage,
});

// ---------- helpers ----------
const BDT = (n: number) =>
  "৳" + Math.round(n).toLocaleString("en-IN");
const compact = (n: number) =>
  n >= 1e7 ? (n / 1e7).toFixed(1) + "Cr"
  : n >= 1e5 ? (n / 1e5).toFixed(1) + "L"
  : n >= 1e3 ? (n / 1e3).toFixed(1) + "k"
  : String(Math.round(n));

function rangeFromMkt(v: MktRangeValue): { from: Date; to: Date; prevFrom: Date; prevTo: Date; days: number } {
  const [fy, fm, fd] = v.from.split("-").map(Number);
  const [ty, tm, td] = v.to.split("-").map(Number);
  const from = new Date(fy, (fm ?? 1) - 1, fd ?? 1, 0, 0, 0, 0);
  const to = new Date(ty, (tm ?? 1) - 1, td ?? 1, 23, 59, 59, 999);
  const ms = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - ms);
  const days = Math.max(1, Math.round(ms / 86400e3) + 1);
  return { from, to, prevFrom, prevTo, days };
}
// Kept for typing of helper consumers
const getRange = rangeFromMkt;
function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// ---------- page ----------
function DashboardPage() {
  const { roles, isLoading: roleLoading } = useCurrentRole();
  if (roleLoading) {
    return (
      <div className="min-h-screen grid place-items-center bg-muted/30">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }
  if (!hasAnyBackoffice(roles)) {
    return (
      <div className="min-h-screen grid place-items-center bg-muted/30">
        <div className="max-w-md text-center space-y-2 p-6">
          <h2 className="text-lg font-semibold">Restricted</h2>
          <p className="text-sm text-muted-foreground">
            Your account doesn't have dashboard access. Contact an admin if this is unexpected.
          </p>
        </div>
      </div>
    );
  }
  return <AdminDashboard />;
}

function AdminDashboard() {
  const { activeBrand, brandIds, isAllBrands, brands } = useBrand();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const enabled = brandIds.length > 0;
  const [mktRange, setMktRange] = useState<MktRangeValue>(() => buildPreset("today"));
  const range = useMemo(() => rangeFromMkt(mktRange), [mktRange]);
  const [lastSync, setLastSync] = useState(new Date());

  // user greeting
  const { data: me } = useQuery({
    queryKey: ["me-profile"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return { name: "there" };
      const { data: p } = await supabase
        .from("profiles").select("display_name").eq("id", u.user.id).maybeSingle();
      return { name: (p?.display_name as string) || u.user.email?.split("@")[0] || "there" };
    },
    staleTime: 5 * 60 * 1000,
  });

  const refreshAll = () => {
    qc.invalidateQueries({ predicate: q => Array.isArray(q.queryKey) && String(q.queryKey[0]).startsWith("dash-") });
    setLastSync(new Date());
  };
  useEffect(() => {
    const t = setInterval(refreshAll, 30000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* HEADER — Linear/Vercel style: hairline, tight, no gradient */}
      <div className="border-b border-slate-200 bg-white/90 sticky top-0 z-20 backdrop-blur supports-[backdrop-filter]:bg-white/75">
        <div className="px-4 md:px-6 py-3 max-w-[1600px] mx-auto">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:flex-wrap sm:justify-between">
            <div className="min-w-0 flex items-baseline gap-3 flex-wrap">
              <h1 className="text-[15px] font-semibold tracking-tight text-slate-900 truncate">
                {greeting()}, {me?.name ?? "..."}
              </h1>
              <span className="text-[12px] text-slate-500 truncate">
                {isAllBrands ? `All Brands · ${brands.length}` : activeBrand?.name ?? ""}
                <span className="mx-1.5 text-slate-300">·</span>
                {new Date().toLocaleDateString("en-GB", { weekday: "short", month: "short", day: "numeric" })}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              <span className="hidden md:inline-flex items-center gap-1.5 text-[11px] text-slate-500">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                Updated {timeAgo(lastSync)}
              </span>
              <Button size="sm" variant="ghost" onClick={refreshAll} className="gap-1.5 h-8 px-2 text-slate-600 hover:text-slate-900">
                <RefreshCw className="size-3.5" />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
              <DateRangePicker value={mktRange} onChange={setMktRange} />
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-6 py-4 max-w-[1600px] mx-auto space-y-4">
        {/* KPI strip */}
        <KpiStrip brandIds={brandIds} enabled={enabled} range={range} onNav={(to) => navigate({ to: to as any })} />

        {/* Website orders + Today's sales split */}
        <WebsiteOrdersOverview brandIds={brandIds} enabled={enabled} range={range} rangeLabel={mktRange.label} />

        {/* MUST-HAVE row 1: Profit + Cash */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <NetProfitCard brandIds={brandIds} enabled={enabled} range={range} />
          <CashPositionCard brandIds={brandIds} enabled={enabled} />
        </div>

        {/* MUST-HAVE row 2: COD Remittance + ROAS */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <CodRemittancePipelineCard brandIds={brandIds} enabled={enabled} range={range} />
          <RoasComparisonCard brandIds={brandIds} enabled={enabled} range={range} />
        </div>

        {/* MUST-HAVE row 3: Ad Wallet + Stuck Orders */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <AdWalletBalanceCard brandIds={brandIds} enabled={enabled} />
          <StuckOrdersCard brandIds={brandIds} enabled={enabled} />
        </div>

        {/* MUST-HAVE row 4: Courier perf + Return-rate SKUs */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <CourierPerformanceCard brandIds={brandIds} enabled={enabled} range={range} />
          <ReturnRateByProductCard brandIds={brandIds} enabled={enabled} range={range} />
        </div>

        {/* GOOD-TO-HAVE — trend + segmentation */}
        <TrendChart brandIds={brandIds} enabled={enabled} range={range} brands={brands} isAllBrands={isAllBrands} />

        <TodayAnalytics brandIds={brandIds} enabled={enabled} range={range} rangeLabel={mktRange.label} />

        <HourlyOrdersComparison brandIds={brandIds} enabled={enabled} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <NewVsReturningCard brandIds={brandIds} enabled={enabled} range={range} />
          <AbandonedCartRecoveryCard brandIds={brandIds} enabled={enabled} />
        </div>

        {isAllBrands && brands.length > 1 && (
          <BrandComparison brands={brands} range={range} />
        )}

        {/* Supporting existing cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <CourierCard brandIds={brandIds} enabled={enabled} range={range} />
          <CodOutstandingCard brandIds={brandIds} enabled={enabled} range={range} />
          <ReturnsCard brandIds={brandIds} enabled={enabled} range={range} />
          <ImportsCard brandIds={brandIds} enabled={enabled} range={range} />
        </div>

        <FinanceSection brandIds={brandIds} enabled={enabled} range={range} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <InventoryHealth brandIds={brandIds} enabled={enabled} />
          <div className="lg:col-span-2">
            <LowStockList brandIds={brandIds} enabled={enabled} />
          </div>
        </div>

        <MarketingCard brandIds={brandIds} enabled={enabled} range={range} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <TopProducts brandIds={brandIds} enabled={enabled} range={range} />
          <TopCustomers brandIds={brandIds} enabled={enabled} range={range} />
        </div>

        <NeedsAttention brandIds={brandIds} enabled={enabled} />

        <LiveOrdersFeed brandIds={brandIds} enabled={enabled} />

        <SystemFooter lastSync={lastSync} />
      </div>
    </div>
  );
}

function timeAgo(d: Date) {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  return `${Math.floor(s/3600)}h ago`;
}

// ---------- KPI STRIP ----------
function KpiStrip({
  brandIds, enabled, range, onNav,
}: { brandIds: string[]; enabled: boolean; range: ReturnType<typeof getRange>; onNav: (to: string) => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["dash-kpi", brandIds.join(","), range.from.toISOString(), range.to.toISOString()],
    enabled,
    staleTime: 60_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      const inRange = (q: any) => q.gte("created_at", range.from.toISOString()).lte("created_at", range.to.toISOString());
      const inPrev = (q: any) => q.gte("created_at", range.prevFrom.toISOString()).lte("created_at", range.prevTo.toISOString());

      const [cur, prev, confirmed, inTransit, codPending, attention, cancelled, items, users] = await Promise.all([
        inRange(applyBrandScope(supabase.from("orders").select("total,status,source_website"), brandIds)),
        inPrev(applyBrandScope(supabase.from("orders").select("total,status,source_website"), brandIds)),
        // Snapshot: orders created in range whose CURRENT status is a confirmed-side state.
        inRange(applyBrandScope(supabase.from("orders").select("id", { count: "exact", head: true }), brandIds))
          .in("status", ["confirmed","packaging","packed","ready_to_ship","shipped","in_transit","delivered","partial_delivered"]),
        inRange(applyBrandScope(supabase.from("orders").select("id", { count: "exact", head: true }), brandIds))
          .in("status", ["shipped", "in_transit"]),
        inRange(applyBrandScope(supabase.from("orders").select("total,partial_amount,payment_status"), brandIds))
          .eq("payment_method", "cod").neq("payment_status", "paid")
          .in("status", ["shipped", "in_transit", "delivered", "partial_delivered"]),
        applyBrandScope(supabase.from("orders").select("id", { count: "exact", head: true }), brandIds)
          .in("status", ["new" as any, "processing" as any]).lt("created_at", new Date(Date.now() - 3*86400e3).toISOString()),
        inRange(applyBrandScope(supabase.from("orders").select("id", { count: "exact", head: true }), brandIds))
          .eq("status", "cancelled"),
        inRange(applyBrandScope(supabase.from("orders").select("user_id"), brandIds))
          .not("user_id", "is", null),
        applyBrandScope(supabase.from("orders").select("user_id, created_at"), brandIds).not("user_id", "is", null),
      ]);

      const curRows = cur.data ?? [];
      const prevRows = prev.data ?? [];
      const curOrders = curRows.length;
      const prevOrders = prevRows.length;
      const revenue = curRows.reduce((s: number, r: any) => s + Number(r.total ?? 0), 0);
      const prevRevenue = prevRows.reduce((s: number, r: any) => s + Number(r.total ?? 0), 0);
      const CONFIRMED_STATUSES = new Set([
        "confirmed","packaging","packed","ready_to_ship","shipped","in_transit","delivered","partial_delivered",
      ]);
      const EXCLUDED_STATUSES = new Set(["cancelled","returned"]);
      let revenueConfirmed = 0, prevRevenueConfirmed = 0;
      let revenueWebPending = 0, prevRevenueWebPending = 0;
      for (const r of curRows as any[]) {
        const st = String(r.status ?? "");
        const total = Number(r.total ?? 0);
        if (CONFIRMED_STATUSES.has(st)) revenueConfirmed += total;
        else if (!EXCLUDED_STATUSES.has(st) && r.source_website) revenueWebPending += total;
      }
      for (const r of prevRows as any[]) {
        const st = String(r.status ?? "");
        const total = Number(r.total ?? 0);
        if (CONFIRMED_STATUSES.has(st)) prevRevenueConfirmed += total;
        else if (!EXCLUDED_STATUSES.has(st) && r.source_website) prevRevenueWebPending += total;
      }
      const codRows = codPending.data ?? [];
      const codAmount = codRows.reduce((s: number, r: any) =>
        s + Math.max(0, Number(r.total ?? 0) - Number(r.partial_amount ?? 0)), 0);

      // new vs returning: customers in range whose earliest order is also in range
      const firstSeen = new Map<string, string>();
      for (const r of (users.data ?? []) as any[]) {
        const u = r.user_id as string; const t = r.created_at as string;
        if (!firstSeen.has(u) || t < firstSeen.get(u)!) firstSeen.set(u, t);
      }
      const seenInRange = new Set<string>();
      const newCust = new Set<string>(); const retCust = new Set<string>();
      for (const r of (items.data ?? []) as any[]) {
        const u = r.user_id as string;
        if (seenInRange.has(u)) continue;
        seenInRange.add(u);
        const first = firstSeen.get(u);
        if (first && first >= range.from.toISOString() && first <= range.to.toISOString()) newCust.add(u);
        else retCust.add(u);
      }

      const confirmRate = curOrders > 0 ? (confirmed.count ?? 0) / curOrders * 100 : 0;
      const cancelRate = curOrders > 0 ? (cancelled.count ?? 0) / curOrders * 100 : 0;
      const aov = curOrders > 0 ? revenue / curOrders : 0;
      const trend = (a: number, b: number) => b === 0 ? (a > 0 ? 100 : 0) : ((a - b) / b) * 100;

      return {
        curOrders, prevOrders, revenue, prevRevenue,
        revenueConfirmed, prevRevenueConfirmed,
        revenueWebPending, prevRevenueWebPending,
        confirmed: confirmed.count ?? 0, confirmRate,
        inTransit: inTransit.count ?? 0,
        codAmount, codCount: codRows.length,
        attention: attention.count ?? 0,
        cancelled: cancelled.count ?? 0, cancelRate,
        aov, newCust: newCust.size, retCust: retCust.size,
        ordersTrend: trend(curOrders, prevOrders),
        revTrend: trend(revenue, prevRevenue),
        revConfirmedTrend: trend(revenueConfirmed, prevRevenueConfirmed),
        revWebPendingTrend: trend(revenueWebPending, prevRevenueWebPending),
      };
    },
  });

  const cards = [
    { icon: ShoppingCart, label: "Orders", value: data?.curOrders ?? 0, trend: data?.ordersTrend, sub: "vs previous", tone: "indigo", to: "/erp/orders/web" },
    { icon: CheckCircle2, label: "Confirmed", value: data?.confirmed ?? 0, sub: `${(data?.confirmRate ?? 0).toFixed(0)}% confirm rate`, tone: "emerald", to: "/erp/orders/web" },
    { icon: Truck, label: "In Transit", value: data?.inTransit ?? 0, sub: "Pathao + Steadfast", tone: "blue", to: "/erp/orders/web" },
    { icon: Wallet, label: "Sales Revenue", value: BDT(data?.revenueConfirmed ?? 0), amount: data?.revenueConfirmed ?? 0, trend: data?.revConfirmedTrend, sub: "confirmed orders", tone: "emerald", to: "/erp/orders/web" },
    { icon: ShoppingCart, label: "Web Pending Rev", value: BDT(data?.revenueWebPending ?? 0), amount: data?.revenueWebPending ?? 0, trend: data?.revWebPendingTrend, sub: "not confirmed yet", tone: "amber", to: "/erp/orders/web" },
    { icon: Banknote, label: "COD Pending", value: BDT(data?.codAmount ?? 0), amount: data?.codAmount ?? 0, sub: `${data?.codCount ?? 0} orders`, tone: "amber", to: "/erp/reconciliation" },
    { icon: AlertTriangle, label: "Attention", value: data?.attention ?? 0, sub: "needs action", tone: "rose", to: "/erp/orders/web" },
    { icon: XCircle, label: "Cancelled", value: data?.cancelled ?? 0, sub: `${(data?.cancelRate ?? 0).toFixed(1)}% cancel rate`, tone: "rose", to: "/erp/orders/web" },
    { icon: TrendingUp, label: "AOV", value: BDT(data?.aov ?? 0), amount: data?.aov ?? 0, sub: "avg order value", tone: "slate" },
    { icon: UserPlus, label: "New Customers", value: data?.newCust ?? 0, sub: "first orders", tone: "violet" },
    { icon: Repeat, label: "Returning", value: data?.retCust ?? 0, sub: "repeat customers", tone: "violet" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2">
      {cards.map((c, i) => (
        <KpiCard
          key={i}
          icon={c.icon}
          label={c.label}
          value={c.value}
          amount={(c as any).amount}
          trend={(c as any).trend}
          sub={c.sub}
          tone={c.tone}
          to={c.to}
          onNav={onNav}
          loading={isLoading}
          seed={i}
        />
      ))}
    </div>
  );
}

// ---------- KPI CARD — Linear/Vercel compact ----------
function KpiCard({
  icon: Icon, label, value, amount, trend, sub, tone, to, onNav, loading,
}: {
  icon: any; label: string; value: any; amount?: number; trend?: number;
  sub: string; tone: string; to?: string; onNav: (to: string) => void;
  loading: boolean; seed: number;
}) {
  const clickable = !!to;
  return (
    <button
      onClick={() => clickable && onNav(to!)}
      type="button"
      className={cn(
        "group text-left rounded-lg border border-slate-200 bg-white p-3 transition-colors",
        "hover:border-slate-300 hover:shadow-sm",
        clickable ? "cursor-pointer" : "cursor-default",
      )}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[10.5px] font-medium uppercase tracking-wider text-slate-500 truncate">
          {label}
        </span>
        <Icon className={cn("size-3.5 shrink-0", toneFg(tone))} />
      </div>

      {loading ? (
        <Skeleton className="h-7 w-20" />
      ) : (
        <div
          className={cn(
            "tabular-nums leading-none tracking-tight font-semibold text-slate-900 text-[22px]",
            typeof amount === "number" && moneyTier(amount),
          )}
        >
          {value}
        </div>
      )}

      <div className="mt-2 flex items-center gap-1.5 min-h-[16px]">
        {typeof trend === "number" && <TrendChip trend={trend} />}
        <span className="text-[11px] text-slate-500 truncate">{sub}</span>
      </div>
    </button>
  );
}

function TrendChip({ trend }: { trend: number }) {
  const up = trend >= 0;
  return (
    <span className={cn(
      "inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums",
      up ? "text-emerald-600" : "text-rose-600",
    )}>
      {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
      {Math.abs(trend).toFixed(1)}%
    </span>
  );
}

function trendSub(t: number | undefined) {
  if (t === undefined) return "vs previous period";
  const sign = t >= 0 ? "+" : "";
  return `${sign}${t.toFixed(1)}% vs previous`;
}
function toneBg(t: string) {
  return {
    indigo: "bg-indigo-50 dark:bg-indigo-950/30",
    emerald: "bg-emerald-50 dark:bg-emerald-950/30",
    blue: "bg-blue-50 dark:bg-blue-950/30",
    amber: "bg-amber-50 dark:bg-amber-950/30",
    rose: "bg-rose-50 dark:bg-rose-950/30",
    slate: "bg-slate-100 dark:bg-slate-800",
    violet: "bg-violet-50 dark:bg-violet-950/30",
  }[t] ?? "bg-muted";
}
function toneFg(t: string) {
  return {
    indigo: "text-indigo-600", emerald: "text-emerald-600", blue: "text-blue-600",
    amber: "text-amber-600", rose: "text-rose-600", slate: "text-slate-600",
    violet: "text-violet-600",
  }[t] ?? "text-foreground";
}
function toneBarBg(t: string) {
  return {
    indigo: "bg-indigo-400 dark:bg-indigo-500",
    emerald: "bg-emerald-400 dark:bg-emerald-500",
    blue: "bg-blue-400 dark:bg-blue-500",
    amber: "bg-amber-400 dark:bg-amber-500",
    rose: "bg-rose-400 dark:bg-rose-500",
    slate: "bg-slate-400 dark:bg-slate-500",
    violet: "bg-violet-400 dark:bg-violet-500",
  }[t] ?? "bg-muted-foreground/40";
}

// ---------- BRAND COMPARISON ----------
function BrandComparison({ brands, range }: { brands: Brand[]; range: ReturnType<typeof getRange> }) {
  const queries = brands.map(b => useQuery({
    queryKey: ["dash-brand-cmp", b.id, range.from.toISOString(), range.to.toISOString()],
    staleTime: 60_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      const inR = (q: any) => q.gte("created_at", range.from.toISOString()).lte("created_at", range.to.toISOString());
      const [today, pending, delivered, revRows, lowStock, returnRows] = await Promise.all([
        inR(supabase.from("orders").select("id", { count: "exact", head: true })).eq("brand_id", b.id),
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("brand_id", b.id)
          .in("status", ["new","confirmed","packaging","packed","ready_to_ship"]),
        inR(supabase.from("orders").select("id", { count: "exact", head: true })).eq("brand_id", b.id).eq("status","delivered"),
        // Revenue = all in-range orders except cancelled/returned (matches top KPI Revenue card).
        inR(supabase.from("orders").select("total")).eq("brand_id", b.id).not("status","in","(cancelled,returned)"),
        supabase.from("low_stock_alerts").select("id", { count: "exact", head: true }).eq("brand_id", b.id).eq("is_resolved", false),
        inR(supabase.from("orders").select("id", { count: "exact", head: true })).eq("brand_id", b.id).eq("status","returned"),
      ]);
      const rev = (revRows.data ?? []).reduce((s: number, r: any) => s + Number(r.total ?? 0), 0);
      const deliv = delivered.count ?? 0;
      const ret = returnRows.count ?? 0;
      return {
        today: today.count ?? 0,
        pending: pending.count ?? 0,
        delivered: deliv,
        revenue: rev,
        lowStock: lowStock.count ?? 0,
        returnRate: deliv + ret > 0 ? (ret / (deliv + ret)) * 100 : 0,
      };
    },
  }));

  type Metric = { key: "today" | "revenue" | "delivered" | "pending" | "lowStock" | "returnRate"; label: string; fmt: (v: number) => string; tone: string; lowerIsBetter?: boolean };
  const metrics: Metric[] = [
    { key: "revenue", label: "Revenue", fmt: (v) => BDT(v), tone: "emerald" },
    { key: "today", label: "Orders", fmt: (v) => String(v), tone: "indigo" },
    { key: "delivered", label: "Delivered", fmt: (v) => String(v), tone: "blue" },
    { key: "pending", label: "Pending", fmt: (v) => String(v), tone: "amber" },
    { key: "lowStock", label: "Low Stock", fmt: (v) => String(v), tone: "rose", lowerIsBetter: true },
    { key: "returnRate", label: "Return Rate", fmt: (v) => v.toFixed(1) + "%", tone: "rose", lowerIsBetter: true },
  ];

  const totals = metrics.reduce<Record<string, number>>((acc, m) => {
    acc[m.key] = queries.reduce((s, q) => s + Number(q.data?.[m.key] ?? 0), 0);
    return acc;
  }, {});
  const combinedReturn = (() => {
    const d = queries.reduce((s, q) => s + Number(q.data?.delivered ?? 0), 0);
    const denomApprox = queries.reduce((s, q) => {
      const dv = Number(q.data?.delivered ?? 0);
      const rr = Number(q.data?.returnRate ?? 0);
      // ret ≈ rr * (d+ret) / 100  →  ret = (rr*d)/(100-rr) approximated by share
      const ret = rr > 0 && rr < 100 ? (rr * dv) / (100 - rr) : 0;
      return s + dv + ret;
    }, 0);
    const ret = denomApprox - d;
    return denomApprox > 0 ? (ret / denomApprox) * 100 : 0;
  })();

  const leaders: Record<string, number> = {};
  metrics.forEach((m) => {
    const values = queries.map((q) => Number(q.data?.[m.key] ?? 0));
    if (values.every((v) => v === 0)) { leaders[m.key] = -1; return; }
    leaders[m.key] = m.lowerIsBetter ? values.indexOf(Math.min(...values)) : values.indexOf(Math.max(...values));
  });

  const totalRevenue = totals.revenue ?? 0;

  return (
    <Card className="border-border/60 overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Sparkles className="size-4 text-amber-500" /> Brand Comparison
        </CardTitle>
        <div className="text-xs text-muted-foreground">
          Combined Revenue <span className={cn("font-bold tabular-nums ml-1", moneyTier(totalRevenue))}>{BDT(totalRevenue)}</span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {queries.map((q, i) => {
            const b = brands[i];
            const rev = Number(q.data?.revenue ?? 0);
            const sharePct = totalRevenue > 0 ? (rev / totalRevenue) * 100 : 0;
            return (
              <div
                key={b.id}
                className="group relative rounded-xl border border-border/60 bg-card p-4 hover:shadow-sm hover:-translate-y-0.5 transition-all overflow-hidden"
              >
                <div className="absolute -top-10 -right-10 size-32 rounded-full bg-primary/5 blur-2xl pointer-events-none" />
                {/* Brand header */}
                <div className="flex items-center gap-3 mb-3">
                  {b.logo_url ? (
                    <img src={b.logo_url} alt="" className="size-10 rounded-lg object-cover ring-1 ring-border" />
                  ) : (
                    <div className="size-10 rounded-lg bg-muted grid place-items-center text-foreground font-bold">
                      {b.name.charAt(0)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold truncate">{b.name}</div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {sharePct.toFixed(1)}% of total
                    </div>
                  </div>
                </div>

                {/* Revenue spotlight */}
                <div className="rounded-lg border bg-card/60 px-3 py-2 mb-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Revenue</div>
                  {q.isLoading ? <Skeleton className="h-7 w-24 mt-1" /> : (
                    <div className={cn("text-2xl font-extrabold tabular-nums leading-tight", moneyTier(rev))}>
                      {BDT(rev)}
                    </div>
                  )}
                  <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-foreground/70 rounded-full transition-all"
                      style={{ width: `${Math.min(100, sharePct)}%` }}
                    />
                  </div>
                </div>

                {/* Metric grid */}
                <div className="grid grid-cols-2 gap-2">
                  {metrics.filter(m => m.key !== "revenue").map((m) => {
                    const v = Number(q.data?.[m.key] ?? 0);
                    const isLeader = leaders[m.key] === i;
                    return (
                      <div
                        key={m.key}
                        className={cn(
                          "rounded-md border px-2.5 py-1.5 transition-colors",
                          isLeader ? "border-amber-400/60 bg-amber-50/60 dark:bg-amber-950/20" : "bg-card/40",
                        )}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold truncate">{m.label}</span>
                          {isLeader && <Sparkles className="size-3 text-amber-500 shrink-0" />}
                        </div>
                        {q.isLoading
                          ? <Skeleton className="h-4 w-12 mt-1" />
                          : <div className="text-sm font-bold tabular-nums">{m.fmt(v)}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Combined footer strip */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 rounded-lg border border-dashed border-border/70 bg-muted/30 p-3">
          {metrics.map((m) => {
            const v = m.key === "returnRate" ? combinedReturn : (totals[m.key] ?? 0);
            return (
              <div key={m.key} className="text-center">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{m.label}</div>
                <div className={cn("text-sm font-bold tabular-nums mt-0.5", m.key === "revenue" && moneyTier(v))}>
                  {m.fmt(v)}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- TREND CHART ----------
function TrendChart({
  brandIds, enabled, range, brands, isAllBrands,
}: { brandIds: string[]; enabled: boolean; range: ReturnType<typeof getRange>; brands: Brand[]; isAllBrands: boolean }) {
  const [mode, setMode] = useState<"revenue" | "orders" | "both">("both");

  const { data, isLoading } = useQuery({
    queryKey: ["dash-trend", brandIds.join(","), range.from.toISOString(), range.to.toISOString()],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: rows } = await applyBrandScope(
        supabase.from("orders").select("created_at, total, brand_id"), brandIds
      ).gte("created_at", range.from.toISOString()).lte("created_at", range.to.toISOString());
      const buckets = new Map<string, any>();
      const days = Math.min(range.days, 60);
      for (let i = 0; i < days; i++) {
        const d = new Date(range.from); d.setDate(d.getDate() + i);
        const key = d.toISOString().slice(0, 10);
        const init: any = { date: key, label: d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }), orders: 0, revenue: 0 };
        for (const b of brands) init["b_" + b.id] = 0;
        buckets.set(key, init);
      }
      for (const r of (rows ?? []) as any[]) {
        const key = (r.created_at as string).slice(0, 10);
        const b = buckets.get(key); if (!b) continue;
        b.orders += 1;
        b.revenue += Number(r.total ?? 0);
        if (r.brand_id && b["b_" + r.brand_id] !== undefined) b["b_" + r.brand_id] += Number(r.total ?? 0);
      }
      return Array.from(buckets.values());
    },
  });

  const colors = ["#6366f1", "#f97316", "#10b981", "#ec4899", "#8b5cf6"];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-lg font-semibold">Revenue & Orders Trend</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">{range.from.toLocaleDateString()} → {range.to.toLocaleDateString()}</p>
        </div>
        <div className="flex gap-1 bg-muted rounded-md p-0.5">
          {(["revenue","orders","both"] as const).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={cn("text-xs px-2.5 py-1 rounded capitalize transition",
                mode === m ? "bg-background shadow-sm" : "text-muted-foreground")}>
              {m}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading || !data ? <Skeleton className="h-[320px] w-full" /> : (
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 16, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} tickMargin={8} stroke="var(--muted-foreground)" axisLine={false} tickLine={false} />
                <YAxis yAxisId="rev" tickFormatter={(v) => "৳" + compact(v)} tick={{ fontSize: 12 }} tickMargin={8} stroke="var(--muted-foreground)" axisLine={false} tickLine={false} width={56} />
                <YAxis yAxisId="ord" orientation="right" tick={{ fontSize: 12 }} tickMargin={8} stroke="var(--muted-foreground)" axisLine={false} tickLine={false} width={36} />
                <Tooltip
                  cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
                  contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12, padding: "8px 12px", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
                  labelStyle={{ fontWeight: 600, marginBottom: 4 }}
                  formatter={(v: any, n: any) => [n.toString().startsWith("Orders") ? v : BDT(Number(v)), n]}
                />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} iconType="circle" />
                {(mode === "revenue" || mode === "both") && (
                  isAllBrands && brands.length > 1 ? brands.map((b, i) => (
                    <Area key={b.id} yAxisId="rev" type="monotone" dataKey={"b_" + b.id} name={b.name}
                      stroke={colors[i % colors.length]} fill={colors[i % colors.length]} fillOpacity={0.15} strokeWidth={2} />
                  )) : (
                    <Area yAxisId="rev" type="monotone" dataKey="revenue" name="Revenue"
                      stroke="#6366f1" fill="#6366f1" fillOpacity={0.18} strokeWidth={2} />
                  )
                )}
                {(mode === "orders" || mode === "both") && (
                  <Line yAxisId="ord" type="monotone" dataKey="orders" name="Orders" stroke="#64748b" strokeDasharray="4 4" strokeWidth={2} dot={false} />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- COURIER ----------
function CourierCard({ brandIds, enabled, range }: { brandIds: string[]; enabled: boolean; range: ReturnType<typeof getRange> }) {
  const { data, isLoading } = useQuery({
    queryKey: ["dash-courier", brandIds.join(","), range.from.toISOString(), range.to.toISOString()],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: rows } = await applyBrandScope(
        supabase.from("courier_shipments").select("provider, status, created_at"), brandIds
      ).gte("created_at", range.from.toISOString()).lte("created_at", range.to.toISOString());
      const agg: Record<string, { transit: number; delivered: number; returned: number; failed: number; total: number }> = {};
      for (const r of (rows ?? []) as any[]) {
        const p = (r.provider as string) || "other";
        agg[p] ??= { transit: 0, delivered: 0, returned: 0, failed: 0, total: 0 };
        const s = (r.status as string) || "";
        agg[p].total++;
        if (/deliver/i.test(s)) agg[p].delivered++;
        else if (/return/i.test(s)) agg[p].returned++;
        else if (/fail|cancel|lost/i.test(s)) agg[p].failed++;
        else agg[p].transit++;
      }
      return agg;
    },
  });
  return (
    <Card>
      <CardHeader><CardTitle className="text-base font-semibold flex items-center gap-2"><Truck className="size-5 text-blue-600" /> Courier Status</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? <Skeleton className="h-32" /> : Object.keys(data ?? {}).length === 0 ? (
          <p className="text-sm text-muted-foreground">No courier data yet.</p>
        ) : (
          Object.entries(data!).map(([provider, s]) => {
            const success = s.total ? (s.delivered / s.total) * 100 : 0;
            return (
              <div key={provider} className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="font-medium capitalize">{provider}</span>
                  <span className="text-emerald-600 font-semibold">{success.toFixed(0)}% success</span>
                </div>
                <div className="grid grid-cols-4 gap-1 text-[11px]">
                  <Stat label="Transit" v={s.transit} />
                  <Stat label="Delivered" v={s.delivered} c="text-emerald-600" />
                  <Stat label="Returned" v={s.returned} c="text-amber-600" />
                  <Stat label="Failed" v={s.failed} c="text-rose-600" />
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
function Stat({ label, v, c }: { label: string; v: number; c?: string }) {
  return <div className="bg-muted/50 rounded px-1.5 py-1"><div className="text-muted-foreground">{label}</div><div className={cn("font-semibold", c)}>{v}</div></div>;
}

// ---------- COD OUTSTANDING ----------
function CodOutstandingCard({ brandIds, enabled, range }: { brandIds: string[]; enabled: boolean; range: ReturnType<typeof getRange> }) {
  const { data, isLoading } = useQuery({
    queryKey: ["dash-cod", brandIds.join(","), range.from.toISOString(), range.to.toISOString()],
    enabled, staleTime: 60_000,
    queryFn: async () => {
      const { data: rows } = await applyBrandScope(
        supabase.from("orders").select("total, partial_amount, delivered_at, created_at, payment_status, status"), brandIds
      ).eq("payment_method", "cod").neq("payment_status", "paid")
        .in("status", ["shipped", "in_transit", "delivered", "partial_delivered"])
        .gte("created_at", range.from.toISOString()).lte("created_at", range.to.toISOString());
      const cutoff = Date.now() - 14 * 86400e3;
      let amount = 0, count = 0, overdue = 0;
      for (const r of (rows ?? []) as any[]) {
        const due = Math.max(0, Number(r.total ?? 0) - Number(r.partial_amount ?? 0));
        if (due <= 0) continue;
        amount += due; count++;
        const ref = r.delivered_at ?? r.created_at;
        if (ref && new Date(ref).getTime() < cutoff) overdue += due;
      }
      return { amount, count, overdue };
    },
  });
  return (
    <Card>
      <CardHeader><CardTitle className="text-base font-semibold flex items-center gap-2"><Banknote className="size-5 text-amber-600" /> COD Outstanding</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-20" /> : (
          <>
            <div className={cn("text-3xl font-bold tabular-nums", moneyTier(data?.amount ?? 0))}>{BDT(data?.amount ?? 0)}</div>
            <div className="text-xs text-muted-foreground mt-1">{data?.count ?? 0} orders pending</div>
            {(data?.overdue ?? 0) > 0 && (
              <div className="mt-2 text-xs flex items-center gap-1.5 text-rose-600">
                <span className="size-1.5 rounded-full bg-rose-500" />
                Overdue &gt;14d: <span className="font-semibold">{BDT(data!.overdue)}</span>
              </div>
            )}
            <Link to="/erp/reconciliation" className="mt-3 inline-flex text-xs text-indigo-600 hover:underline">View queue →</Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- RETURNS ----------
function ReturnsCard({ brandIds, enabled, range }: { brandIds: string[]; enabled: boolean; range: ReturnType<typeof getRange> }) {
  const { data, isLoading } = useQuery({
    queryKey: ["dash-returns", brandIds.join(","), range.from.toISOString(), range.to.toISOString()],
    enabled, staleTime: 60_000,
    queryFn: async () => {
      const [pendingQc, inTransit, monthly, refunds] = await Promise.all([
        applyBrandScope(supabase.from("erp_return_cases").select("id", { count: "exact", head: true }), brandIds).eq("return_status", "pending_qc"),
        applyBrandScope(supabase.from("erp_return_cases").select("id", { count: "exact", head: true }), brandIds).eq("return_status", "in_transit"),
        applyBrandScope(supabase.from("erp_return_cases").select("id", { count: "exact", head: true }), brandIds)
          .gte("created_at", range.from.toISOString()).lte("created_at", range.to.toISOString()),
        applyBrandScope(supabase.from("erp_return_cases").select("refund_amount"), brandIds).neq("refund_status", "completed"),
      ]);
      const refundDue = (refunds.data ?? []).reduce((s: number, r: any) => s + Number(r.refund_amount ?? 0), 0);
      return { pendingQc: pendingQc.count ?? 0, inTransit: inTransit.count ?? 0, monthly: monthly.count ?? 0, refundDue };
    },
  });
  return (
    <Card>
      <CardHeader><CardTitle className="text-base font-semibold flex items-center gap-2"><Repeat className="size-5 text-amber-600" /> Returns & Exchanges</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-20" /> : (
          <>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><div className="text-muted-foreground text-xs">Pending QC</div><div className="font-semibold text-amber-600">{data?.pendingQc ?? 0}</div></div>
              <div><div className="text-muted-foreground text-xs">In Transit</div><div className="font-semibold">{data?.inTransit ?? 0}</div></div>
              <div><div className="text-muted-foreground text-xs">This Range</div><div className="font-semibold">{data?.monthly ?? 0}</div></div>
              <div><div className="text-muted-foreground text-xs">Refunds Due</div><div className="font-semibold text-rose-600">{BDT(data?.refundDue ?? 0)}</div></div>
            </div>
            <Link to="/erp/returns" className="mt-3 inline-flex text-xs text-indigo-600 hover:underline">View returns →</Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- IMPORTS ----------
function ImportsCard({ brandIds, enabled, range }: { brandIds: string[]; enabled: boolean; range: ReturnType<typeof getRange> }) {
  const { data, isLoading } = useQuery({
    queryKey: ["dash-imports", brandIds.join(","), range.from.toISOString(), range.to.toISOString()],
    enabled, staleTime: 60_000,
    queryFn: async () => {
      const { data: rows } = await applyBrandScope(
        supabase.from("imp_purchase_orders").select("status, due_bdt, shipped_at"), brandIds
      ).not("status", "in", "(received,cancelled)")
        .gte("created_at", range.from.toISOString()).lte("created_at", range.to.toISOString());
      let active = 0, inTransit = 0, due = 0;
      for (const r of (rows ?? []) as any[]) {
        active++;
        if (r.shipped_at && r.status !== "received") inTransit++;
        due += Number(r.due_bdt ?? 0);
      }
      return { active, inTransit, due };
    },
  });
  return (
    <Card>
      <CardHeader><CardTitle className="text-base font-semibold flex items-center gap-2"><Package className="size-5 text-violet-600" /> Import Status</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-20" /> : (
          <>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div><div className="text-muted-foreground text-xs">Active POs</div><div className="font-semibold">{data?.active ?? 0}</div></div>
              <div><div className="text-muted-foreground text-xs">In Transit</div><div className="font-semibold">{data?.inTransit ?? 0}</div></div>
              <div><div className="text-muted-foreground text-xs">Dues</div><div className="font-semibold text-rose-600">{BDT(data?.due ?? 0)}</div></div>
            </div>
            <Link to="/erp/imports" className="mt-3 inline-flex text-xs text-indigo-600 hover:underline">View imports →</Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- FINANCE ----------
function FinanceSection({ brandIds, enabled, range }: { brandIds: string[]; enabled: boolean; range: ReturnType<typeof getRange> }) {
  const { data, isLoading } = useQuery({
    queryKey: ["dash-finance", brandIds.join(","), range.from.toISOString(), range.to.toISOString()],
    enabled, staleTime: 60_000,
    queryFn: async () => {
      const fromISO = range.from.toISOString();
      const toISO = range.to.toISOString();
      const fromDate = fromISO.slice(0, 10);
      const toDate = toISO.slice(0, 10);
      const [accounts, rev, items, txns, bills, arOrders] = await Promise.all([
        applyBrandScope(supabase.from("erp_accounts").select("account_type, account_subtype, name, current_balance"), brandIds, "brand_id", { includeNull: true }).eq("is_active", true),
        // P&L Revenue = all in-range orders except cancelled/returned (mirrors top KPI Revenue).
        applyBrandScope(supabase.from("orders").select("total"), brandIds).not("status","in","(cancelled,returned)")
          .gte("created_at", fromISO).lte("created_at", toISO),
        applyBrandScope(supabase.from("order_items").select("cost_price, quantity, orders!inner(brand_id, status, created_at)"), brandIds, "orders.brand_id" as any)
          .not("orders.status","in","(cancelled,returned)")
          .gte("orders.created_at", fromISO).lte("orders.created_at", toISO),
        applyBrandScope(supabase.from("erp_transactions").select("amount, type, account_id"), brandIds)
          .gte("transaction_date", fromDate).lte("transaction_date", toDate),
        applyBrandScope(supabase.from("erp_bills").select("amount, paid_amount, status"), brandIds).neq("status", "paid"),
        applyBrandScope(supabase.from("orders").select("total, advance_amount"), brandIds)
          .in("status", ["shipped", "delivered"]).eq("payment_method", "cod"),
      ]);
      const accs = (accounts.data ?? []) as any[];
      const sumBy = (pred: (a: any) => boolean) =>
        accs.filter(pred).reduce((s, a) => s + Number(a.current_balance ?? 0), 0);
      const isBkash = (a: any) => a.account_type === "bkash" || a.account_subtype === "bkash" || /bkash/i.test(a.name);
      const isNagad = (a: any) => a.account_type === "nagad" || a.account_subtype === "nagad" || /nagad/i.test(a.name);
      const isBank = (a: any) => a.account_type === "bank";
      const isCash = (a: any) => a.account_type === "cash" && !isBkash(a) && !isNagad(a);
      const cash = sumBy(isCash);
      const bkash = sumBy(isBkash);
      const nagad = sumBy(isNagad);
      const bank = sumBy(isBank);
      const ar = (arOrders.data ?? []).reduce((s: number, r: any) =>
        s + Math.max(0, Number(r.total ?? 0) - Number(r.advance_amount ?? 0)), 0);
      const ap = (bills.data ?? []).reduce((s: number, r: any) =>
        s + Math.max(0, Number(r.amount ?? 0) - Number(r.paid_amount ?? 0)), 0);
      const totalAssets = cash + bkash + nagad + bank;
      const netPosition = totalAssets + ar - ap;
      const revenue = (rev.data ?? []).reduce((s: number, r: any) => s + Number(r.total ?? 0), 0);
      const cogs = (items.data ?? []).reduce((s: number, r: any) => s + Number(r.cost_price ?? 0) * Number(r.quantity ?? 0), 0);
      const expenses = (txns.data ?? []).filter((t: any) => t.type === "expense").reduce((s: number, t: any) => s + Number(t.amount ?? 0), 0);
      const gross = revenue - cogs;
      const net = gross - expenses;
      return { cash, bkash, nagad, bank, ar, ap, totalAssets, netPosition, revenue, cogs, gross, expenses, net };
    },
  });

  const wallets = [
    { label: "Cash", Icon: Coins, value: data?.cash ?? 0 },
    { label: "bKash", Icon: Smartphone, value: data?.bkash ?? 0 },
    { label: "Nagad", Icon: Smartphone, value: data?.nagad ?? 0 },
    { label: "Bank", Icon: Landmark, value: data?.bank ?? 0 },
  ];
  const receivablePayable = [
    { label: "Receivable", Icon: ArrowDownLeft, value: data?.ar ?? 0, hint: "COD pending" },
    { label: "Payable", Icon: ArrowOut, value: data?.ap ?? 0, hint: "Bills unpaid" },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="lg:col-span-2 overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Wallet className="size-5 text-emerald-600" /> Finance Snapshot
            </CardTitle>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Net Position</div>
              {isLoading ? <Skeleton className="h-6 w-24 mt-0.5 ml-auto" /> : (
                <div className={cn("text-xl font-bold tabular-nums", moneyTier(data?.netPosition ?? 0))}>
                  {BDT(data?.netPosition ?? 0)}
                </div>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Wallets</span>
              {isLoading ? <Skeleton className="h-3 w-16" /> : (
                <span className="text-xs text-muted-foreground tabular-nums">Total · <span className="font-semibold text-foreground">{BDT(data?.totalAssets ?? 0)}</span></span>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
              {wallets.map(({ label, Icon, value }) => (
                <div key={label} className="group relative rounded-xl border border-border/60 bg-card p-3 transition-all hover:border-border hover:shadow-sm">
                  <div className="flex items-center justify-between mb-1.5">
                    <Icon className="size-4 text-muted-foreground" />
                    <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
                  </div>
                  {isLoading ? <Skeleton className="h-5 w-16" /> : (
                    <div className={cn("text-base font-bold tabular-nums text-foreground", value < 0 && "text-rose-600")}>
                      {BDT(value)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {receivablePayable.map(({ label, Icon, value, hint }) => (
              <div key={label} className="flex items-center justify-between rounded-xl border border-border/60 bg-card p-3">
                <div className="flex items-center gap-2.5">
                  <div className="size-9 rounded-lg flex items-center justify-center bg-muted">
                    <Icon className="size-4 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-foreground">{label}</div>
                    <div className="text-[10px] text-muted-foreground">{hint}</div>
                  </div>
                </div>
                {isLoading ? <Skeleton className="h-5 w-16" /> : (
                  <div className="text-base font-bold tabular-nums text-foreground">{BDT(value)}</div>
                )}
              </div>
            ))}
          </div>
          <Link to="/erp/finance" className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline">
            Open Finance <ArrowUpRight className="size-3" />
          </Link>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-lg font-semibold">P&amp;L (Range)</CardTitle></CardHeader>
        <CardContent className="space-y-1.5 text-sm">
          {isLoading ? <Skeleton className="h-32" /> : (<>
            <PLRow label="Revenue" v={data?.revenue ?? 0} />
            <PLRow label="COGS" v={-(data?.cogs ?? 0)} />
            <div className="border-t pt-1.5"><PLRow label="Gross" v={data?.gross ?? 0} bold sub={data?.revenue ? `${((data!.gross/data!.revenue)*100).toFixed(1)}%` : undefined} /></div>
            <PLRow label="Expenses" v={-(data?.expenses ?? 0)} />
            <div className="border-t pt-1.5"><PLRow label="Net Profit" v={data?.net ?? 0} bold positive /></div>
          </>)}
        </CardContent>
      </Card>
    </div>
  );
}
function PLRow({ label, v, bold, positive, sub }: { label: string; v: number; bold?: boolean; positive?: boolean; sub?: string }) {
  const cls = v < 0 ? "text-rose-600" : positive ? "text-emerald-600" : "";
  return (
    <div className="flex justify-between items-baseline">
      <span className={cn("text-muted-foreground", bold && "text-foreground font-medium")}>{label}{sub && <span className="text-xs ml-1 text-muted-foreground">({sub})</span>}</span>
      <span className={cn("tabular-nums", bold && "font-semibold", cls)}>{BDT(v)}</span>
    </div>
  );
}

// ---------- INVENTORY ----------
function InventoryHealth({ brandIds, enabled }: { brandIds: string[]; enabled: boolean }) {
  const { data, isLoading } = useQuery({
    queryKey: ["dash-inv", brandIds.join(",")],
    enabled, staleTime: 60_000,
    queryFn: async () => {
      // Single source of truth: derive Low & Out from live products.
      const [products, out] = await Promise.all([
        applyBrandScope(
          supabase.from("products").select("total_cost_value, stock, available_stock, low_stock_threshold, reorder_point"),
          brandIds,
        ).eq("is_active", true).limit(5000),
        applyBrandScope(supabase.from("products").select("id", { count: "exact", head: true }), brandIds).eq("is_active", true).eq("stock", 0),
      ]);
      let value = 0, low = 0;
      for (const p of (products.data ?? []) as any[]) {
        value += Number(p.total_cost_value ?? 0);
        const stock = Number(p.available_stock ?? p.stock ?? 0);
        const threshold = Number(p.low_stock_threshold ?? p.reorder_point ?? 0);
        if (stock > 0 && threshold > 0 && stock <= threshold) low++;
      }
      return { value, low, out: out.count ?? 0 };
    },
  });
  return (
    <Card>
      <CardHeader><CardTitle className="text-base font-semibold flex items-center gap-2"><Boxes className="size-5 text-indigo-600" /> Inventory Health</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        {isLoading ? <Skeleton className="h-28" /> : (<>
          <div className="flex justify-between"><span className="text-muted-foreground">Stock Value</span><span className="font-semibold tabular-nums">{BDT(data?.value ?? 0)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Low Stock</span><span className="font-semibold text-amber-600">{data?.low ?? 0} products</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Out of Stock</span><span className="font-semibold text-rose-600">{data?.out ?? 0} products</span></div>
          <Link to="/erp/inventory" className="inline-flex text-xs text-indigo-600 hover:underline">View inventory →</Link>
        </>)}
      </CardContent>
    </Card>
  );
}

function LowStockList({ brandIds, enabled }: { brandIds: string[]; enabled: boolean }) {
  const { data, isLoading } = useQuery({
    queryKey: ["dash-lowstock", brandIds.join(",")],
    enabled, staleTime: 60_000,
    queryFn: async () => {
      // Live source of truth: query products directly (low_stock_alerts can be stale).
      const { data: rows } = await applyBrandScope(
        supabase.from("products").select("id, title, stock, available_stock, low_stock_threshold, reorder_point"),
        brandIds,
      ).eq("is_active", true).limit(500);
      const list = ((rows ?? []) as any[])
        .map((p) => {
          const stock = Number(p.available_stock ?? p.stock ?? 0);
          const threshold = Number(p.low_stock_threshold ?? p.reorder_point ?? 0);
          return { id: p.id, title: p.title, stock, threshold };
        })
        .filter((p) => p.stock === 0 || (p.threshold > 0 && p.stock <= p.threshold))
        .sort((a, b) => a.stock - b.stock)
        .slice(0, 5);
      return list;
    },
  });
  return (
    <Card>
      <CardHeader><CardTitle className="text-base font-semibold">Low Stock Products</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-32" /> : (data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No low stock alerts 🎉</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-muted-foreground border-b"><th className="text-left py-2">Product</th><th className="text-right">Stock</th><th className="text-right">Threshold</th><th></th></tr></thead>
            <tbody>
              {(data as any[]).map((r, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-2 truncate max-w-[200px]">{r.title ?? "Untitled"}</td>
                  <td className="text-right font-semibold text-rose-600 tabular-nums">{r.stock}</td>
                  <td className="text-right text-muted-foreground tabular-nums">{r.threshold}</td>
                  <td className="text-right"><Link to="/erp/inventory" className="text-xs text-indigo-600 hover:underline">Reorder</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- MARKETING ----------
function MarketingCard({ brandIds, enabled, range }: { brandIds: string[]; enabled: boolean; range: ReturnType<typeof getRange> }) {
  const { data, isLoading } = useQuery({
    queryKey: ["dash-mkt", brandIds.join(","), range.from.toISOString(), range.to.toISOString()],
    enabled, staleTime: 60_000,
    queryFn: async () => {
      const fromDate = range.from.toISOString().slice(0, 10);
      const toDate = range.to.toISOString().slice(0, 10);
      const { data: rows } = await applyBrandScope(
        supabase.from("mkt_insights_daily").select("date, spend, meta_purchases, meta_purchase_value"), brandIds
      ).gte("date", fromDate).lte("date", toDate);
      // Live USD→BDT rate (latest per brand scope). No hardcoded fallback —
      // BDT-side numbers stay 0 until a real rate is entered in Finance → FX.
      let fx = 0;
      const fxQ = brandIds.length
        ? await supabase.from("erp_fx_rates").select("rate, rate_date").in("brand_id", brandIds)
            .eq("from_ccy", "USD").eq("to_ccy", "BDT").order("rate_date", { ascending: false }).limit(1)
        : await supabase.from("erp_fx_rates").select("rate, rate_date")
            .eq("from_ccy", "USD").eq("to_ccy", "BDT").order("rate_date", { ascending: false }).limit(1);
      if (fxQ.data?.[0]?.rate) fx = Number(fxQ.data[0].rate) || 0;
      let spendTotal = 0, purchTotal = 0, valTotal = 0;
      const series = new Map<string, { date: string; spend: number; revenue: number }>();
      const days = Math.min(range.days, 60);
      for (let i = 0; i < days; i++) {
        const dt = new Date(range.from); dt.setDate(dt.getDate() + i);
        const d = dt.toISOString().slice(0, 10);
        series.set(d, { date: d, spend: 0, revenue: 0 });
      }
      for (const r of (rows ?? []) as any[]) {
        spendTotal += Number(r.spend ?? 0);
        purchTotal += Number(r.meta_purchases ?? 0);
        valTotal += Number(r.meta_purchase_value ?? 0);
        const s = series.get(r.date); if (s) { s.spend += Number(r.spend ?? 0); s.revenue += Number(r.meta_purchase_value ?? 0); }
      }
      // ROAS is unitless — both spend & value are in account currency (USD). No FX needed.
      const roas = spendTotal > 0 ? valTotal / spendTotal : null;
      // CPO in BDT if FX is set, else raw USD per order.
      const cpo = purchTotal > 0 ? (spendTotal * (fx > 0 ? fx : 1)) / purchTotal : null;
      const cpoIsBdt = fx > 0;
      const spendBdt = fx > 0 ? spendTotal * fx : null;
      return { spendToday: spendTotal, spendTodayBdt: spendBdt, roas, purchToday: purchTotal, cpo, cpoIsBdt, fx, series: Array.from(series.values()) };
    },
  });
  return (
    <Card>
      <CardHeader><CardTitle className="text-lg font-semibold flex items-center gap-2"><Megaphone className="size-5 text-pink-600" /> Marketing Snapshot</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-32" /> : (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <KV
              label="Spend (Range)"
              v={
                data?.spendTodayBdt != null
                  ? `${BDT(data.spendTodayBdt)} ($${(data?.spendToday ?? 0).toFixed(2)})`
                  : `$${(data?.spendToday ?? 0).toFixed(2)}`
              }
            />
            <KV
              label="ROAS"
              v={data?.roas != null && Number.isFinite(data.roas) ? `${data.roas.toFixed(2)}x` : "—"}
              tone="emerald"
            />
            <KV label="Meta Orders" v={String(data?.purchToday ?? 0)} />
            <KV
              label="CPO"
              v={
                data?.cpo != null && Number.isFinite(data.cpo)
                  ? (data.cpoIsBdt ? BDT(data.cpo) : `$${data.cpo.toFixed(2)}`)
                  : "—"
              }
            />
            <div className="md:col-span-1 h-20">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data?.series ?? []}>
                  <Area type="monotone" dataKey="spend" stroke="#ec4899" fill="#ec4899" fillOpacity={0.2} />
                  <Area type="monotone" dataKey="revenue" stroke="#10b981" fill="#10b981" fillOpacity={0.15} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
function KV({ label, v, tone }: { label: string; v: string; tone?: string }) {
  return <div><div className="text-xs text-muted-foreground">{label}</div><div className={cn("text-base font-semibold tabular-nums", tone === "emerald" && "text-emerald-600")}>{v}</div></div>;
}

// ---------- TOP PRODUCTS & CUSTOMERS ----------
function TopProducts({ brandIds, enabled, range }: { brandIds: string[]; enabled: boolean; range: ReturnType<typeof getRange> }) {
  const { data, isLoading } = useQuery({
    queryKey: ["dash-top-prod", brandIds.join(","), range.from.toISOString()],
    enabled, staleTime: 60_000,
    queryFn: async () => {
      const { data: rows } = await applyBrandScope(
        supabase.from("order_items").select("name, quantity, line_total, orders!inner(brand_id, status, created_at)"),
        brandIds, "orders.brand_id" as any
      ).not("orders.status","in","(cancelled,returned)")
       .gte("orders.created_at", range.from.toISOString())
       .lte("orders.created_at", range.to.toISOString());
      const agg = new Map<string, { name: string; units: number; revenue: number }>();
      for (const r of (rows ?? []) as any[]) {
        const k = r.name as string;
        const cur = agg.get(k) ?? { name: k, units: 0, revenue: 0 };
        cur.units += Number(r.quantity ?? 0);
        cur.revenue += Number(r.line_total ?? 0);
        agg.set(k, cur);
      }
      return Array.from(agg.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
    },
  });
  return (
    <Card>
      <CardHeader><CardTitle className="text-base font-semibold flex items-center gap-2"><Sparkles className="size-5 text-amber-500" /> Top Products</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-32" /> : (data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No sales yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-muted-foreground border-b"><th className="text-left py-2 w-6">#</th><th className="text-left">Product</th><th className="text-right">Units</th><th className="text-right">Revenue</th></tr></thead>
            <tbody>
              {data!.map((r, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-2 text-muted-foreground">{i+1}</td>
                  <td className="truncate max-w-[200px]">{r.name}</td>
                  <td className="text-right tabular-nums">{r.units}</td>
                  <td className="text-right font-semibold tabular-nums">{BDT(r.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

function TopCustomers({ brandIds, enabled, range }: { brandIds: string[]; enabled: boolean; range: ReturnType<typeof getRange> }) {
  const { data, isLoading } = useQuery({
    queryKey: ["dash-top-cust", brandIds.join(","), range.from.toISOString()],
    enabled, staleTime: 60_000,
    queryFn: async () => {
      const { data: rows } = await applyBrandScope(
        supabase.from("orders").select("shipping_name, shipping_phone, total"), brandIds
      ).not("status","in","(cancelled,returned)")
       .gte("created_at", range.from.toISOString())
       .lte("created_at", range.to.toISOString());
      const agg = new Map<string, { name: string; orders: number; value: number }>();
      for (const r of (rows ?? []) as any[]) {
        const k = (r.shipping_phone as string) || (r.shipping_name as string) || "Unknown";
        const cur = agg.get(k) ?? { name: (r.shipping_name as string) || k, orders: 0, value: 0 };
        cur.orders++; cur.value += Number(r.total ?? 0);
        agg.set(k, cur);
      }
      return Array.from(agg.values()).sort((a, b) => b.value - a.value).slice(0, 5);
    },
  });
  return (
    <Card>
      <CardHeader><CardTitle className="text-base font-semibold flex items-center gap-2"><Users className="size-5 text-violet-600" /> Top Customers</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-32" /> : (data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No customers yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-muted-foreground border-b"><th className="text-left py-2 w-6">#</th><th className="text-left">Customer</th><th className="text-right">Orders</th><th className="text-right">Value</th></tr></thead>
            <tbody>
              {data!.map((r, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-2 text-muted-foreground">{i+1}</td>
                  <td className="truncate max-w-[200px]">{r.name}</td>
                  <td className="text-right tabular-nums">{r.orders}</td>
                  <td className="text-right font-semibold tabular-nums">{BDT(r.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- NEEDS ATTENTION ----------
function NeedsAttention({ brandIds, enabled }: { brandIds: string[]; enabled: boolean }) {
  const { data, isLoading } = useQuery({
    queryKey: ["dash-attention", brandIds.join(",")],
    enabled, staleTime: 60_000,
    queryFn: async () => {
      const threeDaysAgo = new Date(Date.now() - 3*86400e3).toISOString();
      const fourteenDaysAgo = new Date(Date.now() - 14*86400e3).toISOString();
      const twoDaysAgo = new Date(Date.now() - 2*86400e3).toISOString();
      const [stuck, overdueCod, oldQc, lowStock, importLate] = await Promise.all([
        applyBrandScope(supabase.from("orders").select("id", { count: "exact", head: true }), brandIds)
          .in("status", ["new" as any, "processing" as any]).lt("created_at", threeDaysAgo),
        applyBrandScope(supabase.from("orders").select("total, partial_amount"), brandIds)
          .eq("payment_method", "cod").neq("payment_status", "paid").neq("status", "cancelled")
          .lt("created_at", fourteenDaysAgo),
        applyBrandScope(supabase.from("erp_return_cases").select("id", { count: "exact", head: true }), brandIds)
          .eq("return_status", "pending_qc").lt("created_at", twoDaysAgo),
        applyBrandScope(supabase.from("low_stock_alerts").select("id", { count: "exact", head: true }), brandIds)
          .eq("is_resolved", false),
        applyBrandScope(supabase.from("imp_purchase_orders").select("id", { count: "exact", head: true }), brandIds)
          .not("status", "in", "(received,cancelled)")
          .lt("order_date", new Date(Date.now() - 45*86400e3).toISOString().slice(0,10)),
      ]);
      const codAmount = (overdueCod.data ?? []).reduce((s: number, r: any) =>
        s + Math.max(0, Number(r.total ?? 0) - Number(r.partial_amount ?? 0)), 0);
      const items: Array<{ level: "red"|"amber"|"green"; text: string; count?: string; to: string }> = [];
      if ((stuck.count ?? 0) > 0) items.push({ level: "red", text: `Orders stuck in Processing > 3 days`, count: String(stuck.count), to: "/erp/orders/web" });
      if (codAmount > 0) items.push({ level: "red", text: `COD overdue > 14 days`, count: BDT(codAmount), to: "/erp/reconciliation" });
      if ((oldQc.count ?? 0) > 0) items.push({ level: "amber", text: `Returns pending QC > 2 days`, count: String(oldQc.count), to: "/erp/returns" });
      if ((lowStock.count ?? 0) > 0) items.push({ level: "amber", text: `Products below reorder point`, count: String(lowStock.count), to: "/erp/inventory" });
      if ((importLate.count ?? 0) > 0) items.push({ level: "amber", text: `Import PO overdue`, count: String(importLate.count), to: "/erp/imports" });
      return items;
    },
  });

  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try { return new Set(JSON.parse(localStorage.getItem("dash.dismissed") ?? "[]")); }
    catch { return new Set(); }
  });
  const dismiss = (k: string) => {
    const next = new Set(dismissed); next.add(k);
    setDismissed(next);
    localStorage.setItem("dash.dismissed", JSON.stringify(Array.from(next)));
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base font-semibold flex items-center gap-2"><AlertTriangle className="size-5 text-amber-600" /> Needs Attention</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-24" /> : (
          (data ?? []).filter(a => !dismissed.has(a.text)).length === 0 ? (
            <p className="text-sm text-muted-foreground">All clear ✨</p>
          ) : (
            <ul className="space-y-2">
              {(data ?? []).filter(a => !dismissed.has(a.text)).map((a, i) => (
                <li key={i} className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={cn("size-2 rounded-full shrink-0",
                      a.level === "red" ? "bg-rose-500" : a.level === "amber" ? "bg-amber-500" : "bg-emerald-500")} />
                    <span className="text-sm truncate">{a.text}</span>
                    {a.count && <Badge variant="secondary" className="ml-1 tabular-nums">{a.count}</Badge>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Link to={a.to as any} className="text-xs text-indigo-600 hover:underline">View →</Link>
                    <button onClick={() => dismiss(a.text)} className="text-xs text-muted-foreground hover:text-foreground px-1">✕</button>
                  </div>
                </li>
              ))}
            </ul>
          )
        )}
      </CardContent>
    </Card>
  );
}

// ---------- LIVE ORDERS FEED ----------
type LiveOrder = { id: string; created_at: string; total: number; status: string; shipping_name: string | null };

function LiveOrdersFeed({ brandIds, enabled }: { brandIds: string[]; enabled: boolean }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<LiveOrder[]>({
    queryKey: ["dash-live", brandIds.join(",")],
    enabled, staleTime: 30_000,
    queryFn: async () => {
      const { data: rows } = await applyBrandScope(
        supabase.from("orders").select("id, created_at, total, status, shipping_name"), brandIds
      ).order("created_at", { ascending: false }).limit(10);
      return (rows ?? []) as LiveOrder[];
    },
  });

  useEffect(() => {
    if (!enabled) return;
    const ch = supabase.channel("dash-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        qc.invalidateQueries({ queryKey: ["dash-live", brandIds.join(",")] });
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [enabled, brandIds, qc]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm flex items-center gap-2"><Activity className="size-4 text-emerald-600" /> Live Orders</CardTitle>
        <span className="flex items-center gap-1.5 text-xs text-emerald-600">
          <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live
        </span>
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-40" /> : (data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No recent orders.</p>
        ) : (
          <ul className="divide-y">
            {data!.map(o => (
              <li key={o.id} className="flex items-center justify-between py-2.5">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs text-muted-foreground tabular-nums w-16 shrink-0">{timeAgo(new Date(o.created_at))}</span>
                  <span className="text-sm truncate">{o.shipping_name ?? "Guest"}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm font-semibold tabular-nums">{BDT(o.total)}</span>
                  <Badge variant="outline" className="capitalize text-xs">{o.status}</Badge>
                  <Link to="/erp/orders/$orderId" params={{ orderId: o.id }} className="text-xs text-indigo-600 hover:underline">Open</Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- FOOTER ----------
function SystemFooter({ lastSync }: { lastSync: Date }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground border-t pt-4">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <span>✅ DB Connected</span>
        <span>✅ Realtime Active</span>
        <span>Synced {timeAgo(lastSync)}</span>
      </div>
      <span>SynqWithUs ERP · v1.0</span>
    </div>
  );
}

// ---------- TODAY ANALYTICS (3 charts) ----------
const SOURCE_COLORS: Record<string, string> = {
  Facebook: "#1877F2",
  Instagram: "#E1306C",
  Google: "#34A853",
  TikTok: "#000000",
  YouTube: "#FF0000",
  "Landing Page": "#8B5CF6",
  Toyora: "#F09000",
  HobbyShop: "#0EA5E9",
  Referral: "#10B981",
  WhatsApp: "#25D366",
  Messenger: "#0084FF",
  Telegram: "#229ED9",
  Web: "#0EA5E9",
  Manual: "#64748B",
  Incomplete: "#EF4444",
  "Custom Source": "#F59E0B",
  POS: "#9333EA",
  Marketplace: "#A855F7",
  Email: "#22C55E",
  SMS: "#0EA5E9",
  Direct: "hsl(var(--foreground))",
  Other: "#F59E0B",
};
// Lighter gradient stop per source for premium donut look
const SOURCE_COLORS_LIGHT: Record<string, string> = {
  Facebook: "#60A5FA",
  Instagram: "#F472B6",
  Google: "#86EFAC",
  Direct: "#CBD5E1",
  Other: "#FCD34D",
};
const CONFIRMED_STATUSES = new Set([
  "confirmed", "processing", "shipped", "delivered", "complete", "advance_payment", "on_hold",
]);
const SOURCE_FALLBACK_PALETTE = [
  "#6366F1", "#EC4899", "#14B8A6", "#F97316", "#A855F7", "#EAB308", "#06B6D4", "#EF4444",
];
function colorForSource(name: string, index: number): string {
  if (SOURCE_COLORS[name]) return SOURCE_COLORS[name];
  return SOURCE_FALLBACK_PALETTE[index % SOURCE_FALLBACK_PALETTE.length];
}
// AI-style multi-signal classifier. Looks across all available source signals
// (source, source_platform, source_website, utm_source) and returns a stable label.
type SourceSignals = {
  source?: string | null;          // 'website' | 'manual' | 'pos' | ...
  source_platform?: string | null; // 'whatsapp' | 'messenger' | 'facebook' | ...
  source_website?: string | null;  // 'toyora' | 'hobbyshop' | 'main' | host
  utm_source?: string | null;      // 'fb' | 'ig_reels' | 'google_cpc' | ...
  status?: string | null;          // used to surface incomplete carts
};
function matchToken(s: string, tokens: string[]): boolean {
  return tokens.some((t) => s === t || s.includes(t));
}
function classifySourceSignals(sig: SourceSignals): string {
  const status = (sig.status ?? "").toLowerCase().trim();
  if (status === "incomplete" || status === "abandoned" || status === "cart") return "Incomplete";

  const parts = [sig.utm_source, sig.source_platform, sig.source_website, sig.source]
    .map((v) => (v ?? "").toLowerCase().trim())
    .filter(Boolean);
  const joined = parts.join(" | ");

  if (!joined) return "Direct";

  if (matchToken(joined, ["whatsapp", "wa "])) return "WhatsApp";
  if (matchToken(joined, ["messenger", "m.me", "fb-msg"])) return "Messenger";
  if (matchToken(joined, ["telegram", "tg "])) return "Telegram";
  if (matchToken(joined, ["instagram", "ig_", " ig", "ig-"]) || parts.includes("ig")) return "Instagram";
  if (matchToken(joined, ["facebook", "meta", "fb_", "fb-"]) || parts.includes("fb")) return "Facebook";
  if (matchToken(joined, ["tiktok"]) || parts.includes("tt")) return "TikTok";
  if (matchToken(joined, ["youtube", "yt_"]) || parts.includes("yt")) return "YouTube";
  if (matchToken(joined, ["google", "gads", "adwords"])) return "Google";
  if (matchToken(joined, ["landing", "lp/", "lp-", "lp_"])) return "Landing Page";
  if (matchToken(joined, ["referral", "ref_", "ref-"])) return "Referral";
  if (matchToken(joined, ["email", "newsletter", "mailchimp", "klaviyo"])) return "Email";
  if (matchToken(joined, ["sms", "otp"])) return "SMS";
  if (matchToken(joined, ["marketplace", "daraz", "evaly", "ajkerdeal", "pickaboo"])) return "Marketplace";
  if (matchToken(joined, ["toyora"])) return "Toyora";
  if (matchToken(joined, ["hobby"])) return "HobbyShop";
  if (matchToken(joined, ["pos", "in-store", "in store", "retail"])) return "POS";

  // Channel-level fallbacks before bucketing
  // Explicit user selection (source_platform / utm_source) wins over channel bucket.
  const explicit = (sig.source_platform ?? sig.utm_source ?? "").trim();
  if (explicit) {
    return explicit.replace(/[_\-/]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 24);
  }
  if (sig.source && sig.source.toLowerCase() === "manual") return "Manual";
  if (sig.source && sig.source.toLowerCase() === "pos") return "POS";
  if (sig.source_website && !["main", "website", "web", "direct", "(direct)"].includes(sig.source_website.toLowerCase())) {
    // unknown storefront — title-case for distinct label
    return sig.source_website.replace(/[_\-/]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 24);
  }
  if (matchToken(joined, ["main", "website", "web ", "(direct)", "direct"])) return "Web";

  // Final fallback: prettify the most specific signal we have
  const raw = sig.utm_source ?? sig.source_platform ?? sig.source_website ?? sig.source ?? "Other";
  return raw.toString().replace(/[_\-/]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 24);
}
// Back-compat single-string entry point.
function classifySource(raw: string | null | undefined): string {
  return classifySourceSignals({ utm_source: raw ?? null });
}

type RangeT = { from: Date; to: Date; prevFrom: Date; prevTo: Date; days: number };
function TodayAnalytics({ brandIds, enabled, range, rangeLabel }: { brandIds: string[]; enabled: boolean; range: RangeT; rangeLabel: string }) {
  const [open, setOpen] = useState(true);
  const BD_MS = 6 * 60 * 60 * 1000;
  const mode: "hourly" | "daily" = range.days <= 1 ? "hourly" : "daily";
  const fromISO = range.from.toISOString();
  const toISO = range.to.toISOString();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["dash-today-analytics", brandIds.join(","), fromISO, toISO],
    enabled: enabled && open,
    refetchInterval: 60000,
    queryFn: async () => {
      const { data, error } = await applyBrandScope(
        supabase.from("orders").select("created_at, status, utm_source, source, source_platform, source_website"),
        brandIds,
      ).gte("created_at", fromISO).lte("created_at", toISO);
      if (error) throw error;
      return (data ?? []) as Array<{
        created_at: string;
        status: string | null;
        utm_source: string | null;
        source: string | null;
        source_platform: string | null;
        source_website: string | null;
      }>;
    },
  });

  const sourceData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of rows) {
      const k = classifySourceSignals({
        utm_source: r.utm_source,
        source: r.source,
        source_platform: r.source_platform,
        source_website: r.source_website,
        status: r.status,
      });
      counts[k] = (counts[k] ?? 0) + 1;
    }
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [rows]);
  const totalSource = sourceData.reduce((s, d) => s + d.value, 0);

  const currentHour = new Date(Date.now() + BD_MS).getUTCHours();
  const todayBdKey = (() => {
    const d = new Date(Date.now() + BD_MS);
    return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
  })();
  const series = useMemo(() => {
    if (mode === "hourly") {
      const buckets = Array.from({ length: 24 }, (_, h) => ({ key: String(h), created: 0, confirmed: 0 }));
      for (const r of rows) {
        const h = new Date(new Date(r.created_at).getTime() + BD_MS).getUTCHours();
        if (h < 0 || h > 23) continue;
        buckets[h].created += 1;
        if (CONFIRMED_STATUSES.has((r.status ?? "").toLowerCase())) buckets[h].confirmed += 1;
      }
      const peak = buckets.reduce((m, b) => (b.created > m ? b.created : m), 0);
      return buckets.map((b, h) => ({
        ...b,
        label: h === 0 ? "12A" : h < 12 ? `${h}A` : h === 12 ? "12P" : `${h - 12}P`,
        isPeak: peak > 0 && b.created === peak,
        isCurrent: h === currentHour && range.days === 1 && new Date(range.from).toDateString() === new Date().toDateString(),
      }));
    }
    // daily mode — bucket per BD day across range
    const startBd = new Date(range.from.getTime() + BD_MS);
    startBd.setUTCHours(0, 0, 0, 0);
    const endBd = new Date(range.to.getTime() + BD_MS);
    endBd.setUTCHours(0, 0, 0, 0);
    const dayMs = 86400e3;
    const nDays = Math.max(1, Math.round((endBd.getTime() - startBd.getTime()) / dayMs) + 1);
    const buckets = Array.from({ length: nDays }, (_, i) => {
      const d = new Date(startBd.getTime() + i * dayMs);
      const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
      return { key, _date: d, created: 0, confirmed: 0 };
    });
    const idx = new Map(buckets.map((b, i) => [b.key, i]));
    for (const r of rows) {
      const d = new Date(new Date(r.created_at).getTime() + BD_MS);
      const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
      const i = idx.get(key);
      if (i == null) continue;
      buckets[i].created += 1;
      if (CONFIRMED_STATUSES.has((r.status ?? "").toLowerCase())) buckets[i].confirmed += 1;
    }
    const peak = buckets.reduce((m, b) => (b.created > m ? b.created : m), 0);
    const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return buckets.map((b) => ({
      key: b.key,
      created: b.created,
      confirmed: b.confirmed,
      label: `${MONTHS[b._date.getUTCMonth()]} ${b._date.getUTCDate()}`,
      isPeak: peak > 0 && b.created === peak,
      isCurrent: b.key === todayBdKey,
    }));
  }, [rows, mode, range.from, range.to, currentHour, todayBdKey]);
  const xInterval = mode === "hourly" ? 2 : Math.max(0, Math.floor(series.length / 10));

  return (
    <section className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
      <header className="px-5 py-3.5 flex items-center justify-between border-b border-border/60">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="size-7 grid place-items-center rounded-md bg-muted border border-border/60 shrink-0">
            <Activity className="size-3.5 text-muted-foreground" />
          </div>
          <h2
            className="text-[12px] font-semibold uppercase tracking-[0.16em] text-foreground truncate"
            style={{ fontFamily: "Sora, ui-sans-serif, system-ui, sans-serif" }}
          >
            Order Analytics
          </h2>
          <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-muted text-muted-foreground border border-border/60">
            {rangeLabel}
          </span>
          {!isLoading && (
            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-foreground text-background tabular-nums">
              {rows.length} {rows.length === 1 ? "order" : "orders"}
            </span>
          )}
        </div>
        <Button variant="ghost" size="sm" className="size-8 p-0" onClick={() => setOpen(o => !o)}>
          {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </Button>
      </header>
      {open && (
        <div className="p-5">
          {isLoading ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {[0,1,2].map(i => <Skeleton key={i} className="h-64 w-full" />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Donut */}
              <div className="relative rounded-xl border border-border/60 bg-muted/30 p-5 overflow-hidden">
                <div
                  className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.18em] mb-6"
                  style={{ fontFamily: "Sora, ui-sans-serif, system-ui, sans-serif" }}
                >
                  Order Sources
                </div>
                <div className="relative h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={sourceData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={64}
                        outerRadius={90}
                        paddingAngle={2}
                        cornerRadius={4}
                        stroke="hsl(var(--card))"
                        strokeWidth={2}
                      >
                        {sourceData.map((d, i) => (
                          <Cell key={d.name} fill={colorForSource(d.name, i)} />
                        ))}
                      </Pie>
                      <Tooltip
                        cursor={{ fill: "transparent" }}
                        contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", fontSize: 12, boxShadow: "0 8px 24px -8px rgba(0,0,0,0.15)" }}
                        formatter={(value: number, name: string) => [
                          `${value} (${totalSource ? Math.round((value / totalSource) * 100) : 0}%)`, name,
                        ]}
                      />
                      <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none -mt-6">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-[0.18em] font-semibold">Total</div>
                    <div
                      className="text-3xl font-semibold tabular-nums text-foreground"
                      style={{ fontFamily: "Sora, ui-sans-serif, system-ui, sans-serif", letterSpacing: "-0.02em" }}
                    >
                      {totalSource}
                    </div>
                  </div>
                </div>
              </div>

              {/* Hourly / daily bar */}
              <div className="rounded-xl border border-border/60 bg-muted/30 p-5 lg:col-span-2">
                <div
                  className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.18em] mb-6"
                  style={{ fontFamily: "Sora, ui-sans-serif, system-ui, sans-serif" }}
                >
                  {mode === "hourly" ? "Orders by Hour" : "Orders by Day"}
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="2 4" vertical={false} stroke="var(--border)" />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} interval={xInterval} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} allowDecimals={false} width={28} axisLine={false} tickLine={false} />
                      <Tooltip />
                      <Bar dataKey="created" radius={[3, 3, 0, 0]}>
                        {series.map((b) => (
                          <Cell
                            key={b.key}
                            fill={b.isPeak ? "#6366f1" : b.isCurrent ? "#818cf8" : "#c7d2fe"}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ============================================================================
// Hourly Orders Comparison — Web orders + Confirmed/Manual orders by hour
// with previous-day compare and custom date picker.
// ============================================================================
const BD_TZ_OFFSET_MS = 6 * 60 * 60 * 1000;
function toBdHour(iso: string) {
  return new Date(new Date(iso).getTime() + BD_TZ_OFFSET_MS).getUTCHours();
}
function isoDayBoundsBD(ymd: string): { fromISO: string; toISO: string } {
  const [y, m, d] = ymd.split("-").map(Number);
  // BD midnight = UTC 18:00 previous day
  const fromUTC = Date.UTC(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0) - BD_TZ_OFFSET_MS;
  const toUTC = fromUTC + 86400e3 - 1;
  return { fromISO: new Date(fromUTC).toISOString(), toISO: new Date(toUTC).toISOString() };
}
function ymdLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function prevDayYmd(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  dt.setDate(dt.getDate() - 1);
  return ymdLocal(dt);
}
function humanDate(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  return dt.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

type HourlyRow = { created_at: string; source: string | null; confirmed_at: string | null };
const WEB_SOURCES = new Set(["website", "pixel", "utm"]);
const MANUAL_SOURCES = new Set(["manual", "pos"]);

function useHourlyDay(brandIds: string[], enabled: boolean, ymd: string) {
  const { fromISO, toISO } = useMemo(() => isoDayBoundsBD(ymd), [ymd]);
  return useQuery({
    queryKey: ["dash-hourly-orders", brandIds.join(","), ymd],
    enabled: enabled && brandIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await applyBrandScope(
        supabase
          .from("orders")
          .select("created_at, source, confirmed_at")
          .or(`created_at.gte.${fromISO},confirmed_at.gte.${fromISO}`)
          .lte("created_at", toISO)
          .limit(10000),
        brandIds,
      );
      if (error) throw error;
      return (data ?? []) as HourlyRow[];
    },
  });
}

function bucketize(rows: HourlyRow[], kind: "web" | "confirmed", ymd: string) {
  const { fromISO, toISO } = isoDayBoundsBD(ymd);
  const fromMs = new Date(fromISO).getTime();
  const toMs = new Date(toISO).getTime();
  const buckets = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0 }));
  for (const r of rows) {
    if (kind === "web") {
      const s = (r.source ?? "").toLowerCase();
      if (!WEB_SOURCES.has(s)) continue;
      const t = new Date(r.created_at).getTime();
      if (t < fromMs || t > toMs) continue;
      buckets[toBdHour(r.created_at)].count += 1;
    } else {
      // Confirmed/manual bucket. Manual/POS orders bucket at created_at.
      // Confirmations (any source) bucket at confirmed_at.
      const s = (r.source ?? "").toLowerCase();
      const isManual = MANUAL_SOURCES.has(s);
      if (r.confirmed_at) {
        const t = new Date(r.confirmed_at).getTime();
        if (t >= fromMs && t <= toMs) buckets[toBdHour(r.confirmed_at)].count += 1;
      } else if (isManual) {
        const t = new Date(r.created_at).getTime();
        if (t >= fromMs && t <= toMs) buckets[toBdHour(r.created_at)].count += 1;
      }
    }
  }
  return buckets;
}

function HourlyOrdersComparison({ brandIds, enabled }: { brandIds: string[]; enabled: boolean }) {
  const [open, setOpen] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>(() => ymdLocal(new Date()));
  const prevDate = useMemo(() => prevDayYmd(selectedDate), [selectedDate]);

  const todayQ = useHourlyDay(brandIds, enabled && open, selectedDate);
  const prevQ = useHourlyDay(brandIds, enabled && open, prevDate);

  const isToday = selectedDate === ymdLocal(new Date());
  const currentHour = new Date(Date.now() + BD_TZ_OFFSET_MS).getUTCHours();

  function makeSeries(kind: "web" | "confirmed") {
    const cur = bucketize(todayQ.data ?? [], kind, selectedDate);
    const prev = bucketize(prevQ.data ?? [], kind, prevDate);
    return cur.map((b, h) => ({
      hour: h,
      label: h === 0 ? "12A" : h < 12 ? `${h}A` : h === 12 ? "12P" : `${h - 12}P`,
      current: b.count,
      previous: prev[h].count,
      isCurrent: isToday && h === currentHour,
    }));
  }

  const webSeries = useMemo(() => makeSeries("web"), [todayQ.data, prevQ.data, selectedDate]);
  const confSeries = useMemo(() => makeSeries("confirmed"), [todayQ.data, prevQ.data, selectedDate]);

  const isLoading = todayQ.isLoading || prevQ.isLoading;

  return (
    <section className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
      <header className="px-5 py-4 border-b border-border/60">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="size-9 grid place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 shadow-sm shrink-0">
              <Clock className="size-4 text-white" />
            </div>
            <div className="min-w-0">
              <h2
                className="text-[13px] font-semibold uppercase tracking-[0.14em] text-foreground truncate leading-tight"
                style={{ fontFamily: "Sora, ui-sans-serif, system-ui, sans-serif" }}
              >
                Hourly Orders
              </h2>
              <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                {humanDate(selectedDate)}
                <span className="mx-1.5 text-muted-foreground/60">vs</span>
                {humanDate(prevDate)}
                {isToday && (
                  <span className="ml-2 inline-flex items-center gap-1 text-emerald-600 font-medium">
                    <span className="relative flex size-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full size-1.5 bg-emerald-500" />
                    </span>
                    Live
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="hidden md:flex items-center rounded-lg border border-border/60 bg-background overflow-hidden">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 rounded-none hover:bg-muted"
                onClick={() => setSelectedDate((d) => prevDayYmd(d))}
                aria-label="Previous day"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <label className="relative inline-flex items-center px-2.5 gap-1.5 text-xs font-medium cursor-pointer hover:bg-muted h-8 border-x border-border/60">
                <CalendarDays className="size-3.5 text-muted-foreground" />
                <span className="tabular-nums">{humanDate(selectedDate)}</span>
                <input
                  type="date"
                  value={selectedDate}
                  max={ymdLocal(new Date())}
                  onChange={(e) => setSelectedDate(e.target.value || ymdLocal(new Date()))}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
              </label>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 rounded-none hover:bg-muted disabled:opacity-40"
                disabled={isToday}
                onClick={() => {
                  const [y, m, d] = selectedDate.split("-").map(Number);
                  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
                  dt.setDate(dt.getDate() + 1);
                  const next = ymdLocal(dt);
                  if (next <= ymdLocal(new Date())) setSelectedDate(next);
                }}
                aria-label="Next day"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
            <Button
              variant={isToday ? "default" : "outline"}
              size="sm"
              className="h-8 text-xs"
              onClick={() => setSelectedDate(ymdLocal(new Date()))}
            >
              Today
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs hidden sm:inline-flex"
              onClick={() => setSelectedDate(prevDayYmd(ymdLocal(new Date())))}
            >
              Yesterday
            </Button>
            <Button variant="ghost" size="sm" className="size-8 p-0" onClick={() => setOpen((o) => !o)}>
              {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            </Button>
          </div>
        </div>
      </header>
      {open && (
        <div className="p-5 bg-gradient-to-b from-muted/20 to-transparent">
          {isLoading ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Skeleton className="h-[380px] w-full" />
              <Skeleton className="h-[380px] w-full" />
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <HourlyChartCard
                title="Web Orders"
                subtitle="Website checkout — hourly created"
                icon={ShoppingCart}
                accent="#6366F1"
                accentSoft="#EEF2FF"
                series={webSeries}
                selectedLabel={humanDate(selectedDate)}
                previousLabel={humanDate(prevDate)}
                isToday={isToday}
                currentHour={currentHour}
              />
              <HourlyChartCard
                title="Confirmed / Manual"
                subtitle="Confirmations + manual & POS orders"
                icon={CheckCircle2}
                accent="#10B981"
                accentSoft="#ECFDF5"
                series={confSeries}
                selectedLabel={humanDate(selectedDate)}
                previousLabel={humanDate(prevDate)}
                isToday={isToday}
                currentHour={currentHour}
              />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function HourlyChartCard({
  title,
  subtitle,
  icon: Icon,
  accent,
  accentSoft,
  series,
  selectedLabel,
  previousLabel,
  isToday,
  currentHour,
}: {
  title: string;
  subtitle: string;
  icon: any;
  accent: string;
  accentSoft: string;
  series: Array<{ hour: number; label: string; current: number; previous: number; isCurrent: boolean }>;
  selectedLabel: string;
  previousLabel: string;
  isToday: boolean;
  currentHour: number;
}) {
  const totalCur = series.reduce((s, b) => s + b.current, 0);
  const totalPrev = series.reduce((s, b) => s + b.previous, 0);
  const diff = totalCur - totalPrev;
  const pct = totalPrev > 0 ? Math.round((diff / totalPrev) * 100) : totalCur > 0 ? 100 : 0;
  const up = diff >= 0;
  const peakHour = series.reduce((m, b) => (b.current > m.current ? b : m), series[0] ?? { current: 0, label: "-" });
  const activeHours = series.filter((b) => b.current > 0).length;
  const avgPerActive = activeHours > 0 ? (totalCur / activeHours).toFixed(1) : "0";
  const gradId = `grad-${title.replace(/\s+/g, "")}`;
  const gradPrevId = `gradPrev-${title.replace(/\s+/g, "")}`;

  return (
    <div className="group relative rounded-2xl border border-border/60 bg-card p-5 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      {/* subtle accent glow */}
      <div
        className="absolute -top-16 -right-16 size-40 rounded-full opacity-40 blur-3xl pointer-events-none"
        style={{ background: accentSoft }}
      />
      {/* Header */}
      <div className="relative flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-2.5 min-w-0">
          <div
            className="size-9 grid place-items-center rounded-xl shrink-0"
            style={{ background: accentSoft, color: accent }}
          >
            <Icon className="size-4" />
          </div>
          <div className="min-w-0">
            <div
              className="text-[13px] font-semibold text-foreground leading-tight truncate"
              style={{ fontFamily: "Sora, ui-sans-serif, system-ui, sans-serif" }}
            >
              {title}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{subtitle}</div>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div
            className="text-3xl font-bold tabular-nums text-foreground leading-none"
            style={{ fontFamily: "Sora, ui-sans-serif, system-ui, sans-serif", letterSpacing: "-0.03em" }}
          >
            {totalCur}
          </div>
          <div
            className={cn(
              "text-[11px] font-semibold mt-1.5 inline-flex items-center gap-0.5 tabular-nums px-1.5 py-0.5 rounded-full",
              up ? "text-emerald-700 bg-emerald-50" : "text-rose-700 bg-rose-50",
            )}
          >
            {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
            {up ? "+" : ""}{diff} ({up ? "+" : ""}{pct}%)
          </div>
        </div>
      </div>

      {/* KPI mini-strip */}
      <div className="relative grid grid-cols-3 gap-2 mb-4">
        <div className="rounded-lg bg-muted/50 px-2.5 py-2">
          <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Peak Hour</div>
          <div className="text-sm font-bold tabular-nums text-foreground mt-0.5">
            {peakHour?.label ?? "-"}
            <span className="text-[10px] text-muted-foreground font-medium ml-1">({peakHour?.current ?? 0})</span>
          </div>
        </div>
        <div className="rounded-lg bg-muted/50 px-2.5 py-2">
          <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Avg / Active Hr</div>
          <div className="text-sm font-bold tabular-nums text-foreground mt-0.5">
            {avgPerActive}
          </div>
        </div>
        <div className="rounded-lg bg-muted/50 px-2.5 py-2">
          <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Prev Day</div>
          <div className="text-sm font-bold tabular-nums text-muted-foreground mt-0.5">
            {totalPrev}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="relative h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={accent} stopOpacity={0.4} />
                <stop offset="100%" stopColor={accent} stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id={gradPrevId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#94A3B8" stopOpacity={0.18} />
                <stop offset="100%" stopColor="#94A3B8" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 4" vertical={false} stroke="var(--border)" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} interval={2} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} allowDecimals={false} width={28} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={{ stroke: accent, strokeWidth: 1, strokeDasharray: "3 3" }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const cur = Number(payload.find((p) => p.dataKey === "current")?.value ?? 0);
                const prev = Number(payload.find((p) => p.dataKey === "previous")?.value ?? 0);
                const d = cur - prev;
                const p = prev > 0 ? Math.round((d / prev) * 100) : cur > 0 ? 100 : 0;
                return (
                  <div className="rounded-lg border border-border/60 bg-popover px-3 py-2 text-xs shadow-xl min-w-[140px]">
                    <div className="font-semibold mb-1.5 text-foreground">Hour {label}</div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-1.5">
                        <span className="size-2 rounded-full" style={{ background: accent }} />
                        <span className="text-muted-foreground">{selectedLabel}</span>
                      </span>
                      <span className="font-bold tabular-nums text-foreground">{cur}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 mt-1">
                      <span className="flex items-center gap-1.5">
                        <span className="size-2 rounded-full bg-slate-400" />
                        <span className="text-muted-foreground">{previousLabel}</span>
                      </span>
                      <span className="font-bold tabular-nums text-muted-foreground">{prev}</span>
                    </div>
                    <div className={cn("mt-1.5 pt-1.5 border-t border-border/60 text-[11px] font-semibold flex items-center justify-between", d >= 0 ? "text-emerald-600" : "text-rose-600")}>
                      <span>Δ</span>
                      <span>{d >= 0 ? "+" : ""}{d} ({d >= 0 ? "+" : ""}{p}%)</span>
                    </div>
                  </div>
                );
              }}
            />
            <Area type="monotone" dataKey="previous" stroke="#94A3B8" strokeWidth={1.25} strokeDasharray="4 3" fill={`url(#${gradPrevId})`} name="previous" dot={false} />
            <Area type="monotone" dataKey="current" stroke={accent} strokeWidth={2.25} fill={`url(#${gradId})`} name="current" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff", fill: accent }} />
            {isToday && (
              <ReferenceLine
                x={series[currentHour]?.label}
                stroke={accent}
                strokeDasharray="3 3"
                strokeOpacity={0.5}
                label={{ value: "Now", position: "top", fontSize: 9, fill: accent, fontWeight: 700 }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="relative mt-2 flex items-center justify-center gap-4 text-[10px] font-semibold uppercase tracking-wider">
        <span className="inline-flex items-center gap-1.5 text-foreground">
          <span className="size-2 rounded-full" style={{ background: accent }} />
          {selectedLabel}
        </span>
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <span className="inline-block w-3 h-[2px] border-t-2 border-dashed border-slate-400" />
          {previousLabel}
        </span>
      </div>
    </div>
  );
}
