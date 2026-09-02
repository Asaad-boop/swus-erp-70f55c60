import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { format, subDays, eachDayOfInterval, startOfDay, endOfDay, parseISO } from "date-fns";
import {
  Users, ShoppingCart, DollarSign, TrendingUp, Activity,
  Package, Globe, MapPin, Repeat, Smartphone, Eye, Zap, ChevronRight,
} from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateRangePicker, buildPreset, type MktRangeValue } from "@/components/erp/marketing/date-range-picker";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/brand-context";

const searchSchema = z.object({
  from: fallback(z.string(), "").default(""),
  to: fallback(z.string(), "").default(""),
});

export const Route = createFileRoute("/_authenticated/erp/analytics/")({
  head: () => ({ meta: [{ title: "Analytics — ERP" }] }),
  validateSearch: zodValidator(searchSchema),
  component: HistoricalAnalyticsPage,
});

// -------- helpers --------
const BDT = new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 });
const num = (n: number) => new Intl.NumberFormat("en-US").format(n);
const pct = (n: number, d: number) => (d > 0 ? (n / d) * 100 : 0);

function classifySource(utm: string | null, referrer: string | null): string {
  if (utm) {
    const u = utm.toLowerCase();
    if (u.includes("facebook") || u.includes("fb") || u.includes("meta")) return "Facebook";
    if (u.includes("google")) return "Google";
    if (u.includes("instagram") || u.includes("ig")) return "Instagram";
    return utm.charAt(0).toUpperCase() + utm.slice(1);
  }
  if (!referrer) return "Direct";
  try {
    const host = new URL(referrer).hostname.replace("www.", "");
    if (host.includes("facebook")) return "Facebook";
    if (host.includes("google")) return "Google";
    if (host.includes("instagram")) return "Instagram";
    return host;
  } catch {
    return "Direct";
  }
}

const SOURCE_COLORS: Record<string, string> = {
  Facebook: "#1877f2", Google: "#ea4335", Instagram: "#e1306c", Direct: "#64748b",
};
const COLOR_POOL = ["#3b82f6", "#10b981", "#f59e0b", "#a855f7", "#ef4444", "#6366f1", "#14b8a6", "#f97316"];
function srcColor(name: string, idx: number) {
  return SOURCE_COLORS[name] ?? COLOR_POOL[idx % COLOR_POOL.length];
}

// -------- date range --------
type Range = { from: Date; to: Date };

function useRangeFromSearch(): [Range, (r: Range) => void] {
  const { from, to } = Route.useSearch();
  const navigate = Route.useNavigate();
  const range = useMemo<Range>(() => {
    const t = to ? endOfDay(parseISO(to)) : endOfDay(new Date());
    const f = from ? startOfDay(parseISO(from)) : startOfDay(subDays(t, 29));
    return { from: f, to: t };
  }, [from, to]);
  const setRange = (r: Range) => {
    navigate({
      search: () => ({ from: format(r.from, "yyyy-MM-dd"), to: format(r.to, "yyyy-MM-dd") }),
      replace: true,
    });
  };
  return [range, setRange];
}

// -------- Page --------
function HistoricalAnalyticsPage() {
  const { brandIds, isAllBrands, activeBrand } = useBrand();
  const [range, setRange] = useRangeFromSearch();

  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/20 via-background to-background">
      <div className="px-4 lg:px-6 py-5 space-y-5 max-w-[1600px] mx-auto">
        <Header
          brandLabel={isAllBrands ? "All Brands" : activeBrand?.name ?? "—"}
          range={range}
          setRange={setRange}
        />
        <KpiRow range={range} brandIds={brandIds} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <RevenueTrendCard range={range} brandIds={brandIds} />
          <OrdersTrendCard range={range} brandIds={brandIds} />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2"><SourcesAreaCard range={range} brandIds={brandIds} /></div>
          <DeviceCard range={range} brandIds={brandIds} />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <TopProductsBarCard range={range} brandIds={brandIds} />
          <FunnelCard range={range} brandIds={brandIds} />
        </div>
        <HeatmapCard range={range} brandIds={brandIds} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <TopProductsTable range={range} brandIds={brandIds} />
          <SourcesTable range={range} brandIds={brandIds} />
        </div>
        <GeoTable range={range} brandIds={brandIds} />
      </div>
    </div>
  );
}

