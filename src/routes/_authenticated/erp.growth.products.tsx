import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { AlertCircle, ImageOff, Loader2, RefreshCw, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBrand } from "@/contexts/brand-context";
import {
  GrowthHeader,
  GrowthTabs,
  InsufficientData,
  useGrowthRange,
} from "@/components/erp/growth/growth-filters";
import { Product360Panel } from "@/components/erp/reports/product-360";
import { getProductMarketing, type MktProductRow } from "@/lib/erp/marketing/products.functions";
import { ProductPipelinePage } from "@/components/erp/growth/pages/products";

const SearchParams = z.object({ tab: z.enum(["performance", "pipeline", "360"]).catch("performance") });

type SortKey = "profit" | "revenue" | "units" | "roas" | "cover";

export const Route = createFileRoute("/_authenticated/erp/growth/products")({
  head: () => ({
    meta: [
      { title: "Product Lab — Growth Operating System" },
      {
        name: "description",
        content: "Traceable product performance, unit economics, stock cover and Product 360 analysis.",
      },
      { property: "og:title", content: "Product Lab — Growth Operating System" },
      {
        property: "og:description",
        content: "Review product profitability, demand and stock health from canonical ERP data.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: SearchParams,
  component: ProductLabPage,
});

const bdt = (n: number | null | undefined) =>
  `৳${Math.round(Number(n ?? 0)).toLocaleString("en-BD")}`;
const number = (n: number | null | undefined) => Math.round(Number(n ?? 0)).toLocaleString("en-BD");
const metric = (n: number | null | undefined, suffix = "") =>
  n == null || !Number.isFinite(Number(n)) ? "—" : `${Number(n).toFixed(2)}${suffix}`;

function ProductLabPage() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate();
  const { brandIds, isLoading } = useBrand();
  const { range, setRange } = useGrowthRange();
  const fetchProducts = useServerFn(getProductMarketing);

  const productsQ = useQuery({
    queryKey: ["growth-product-lab", brandIds.slice().sort(), range.from, range.to],
    enabled: !isLoading && brandIds.length > 0 && tab === "performance",
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: () => fetchProducts({ data: { brandIds, from: range.from, to: range.to } }),
  });

  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("profit");
  const rangeDays = useMemo(() => {
    const from = new Date(`${range.from}T00:00:00`);
    const to = new Date(`${range.to}T00:00:00`);
    return Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1);
  }, [range.from, range.to]);
  const rows = useMemo(() => {
    const list = (productsQ.data ?? []) as MktProductRow[];
    const filtered = query.trim()
      ? list.filter((r) => `${r.title} ${r.sku ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()))
      : list;
    return [...filtered].sort((a, b) => {
      if (sort === "revenue") return b.delivered_revenue - a.delivered_revenue;
      if (sort === "units") return b.delivered_units - a.delivered_units;
      if (sort === "roas") return (b.roas ?? -1) - (a.roas ?? -1);
      if (sort === "cover") return (b.stock_cover_days ?? -1) - (a.stock_cover_days ?? -1);
      return b.net_profit - a.net_profit;
    });
  }, [productsQ.data, query, sort]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (a, r) => ({
          revenue: a.revenue + Number(r.delivered_revenue || 0),
          profit: a.profit + Number(r.net_profit || 0),
          spend: a.spend + Number(r.ad_spend || 0),
          units: a.units + Number(r.delivered_units || 0),
        }),
        { revenue: 0, profit: 0, spend: 0, units: 0 },
      ),
    [rows],
  );

  return (
    <div className="pb-16">
      <GrowthTabs
        tabs={[
          { key: "performance", label: "Live performance" },
          { key: "pipeline", label: "Idea → Winner pipeline" },
          { key: "360", label: "Product 360" },
        ]}
        value={tab}
        onChange={(key) => navigate({ to: "/erp/growth/products", search: { tab: key as "performance" | "pipeline" | "360" } })}
      />

      {tab === "pipeline" ? (
        <>
          <GrowthHeader
            title="Product Lab"
            subtitle="Evaluate ideas, validate unit economics and move winners into launch"
            range={range}
            onRangeChange={setRange}
          />
          <ProductPipelinePage showHeader={false} />
        </>
      ) : tab === "360" ? (
        <>
          <GrowthHeader
            title="Product 360"
            subtitle="Trace the full product story from orders to profit"
            range={range}
            onRangeChange={setRange}
          />
          <div className="mx-auto max-w-[1500px] px-4 py-5 md:px-6">
            <Product360Panel
              brandIds={brandIds}
              from={range.from}
              to={range.to}
              enabled={!isLoading && brandIds.length > 0}
              rangeLabel={`${range.from} → ${range.to}`}
            />
          </div>
        </>
      ) : (
        <>
          <GrowthHeader
            title="Product Lab"
            subtitle="Canonical product economics, demand and stock cover"
            range={range}
            onRangeChange={setRange}
          />
          <div className="mx-auto max-w-[1500px] space-y-4 px-4 py-5 md:px-6">
            {productsQ.isError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Product data could not be loaded</AlertTitle>
                <AlertDescription className="flex flex-wrap items-center gap-3">
                  {productsQ.error instanceof Error ? productsQ.error.message : "Please try again."}
                  <Button variant="outline" size="sm" onClick={() => productsQ.refetch()}>
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Try again
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Summary label="Delivered revenue" value={rows.length ? bdt(totals.revenue) : "—"} />
              <Summary label="Net profit" value={rows.length ? bdt(totals.profit) : "—"} />
              <Summary label="Ad spend" value={rows.length ? bdt(totals.spend) : "—"} />
              <Summary label="Delivered units" value={rows.length ? number(totals.units) : "—"} />
            </div>

            <Card className="shadow-none">
              <CardHeader className="gap-3 border-b border-border pb-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle className="text-sm">Live product performance ({rows.length})</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Delivered sales and profitability from the canonical product marketing source. Stock is available after reservations.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search product or SKU"
                      className="h-9 w-[220px] pl-8"
                    />
                  </div>
                  <Select value={sort} onValueChange={(value) => setSort(value as SortKey)}>
                    <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="profit">Net profit</SelectItem>
                      <SelectItem value="revenue">Revenue</SelectItem>
                      <SelectItem value="units">Units</SelectItem>
                      <SelectItem value="roas">ROAS</SelectItem>
                      <SelectItem value="cover">Stock cover</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {productsQ.isLoading ? (
                  <div className="flex items-center gap-2 px-4 py-12 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading canonical product economics…
                  </div>
                ) : productsQ.isError ? null : rows.length === 0 ? (
                  <div className="p-4"><InsufficientData note="No delivered product data exists for the selected brand and period." /></div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[1120px] text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                          <th className="px-4 py-3 font-medium">Product</th>
                          <th className="px-3 py-3 text-right font-medium">Orders</th>
                          <th className="px-3 py-3 text-right font-medium">Units</th>
                          <th className="px-3 py-3 text-right font-medium">Revenue</th>
                          <th className="px-3 py-3 text-right font-medium">Net profit</th>
                          <th className="px-3 py-3 text-right font-medium">Margin</th>
                          <th className="px-3 py-3 text-right font-medium">ROAS</th>
                          <th className="px-3 py-3 text-right font-medium">CPA</th>
                          <th className="px-3 py-3 text-right font-medium">Daily sales</th>
                          <th className="px-3 py-3 text-right font-medium">Available</th>
                          <th className="px-3 py-3 text-right font-medium">Cover</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.product_id} className="border-b border-border/60 last:border-0">
                            <td className="max-w-[300px] px-4 py-3">
                              <div className="flex items-center gap-2.5">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                                  {r.image ? <img src={r.image} alt={r.title} loading="lazy" className="h-full w-full object-cover" /> : <ImageOff className="h-4 w-4 text-muted-foreground" />}
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate font-medium">{r.title || "Untitled"}</p>
                                  {r.sku && <p className="text-[11px] text-muted-foreground">{r.sku}</p>}
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums">{number(r.delivered_orders)}</td>
                            <td className="px-3 py-3 text-right tabular-nums">{number(r.delivered_units)}</td>
                            <td className="px-3 py-3 text-right tabular-nums">{bdt(r.delivered_revenue)}</td>
                            <td className="px-3 py-3 text-right font-medium tabular-nums">{bdt(r.net_profit)}</td>
                            <td className="px-3 py-3 text-right tabular-nums">{metric(r.margin_pct, "%")}</td>
                            <td className="px-3 py-3 text-right tabular-nums">{metric(r.roas, "x")}</td>
                            <td className="px-3 py-3 text-right tabular-nums">{bdt(r.cpa)}</td>
                            <td className="px-3 py-3 text-right tabular-nums">{metric(r.delivered_units / rangeDays)}</td>
                            <td className="px-3 py-3 text-right tabular-nums">{number(r.available_stock)}</td>
                            <td className="px-3 py-3 text-right">
                              <Badge variant={r.available_stock <= (r.low_stock_threshold ?? 5) || (r.stock_cover_days != null && r.stock_cover_days <= 7) ? "destructive" : "outline"}>
                                {r.stock_cover_days == null ? "—" : `${Math.floor(r.stock_cover_days)}d`}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
