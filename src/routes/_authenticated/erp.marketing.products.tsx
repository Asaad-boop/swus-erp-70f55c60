import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  RefreshCcw,
  Search,
  Download,
  Users,
  Repeat,
  Wallet,
  TrendingUp,
  PackagePlus as PageIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useBrand } from "@/contexts/brand-context";
import { BrandTabs } from "@/components/erp/marketing/marketing-shell";
import {
  DateRangePicker,
  buildPreset,
  type MktRangeValue,
} from "@/components/erp/marketing/date-range-picker";
import {
  getProductMarketing,
  getAcquisition,
  type MktProductRow,
} from "@/lib/erp/marketing/products.functions";

export const Route = createFileRoute("/_authenticated/erp/marketing/products")({
  head: () => ({
    meta: [
      { title: "Product Marketing & LTV — Marketing ERP" },
      {
        name: "description",
        content:
          "Per-product ad spend, delivered revenue, COGS, net profit, ROAS plus customer acquisition cost, LTV and repeat cohorts.",
      },
      { property: "og:title", content: "Product Marketing & LTV — Marketing ERP" },
      {
        property: "og:description",
        content: "SKU-level marketing profitability with CAC, LTV and cohort retention.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProductMarketingPage,
});

const bdt = (n: number) => "৳" + Math.round(n || 0).toLocaleString("en-IN");
type SortKey =
  | "net_profit"
  | "delivered_revenue"
  | "ad_spend"
  | "roas"
  | "delivered_units"
  | "margin_pct";

function ProductMarketingPage() {
  const { brands } = useBrand();
  const [brandKey, setBrandKey] = useState("all");
  const [range, setRange] = useState<MktRangeValue>(() => buildPreset("30d"));
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("net_profit");

  const brandIds = useMemo(() => {
    if (brandKey === "all") return brands.map((b) => b.id);
    const b = brands.find((x) => x.slug === brandKey || x.id === brandKey);
    return b ? [b.id] : brands.map((x) => x.id);
  }, [brandKey, brands]);

  const fetchProducts = useServerFn(getProductMarketing);
  const fetchAcq = useServerFn(getAcquisition);
  const key = [brandIds.slice().sort().join(","), range.from, range.to];

  const prodQ = useQuery({
    queryKey: ["mkt-products", ...key],
    queryFn: () => fetchProducts({ data: { brandIds, from: range.from, to: range.to } }),
    enabled: brandIds.length > 0,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const acqQ = useQuery({
    queryKey: ["mkt-acquisition", ...key],
    queryFn: () => fetchAcq({ data: { brandIds, from: range.from, to: range.to } }),
    enabled: brandIds.length > 0,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const rows = useMemo(() => {
    let list: MktProductRow[] = prodQ.data ?? [];
    const needle = q.trim().toLowerCase();
    if (needle)
      list = list.filter((r) => `${r.title} ${r.sku ?? ""}`.toLowerCase().includes(needle));
    return [...list].sort((a, b) => (b[sort] as number) - (a[sort] as number));
  }, [prodQ.data, q, sort]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (a, r) => {
          a.revenue += r.delivered_revenue;
          a.cogs += r.cogs;
          a.opex += r.operating_cost;
          a.spend += r.ad_spend;
          a.net += r.net_profit;
          a.units += r.delivered_units;
          return a;
        },
        { revenue: 0, cogs: 0, opex: 0, spend: 0, net: 0, units: 0 },
      ),
    [rows],
  );

  const acq = acqQ.data?.summary ?? null;
  const cohorts = acqQ.data?.cohorts ?? [];

  function exportCsv() {
    const head = [
      "Product",
      "SKU",
      "Delivered units",
      "Delivered orders",
      "Delivered revenue",
      "COGS",
      "Operating cost",
      "Gross profit",
      "Ad spend",
      "Net profit",
      "Margin %",
      "ROAS",
      "CPA",
      "AOV",
      "Attributed orders",
    ];
    const lines = [
      head,
      ...rows.map((r) => [
        r.title,
        r.sku ?? "",
        r.delivered_units,
        r.delivered_orders,
        r.delivered_revenue,
        r.cogs,
        r.operating_cost,
        r.gross_profit,
        r.ad_spend,
        r.net_profit,
        r.margin_pct,
        r.roas,
        r.cpa,
        r.aov,
        r.attributed_orders,
      ]),
    ];
    const csv =
      "\uFEFF" +
      lines.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `product-marketing-${range.from}-to-${range.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <PageIcon className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-xl font-bold tracking-tight">
              Product Marketing &amp; LTV
            </h1>
            <p className="text-xs text-muted-foreground">
              {range.label} · {rows.length} products · ad spend {bdt(totals.spend)} · delivered rev{" "}
              {bdt(totals.revenue)} · net profit {bdt(totals.net)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BrandTabs value={brandKey} onChange={setBrandKey} />
          <DateRangePicker value={range} onChange={setRange} />
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
            <Download className="h-3.5 w-3.5 mr-1.5" />
            CSV
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              prodQ.refetch();
              acqQ.refetch();
            }}
            disabled={prodQ.isFetching || acqQ.isFetching}
          >
            <RefreshCcw
              className={`h-3.5 w-3.5 mr-1.5 ${prodQ.isFetching ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      {/* Acquisition KPIs */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={<Users className="h-4 w-4" />}
          label="New customers"
          value={acqQ.isLoading ? null : String(acq?.new_customers ?? 0)}
          hint={`${acq?.new_orders ?? 0} orders`}
        />
        <KpiCard
          icon={<Wallet className="h-4 w-4" />}
          label="CAC"
          value={acqQ.isLoading ? null : bdt(acq?.cac ?? 0)}
          hint={`spend ${bdt(acq?.spend ?? 0)}`}
        />
        <KpiCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="LTV (cohort)"
          value={acqQ.isLoading ? null : bdt(acq?.ltv ?? 0)}
          hint={`LTV/CAC ${(acq?.ltv_cac ?? 0).toFixed(2)}x`}
        />
        <KpiCard
          icon={<Repeat className="h-4 w-4" />}
          label="Repeat rate"
          value={acqQ.isLoading ? null : `${(acq?.repeat_rate ?? 0).toFixed(2)}%`}
          hint={`${acq?.returning_customers ?? 0} returning`}
        />
      </div>

      <Card>
        <CardHeader className="pb-2 flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-sm">Product P&amp;L (delivered basis)</CardTitle>
          <div className="flex items-center gap-2">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="h-7 rounded-md border bg-background px-2 text-xs"
            >
              <option value="net_profit">Sort: Net profit</option>
              <option value="delivered_revenue">Sort: Delivered revenue</option>
              <option value="ad_spend">Sort: Ad spend</option>
              <option value="roas">Sort: ROAS</option>
              <option value="delivered_units">Sort: Units</option>
              <option value="margin_pct">Sort: Margin %</option>
            </select>
            <div className="relative w-56">
              <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search product / SKU"
                className="h-8 pl-7 text-xs"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {prodQ.isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Ei range-e kono product data nei.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-right [&>th:first-child]:text-left">
                    <th>Product</th>
                    <th>Units</th>
                    <th>Delivered orders</th>
                    <th>Delivered revenue</th>
                    <th>COGS</th>
                    <th>Opex</th>
                    <th>Ad spend</th>
                    <th>Net profit</th>
                    <th>Margin</th>
                    <th>ROAS</th>
                    <th>CPA</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.product_id}
                      className="border-t hover:bg-muted/30 [&>td]:px-3 [&>td]:py-2 [&>td]:text-right [&>td:first-child]:text-left"
                    >
                      <td>
                        <div className="flex items-center gap-2 max-w-[320px]">
                          {r.image ? (
                            <img
                              src={r.image}
                              alt={r.title}
                              loading="lazy"
                              className="h-8 w-8 rounded object-cover border"
                            />
                          ) : (
                            <div className="h-8 w-8 rounded bg-muted" />
                          )}
                          <div className="min-w-0">
                            <div className="truncate font-medium">{r.title}</div>
                            {r.cost_missing_units > 0 && (
                              <Badge variant="outline" className="mt-0.5 text-[10px]">
                                {r.cost_missing_units} units cost missing
                              </Badge>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>{r.delivered_units}</td>
                      <td>{r.delivered_orders}</td>
                      <td>{bdt(r.delivered_revenue)}</td>
                      <td>{bdt(r.cogs)}</td>
                      <td>{bdt(r.operating_cost)}</td>
                      <td>{bdt(r.ad_spend)}</td>
                      <td
                        className={
                          r.net_profit >= 0
                            ? "text-emerald-600 font-medium"
                            : "text-destructive font-medium"
                        }
                      >
                        {bdt(r.net_profit)}
                      </td>
                      <td>{r.margin_pct == null ? "—" : `${r.margin_pct.toFixed(1)}%`}</td>
                      <td>{r.roas != null && r.roas > 0 ? `${r.roas.toFixed(2)}x` : "—"}</td>
                      <td>{r.cpa != null && r.cpa > 0 ? bdt(r.cpa) : "—"}</td>

                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t bg-muted/40 font-medium">
                  <tr className="[&>td]:px-3 [&>td]:py-2 [&>td]:text-right [&>td:first-child]:text-left">
                    <td>Total ({rows.length})</td>
                    <td>{totals.units}</td>
                    <td />
                    <td>{bdt(totals.revenue)}</td>
                    <td>{bdt(totals.cogs)}</td>
                    <td>{bdt(totals.opex)}</td>
                    <td>{bdt(totals.spend)}</td>
                    <td className={totals.net >= 0 ? "text-emerald-600" : "text-destructive"}>
                      {bdt(totals.net)}
                    </td>
                    <td>
                      {totals.revenue > 0
                        ? ((100 * totals.net) / totals.revenue).toFixed(1)
                        : "0.0"}
                      %
                    </td>
                    <td>
                      {totals.spend > 0 ? `${(totals.revenue / totals.spend).toFixed(2)}x` : "—"}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Acquisition cohorts (by first order month)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {acqQ.isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : cohorts.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Cohort data nei.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-right [&>th:first-child]:text-left">
                    <th>Cohort</th>
                    <th>Customers</th>
                    <th>Orders</th>
                    <th>Delivered revenue</th>
                    <th>Repeat customers</th>
                    <th>Repeat rate</th>
                    <th>LTV</th>
                  </tr>
                </thead>
                <tbody>
                  {cohorts.map((c) => (
                    <tr
                      key={c.cohort_month}
                      className="border-t [&>td]:px-3 [&>td]:py-2 [&>td]:text-right [&>td:first-child]:text-left"
                    >
                      <td className="font-medium">{c.cohort_month}</td>
                      <td>{c.customers}</td>
                      <td>{c.orders}</td>
                      <td>{bdt(c.revenue)}</td>
                      <td>{c.repeat_customers}</td>
                      <td>{c.repeat_rate.toFixed(2)}%</td>
                      <td>{bdt(c.ltv)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {icon}
          {label}
        </div>
        {value === null ? (
          <Skeleton className="h-7 w-24 mt-2" />
        ) : (
          <div className="text-xl font-semibold mt-1.5 tracking-tight">{value}</div>
        )}
        {hint && <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>}
      </CardContent>
    </Card>
  );
}