// -------- Header --------
function Header({ brandLabel, range, setRange }: { brandLabel: string; range: Range; setRange: (r: Range) => void }) {
  const days = Math.round((range.to.getTime() - range.from.getTime()) / 86_400_000) + 1;
  const mktValue: MktRangeValue = useMemo(() => {
    const from = format(range.from, "yyyy-MM-dd");
    const to = format(range.to, "yyyy-MM-dd");
    // try detect preset
    const presetKeys = ["today","yesterday","7d","14d","30d","90d","this_week","last_week","this_month","last_month","qtd","ytd","last_6m","last_12m","lifetime"];
    for (const k of presetKeys) {
      const p = buildPreset(k);
      if (p.from === from && p.to === to) return p;
    }
    return { presetKey: "custom", label: "Custom", from, to };
  }, [range.from, range.to]);
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {brandLabel} · {format(range.from, "MMM d")} – {format(range.to, "MMM d, yyyy")} <span className="text-muted-foreground/60">({days}d)</span>
        </p>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Button asChild variant="outline" size="sm">
          <Link to="/erp/analytics/live" className="gap-1.5"><Activity className="h-3.5 w-3.5 text-emerald-500" /> Live</Link>
        </Button>
        <DateRangePicker
          value={mktValue}
          onChange={(v) => setRange({ from: startOfDay(parseISO(v.from)), to: endOfDay(parseISO(v.to)) })}
        />
      </div>
    </div>
  );
}

// -------- KPI Row --------
type KpiData = {
  visitors: number; orders: number; revenue: number; aov: number;
  conversion: number; returnRate: number;
};

function useKpis(range: Range, brandIds: string[]) {
  return useQuery<KpiData>({
    queryKey: ["analytics-kpis", range.from.toISOString(), range.to.toISOString(), brandIds],
    queryFn: async () => {
      const fromIso = range.from.toISOString();
      const toIso = range.to.toISOString();

      // Visitors = distinct session_id from analytics_events
      let sq = supabase
        .from("analytics_events")
        .select("session_id")
        .gte("created_at", fromIso).lte("created_at", toIso)
        .not("session_id", "is", null);
      if (brandIds.length > 0) sq = sq.in("brand_id", brandIds);
      const { data: sessRows } = await sq.limit(50000);
      const visitors = new Set((sessRows ?? []).map((r: { session_id: string | null }) => r.session_id)).size;

      // Orders
      let oq = supabase.from("orders")
        .select("id, total, user_id, guest_phone, status")
        .gte("created_at", fromIso).lte("created_at", toIso);
      if (brandIds.length > 0) oq = oq.in("brand_id", brandIds);
      const { data: ordRows } = await oq.limit(20000);
      const valid = ((ordRows ?? []) as { id: string; total: number | null; user_id: string | null; guest_phone: string | null; status: string | null }[])
        .filter((r) => r.status !== "cancelled");
      const orders = valid.length;
      const revenue = valid.reduce((s, r) => s + (Number(r.total) || 0), 0);
      const aov = orders > 0 ? revenue / orders : 0;
      const conversion = pct(orders, visitors);

      // Return rate: customers with >1 orders in window
      const counter = new Map<string, number>();
      for (const r of valid) {
        const key = r.user_id || (r.guest_phone ? `g:${r.guest_phone}` : null);
        if (!key) continue;
        counter.set(key, (counter.get(key) || 0) + 1);
      }
      const totalCustomers = counter.size;
      const returning = Array.from(counter.values()).filter((c) => c > 1).length;
      const returnRate = totalCustomers > 0 ? (returning / totalCustomers) * 100 : 0;

      return { visitors, orders, revenue, aov, conversion, returnRate };
    },
    staleTime: 30_000,
  });
}

