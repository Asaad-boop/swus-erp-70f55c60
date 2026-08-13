import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  Package,
  Percent,
  Tag,
  Wallet,
  RefreshCcw,
  CalendarDays,
} from "lucide-react";
import { useBrand } from "@/contexts/brand-context";
import { getMarketingOverview } from "@/lib/erp/marketing/overview.functions";
import { syncSpendCapToWallet } from "@/lib/erp/marketing/meta.functions";
import { getMarketingDashboard } from "@/lib/erp/marketing/dashboard.functions";
import { DateRangePicker, buildPreset, type MktRangeValue } from "@/components/erp/marketing/date-range-picker";
import {
  KpiGrid,
  TrendChart,
  TopCampaigns,
  TopProducts,
  TopAds,
} from "@/components/erp/marketing/dashboard-panels";

const searchSchema = z.object({
  brand: fallback(z.string(), "all").default("all"),
});

export const Route = createFileRoute("/_authenticated/erp/marketing/")({
  head: () => ({ meta: [{ title: "Marketing Overview — ERP" }] }),
  validateSearch: zodValidator(searchSchema),
  component: MarketingOverview,
});

function todayInDhaka(): string {
  // YYYY-MM-DD in Asia/Dhaka regardless of client TZ
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

const bdt = (n: number) =>
  "৳" + Math.round(n).toLocaleString("en-IN");
const usd = (n: number) =>
  "$" + n.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

function MarketingOverview() {
  const { brand } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { brands, isLoading: brandsLoading } = useBrand();

  // Resolve URL brand → brandIds for RPC calls
  const selection = useMemo(() => {
    if (brand === "all") {
      return { key: "all", label: "All Brands", ids: brands.map((b) => b.id) };
    }
    const b = brands.find((x) => x.slug === brand || x.id === brand);
    if (b) return { key: b.slug, label: b.name, ids: [b.id] };
    return { key: "all", label: "All Brands", ids: brands.map((b) => b.id) };
  }, [brand, brands]);

  const today = useMemo(() => todayInDhaka(), []);
  const fetchOverview = useServerFn(getMarketingOverview);
  const syncCap = useServerFn(syncSpendCapToWallet);
  const capMutation = useMutation({
    mutationFn: () =>
      syncCap({
        data: selection.key === "all" ? {} : { brandIds: selection.ids },
      }),
    onSuccess: (r: any) => {
      const u = r?.updated ?? [];
      const s = r?.skipped ?? [];
      if (u.length === 0 && s.length === 0) {
        toast.info("Kono ad account nei");
        return;
      }
      for (const it of u) {
        toast.success(
          `${it.name}: cap = $${it.new_spend_cap_usd.toFixed(2)} (spent $${it.amount_spent_usd.toFixed(2)} + wallet $${it.wallet_usd.toFixed(2)})`,
        );
      }
      for (const it of s) toast.warning(`${it.name}: skipped — ${it.reason}`);
      q.refetch();
    },
    onError: (e: any) => toast.error(e?.message ?? "Spend cap sync fail"),
  });

  const q = useQuery({
    queryKey: ["mkt-overview", selection.ids.sort().join(","), today],
    queryFn: () => fetchOverview({ data: { brandIds: selection.ids, today } }),
    enabled: selection.ids.length > 0,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const setBrand = (nextSlug: string) =>
    navigate({
      search: (prev: { brand: string }) => ({ ...prev, brand: nextSlug }),
      replace: true,
    });

  // ── Dashboard (range-based) ──────────────────────────────────────────
  const [range, setRange] = useState<MktRangeValue>(() => buildPreset("30d"));
  const [grain, setGrain] = useState<"day" | "week" | "month">("day");
  const fetchDashboard = useServerFn(getMarketingDashboard);
  const dash = useQuery({
    queryKey: ["mkt-dashboard", selection.ids.slice().sort().join(","), range.from, range.to, grain],
    queryFn: () =>
      fetchDashboard({ data: { brandIds: selection.ids, from: range.from, to: range.to, grain } }),
    enabled: selection.ids.length > 0,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight">
            Marketing Dashboard
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {range.label} · Dhaka time · Data: canonical RPCs
          </p>
        </div>
        <div className="flex items-center gap-2">
          <BrandTabs
            active={selection.key}
            brands={brands}
            loading={brandsLoading}
            onChange={setBrand}
          />
          <DateRangePicker value={range} onChange={setRange} />
          <Link to="/erp/marketing/daily" search={{ brand: selection.key }}>
            <Button size="sm" variant="outline">
              <CalendarDays className="h-3.5 w-3.5 mr-1.5" />
              Daily
            </Button>
          </Link>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              q.refetch();
              dash.refetch();
            }}
            disabled={q.isFetching || dash.isFetching}
          >
            <RefreshCcw className={`h-3.5 w-3.5 mr-1.5 ${q.isFetching || dash.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => capMutation.mutate()}
            disabled={capMutation.isPending}
            title="Meta Account Spending Limit = amount_spent + USD-on-hand"
          >
            <Wallet className={`h-3.5 w-3.5 mr-1.5 ${capMutation.isPending ? "animate-pulse" : ""}`} />
            Sync spend cap
          </Button>
        </div>
      </div>

      {/* Action strip */}
      <ActionStrip loading={q.isLoading} data={q.data?.actions} />

      {/* Today card */}
      <TodayCard loading={q.isLoading} data={q.data?.today} />

      {/* Range KPIs */}
      <KpiGrid loading={dash.isLoading} k={dash.data?.kpis} />

      <TrendChart loading={dash.isLoading} rows={dash.data?.trend} grain={grain} onGrain={setGrain} />

      <div className="grid gap-4 lg:grid-cols-2">
        <TopCampaigns loading={dash.isLoading} rows={dash.data?.topCampaigns} />
        <TopProducts loading={dash.isLoading} rows={dash.data?.topProducts} />
      </div>
      <TopAds loading={dash.isLoading} rows={dash.data?.topAds} />

      {dash.error && (
        <Card className="border-destructive/40">
          <CardContent className="py-3 text-sm text-destructive">
            Dashboard load fail holo: {(dash.error as Error).message}
          </CardContent>
        </Card>
      )}

      {q.error && (
        <Card className="border-destructive/40">
          <CardContent className="py-3 text-sm text-destructive">
            Overview load fail holo: {(q.error as Error).message}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function BrandTabs({
  active,
  brands,
  loading,
  onChange,
}: {
  active: string;
  brands: { id: string; name: string; slug: string }[];
  loading: boolean;
  onChange: (slug: string) => void;
}) {
  const items = [{ slug: "all", name: "All" }, ...brands.map((b) => ({ slug: b.slug, name: b.name }))];
  return (
    <div className="inline-flex items-center rounded-md border bg-background p-0.5">
      {loading && brands.length === 0 ? (
        <Skeleton className="h-7 w-40" />
      ) : (
        items.map((it) => {
          const on = active === it.slug;
          return (
            <button
              key={it.slug}
              onClick={() => onChange(it.slug)}
              className={`px-3 h-7 text-xs font-medium rounded transition ${
                on
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {it.name}
            </button>
          );
        })
      )}
    </div>
  );
}

