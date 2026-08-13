import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileBarChart } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useBrand } from "@/contexts/brand-context";
import {
  DateRangePicker,
  buildPreset,
  type MktRangeValue,
} from "@/components/erp/marketing/date-range-picker";
import { Panel, ExportMenu, KpiStrip, EmptyState, type Kpi } from "@/components/erp/reports/report-kit";
import type { Aoa } from "@/lib/erp/reports/export";
import { getMarketingDashboard } from "@/lib/erp/marketing/dashboard.functions";
import { getMktLevel } from "@/lib/erp/marketing/campaigns.functions";
import { getCreatives } from "@/lib/erp/marketing/creatives.functions";
import { getProductMarketing, getAcquisition } from "@/lib/erp/marketing/products.functions";
import { getUtmBreakdown, getFunnel } from "@/lib/erp/marketing/attribution.functions";

export const Route = createFileRoute("/_authenticated/erp/marketing/reports")({
  head: () => ({
    meta: [
      { title: "Marketing Reports & Exports — Marketing ERP" },
      {
        name: "description",
        content:
          "Exportable marketing reports: period performance, campaign and ad set roll-up, creative, product P&L, acquisition cohorts, UTM breakdown and the full funnel.",
      },
      { property: "og:title", content: "Marketing Reports — Marketing ERP" },
      {
        property: "og:description",
        content: "Every marketing report in Excel, CSV and print-ready PDF.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MarketingReportsPage,
});

type TabKey =
  | "performance"
  | "campaigns"
  | "creatives"
  | "products"
  | "customers"
  | "attribution"
  | "funnel";

const TABS: { key: TabKey; label: string }[] = [
  { key: "performance", label: "Performance" },
  { key: "campaigns", label: "Campaign / Ad set / Ad" },
  { key: "creatives", label: "Creative" },
  { key: "products", label: "Product P&L" },
  { key: "customers", label: "Acquisition & LTV" },
  { key: "attribution", label: "UTM" },
  { key: "funnel", label: "Funnel" },
];

const n2 = (v: number | null | undefined) => Number(v ?? 0);
const r2 = (v: number | null | undefined) => Math.round(n2(v) * 100) / 100;

function Table({ aoa }: { aoa: Aoa }) {
  if (aoa.length <= 1) return <EmptyState text="Ei range-e kono data nei." />;
  const [head, ...rows] = aoa;
  return (
    <div className="max-h-[520px] overflow-auto rounded-lg border border-border/60">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-muted/70 backdrop-blur">
          <tr>
            {head.map((h, i) => (
              <th
                key={i}
                className={`whitespace-nowrap px-3 py-2 font-medium ${i === 0 ? "text-left" : "text-right"}`}
              >
                {String(h ?? "")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-t border-border/50 hover:bg-muted/40">
              {r.map((c, ci) => (
                <td
                  key={ci}
                  className={`whitespace-nowrap px-3 py-1.5 tabular-nums ${ci === 0 ? "text-left" : "text-right"}`}
                >
                  {typeof c === "number" ? c.toLocaleString("en-IN") : String(c ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReportPanel({
  title,
  subtitle,
  aoa,
  filename,
  rangeLabel,
  loading,
  kpis,
  action,
}: {
  title: string;
  subtitle?: string;
  aoa: Aoa;
  filename: string;
  rangeLabel: string;
  loading?: boolean;
  kpis?: Kpi[];
  action?: React.ReactNode;
}) {
  return (
    <Panel
      title={title}
      subtitle={subtitle}
      action={
        <div className="flex items-center gap-2">
          {action}
          <ExportMenu
            aoa={() => aoa}
            filename={filename}
            title={title}
            subtitle={subtitle}
            rangeLabel={rangeLabel}
            kpis={kpis}
            disabled={loading || aoa.length <= 1}
          />
        </div>
      }
    >
      {loading ? <Skeleton className="h-64 w-full rounded-lg" /> : <Table aoa={aoa} />}
    </Panel>
  );
}

function MarketingReportsPage() {
  const { brands, isLoading: brandsLoading } = useBrand();
  const [brandKey, setBrandKey] = useState("all");
  const [range, setRange] = useState<MktRangeValue>(() => buildPreset("30d"));
  const [grain, setGrain] = useState<"day" | "week" | "month">("day");
  const [tab, setTab] = useState<TabKey>("performance");
  const [level, setLevel] = useState<"campaign" | "adset" | "ad">("campaign");
  const [dim, setDim] = useState<"source" | "medium" | "campaign" | "content" | "term" | "landing">(
    "source",
  );

  const brandIds = useMemo(() => {
    if (brandKey === "all") return brands.map((b) => b.id);
    const b = brands.find((x) => x.slug === brandKey || x.id === brandKey);
    return b ? [b.id] : brands.map((x) => x.id);
  }, [brandKey, brands]);

  const enabled = brandIds.length > 0;
  const baseKey = [brandIds.slice().sort().join(","), range.from, range.to];
  const rangeLabel = `${range.label} · ${range.from} → ${range.to}`;
  const brandLabel =
    brandKey === "all" ? "All brands" : (brands.find((b) => b.slug === brandKey)?.name ?? "Brand");

  const fetchDash = useServerFn(getMarketingDashboard);
  const fetchLevel = useServerFn(getMktLevel);
  const fetchCreatives = useServerFn(getCreatives);
  const fetchProducts = useServerFn(getProductMarketing);
  const fetchAcq = useServerFn(getAcquisition);
  const fetchUtm = useServerFn(getUtmBreakdown);
  const fetchFunnel = useServerFn(getFunnel);

  const qOpts = { staleTime: 5 * 60_000, refetchOnWindowFocus: false } as const;

  const dashQ = useQuery({
    queryKey: ["mkt-rep-dash", ...baseKey, grain],
    queryFn: () => fetchDash({ data: { brandIds, from: range.from, to: range.to, grain } }),
    enabled,
    ...qOpts,
  });
  const levelQ = useQuery({
    queryKey: ["mkt-rep-level", ...baseKey, level],
    queryFn: () => fetchLevel({ data: { brandIds, from: range.from, to: range.to, level } }),
    enabled: enabled && tab === "campaigns",
    ...qOpts,
  });
  const creativeQ = useQuery({
    queryKey: ["mkt-rep-creative", ...baseKey],
    queryFn: () => fetchCreatives({ data: { brandIds, from: range.from, to: range.to } }),
    enabled: enabled && tab === "creatives",
    ...qOpts,
  });
  const productQ = useQuery({
    queryKey: ["mkt-rep-product", ...baseKey],
    queryFn: () => fetchProducts({ data: { brandIds, from: range.from, to: range.to } }),
    enabled: enabled && tab === "products",
    ...qOpts,
  });
  const acqQ = useQuery({
    queryKey: ["mkt-rep-acq", ...baseKey],
    queryFn: () => fetchAcq({ data: { brandIds, from: range.from, to: range.to } }),
    enabled: enabled && tab === "customers",
    ...qOpts,
  });
  const utmQ = useQuery({
    queryKey: ["mkt-rep-utm", ...baseKey, dim],
    queryFn: () => fetchUtm({ data: { brandIds, from: range.from, to: range.to, dim } }),
    enabled: enabled && tab === "attribution",
    ...qOpts,
  });
  const funnelQ = useQuery({
    queryKey: ["mkt-rep-funnel", ...baseKey],
    queryFn: () => fetchFunnel({ data: { brandIds, from: range.from, to: range.to } }),
    enabled: enabled && tab === "funnel",
    ...qOpts,
  });

  const k = dashQ.data?.kpis;
  const kpis: Kpi[] = k
    ? [
        { label: "Ad spend", value: k.spend_bdt },
        { label: "Delivered revenue", value: k.delivered_revenue },
        { label: "Delivered ROAS", value: r2(k.delivered_roas), kind: "number" },
        { label: "Contribution profit", value: k.contribution_profit, tone: k.contribution_profit >= 0 ? "good" : "bad" },
        { label: "Orders", value: k.orders, kind: "number" },
        { label: "Delivered orders", value: k.delivered_orders, kind: "number" },
        { label: "CAC", value: r2(k.cac) },
        { label: "AOV", value: r2(k.aov) },
      ]
    : [];

  const trendAoa: Aoa = useMemo(() => {
    const rows = dashQ.data?.trend ?? [];
    return [
      ["Period", "Ad spend", "Booked revenue", "Delivered revenue", "Orders", "Delivered orders", "ROAS"],
      ...rows.map((r) => [
        r.bucket,
        r2(r.spend_bdt),
        r2(r.booked_revenue),
        r2(r.delivered_revenue),
        r.orders,
        r.delivered_orders,
        r2(r.roas),
      ]),
    ];
  }, [dashQ.data]);

  const levelAoa: Aoa = useMemo(() => {
    const rows = levelQ.data ?? [];
    return [
      ["Name","Status","Objective","Spend","Impressions","Clicks","CTR %","CPC","Orders","Delivered orders","Delivered revenue","ROAS","CPA"],
      ...rows.map((r) => [
        r.name,
        r.status,
        r.objective ?? "—",
        r2(r.spend),
        r.impressions,
        r.clicks,
        r2(r.ctr),
        r2(r.cpc),
        r.orders,
        r.delivered_orders,
        r2(r.revenue),
        r2(r.roas),
        r2(r.cpa),
      ]),
    ];
  }, [levelQ.data]);

  const creativeAoa: Aoa = useMemo(() => {
    const rows = creativeQ.data ?? [];
    return [
      ["Creative","Type","Angle","Creator","Spend","Impressions","Clicks","CTR %","Frequency","Orders","Delivered revenue","ROAS","CPA","Signal"],
      ...rows.map((r) => [
        r.name,
        r.creative_type ?? "—",
        r.angle ?? "—",
        r.creator ?? "—",
        r2(r.spend),
        r.impressions,
        r.clicks,
        r2(r.ctr),
        r2(r.frequency),
        r.orders,
        r2(r.revenue),
        r2(r.roas),
        r2(r.cpa),
        r.winning ? "Winning" : r.fatigued ? "Fatigued" : "—",
      ]),
    ];
  }, [creativeQ.data]);

  const productAoa: Aoa = useMemo(() => {
    const rows = productQ.data ?? [];
    return [
      ["Product","SKU","Delivered units","Delivered orders","Delivered revenue","COGS","Operating cost","Gross profit","Ad spend","Net profit","Margin %","ROAS","CPA","AOV"],
      ...rows.map((r) => [
        r.title,
        r.sku ?? "—",
        r.delivered_units,
        r.delivered_orders,
        r2(r.delivered_revenue),
        r2(r.cogs),
        r2(r.operating_cost),
        r2(r.gross_profit),
        r2(r.ad_spend),
        r2(r.net_profit),
        r2(r.margin_pct),
        r2(r.roas),
        r2(r.cpa),
        r2(r.aov),
      ]),
    ];
  }, [productQ.data]);

  const acqSummaryAoa: Aoa = useMemo(() => {
    const s = acqQ.data?.summary;
    if (!s) return [["Metric", "Value"]];
    return [
      ["Metric", "Value"],
      ["New customers", s.new_customers],
      ["Returning customers", s.returning_customers],
      ["Active customers", s.active_customers],
      ["New revenue", r2(s.new_revenue)],
      ["Returning revenue", r2(s.returning_revenue)],
      ["Ad spend", r2(s.spend)],
      ["CAC", r2(s.cac)],
      ["LTV", r2(s.ltv)],
      ["LTV : CAC", r2(s.ltv_cac)],
      ["Orders per customer", r2(s.orders_per_customer)],
      ["Repeat rate %", r2(s.repeat_rate)],
    ];
  }, [acqQ.data]);

  const cohortAoa: Aoa = useMemo(() => {
    const rows = acqQ.data?.cohorts ?? [];
    return [
      ["Cohort month", "Customers", "Orders", "Revenue", "Repeat customers", "Repeat rate %", "LTV"],
      ...rows.map((r) => [
        String(r.cohort_month).slice(0, 7),
        r.customers,
        r.orders,
        r2(r.revenue),
        r.repeat_customers,
        r2(r.repeat_rate),
        r2(r.ltv),
      ]),
    ];
  }, [acqQ.data]);

  const utmAoa: Aoa = useMemo(() => {
    const rows = utmQ.data ?? [];
    return [
      [dim.toUpperCase(),"Sessions","Orders","Confirmed","Delivered","Cancelled","Returned","Booked revenue","Delivered revenue","AOV","Delivery rate %"],
      ...rows.map((r) => [
        r.dim_value || "(none)",
        r.sessions,
        r.orders,
        r.confirmed_orders,
        r.delivered_orders,
        r.cancelled_orders,
        r.returned_orders,
        r2(r.booked_revenue),
        r2(r.delivered_revenue),
        r2(r.aov),
        r2(r.delivery_rate),
      ]),
    ];
  }, [utmQ.data, dim]);

  const funnelAoa: Aoa = useMemo(() => {
    const f = funnelQ.data;
    if (!f) return [["Step", "Count", "Conversion from previous %"]];
    const steps: [string, number][] = [
      ["Impressions", n2(f.impressions)],
      ["Reach", n2(f.reach)],
      ["Clicks", n2(f.clicks)],
      ["Sessions", n2(f.sessions)],
      ["Page views", n2(f.page_views)],
      ["Orders", n2(f.orders)],
      ["Confirmed", n2(f.confirmed_orders)],
      ["Shipped", n2(f.shipped_orders)],
      ["Delivered", n2(f.delivered_orders)],
    ];
    return [
      ["Step", "Count", "Conversion from previous %"],
      ...steps.map(([label, val], i) => {
        const prev = i === 0 ? 0 : steps[i - 1][1];
        return [label, val, i === 0 || prev === 0 ? "—" : r2((val / prev) * 100)];
      }),
    ];
  }, [funnelQ.data]);

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <FileBarChart className="h-4.5 w-4.5" />
          </span>
          <div>
            <h1 className="font-display text-xl font-bold tracking-tight">Marketing Reports</h1>
            <p className="text-xs text-muted-foreground">
              {brandLabel} · {rangeLabel} — Excel, CSV o print-ready PDF export soho
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={brandKey} onValueChange={setBrandKey} disabled={brandsLoading}>
            <SelectTrigger className="h-9 w-[180px]">
              <SelectValue placeholder="Brand" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All brands</SelectItem>
              {brands.map((b) => (
                <SelectItem key={b.id} value={b.slug}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DateRangePicker value={range} onChange={setRange} />
        </div>
      </div>

      <KpiStrip items={kpis} loading={dashQ.isLoading} />

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <TabsList className="flex h-auto flex-wrap justify-start gap-1">
          {TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key} className="text-xs">
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {tab === "performance" && (
        <ReportPanel
          title="Period performance"
          subtitle="Spend vs booked and delivered revenue per period"
          aoa={trendAoa}
          filename={`marketing-performance-${range.from}_${range.to}`}
          rangeLabel={rangeLabel}
          loading={dashQ.isLoading}
          kpis={kpis}
          action={
            <Tabs value={grain} onValueChange={(v) => setGrain(v as typeof grain)}>
              <TabsList className="h-7">
                <TabsTrigger value="day" className="h-6 px-2 text-[11px]">Day</TabsTrigger>
                <TabsTrigger value="week" className="h-6 px-2 text-[11px]">Week</TabsTrigger>
                <TabsTrigger value="month" className="h-6 px-2 text-[11px]">Month</TabsTrigger>
              </TabsList>
            </Tabs>
          }
        />
      )}

      {tab === "campaigns" && (
        <ReportPanel
          title={`${level === "campaign" ? "Campaign" : level === "adset" ? "Ad set" : "Ad"} report`}
          subtitle="Spend (FIFO BDT) vs attributed delivered revenue"
          aoa={levelAoa}
          filename={`marketing-${level}-${range.from}_${range.to}`}
          rangeLabel={rangeLabel}
          loading={levelQ.isLoading}
          action={
            <Tabs value={level} onValueChange={(v) => setLevel(v as typeof level)}>
              <TabsList className="h-7">
                <TabsTrigger value="campaign" className="h-6 px-2 text-[11px]">Campaign</TabsTrigger>
                <TabsTrigger value="adset" className="h-6 px-2 text-[11px]">Ad set</TabsTrigger>
                <TabsTrigger value="ad" className="h-6 px-2 text-[11px]">Ad</TabsTrigger>
              </TabsList>
            </Tabs>
          }
        />
      )}

      {tab === "creatives" && (
        <ReportPanel
          title="Creative report"
          subtitle="Per-creative delivery, engagement and profit signal"
          aoa={creativeAoa}
          filename={`marketing-creatives-${range.from}_${range.to}`}
          rangeLabel={rangeLabel}
          loading={creativeQ.isLoading}
        />
      )}

      {tab === "products" && (
        <ReportPanel
          title="Product marketing P&L"
          subtitle="Delivered revenue − COGS − opex − allocated ad spend per SKU"
          aoa={productAoa}
          filename={`marketing-products-${range.from}_${range.to}`}
          rangeLabel={rangeLabel}
          loading={productQ.isLoading}
        />
      )}

      {tab === "customers" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <ReportPanel
            title="Acquisition summary"
            subtitle="New vs returning, CAC and LTV"
            aoa={acqSummaryAoa}
            filename={`marketing-acquisition-${range.from}_${range.to}`}
            rangeLabel={rangeLabel}
            loading={acqQ.isLoading}
          />
          <ReportPanel
            title="Cohort retention"
            subtitle="First-order month cohorts with repeat rate and LTV"
            aoa={cohortAoa}
            filename={`marketing-cohorts-${range.from}_${range.to}`}
            rangeLabel={rangeLabel}
            loading={acqQ.isLoading}
          />
        </div>
      )}

      {tab === "attribution" && (
        <ReportPanel
          title="UTM breakdown"
          subtitle="Orders and revenue per attribution dimension"
          aoa={utmAoa}
          filename={`marketing-utm-${dim}-${range.from}_${range.to}`}
          rangeLabel={rangeLabel}
          loading={utmQ.isLoading}
          action={
            <Select value={dim} onValueChange={(v) => setDim(v as typeof dim)}>
              <SelectTrigger className="h-7 w-[130px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["source", "medium", "campaign", "content", "term", "landing"].map((d) => (
                  <SelectItem key={d} value={d} className="text-xs">
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
      )}

      {tab === "funnel" && (
        <ReportPanel
          title="Marketing funnel"
          subtitle="Impressions → clicks → sessions → orders → delivered"
          aoa={funnelAoa}
          filename={`marketing-funnel-${range.from}_${range.to}`}
          rangeLabel={rangeLabel}
          loading={funnelQ.isLoading}
        />
      )}
    </div>
  );
}