function KpiRow({ range, brandIds }: { range: Range; brandIds: string[] }) {
  const { data, isLoading } = useKpis(range, brandIds);
  const k = data ?? { visitors: 0, orders: 0, revenue: 0, aov: 0, conversion: 0, returnRate: 0 };
  const cards: { label: string; value: string; icon: typeof Users; accent: string }[] = [
    { label: "Visitors", value: num(k.visitors), icon: Users, accent: "blue" },
    { label: "Orders", value: num(k.orders), icon: ShoppingCart, accent: "amber" },
    { label: "Revenue", value: BDT.format(k.revenue), icon: DollarSign, accent: "green" },
    { label: "Conv. Rate", value: `${k.conversion.toFixed(2)}%`, icon: Zap, accent: "purple" },
    { label: "Avg Order", value: BDT.format(k.aov), icon: TrendingUp, accent: "indigo" },
    { label: "Return Rate", value: `${k.returnRate.toFixed(1)}%`, icon: Repeat, accent: "rose" },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map((c) => <KpiCard key={c.label} {...c} loading={isLoading} />)}
    </div>
  );
}

const ACCENTS: Record<string, { bg: string; ring: string; icon: string }> = {
  blue:   { bg: "from-blue-50/70 via-card to-card",   ring: "ring-blue-200/70",   icon: "text-blue-600 bg-blue-100/70" },
  amber:  { bg: "from-amber-50/70 via-card to-card",  ring: "ring-amber-200/70",  icon: "text-amber-600 bg-amber-100/70" },
  green:  { bg: "from-green-50/70 via-card to-card",  ring: "ring-green-200/70",  icon: "text-green-700 bg-green-100/70" },
  purple: { bg: "from-purple-50/70 via-card to-card", ring: "ring-purple-200/70", icon: "text-purple-600 bg-purple-100/70" },
  indigo: { bg: "from-indigo-50/70 via-card to-card", ring: "ring-indigo-200/70", icon: "text-indigo-600 bg-indigo-100/70" },
  rose:   { bg: "from-rose-50/70 via-card to-card",   ring: "ring-rose-200/70",   icon: "text-rose-600 bg-rose-100/70" },
};

function KpiCard({ label, value, icon: Icon, accent, loading }: { label: string; value: string; icon: typeof Users; accent: string; loading?: boolean }) {
  const a = ACCENTS[accent] ?? ACCENTS.blue;
  return (
    <div className={cn("rounded-xl ring-1 bg-gradient-to-br p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all", a.ring, a.bg)}>
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
          <div className={cn("text-2xl font-bold tracking-tight mt-1 tabular-nums", loading && "opacity-50")}>{value}</div>
        </div>
        <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", a.icon)}>
          <Icon className="h-4.5 w-4.5" />
        </div>
      </div>
    </div>
  );
}

// -------- Trend Helpers --------
function buildDailyBuckets(range: Range): Map<string, { date: string; revenue: number; orders: number }> {
  const days = eachDayOfInterval({ start: range.from, end: range.to });
  return new Map(days.map((d) => [format(d, "yyyy-MM-dd"), { date: format(d, "MMM d"), revenue: 0, orders: 0 }]));
}

function useDailySeries(range: Range, brandIds: string[]) {
  return useQuery({
    queryKey: ["analytics-daily", range.from.toISOString(), range.to.toISOString(), brandIds],
    queryFn: async () => {
      let q = supabase.from("orders")
        .select("total, status, created_at")
        .gte("created_at", range.from.toISOString())
        .lte("created_at", range.to.toISOString());
      if (brandIds.length > 0) q = q.in("brand_id", brandIds);
      const { data } = await q.limit(20000);
      const buckets = buildDailyBuckets(range);
      for (const r of (data ?? []) as { total: number | null; status: string | null; created_at: string }[]) {
        if (r.status === "cancelled") continue;
        const key = format(new Date(r.created_at), "yyyy-MM-dd");
        const b = buckets.get(key);
        if (b) { b.revenue += Number(r.total) || 0; b.orders += 1; }
      }
      return Array.from(buckets.values());
    },
    staleTime: 30_000,
  });
}