type Actions = NonNullable<Awaited<ReturnType<typeof getMarketingOverview>>>["actions"];

function ActionStrip({ loading, data }: { loading: boolean; data?: Actions }) {
  if (loading || !data) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-md" />
        ))}
      </div>
    );
  }
  const syncOk = data.stale_accounts === 0 && data.active_accounts > 0;
  const walletLow = data.wallet_usd < 50;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      <ActionPill
        icon={syncOk ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
        tone={syncOk ? "ok" : "warn"}
        label="Sync"
        value={
          data.active_accounts === 0
            ? "No accounts"
            : syncOk
              ? `${data.active_accounts} healthy`
              : `${data.stale_accounts}/${data.active_accounts} stale`
        }
      />
      <ActionPill
        icon={<Tag className="h-4 w-4" />}
        tone={data.pending_attribution > 0 ? "info" : "muted"}
        label="Pending attribution"
        value={`${data.pending_attribution.toLocaleString()} orders`}
      />
      <ActionPill
        icon={<AlertTriangle className="h-4 w-4" />}
        tone={data.unassigned_campaigns > 0 ? "warn" : "muted"}
        label="Unassigned campaigns"
        value={`${data.unassigned_campaigns.toLocaleString()}`}
      />
      <ActionPill
        icon={<Wallet className="h-4 w-4" />}
        tone={walletLow ? "warn" : "ok"}
        label="Ad wallet"
        value={usd(data.wallet_usd)}
      />
    </div>
  );
}

