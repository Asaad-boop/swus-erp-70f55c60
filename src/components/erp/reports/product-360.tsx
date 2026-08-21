import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Search, Package, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { fmtBdt } from "@/lib/erp/finance";
import { cn } from "@/lib/utils";
import { Panel, KpiStrip, EmptyState, ExportMenu, REPORT_QUERY_OPTS, type Kpi } from "@/components/erp/reports/report-kit";

type SearchRow = {
  product_id: string; title: string; sku: string | null; image: string | null;
  brand_name: string | null; is_active: boolean; price: number; cost_price: number;
  weighted_avg_cost: number; stock: number;
};

type Bucket = { label: string; orders: number; units: number; delivered?: number; returned?: number; value?: number; revenue?: number };

type Product360 = {
  product: {
    id: string; title: string; sku: string | null; image: string | null; is_active: boolean;
    price: number; cost_price: number; wac: number; stock: number; available_stock: number; brand_name: string | null;
  } | null;
  summary: {
    orders: number; units_ordered: number; booked_value: number; confirmed_orders: number;
    cancelled_orders: number; returned_orders: number; delivered_orders: number; open_orders: number;
    delivered_units: number; returned_units: number; delivered_revenue: number; cogs: number;
    courier_cost: number; packaging_cost: number; return_courier_cost: number; units_no_cost: number;
    advance_collected: number; paid_orders: number; delivery_rate: number; return_rate: number; cancel_rate: number;
  } | null;
  money: { collected: number; fees: number; payout: number; settled_orders: number } | null;
  ads: { ad_spend: number; attributed_orders: number } | null;
  by_status: Bucket[];
  by_source: Bucket[];
  by_district: Bucket[];
  daily: { day: string; orders: number; units: number; delivered_orders: number; revenue: number }[];
  campaigns: { campaign_id: string; campaign_name: string; ad_spend: number; orders: number; delivered_orders: number; revenue: number }[];
};

const STATUS_TONE: Record<string, string> = {
  delivered: "bg-emerald-500", paid: "bg-emerald-600", completed: "bg-emerald-700",
  partial_delivered: "bg-teal-500", shipped: "bg-sky-500", in_transit: "bg-sky-600",
  confirmed: "bg-indigo-500", new: "bg-slate-400", packaging: "bg-violet-500", packed: "bg-violet-600",
  returned: "bg-rose-500", paid_return: "bg-rose-600", unpaid_return: "bg-rose-700",
  pending_return: "bg-orange-500", cancelled: "bg-zinc-500", fake: "bg-zinc-600", on_hold: "bg-amber-500",
};

const SOURCE_LABEL: Record<string, string> = {
  website: "Website", manual: "Manual", facebook: "Facebook", shopify: "Shopify",
  phone: "Phone", incomplete: "Incomplete", utm: "UTM link", pixel: "Pixel",
};