function RevenueTrendCard({ range, brandIds }: { range: Range; brandIds: string[] }) {
  const { data = [] } = useDailySeries(range, brandIds);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2"><DollarSign className="h-4 w-4 text-green-600" /> Revenue Trend</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
              <defs>
                <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`} />
              <RTooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} formatter={(v: number) => [BDT.format(v), "Revenue"]} />
              <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} fill="url(#gRev)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function OrdersTrendCard({ range, brandIds }: { range: Range; brandIds: string[] }) {
  const { data = [] } = useDailySeries(range, brandIds);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2"><ShoppingCart className="h-4 w-4 text-amber-600" /> Orders Trend</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} />
              <RTooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="orders" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// -------- Sources Stacked Area --------
function SourcesAreaCard({ range, brandIds }: { range: Range; brandIds: string[] }) {
  const { data } = useQuery({
    queryKey: ["sources-area", range.from.toISOString(), range.to.toISOString(), brandIds],
    queryFn: async () => {
      let q = supabase
        .from("analytics_events")
        .select("created_at, utm_source, referrer, session_id")
        .eq("event_name", "page_view")
        .gte("created_at", range.from.toISOString())
        .lte("created_at", range.to.toISOString());
      if (brandIds.length > 0) q = q.in("brand_id", brandIds);
      const { data } = await q.limit(50000);
      const dayMap = new Map<string, Map<string, Set<string>>>();
      const sources = new Set<string>();
      for (const r of (data ?? []) as { created_at: string; utm_source: string | null; referrer: string | null; session_id: string | null }[]) {
        const day = format(new Date(r.created_at), "yyyy-MM-dd");
        const src = classifySource(r.utm_source, r.referrer);
        sources.add(src);
        if (!dayMap.has(day)) dayMap.set(day, new Map());
        const m = dayMap.get(day)!;
        if (!m.has(src)) m.set(src, new Set());
        if (r.session_id) m.get(src)!.add(r.session_id);
      }
      const days = eachDayOfInterval({ start: range.from, end: range.to });
      const sortedSources = Array.from(sources);
      const series = days.map((d) => {
        const key = format(d, "yyyy-MM-dd");
        const m = dayMap.get(key);
        const row: Record<string, number | string> = { date: format(d, "MMM d") };
        for (const s of sortedSources) row[s] = m?.get(s)?.size ?? 0;
        return row;
      });
      return { series, sources: sortedSources };
    },
    staleTime: 30_000,
  });
  const series = data?.series ?? [];
  const sources = data?.sources ?? [];
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2"><Globe className="h-4 w-4 text-blue-600" /> Traffic Sources Over Time</CardTitle>
      </CardHeader>
      <CardContent>
        {sources.length === 0 ? (
          <div className="h-[240px] flex items-center justify-center text-sm text-muted-foreground">No traffic data in range.</div>
        ) : (
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} />
                <RTooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {sources.map((s, i) => (
                  <Area key={s} type="monotone" dataKey={s} stackId="1" stroke={srcColor(s, i)} fill={srcColor(s, i)} fillOpacity={0.6} />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// -------- Device --------
function DeviceCard({ range, brandIds }: { range: Range; brandIds: string[] }) {
  const { data = [] } = useQuery({
    queryKey: ["device-mix", range.from.toISOString(), range.to.toISOString(), brandIds],
    queryFn: async () => {
      let q = supabase
        .from("analytics_events")
        .select("device_type, session_id")
        .eq("event_name", "page_view")
        .gte("created_at", range.from.toISOString())
        .lte("created_at", range.to.toISOString());
      if (brandIds.length > 0) q = q.in("brand_id", brandIds);
      const { data } = await q.limit(50000);
      const map = new Map<string, Set<string>>();
      for (const r of (data ?? []) as { device_type: string | null; session_id: string | null }[]) {
        const d = (r.device_type || "unknown").toLowerCase();
        if (!map.has(d)) map.set(d, new Set());
        if (r.session_id) map.get(d)!.add(r.session_id);
      }
      return Array.from(map.entries()).map(([name, set]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value: set.size }));
    },
    staleTime: 30_000,
  });
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2"><Smartphone className="h-4 w-4 text-indigo-600" /> Device Mix</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="h-[240px] flex items-center justify-center text-sm text-muted-foreground">No data.</div>
        ) : (
          <>
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
                    {data.map((_, i) => <Cell key={i} fill={COLOR_POOL[i % COLOR_POOL.length]} />)}
                  </Pie>
                  <RTooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="space-y-1.5 text-xs">
              {data.map((d, i) => (
                <li key={d.name} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: COLOR_POOL[i % COLOR_POOL.length] }} />
                  <span className="truncate flex-1">{d.name}</span>
                  <span className="tabular-nums text-muted-foreground">{total > 0 ? Math.round((d.value / total) * 100) : 0}%</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// -------- Top Products Bar --------
function useTopProducts(range: Range, brandIds: string[]) {
  return useQuery({
    queryKey: ["top-products", range.from.toISOString(), range.to.toISOString(), brandIds],
    queryFn: async () => {
      // Get orders in range first
      let oq = supabase.from("orders").select("id, status")
        .gte("created_at", range.from.toISOString())
        .lte("created_at", range.to.toISOString());
      if (brandIds.length > 0) oq = oq.in("brand_id", brandIds);
      const { data: orders } = await oq.limit(20000);
      const validIds = ((orders ?? []) as { id: string; status: string | null }[])
        .filter((o) => o.status !== "cancelled")
        .map((o) => o.id);
      if (validIds.length === 0) return [] as { product: string; orders: number; qty: number; revenue: number }[];

      // Fetch items in chunks of 200 to avoid URL limit
      const items: { product_id: string | null; name: string | null; quantity: number | null; line_total: number | null; price: number | null }[] = [];
      for (let i = 0; i < validIds.length; i += 200) {
        const chunk = validIds.slice(i, i + 200);
        const { data } = await supabase
          .from("order_items")
          .select("product_id, name, quantity, line_total, price, order_id")
          .in("order_id", chunk);
        items.push(...((data ?? []) as typeof items));
      }
      const map = new Map<string, { product: string; orders: Set<string>; qty: number; revenue: number }>();
      // Re-fetch with order_id to count distinct orders
      const { data: itemsWithOrder } = { data: items as unknown as { product_id: string | null; name: string | null; quantity: number | null; line_total: number | null; price: number | null; order_id?: string }[] };
      void itemsWithOrder;
      for (const it of items as (typeof items[number] & { order_id?: string })[]) {
        const key = it.product_id || `n:${it.name}`;
        if (!key) continue;
        const name = it.name || "—";
        const cur = map.get(key) || { product: name, orders: new Set<string>(), qty: 0, revenue: 0 };
        if (it.order_id) cur.orders.add(it.order_id);
        cur.qty += Number(it.quantity) || 0;
        cur.revenue += Number(it.line_total ?? (it.price ?? 0) * (it.quantity ?? 0)) || 0;
        map.set(key, cur);
      }
      return Array.from(map.values())
        .map((r) => ({ product: r.product, orders: r.orders.size, qty: r.qty, revenue: r.revenue }))
        .sort((a, b) => b.revenue - a.revenue);
    },
    staleTime: 30_000,
  });
}

function TopProductsBarCard({ range, brandIds }: { range: Range; brandIds: string[] }) {
  const { data = [] } = useTopProducts(range, brandIds);
  const top = data.slice(0, 8).map((d) => ({ name: d.product.length > 24 ? d.product.slice(0, 24) + "…" : d.product, revenue: d.revenue }));
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2"><Package className="h-4 w-4 text-emerald-600" /> Top Products by Revenue</CardTitle>
      </CardHeader>
      <CardContent>
        {top.length === 0 ? (
          <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">No orders in range.</div>
        ) : (
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={top} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`} />
                <YAxis type="category" dataKey="name" stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} width={150} />
                <RTooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} formatter={(v: number) => [BDT.format(v), "Revenue"]} />
                <Bar dataKey="revenue" fill="#10b981" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// -------- Funnel (period total) --------