function ActionPill({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "ok" | "warn" | "info" | "muted";
}) {
  const toneClass =
    tone === "ok"
      ? "text-emerald-600 bg-emerald-50 border-emerald-100 dark:bg-emerald-950/30 dark:border-emerald-900/40"
      : tone === "warn"
        ? "text-amber-600 bg-amber-50 border-amber-100 dark:bg-amber-950/30 dark:border-amber-900/40"
        : tone === "info"
          ? "text-sky-600 bg-sky-50 border-sky-100 dark:bg-sky-950/30 dark:border-sky-900/40"
          : "text-muted-foreground bg-muted/40 border-border";
  return (
    <div className={`flex items-center gap-3 rounded-md border px-3 py-2 ${toneClass}`}>
      <div className="shrink-0">{icon}</div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wide opacity-75 leading-tight">
          {label}
        </div>
        <div className="text-sm font-semibold truncate">{value}</div>
      </div>
    </div>
  );
}

type Today = NonNullable<Awaited<ReturnType<typeof getMarketingOverview>>>["today"];

function TodayCard({ loading, data }: { loading: boolean; data?: Today }) {
  const busy = loading || !data;
  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold">Today</CardTitle>
        <Badge variant="outline" className="text-[10px] font-normal">
          {busy ? "…" : data.date}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Metric
            label="Ad spend"
            icon={<DollarSign className="h-3.5 w-3.5" />}
            value={busy ? undefined : bdt(data.spend_bdt)}
            hint="get_meta_spend_bdt"
          />
          <Metric
            label="Delivered revenue"
            icon={<DollarSign className="h-3.5 w-3.5" />}
            value={busy ? undefined : bdt(data.revenue_bdt)}
            hint="get_campaign_profit"
          />
          <Metric
            label="Real ROAS"
            icon={<Percent className="h-3.5 w-3.5" />}
            value={busy ? undefined : data.roas > 0 ? `${data.roas.toFixed(2)}x` : "—"}
            tone={data && data.roas >= 1 ? "positive" : data && data.roas > 0 ? "negative" : "neutral"}
            hint="revenue ÷ spend"
          />
          <Metric
            label="Orders · CPO"
            icon={<Package className="h-3.5 w-3.5" />}
            value={
              busy
                ? undefined
                : `${data.orders} · ${data.cpo > 0 ? bdt(data.cpo) : "—"}`
            }
            hint="delivered orders"
          />
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({
  label,
  value,
  icon,
  hint,
  tone = "neutral",
}: {
  label: string;
  value?: string;
  icon?: React.ReactNode;
  hint?: string;
  tone?: "positive" | "negative" | "neutral";
}) {
  const toneCls =
    tone === "positive"
      ? "text-emerald-600"
      : tone === "negative"
        ? "text-rose-600"
        : "text-foreground";
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${toneCls}`}>
        {value ?? <Skeleton className="h-7 w-24" />}
      </div>
      {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}