function useDebounced(value: string, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function num(v: unknown) {
  return Number(v ?? 0);
}

export function Product360Panel({
  brandIds, from, to, enabled, rangeLabel,
}: { brandIds: string[]; from: string; to: string; enabled: boolean; rangeLabel?: string }) {
  const [term, setTerm] = useState("");
  const [picked, setPicked] = useState<SearchRow | null>(null);
  const q = useDebounced(term);

  const searchQ = useQuery({
    queryKey: ["rpt-product-search", brandIds.join(","), q],
    enabled: enabled && q.trim().length >= 2 && !picked,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpt_product_search", { _brand_ids: brandIds, _q: q, _limit: 20 } as never);
      if (error) throw error;
      return (data ?? []) as unknown as SearchRow[];
    },
  });

  const detailQ = useQuery({
    queryKey: ["rpt-product-360", brandIds.join(","), from, to, picked?.product_id],
    enabled: enabled && !!picked,
    ...REPORT_QUERY_OPTS,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpt_product_360", {
        _brand_ids: brandIds, _from: from, _to: to, _product_id: picked!.product_id,
      } as never);
      if (error) throw error;
      return data as unknown as Product360;
    },
  });

  const d = detailQ.data;
  const s = d?.summary;
  const money = d?.money;
  const adSpend = num(d?.ads?.ad_spend);

  const grossProfit = s ? num(s.delivered_revenue) - num(s.cogs) : 0;
  const opsCost = s ? num(s.courier_cost) + num(s.packaging_cost) + num(s.return_courier_cost) : 0;
  const netProfit = grossProfit - opsCost - adSpend;
  const marginPct = s && num(s.delivered_revenue) > 0 ? (netProfit / num(s.delivered_revenue)) * 100 : 0;
  const grossMarginPct = s && num(s.delivered_revenue) > 0 ? (grossProfit / num(s.delivered_revenue)) * 100 : 0;
  const roas = adSpend > 0 ? num(s?.delivered_revenue) / adSpend : 0;

  const kpis: Kpi[] = s
    ? [
        { label: "Orders placed", value: num(s.orders), kind: "number", hint: `${num(s.units_ordered).toLocaleString()} units · booked ${fmtBdt(s.booked_value)}` },
        { label: "Delivered", value: num(s.delivered_orders), kind: "number", tone: "good", hint: `${num(s.delivered_units).toLocaleString()} units · ${num(s.delivery_rate).toFixed(1)}% delivery rate` },
        { label: "Delivered revenue", value: num(s.delivered_revenue), hint: "product lines only (no shipping fee)" },
        { label: "Product cost (COGS)", value: num(s.cogs), hint: num(s.units_no_cost) > 0 ? `${num(s.units_no_cost)} units missing cost` : "cost fully resolved" },
        { label: "Gross profit", value: grossProfit, tone: grossProfit >= 0 ? "good" : "bad", hint: `${grossMarginPct.toFixed(1)}% gross margin` },
        { label: "Courier + return cost", value: opsCost, tone: "bad", hint: `delivery ${fmtBdt(s.courier_cost)} · return ${fmtBdt(s.return_courier_cost)}` },
        { label: "Marketing spend", value: adSpend, tone: "bad", hint: `${num(d?.ads?.attributed_orders).toLocaleString()} attributed orders · ROAS ${roas.toFixed(2)}x` },
        { label: "Net profit", value: netProfit, tone: netProfit >= 0 ? "good" : "bad", hint: `${marginPct.toFixed(1)}% net margin` },
      ]
    : [];

  const chart = useMemo(
    () => (d?.daily ?? []).map((r) => ({ day: r.day.slice(5), orders: num(r.orders), revenue: num(r.revenue) })),
    [d?.daily],
  );

  const districts = d?.by_district ?? [];
  const maxDistrict = Math.max(1, ...districts.map((r) => num(r.orders)));

  return (
    <>
      <Panel
        title="Product 360"
        subtitle="Search a product by name, SKU or barcode to see its complete story"
        action={
          picked && (
            <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs" onClick={() => { setPicked(null); setTerm(""); }}>
              <X className="mr-1.5 h-3.5 w-3.5" />Clear
            </Button>
          )
        }
      >
        {!picked ? (
          <div className="space-y-3">
            <div className="relative max-w-xl">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Product name / SKU / barcode…"
                className="h-10 pl-9"
              />
            </div>

            {q.trim().length < 2 ? (
              <p className="text-xs text-muted-foreground">Type at least 2 characters.</p>
            ) : searchQ.isLoading ? (
              <Skeleton className="h-28 rounded-lg" />
            ) : (searchQ.data ?? []).length === 0 ? (
              <EmptyState text="No product matched." />
            ) : (
              <div className="grid gap-2 md:grid-cols-2">
                {(searchQ.data ?? []).map((r) => (
                  <button
                    key={r.product_id}
                    onClick={() => setPicked(r)}
                    className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-2.5 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                      {r.image ? <img src={r.image} alt={r.title} className="h-full w-full object-cover" loading="lazy" /> : <Package className="h-4 w-4 text-muted-foreground" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{r.title}</p>
                      <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                        {r.sku && <span className="font-mono">{r.sku}</span>}
                        {r.brand_name && <span>· {r.brand_name}</span>}
                        <span>· stock {num(r.stock)}</span>
                      </p>
                    </div>
                    <Badge variant={r.is_active ? "default" : "outline"} className="text-[10px]">
                      {r.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">
              {picked.image ? <img src={picked.image} alt={picked.title} className="h-full w-full object-cover" /> : <Package className="h-5 w-5 text-muted-foreground" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="font-display text-base font-semibold tracking-tight">{picked.title}</h4>
                <Badge variant={picked.is_active ? "default" : "outline"} className="text-[10px]">{picked.is_active ? "Active" : "Inactive"}</Badge>
                {picked.brand_name && <Badge variant="outline" className="text-[10px]">{picked.brand_name}</Badge>}
              </div>
              <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                {picked.sku && <span className="font-mono">{picked.sku}</span>}
                <span>Price {fmtBdt(picked.price)}</span>
                <span>Cost {fmtBdt(picked.weighted_avg_cost || picked.cost_price)}</span>
                <span>Stock {num(picked.stock).toLocaleString()}</span>
                <span>{rangeLabel}</span>
              </p>
            </div>
            {s && (
              <ExportMenu
                title={`Product 360 — ${picked.title}`}
                subtitle={picked.sku ?? undefined}
                rangeLabel={rangeLabel}
                filename={`product-360-${picked.sku ?? picked.product_id}`}
                kpis={kpis}
                aoa={() => [
                  ["Metric", "Value"],
                  ["Orders placed", num(s.orders)],
                  ["Units ordered", num(s.units_ordered)],
                  ["Confirmed orders", num(s.confirmed_orders)],
                  ["Cancelled orders", num(s.cancelled_orders)],
                  ["Delivered orders", num(s.delivered_orders)],
                  ["Delivered units", num(s.delivered_units)],
                  ["Returned orders", num(s.returned_orders)],
                  ["Delivered revenue", num(s.delivered_revenue)],
                  ["COGS", num(s.cogs)],
                  ["Gross profit", grossProfit],
                  ["Courier cost", num(s.courier_cost)],
                  ["Return courier cost", num(s.return_courier_cost)],
                  ["Marketing spend", adSpend],
                  ["Net profit", netProfit],
                  ["Courier collected", num(money?.collected)],
                  ["Courier fees", num(money?.fees)],
                  ["Courier payout received", num(money?.payout)],
                  [],
                  ["Channel", "Orders", "Units", "Delivered", "Value"],
                  ...(d?.by_source ?? []).map((r) => [SOURCE_LABEL[r.label] ?? r.label, num(r.orders), num(r.units), num(r.delivered), num(r.value)]),
                  [],
                  ["Status", "Orders", "Units", "Value"],
                  ...(d?.by_status ?? []).map((r) => [r.label, num(r.orders), num(r.units), num(r.value)]),
                  [],
                  ["District", "Orders", "Delivered", "Returned", "Revenue"],
                  ...districts.map((r) => [r.label, num(r.orders), num(r.delivered), num(r.returned), num(r.revenue)]),
                  [],
                  ["Campaign", "Ad spend", "Orders", "Delivered", "Revenue"],
                  ...(d?.campaigns ?? []).map((r) => [r.campaign_name, num(r.ad_spend), num(r.orders), num(r.delivered_orders), num(r.revenue)]),
                ]}
              />
            )}
          </div>
        )}
      </Panel>

      {picked && (
        detailQ.isLoading ? (
          <KpiStrip items={[]} loading />
        ) : !s || num(s.orders) === 0 ? (
          <Panel><EmptyState text="No order for this product in the selected range." /></Panel>
        ) : (
          <>
            <KpiStrip items={kpis} />

            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title="Order status" subtitle={`${num(s.orders)} orders · ${num(s.open_orders)} still in pipeline`}>
                <div className="space-y-2">
                  {(d?.by_status ?? []).map((r) => (
                    <div key={r.label} className="flex items-center gap-3">
                      <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", STATUS_TONE[r.label] ?? "bg-primary/60")} />
                      <span className="w-40 shrink-0 truncate text-xs capitalize">{r.label.replace(/_/g, " ")}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn("h-full rounded-full", STATUS_TONE[r.label] ?? "bg-primary/60")}
                          style={{ width: `${Math.max(2, (num(r.orders) / Math.max(1, num(s.orders))) * 100)}%` }}
                        />
                      </div>
                      <span className="w-14 shrink-0 text-right text-xs tabular-nums font-medium">{num(r.orders)}</span>
                      <span className="w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{fmtBdt(r.value ?? 0)}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  {[
                    ["Confirmed", num(s.confirmed_orders), "text-indigo-600 dark:text-indigo-400"],
                    ["Cancelled", num(s.cancelled_orders), "text-zinc-600 dark:text-zinc-400"],
                    ["Returned", num(s.returned_orders), "text-rose-600 dark:text-rose-400"],
                  ].map(([label, val, tone]) => (
                    <div key={String(label)} className="rounded-lg border border-border/60 bg-muted/30 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
                      <p className={cn("font-display text-lg font-bold tabular-nums", tone as string)}>{Number(val).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel title="Order channel" subtitle="কোথা থেকে order এসেছে">
                <div className="space-y-2.5">
                  {(d?.by_source ?? []).map((r) => (
                    <div key={r.label} className="rounded-lg border border-border/60 p-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{SOURCE_LABEL[r.label] ?? r.label}</span>
                        <span className="text-sm tabular-nums font-semibold">{num(r.orders).toLocaleString()} orders</span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, (num(r.orders) / Math.max(1, num(s.orders))) * 100)}%` }} />
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {num(r.units).toLocaleString()} units · {num(r.delivered).toLocaleString()} delivered · {fmtBdt(r.value ?? 0)}
                      </p>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>

            <Panel title="Money after delivery" subtitle="Courier থেকে কত collect হয়েছে, fee কেটে কত payout পাওয়া গেছে">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { label: "COD collected", value: num(money?.collected), hint: `${num(money?.settled_orders).toLocaleString()} reconciled orders` },
                  { label: "Courier fees", value: num(money?.fees), hint: "delivery + COD + return fee" },
                  { label: "Payout received", value: num(money?.payout), hint: "wallet-এ ঢুকেছে" },
                  { label: "Advance collected", value: num(s.advance_collected), hint: `${num(s.paid_orders).toLocaleString()} orders marked paid` },
                ].map((m) => (
                  <div key={m.label} className="rounded-xl border border-border/60 bg-card px-4 py-3">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{m.label}</p>
                    <p className="mt-0.5 font-display text-[20px] font-bold tabular-nums">{fmtBdt(m.value)}</p>
                    <p className="text-[11px] text-muted-foreground">{m.hint}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-xl border border-border/60">
                <Table>
                  <TableBody>
                    {[
                      ["Delivered revenue", num(s.delivered_revenue), ""],
                      ["− Product cost (COGS)", -num(s.cogs), "text-muted-foreground"],
                      ["= Gross profit", grossProfit, "font-semibold"],
                      ["− Courier (delivery)", -num(s.courier_cost), "text-muted-foreground"],
                      ["− Return loss (courier)", -num(s.return_courier_cost), "text-muted-foreground"],
                      ["− Marketing spend", -adSpend, "text-muted-foreground"],
                      ["= Net profit", netProfit, "font-bold"],
                    ].map(([label, val, cls]) => (
                      <TableRow key={String(label)}>
                        <TableCell className={cn("py-2 text-sm", cls as string)}>{label}</TableCell>
                        <TableCell className={cn(
                          "py-2 text-right text-sm tabular-nums",
                          cls as string,
                          Number(val) < 0 && String(label).startsWith("=") && "text-rose-600 dark:text-rose-400",
                          Number(val) >= 0 && String(label).startsWith("=") && "text-emerald-600 dark:text-emerald-400",
                        )}>
                          {fmtBdt(Number(val))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Panel>

            <Panel title="Daily orders vs delivered revenue">
              {chart.length === 0 ? (
                <EmptyState text="No daily data." />
              ) : (
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chart} margin={{ left: 4, right: 8 }}>
                      <defs>
                        <linearGradient id="p360rev" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="day" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                      <YAxis yAxisId="l" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                      <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                      <Tooltip
                        formatter={(v: number, n: string) => (n === "Revenue" ? [fmtBdt(v), n] : [Number(v).toLocaleString(), n])}
                        contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Area yAxisId="l" type="monotone" dataKey="revenue" name="Revenue" stroke="var(--primary)" fill="url(#p360rev)" strokeWidth={2} />
                      <Area yAxisId="r" type="monotone" dataKey="orders" name="Orders" stroke="var(--chart-2)" fill="transparent" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Panel>

            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title="District-wise orders" subtitle={`${districts.length} districts · top area highlighted`}>
                {districts.length === 0 ? (
                  <EmptyState text="No district data." />
                ) : (
                  <div className="max-h-[360px] space-y-2 overflow-auto pr-1">
                    {districts.slice(0, 25).map((r) => (
                      <div key={r.label} className="flex items-center gap-3">
                        <span className="w-32 shrink-0 truncate text-xs">{r.label}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary/80" style={{ width: `${(num(r.orders) / maxDistrict) * 100}%` }} />
                        </div>
                        <span className="w-10 shrink-0 text-right text-xs tabular-nums font-medium">{num(r.orders)}</span>
                        <span className="w-24 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                          {num(r.delivered)} del · {num(r.returned)} ret
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>

              <Panel title="Campaign results" subtitle={`Meta spend ${fmtBdt(adSpend)} · ROAS ${roas.toFixed(2)}x`}>
                {(d?.campaigns ?? []).length === 0 ? (
                  <EmptyState text="No attributed campaign spend in this range." />
                ) : (
                  <div className="max-h-[360px] overflow-auto rounded-lg border">
                    <Table>
                      <TableHeader className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
                        <TableRow>
                          <TableHead>Campaign</TableHead>
                          <TableHead className="text-right">Spend</TableHead>
                          <TableHead className="text-right">Delivered</TableHead>
                          <TableHead className="text-right">Revenue</TableHead>
                          <TableHead className="text-right">ROAS</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(d?.campaigns ?? []).map((c) => {
                          const r = num(c.ad_spend) > 0 ? num(c.revenue) / num(c.ad_spend) : 0;
                          return (
                            <TableRow key={c.campaign_id}>
                              <TableCell className="max-w-[220px] truncate text-xs font-medium">{c.campaign_name}</TableCell>
                              <TableCell className="text-right text-xs tabular-nums">{fmtBdt(c.ad_spend)}</TableCell>
                              <TableCell className="text-right text-xs tabular-nums text-muted-foreground">{num(c.delivered_orders)}</TableCell>
                              <TableCell className="text-right text-xs tabular-nums">{fmtBdt(c.revenue)}</TableCell>
                              <TableCell className={cn("text-right text-xs tabular-nums font-medium", r >= 2 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                                {r.toFixed(2)}x
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </Panel>
            </div>
          </>
        )
      )}
    </>
  );
}