function FunnelCard({ range, brandIds }: { range: Range; brandIds: string[] }) {
  const { data } = useQuery({
    queryKey: ["funnel-period", range.from.toISOString(), range.to.toISOString(), brandIds],
    queryFn: async () => {
      const names = ["page_view", "view_item", "add_to_cart", "begin_checkout", "purchase"] as const;
      const counts: Record<string, number> = {};
      await Promise.all(names.map(async (n) => {
        let q = supabase
          .from("analytics_events")
          .select("id", { count: "exact", head: true })
          .eq("event_name", n)
          .gte("created_at", range.from.toISOString())
          .lte("created_at", range.to.toISOString());
        if (brandIds.length > 0) q = q.in("brand_id", brandIds);
        const { count } = await q;
        counts[n] = count ?? 0;
      }));
      return [
        { step: "Visitors", v: counts.page_view, color: "#6366f1" },
        { step: "Product Views", v: counts.view_item, color: "#3b82f6" },
        { step: "Add to Cart", v: counts.add_to_cart, color: "#f59e0b" },
        { step: "Checkout", v: counts.begin_checkout, color: "#a855f7" },
        { step: "Orders", v: counts.purchase, color: "#10b981" },
      ];
    },
    staleTime: 30_000,
  });
  const rows = data ?? [];
  const max = Math.max(1, ...rows.map((d) => d.v));
  const first = rows[0]?.v || 0;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2"><Zap className="h-4 w-4 text-amber-500" /> Conversion Funnel</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2.5 py-2">
          {rows.map((d, idx) => {
            const p = first > 0 ? (d.v / first) * 100 : 0;
            const w = (d.v / max) * 100;
            return (
              <div key={d.step}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium">{d.step}</span>
                  <span className="text-muted-foreground tabular-nums">{num(d.v)}{idx > 0 && first > 0 && ` · ${p.toFixed(1)}%`}</span>
                </div>
                <div className="h-3 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(2, w)}%`, background: d.color }} />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// -------- Heatmap (day × hour) --------
function HeatmapCard({ range, brandIds }: { range: Range; brandIds: string[] }) {
  // Use last 7 days of range (or whole if shorter)
  const sevenStart = useMemo(() => {
    const diff = (range.to.getTime() - range.from.getTime()) / 86_400_000;
    if (diff <= 7) return range.from;
    return startOfDay(subDays(range.to, 6));
  }, [range.from, range.to]);

  const { data } = useQuery({
    queryKey: ["heatmap", sevenStart.toISOString(), range.to.toISOString(), brandIds],
    queryFn: async () => {
      let q = supabase
        .from("analytics_events")
        .select("created_at")
        .eq("event_name", "page_view")
        .gte("created_at", sevenStart.toISOString())
        .lte("created_at", range.to.toISOString());
      if (brandIds.length > 0) q = q.in("brand_id", brandIds);
      const { data } = await q.limit(50000);
      const days = eachDayOfInterval({ start: sevenStart, end: range.to });
      const grid: Record<string, number[]> = {};
      for (const d of days) grid[format(d, "yyyy-MM-dd")] = Array(24).fill(0);
      let mx = 0;
      for (const r of (data ?? []) as { created_at: string }[]) {
        const dt = new Date(r.created_at);
        const k = format(dt, "yyyy-MM-dd");
        const h = dt.getHours();
        if (grid[k]) {
          grid[k][h] += 1;
          if (grid[k][h] > mx) mx = grid[k][h];
        }
      }
      return { days, grid, mx };
    },
    staleTime: 30_000,
  });

  const days = data?.days ?? [];
  const grid = data?.grid ?? {};
  const mx = data?.mx ?? 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2"><Eye className="h-4 w-4 text-purple-600" /> Hourly Heatmap (Last 7 days of range)</CardTitle>
      </CardHeader>
      <CardContent>
        {days.length === 0 || mx === 0 ? (
          <div className="h-[180px] flex items-center justify-center text-sm text-muted-foreground">No data.</div>
        ) : (
          <ScrollArea>
            <div className="min-w-[760px]">
              <div className="grid" style={{ gridTemplateColumns: "70px repeat(24, 1fr)" }}>
                <div />
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="text-[9px] text-center text-muted-foreground py-1 tabular-nums">{h}</div>
                ))}
                {days.map((d) => {
                  const k = format(d, "yyyy-MM-dd");
                  const row = grid[k] || [];
                  return (
                    <>
                      <div key={`${k}-l`} className="text-[10px] text-muted-foreground pr-2 flex items-center justify-end font-medium">{format(d, "EEE d")}</div>
                      {row.map((v, h) => {
                        const op = mx > 0 ? Math.min(1, v / mx) : 0;
                        return (
                          <div key={`${k}-${h}`} className="aspect-square m-0.5 rounded relative group" style={{ background: op > 0 ? `rgba(99,102,241,${0.15 + op * 0.85})` : "var(--muted)" }}>
                            {v > 0 && (
                              <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-foreground text-background text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-10 tabular-nums">
                                {format(d, "MMM d")} {h}:00 · {v}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </>
                  );
                })}
              </div>
              <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
                <span>Less</span>
                {[0.15, 0.4, 0.6, 0.8, 1].map((op) => (
                  <div key={op} className="h-3 w-5 rounded" style={{ background: `rgba(99,102,241,${op})` }} />
                ))}
                <span>More</span>
              </div>
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

// -------- Tables --------
function TopProductsTable({ range, brandIds }: { range: Range; brandIds: string[] }) {
  const { data = [] } = useTopProducts(range, brandIds);
  const rows = data.slice(0, 10);
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2"><Package className="h-4 w-4 text-emerald-600" /> Top Products <Badge variant="secondary" className="ml-auto">{data.length}</Badge></CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">No orders in range.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.product}>
                  <TableCell className="font-medium truncate max-w-[260px]">{r.product}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.orders}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.qty}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{BDT.format(r.revenue)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function SourcesTable({ range, brandIds }: { range: Range; brandIds: string[] }) {
  const { data = [] } = useQuery({
    queryKey: ["sources-table", range.from.toISOString(), range.to.toISOString(), brandIds],
    queryFn: async () => {
      // Sessions per source
      let pvq = supabase
        .from("analytics_events")
        .select("session_id, utm_source, referrer")
        .eq("event_name", "page_view")
        .gte("created_at", range.from.toISOString())
        .lte("created_at", range.to.toISOString());
      if (brandIds.length > 0) pvq = pvq.in("brand_id", brandIds);
      const { data: pv } = await pvq.limit(50000);
      const sessBySource = new Map<string, Set<string>>();
      const sourceBySession = new Map<string, string>();
      for (const r of (pv ?? []) as { session_id: string | null; utm_source: string | null; referrer: string | null }[]) {
        if (!r.session_id) continue;
        const src = classifySource(r.utm_source, r.referrer);
        if (!sessBySource.has(src)) sessBySource.set(src, new Set());
        sessBySource.get(src)!.add(r.session_id);
        if (!sourceBySession.has(r.session_id)) sourceBySession.set(r.session_id, src);
      }
      // Purchases per source — from analytics_events purchase rows
      let puq = supabase
        .from("analytics_events")
        .select("session_id, value, utm_source, referrer")
        .eq("event_name", "purchase")
        .gte("created_at", range.from.toISOString())
        .lte("created_at", range.to.toISOString());
      if (brandIds.length > 0) puq = puq.in("brand_id", brandIds);
      const { data: purs } = await puq.limit(20000);
      const ordBySource = new Map<string, { orders: number; revenue: number }>();
      for (const r of (purs ?? []) as { session_id: string | null; value: number | null; utm_source: string | null; referrer: string | null }[]) {
        const src = (r.session_id && sourceBySession.get(r.session_id)) || classifySource(r.utm_source, r.referrer);
        const cur = ordBySource.get(src) || { orders: 0, revenue: 0 };
        cur.orders += 1;
        cur.revenue += Number(r.value) || 0;
        ordBySource.set(src, cur);
      }
      const all = new Set([...sessBySource.keys(), ...ordBySource.keys()]);
      return Array.from(all).map((src) => {
        const sessions = sessBySource.get(src)?.size ?? 0;
        const o = ordBySource.get(src) ?? { orders: 0, revenue: 0 };
        return {
          source: src, sessions, orders: o.orders, revenue: o.revenue,
          conv: sessions > 0 ? (o.orders / sessions) * 100 : 0,
        };
      }).sort((a, b) => b.sessions - a.sessions);
    },
    staleTime: 30_000,
  });
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2"><Globe className="h-4 w-4 text-blue-600" /> Traffic Sources <Badge variant="secondary" className="ml-auto">{data.length}</Badge></CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {data.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">No traffic data in range.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Sessions</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Conv.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((r, i) => (
                <TableRow key={r.source}>
                  <TableCell className="font-medium flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: srcColor(r.source, i) }} />
                    {r.source}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{num(r.sessions)}</TableCell>
                  <TableCell className="text-right tabular-nums">{num(r.orders)}</TableCell>
                  <TableCell className="text-right tabular-nums">{BDT.format(r.revenue)}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.conv.toFixed(2)}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function GeoTable({ range, brandIds }: { range: Range; brandIds: string[] }) {
  const { data = [] } = useQuery({
    queryKey: ["geo-table", range.from.toISOString(), range.to.toISOString(), brandIds],
    queryFn: async () => {
      let q = supabase.from("orders")
        .select("shipping_city, shipping_district, total, status")
        .gte("created_at", range.from.toISOString())
        .lte("created_at", range.to.toISOString());
      if (brandIds.length > 0) q = q.in("brand_id", brandIds);
      const { data } = await q.limit(20000);
      const map = new Map<string, { orders: number; revenue: number }>();
      for (const r of (data ?? []) as { shipping_city: string | null; shipping_district: string | null; total: number | null; status: string | null }[]) {
        if (r.status === "cancelled") continue;
        const city = (r.shipping_city || r.shipping_district || "Unknown").trim();
        const cur = map.get(city) || { orders: 0, revenue: 0 };
        cur.orders += 1;
        cur.revenue += Number(r.total) || 0;
        map.set(city, cur);
      }
      return Array.from(map.entries())
        .map(([city, v]) => ({ city, ...v, aov: v.orders > 0 ? v.revenue / v.orders : 0 }))
        .sort((a, b) => b.orders - a.orders);
    },
    staleTime: 30_000,
  });
  const top = data.slice(0, 20);
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2"><MapPin className="h-4 w-4 text-rose-600" /> Geographic Breakdown <Badge variant="secondary" className="ml-auto">{data.length}</Badge></CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {top.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">No orders in range.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>City / District</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">AOV</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {top.map((r, i) => (
                <TableRow key={r.city}>
                  <TableCell className="text-muted-foreground text-xs tabular-nums">#{i + 1}</TableCell>
                  <TableCell className="font-medium">{r.city}</TableCell>
                  <TableCell className="text-right tabular-nums">{num(r.orders)}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{BDT.format(r.revenue)}</TableCell>
                  <TableCell className="text-right tabular-nums">{BDT.format(r.aov)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

void ChevronRight;