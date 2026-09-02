import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Activity, Users, ShoppingCart, Package, DollarSign, Eye, Globe,
  Smartphone, Monitor, Tablet, MapPin, Clock, TrendingUp, Zap, Wifi,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useBrand, type Brand } from "@/contexts/brand-context";

export const Route = createFileRoute("/_authenticated/erp/analytics/live")({
  head: () => ({ meta: [{ title: "Live Analytics — ERP" }] }),
  component: LiveAnalyticsPage,
});

// ---------------- Time Range ----------------
type TimeRange = "instant" | "5m" | "15m" | "30m" | "1h";
const RANGE_OPTIONS: { key: TimeRange; label: string; seconds: number; subtitle: string }[] = [
  { key: "instant", label: "Instant", seconds: 60, subtitle: "Last 60 seconds" },
  { key: "5m", label: "5 Min", seconds: 5 * 60, subtitle: "Last 5 minutes" },
  { key: "15m", label: "15 Min", seconds: 15 * 60, subtitle: "Last 15 minutes" },
  { key: "30m", label: "30 Min", seconds: 30 * 60, subtitle: "Last 30 minutes" },
  { key: "1h", label: "1 Hour", seconds: 60 * 60, subtitle: "Last 60 minutes" },
];
function rangeMeta(key: TimeRange) {
  return RANGE_OPTIONS.find((r) => r.key === key) ?? RANGE_OPTIONS[2];
}

function RangeToggle({ value, onChange }: { value: TimeRange; onChange: (v: TimeRange) => void }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-gray-100 p-1">
      {RANGE_OPTIONS.map((r) => {
        const active = r.key === value;
        return (
          <button
            key={r.key}
            type="button"
            onClick={() => onChange(r.key)}
            className={cn(
              "px-3 py-1 text-xs font-medium rounded-full transition-colors",
              active ? "bg-indigo-600 text-white shadow-sm" : "text-gray-600 hover:text-gray-900",
            )}
          >
            {r.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------- Types ----------------
type ActiveSession = {
  session_id: string;
  path: string | null;
  referrer: string | null;
  country: string | null;
  user_agent: string | null;
  first_seen_at: string;
  last_seen_at: string;
  brand_id: string | null;
};

type AnalyticsEvent = {
  id: string;
  event_name: string;
  product_name: string | null;
  product_id: string | null;
  order_id: string | null;
  value: number | null;
  currency: string | null;
  utm_source: string | null;
  referrer: string | null;
  path: string | null;
  device_type: string | null;
  created_at: string;
};

type OrderRow = {
  id: string;
  total: number | null;
  shipping_city: string | null;
  shipping_district: string | null;
  payment_method: string | null;
  status: string | null;
  created_at: string;
  brand_id: string | null;
};

// ---------------- Helpers ----------------
const BDT = new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 });
const num = (n: number) => new Intl.NumberFormat("en-US").format(n);

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function timeOnSite(firstIso: string) {
  const s = Math.floor((Date.now() - new Date(firstIso).getTime()) / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m === 0) return `${r}s`;
  return `${m}m ${r}s`;
}

function deviceFromUA(ua: string | null): "mobile" | "tablet" | "desktop" {
  if (!ua) return "desktop";
  const u = ua.toLowerCase();
  if (/ipad|tablet/.test(u)) return "tablet";
  if (/mobi|iphone|android/.test(u)) return "mobile";
  return "desktop";
}

function DeviceIcon({ type }: { type: "mobile" | "tablet" | "desktop" }) {
  if (type === "mobile") return <Smartphone className="h-3.5 w-3.5" />;
  if (type === "tablet") return <Tablet className="h-3.5 w-3.5" />;
  return <Monitor className="h-3.5 w-3.5" />;
}

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

function pathLabel(path: string | null): string {
  if (!path || path === "/") return "Home";
  if (path.startsWith("/product/")) return "Product page";
  if (path.startsWith("/category/")) return "Category";
  if (path.startsWith("/checkout")) return "Checkout";
  if (path.startsWith("/cart")) return "Cart";
  return path;
}

function eventIcon(name: string) {
  switch (name) {
    case "purchase": return "📦";
    case "begin_checkout": return "🏁";
    case "add_to_cart": return "🛒";
    case "view_item": return "👁️";
    case "page_view": return "📄";
    default: return "•";
  }
}

function eventToneClasses(name: string) {
  switch (name) {
    case "purchase": return "border-l-emerald-500 bg-emerald-50/40";
    case "begin_checkout": return "border-l-blue-500 bg-blue-50/40";
    case "add_to_cart": return "border-l-amber-500 bg-amber-50/40";
    default: return "border-l-slate-300 bg-card";
  }
}

function eventLabel(e: AnalyticsEvent): string {
  const loc = "Someone";
  const prod = e.product_name ? ` ${e.product_name}` : "";
  switch (e.event_name) {
    case "purchase": return `${loc} placed an order${e.value ? ` — ${BDT.format(e.value)}` : ""}`;
    case "begin_checkout": return `${loc} started checkout`;
    case "add_to_cart": return `${loc} added${prod} to cart`;
    case "view_item": return `${loc} viewed${prod}`;
    case "page_view": return `${loc} visited ${pathLabel(e.path)}`;
    default: return `${loc} — ${e.event_name}`;
  }
}

// Tick every second to re-render time-ago labels
function useTicker(ms: number = 5000) {
  const [, setT] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setT((x) => x + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}

// ---------------- Main Page ----------------
function LiveAnalyticsPage() {
  const { brandIds, isAllBrands, activeBrand, brands } = useBrand();
  const brandLabel = isAllBrands ? "All Brands" : (activeBrand?.name ?? "—");
  const [range, setRange] = useState<TimeRange>("15m");

  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/20 via-background to-background">
      <div className="px-4 lg:px-6 py-5 space-y-5 max-w-[1600px] mx-auto">
        <Header brandLabel={brandLabel} range={range} onRangeChange={setRange} />
        <PulseBar brandIds={brandIds} range={range} brands={brands} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ActiveSessionsPanel brandIds={brandIds} brands={brands} />
          <EventStreamPanel brandIds={brandIds} range={range} />
        </div>
        <TodaysChartsGrid brandIds={brandIds} />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2"><OrderFeed brandIds={brandIds} /></div>
          <GeoPanel brandIds={brandIds} />
        </div>
      </div>
    </div>
  );
}

function Header({ brandLabel, range, onRangeChange }: { brandLabel: string; range: TimeRange; onRangeChange: (v: TimeRange) => void }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          <h1 className="text-2xl font-bold tracking-tight">Live Analytics</h1>
          <Badge variant="outline" className="ml-1 text-[10px] uppercase tracking-wider">Realtime</Badge>
          <div className="ml-2"><RangeToggle value={range} onChange={onRangeChange} /></div>
        </div>
        <p className="text-sm text-muted-foreground mt-0.5">
          {brandLabel} · {now.toLocaleTimeString()}
        </p>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Wifi className="h-4 w-4 text-emerald-500" /> Streaming live data
      </div>
    </div>
  );
}

// ---------------- Pulse Bar ----------------
function PulseBar({ brandIds, range, brands }: { brandIds: string[]; range: TimeRange; brands: Brand[] }) {
  const meta = rangeMeta(range);
  const windowMs = meta.seconds * 1000;
  // Active visitors (selected window) with per-brand breakdown
  const { data: visitorsData = { total: 0, byBrand: {} as Record<string, number>, unknown: 0 } } = useQuery({
    queryKey: ["live-visitors", range, brandIds.join(",")],
    queryFn: async () => {
      const since = new Date(Date.now() - windowMs).toISOString();
      const { data } = await supabase
        .from("active_sessions")
        .select("session_id, brand_id")
        .gte("last_seen_at", since)
        .limit(5000);
      const rows = (data ?? []) as { session_id: string; brand_id: string | null }[];
      const filtered = brandIds.length > 0
        ? rows.filter((r) => r.brand_id && brandIds.includes(r.brand_id))
        : rows;
      const byBrand: Record<string, number> = {};
      let unknown = 0;
      for (const r of filtered) {
        if (r.brand_id) byBrand[r.brand_id] = (byBrand[r.brand_id] ?? 0) + 1;
        else unknown += 1;
      }
      return { total: filtered.length, byBrand, unknown };
    },
    refetchInterval: 5000,
  });

  // Add to carts (selected window)
  const { data: atcCount = 0 } = useQuery({
    queryKey: ["live-atc", range, brandIds],
    queryFn: async () => {
      const since = new Date(Date.now() - windowMs).toISOString();
      let q = supabase
        .from("analytics_events")
        .select("id", { count: "exact", head: true })
        .eq("event_name", "add_to_cart")
        .gte("created_at", since);
      if (brandIds.length > 0) q = q.in("brand_id", brandIds);
      const { count } = await q;
      return count ?? 0;
    },
    refetchInterval: 5000,
  });

  // Page views (selected window)
  const { data: pvWindow = 0 } = useQuery({
    queryKey: ["live-pv-window", range, brandIds],
    queryFn: async () => {
      const since = new Date(Date.now() - windowMs).toISOString();
      let q = supabase
        .from("analytics_events")
        .select("id", { count: "exact", head: true })
        .eq("event_name", "page_view")
        .gte("created_at", since);
      if (brandIds.length > 0) q = q.in("brand_id", brandIds);
      const { count } = await q;
      return count ?? 0;
    },
    refetchInterval: 5000,
  });

  // Orders today + revenue
  const { data: ordersToday = { count: 0, revenue: 0 } } = useQuery({
    queryKey: ["live-orders-today", brandIds],
    enabled: brandIds.length > 0,
    queryFn: async () => {
      const start = startOfDayISO();
      let q = supabase.from("orders").select("total, status").gte("created_at", start);
      if (brandIds.length > 0) q = q.in("brand_id", brandIds);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as { total: number | null; status: string | null }[];
      const valid = rows.filter((r) => r.status !== "cancelled");
      return { count: valid.length, revenue: valid.reduce((s, r) => s + (Number(r.total) || 0), 0) };
    },
    refetchInterval: 5000,
  });

  const brandBreakdown = Object.entries(visitorsData.byBrand)
    .map(([id, n]) => ({ id, name: brands.find((b) => b.id === id)?.name ?? "—", n }))
    .sort((a, b) => b.n - a.n);
  if (visitorsData.unknown > 0) brandBreakdown.push({ id: "unknown", name: "Other", n: visitorsData.unknown });

  const cards = [
    { label: `Live Visitors (${meta.label})`, value: num(visitorsData.total), icon: Users, accent: "emerald", live: true, breakdown: brandBreakdown },
    { label: `Add to Cart (${meta.label})`, value: num(atcCount), icon: ShoppingCart, accent: "amber" },
    { label: "Orders Today", value: num(ordersToday.count), icon: Package, accent: "blue" },
    { label: "Revenue Today", value: BDT.format(ordersToday.revenue), icon: DollarSign, accent: "green" },
    { label: `Page Views (${meta.label})`, value: num(pvWindow), icon: Eye, accent: "purple" },
  ] as const;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map((c) => (
        <PulseCard key={c.label} {...c} />
      ))}
    </div>
  );
}

const ACCENT_MAP: Record<string, { ring: string; bg: string; icon: string; dot: string }> = {
  emerald: { ring: "ring-emerald-200/70", bg: "from-emerald-50/70 via-card to-card", icon: "text-emerald-600 bg-emerald-100/70", dot: "bg-emerald-500" },
  amber:   { ring: "ring-amber-200/70",   bg: "from-amber-50/70 via-card to-card",   icon: "text-amber-600 bg-amber-100/70",   dot: "bg-amber-500" },
  blue:    { ring: "ring-blue-200/70",    bg: "from-blue-50/70 via-card to-card",    icon: "text-blue-600 bg-blue-100/70",    dot: "bg-blue-500" },
  green:   { ring: "ring-green-200/70",   bg: "from-green-50/70 via-card to-card",   icon: "text-green-700 bg-green-100/70",  dot: "bg-green-500" },
  purple:  { ring: "ring-purple-200/70",  bg: "from-purple-50/70 via-card to-card",  icon: "text-purple-600 bg-purple-100/70", dot: "bg-purple-500" },
};

function PulseCard({ label, value, icon: Icon, accent, live, breakdown }: { label: string; value: string; icon: typeof Users; accent: string; live?: boolean; breakdown?: readonly { id: string; name: string; n: number }[] }) {
  const a = ACCENT_MAP[accent] ?? ACCENT_MAP.blue;
  return (
    <div className={cn("relative rounded-xl ring-1 bg-gradient-to-br p-4 shadow-sm hover:shadow-md transition-all", a.ring, a.bg)}>
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
          <div className="text-2xl font-bold tracking-tight mt-1 tabular-nums">{value}</div>
        </div>
        <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", a.icon)}>
          <Icon className="h-4.5 w-4.5" />
        </div>
      </div>
      {breakdown && breakdown.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {breakdown.map((b) => (
            <span
              key={b.id}
              className="inline-flex items-center gap-1 rounded-full bg-background/70 border px-1.5 py-0.5 text-[10px] font-medium"
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", a.dot)} />
              <span className="text-foreground">{b.name}</span>
              <span className="tabular-nums text-muted-foreground">{b.n}</span>
            </span>
          ))}
        </div>
      )}
      {live && (
        <div className="absolute top-2 right-2 flex items-center gap-1">
          <span className={cn("h-1.5 w-1.5 rounded-full animate-pulse", a.dot)} />
        </div>
      )}
    </div>
  );
}

function startOfDayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

// ---------------- Active Sessions Panel ----------------
function ActiveSessionsPanel({ brandIds, brands }: { brandIds: string[]; brands: Brand[] }) {
  useTicker(15000);
  const { data: rows = [], refetch } = useQuery({
    queryKey: ["active-sessions", brandIds.join(",")],
    queryFn: async () => {
      const since = new Date(Date.now() - 2 * 60_000).toISOString();
      let q = supabase
        .from("active_sessions")
        .select("session_id, path, referrer, country, user_agent, first_seen_at, last_seen_at, brand_id")
        .gte("last_seen_at", since)
        .order("last_seen_at", { ascending: false })
        .limit(40);
      if (brandIds.length > 0) q = q.in("brand_id", brandIds);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ActiveSession[];
    },
    refetchInterval: 10000,
  });

  useEffect(() => {
    const ch = supabase
      .channel("rt-active-sessions")
      .on("postgres_changes", { event: "*", schema: "public", table: "active_sessions" }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refetch]);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-emerald-600" /> Active Visitors
          <Badge variant="secondary" className="ml-auto tabular-nums">{rows.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[420px]">
          {rows.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No active visitors right now.
            </div>
          ) : (
            <ul className="divide-y">
              {rows.map((s) => {
                const device = deviceFromUA(s.user_agent);
                const idle = Date.now() - new Date(s.last_seen_at).getTime() > 60_000;
                const src = classifySource(null, s.referrer);
                const brand = s.brand_id ? brands.find((b) => b.id === s.brand_id) : null;
                const brandTone =
                  brand?.slug === "toyora" ? "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200"
                  : brand?.slug === "hobby-shop" ? "bg-sky-100 text-sky-700 border-sky-200"
                  : "bg-muted text-muted-foreground border-border";
                return (
                  <li key={s.session_id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-muted/40 transition-colors">
                    <span className={cn("h-2 w-2 rounded-full shrink-0", idle ? "bg-amber-400" : "bg-emerald-500 animate-pulse")} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-sm font-medium truncate">
                        <span className="text-muted-foreground"><DeviceIcon type={device} /></span>
                        <span className="truncate">{pathLabel(s.path)}</span>
                        <span className={cn("ml-auto text-[10px] font-semibold uppercase tracking-wider rounded-full border px-1.5 py-0.5 shrink-0", brandTone)}>
                          {brand?.name ?? "Other"}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground flex items-center gap-2 flex-wrap mt-0.5">
                        <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{s.country || "Bangladesh"}</span>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1"><Globe className="h-3 w-3" />{src}</span>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1 tabular-nums"><Clock className="h-3 w-3" />{timeOnSite(s.first_seen_at)}</span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// ---------------- Event Stream ----------------
function EventStreamPanel({ brandIds, range }: { brandIds: string[]; range: TimeRange }) {
  useTicker(15000);
  const meta = rangeMeta(range);
  const windowMs = meta.seconds * 1000;
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const initialized = useRef(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const since = new Date(Date.now() - windowMs).toISOString();
      let q = supabase
        .from("analytics_events")
        .select("id, event_name, product_name, product_id, order_id, value, currency, utm_source, referrer, path, device_type, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false });
      if (brandIds.length > 0) q = q.in("brand_id", brandIds);
      const { data } = await q.limit(50);
      if (cancel) return;
      setEvents((data ?? []) as AnalyticsEvent[]);
      initialized.current = true;
    })();
    return () => { cancel = true; };
  }, [range, windowMs, brandIds.join(",")]);

  useEffect(() => {
    const ch = supabase
      .channel("rt-analytics-events")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "analytics_events" }, (payload) => {
        const row = payload.new as AnalyticsEvent;
        const rowBrand = (payload.new as { brand_id?: string | null }).brand_id ?? null;
        if (brandIds.length > 0 && rowBrand && !brandIds.includes(rowBrand)) return;
        setEvents((prev) => [row, ...prev].slice(0, 50));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [brandIds.join(",")]);

  const visibleEvents = useMemo(() => {
    const cutoff = Date.now() - windowMs;
    return events.filter((e) => new Date(e.created_at).getTime() >= cutoff);
  }, [events, windowMs]);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4 text-blue-600" /> Live Event Stream
          <Badge variant="secondary" className="ml-auto tabular-nums">{visibleEvents.length}</Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-0.5">{meta.subtitle}</p>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[420px]">
          {visibleEvents.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">No events yet.</div>
          ) : (
            <ul className="divide-y">
              {visibleEvents.map((e) => (
                <li key={e.id} className={cn("px-4 py-2.5 border-l-2 flex items-center gap-3 hover:bg-muted/40 transition-colors", eventToneClasses(e.event_name))}>
                  <span className="text-base leading-none">{eventIcon(e.event_name)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm truncate">{eventLabel(e)}</div>
                    <div className="text-[11px] text-muted-foreground tabular-nums">{timeAgo(e.created_at)}</div>
                  </div>
                  <Badge variant="outline" className="text-[10px] capitalize">{e.event_name.replace("_", " ")}</Badge>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// ---------------- Today's Charts ----------------
function TodaysChartsGrid({ brandIds }: { brandIds: string[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <HourlyTrafficCard brandIds={brandIds} />
      <FunnelCard brandIds={brandIds} />
      <SourcesCard brandIds={brandIds} />
      <TopProductsCard brandIds={brandIds} />
    </div>
  );
}

function HourlyTrafficCard({ brandIds }: { brandIds: string[] }) {
  const { data = [] } = useQuery({
    queryKey: ["hourly-traffic", brandIds],
    queryFn: async () => {
      const start = startOfDayISO();
      let q = supabase
        .from("analytics_events")
        .select("created_at")
        .eq("event_name", "page_view")
        .gte("created_at", start);
      if (brandIds.length > 0) q = q.in("brand_id", brandIds);
      const { data } = await q.limit(10000);
      const buckets = Array.from({ length: 24 }, (_, h) => ({ hour: h, views: 0, label: `${h}:00` }));
      for (const r of (data ?? []) as { created_at: string }[]) {
        const h = new Date(r.created_at).getHours();
        buckets[h].views += 1;
      }
      return buckets;
    },
    refetchInterval: 30000,
  });
  const currentHour = new Date().getHours();
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4 text-blue-600" /> Hourly Traffic (Today)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="hour" stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} />
              <RTooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
              <Line type="monotone" dataKey="views" stroke="var(--primary)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-1 text-[11px] text-muted-foreground">Current hour: <span className="font-medium text-foreground">{currentHour}:00</span></div>
      </CardContent>
    </Card>
  );
}

function FunnelCard({ brandIds }: { brandIds: string[] }) {
  const { data } = useQuery({
    queryKey: ["funnel-today", brandIds],
    queryFn: async () => {
      const start = startOfDayISO();
      const names = ["page_view", "view_item", "add_to_cart", "begin_checkout", "purchase"] as const;
      const counts: Record<string, number> = {};
      await Promise.all(
        names.map(async (n) => {
          let q = supabase
            .from("analytics_events")
            .select("id", { count: "exact", head: true })
            .eq("event_name", n)
            .gte("created_at", start);
          if (brandIds.length > 0) q = q.in("brand_id", brandIds);
          const { count } = await q;
          counts[n] = count ?? 0;
        }),
      );
      return [
        { step: "Visitors", v: counts.page_view, color: "#6366f1" },
        { step: "Product Views", v: counts.view_item, color: "#3b82f6" },
        { step: "Add to Cart", v: counts.add_to_cart, color: "#f59e0b" },
        { step: "Checkout", v: counts.begin_checkout, color: "#a855f7" },
        { step: "Orders", v: counts.purchase, color: "#10b981" },
      ];
    },
    refetchInterval: 30000,
  });
  const max = Math.max(1, ...(data ?? []).map((d) => d.v));
  const first = (data ?? [])[0]?.v || 0;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2"><Zap className="h-4 w-4 text-amber-500" /> Conversion Funnel</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2.5 py-2">
          {(data ?? []).map((d, idx) => {
            const pct = first > 0 ? (d.v / first) * 100 : 0;
            const w = (d.v / max) * 100;
            return (
              <div key={d.step}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium">{d.step}</span>
                  <span className="text-muted-foreground tabular-nums">{num(d.v)}{idx > 0 && first > 0 && ` · ${pct.toFixed(1)}%`}</span>
                </div>
                <div className="h-2.5 rounded-full bg-muted overflow-hidden">
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

const PIE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#a855f7", "#ef4444", "#6366f1"];

function SourcesCard({ brandIds }: { brandIds: string[] }) {
  const { data = [] } = useQuery({
    queryKey: ["sources-today", brandIds],
    queryFn: async () => {
      const start = startOfDayISO();
      let q = supabase
        .from("analytics_events")
        .select("utm_source, referrer")
        .eq("event_name", "page_view")
        .gte("created_at", start);
      if (brandIds.length > 0) q = q.in("brand_id", brandIds);
      const { data } = await q.limit(10000);
      const map = new Map<string, number>();
      for (const r of (data ?? []) as { utm_source: string | null; referrer: string | null }[]) {
        const s = classifySource(r.utm_source, r.referrer);
        map.set(s, (map.get(s) || 0) + 1);
      }
      return Array.from(map.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 6);
    },
    refetchInterval: 30000,
  });
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2"><Globe className="h-4 w-4 text-purple-600" /> Traffic Sources</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">No data yet today.</div>
        ) : (
          <div className="grid grid-cols-2 gap-2 items-center">
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
                    {data.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <RTooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="space-y-1.5 text-xs">
              {data.map((d, i) => (
                <li key={d.name} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span className="truncate flex-1">{d.name}</span>
                  <span className="tabular-nums text-muted-foreground">{total > 0 ? Math.round((d.value / total) * 100) : 0}%</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TopProductsCard({ brandIds }: { brandIds: string[] }) {
  const [metric, setMetric] = useState<"view_item" | "add_to_cart" | "purchase">("view_item");
  const { data = [] } = useQuery({
    queryKey: ["top-products-today", metric, brandIds],
    queryFn: async () => {
      const start = startOfDayISO();
      let q = supabase
        .from("analytics_events")
        .select("product_name, product_id")
        .eq("event_name", metric)
        .gte("created_at", start)
        .not("product_name", "is", null);
      if (brandIds.length > 0) q = q.in("brand_id", brandIds);
      const { data } = await q.limit(5000);
      const map = new Map<string, number>();
      for (const r of (data ?? []) as { product_name: string | null }[]) {
        if (!r.product_name) continue;
        map.set(r.product_name, (map.get(r.product_name) || 0) + 1);
      }
      return Array.from(map.entries())
        .map(([name, value]) => ({ name: name.length > 22 ? name.slice(0, 22) + "…" : name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5);
    },
    refetchInterval: 30000,
  });
  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm flex items-center gap-2"><Package className="h-4 w-4 text-emerald-600" /> Top Products Today</CardTitle>
        <div className="flex gap-1">
          {(["view_item", "add_to_cart", "purchase"] as const).map((m) => (
            <Button key={m} size="sm" variant={metric === m ? "secondary" : "ghost"} onClick={() => setMetric(m)} className="h-6 px-2 text-[10px] uppercase tracking-wider">
              {m === "view_item" ? "Views" : m === "add_to_cart" ? "Cart" : "Orders"}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">No data yet today.</div>
        ) : (
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} width={130} />
                <RTooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="value" fill="var(--primary)" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------- Order Feed ----------------
function OrderFeed({ brandIds }: { brandIds: string[] }) {
  useTicker(30000);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());
  const seenIds = useRef<Set<string>>(new Set());
  const mounted = useRef(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const start = startOfDayISO();
      let q = supabase
        .from("orders")
        .select("id, total, shipping_city, shipping_district, payment_method, status, created_at, brand_id")
        .gte("created_at", start)
        .order("created_at", { ascending: false })
        .limit(50);
      if (brandIds.length > 0) q = q.in("brand_id", brandIds);
      const { data } = await q;
      if (cancel) return;
      const rows = (data ?? []) as OrderRow[];
      setOrders(rows);
      seenIds.current = new Set(rows.map((r) => r.id));
      mounted.current = true;
    })();
    return () => { cancel = true; };
  }, [brandIds.join(",")]);

  useEffect(() => {
    const ch = supabase
      .channel("rt-orders")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, (payload) => {
        const row = payload.new as OrderRow;
        if (brandIds.length > 0 && row.brand_id && !brandIds.includes(row.brand_id)) return;
        if (seenIds.current.has(row.id)) return;
        seenIds.current.add(row.id);
        setOrders((prev) => [row, ...prev].slice(0, 50));
        setFlashIds((prev) => new Set(prev).add(row.id));
        setTimeout(() => {
          setFlashIds((prev) => { const n = new Set(prev); n.delete(row.id); return n; });
        }, 3000);
        const loc = row.shipping_city || row.shipping_district || "Bangladesh";
        if (mounted.current) {
          toast.success(`🎉 New Order — ${BDT.format(Number(row.total) || 0)}`, {
            description: `From ${loc} · ${row.payment_method || "Order"}`,
            duration: 8000,
          });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [brandIds.join(",")]);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Package className="h-4 w-4 text-emerald-600" /> Today's Order Feed
          <Badge variant="secondary" className="ml-auto tabular-nums">{orders.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[360px]">
          {orders.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">No orders yet today.</div>
          ) : (
            <ul className="divide-y">
              {orders.map((o) => {
                const flash = flashIds.has(o.id);
                const loc = o.shipping_city || o.shipping_district || "—";
                return (
                  <li key={o.id} className={cn("px-4 py-3 flex items-center gap-3 transition-colors", flash ? "bg-emerald-100/60 animate-pulse" : "hover:bg-muted/40")}>
                    <div className="h-9 w-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                      <Package className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold tabular-nums">{BDT.format(Number(o.total) || 0)}</div>
                      <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 flex-wrap mt-0.5">
                        <MapPin className="h-3 w-3" /> {loc}
                        <span>·</span>
                        <Clock className="h-3 w-3" /> {timeAgo(o.created_at)}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {o.payment_method && <Badge variant="outline" className="text-[10px] uppercase">{o.payment_method}</Badge>}
                      {o.status && <Badge className="text-[10px] capitalize" variant="secondary">{o.status.replace("_", " ")}</Badge>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// ---------------- Geo Panel ----------------
function GeoPanel({ brandIds }: { brandIds: string[] }) {
  const { data = [] } = useQuery({
    queryKey: ["geo-today", brandIds],
    enabled: brandIds.length > 0,
    queryFn: async () => {
      const start = startOfDayISO();
      let q = supabase
        .from("orders")
        .select("shipping_city, shipping_district, total, status")
        .gte("created_at", start)
        .limit(2000);
      if (brandIds.length > 0) q = q.in("brand_id", brandIds);
      const { data } = await q;
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
        .map(([city, v]) => ({ city, ...v }))
        .sort((a, b) => b.orders - a.orders)
        .slice(0, 10);
    },
    refetchInterval: 30000,
  });
  const maxOrders = Math.max(1, ...data.map((d) => d.orders));
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPin className="h-4 w-4 text-rose-600" /> Top Locations Today
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[360px]">
          {data.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">No orders yet today.</div>
          ) : (
            <ul className="divide-y">
              {data.map((d, idx) => (
                <li key={d.city} className="px-4 py-2.5">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] font-bold text-muted-foreground w-5 tabular-nums">#{idx + 1}</span>
                      <span className="font-medium truncate">{d.city}</span>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-semibold tabular-nums">{d.orders} {d.orders === 1 ? "order" : "orders"}</div>
                      <div className="text-[10px] text-muted-foreground tabular-nums">{BDT.format(d.revenue)}</div>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-1.5">
                    <div className="h-full bg-gradient-to-r from-rose-400 to-rose-600 rounded-full" style={{ width: `${(d.orders / maxOrders) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}