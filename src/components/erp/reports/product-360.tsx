import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Search, Package, X, AlertTriangle, CheckCircle2, TrendingUp, Layers } from "lucide-react";
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

type Summary = {
  orders: number; units_ordered: number; booked_value: number; discount: number; confirmed_orders: number;
  cancelled_orders: number; returned_orders: number; delivered_orders: number; open_orders: number;
  open_units: number; open_value: number; delivered_units: number; returned_units: number; returned_value: number;
  delivered_revenue: number; cogs: number; courier_cost: number; packaging_cost: number; return_courier_cost: number;
  units_no_cost: number; advance_collected: number; paid_orders: number; avg_days_to_deliver: number;
  delivery_rate: number; return_rate: number; cancel_rate: number;
};

type Prev = {
  orders: number; units_ordered: number; delivered_orders: number; delivered_units: number;
  delivered_revenue: number; cogs: number; courier_cost: number; packaging_cost: number;
  return_courier_cost: number; ad_spend: number; delivery_rate: number; return_rate: number;
};

type Product360 = {
  product: {
    id: string; title: string; sku: string | null; image: string | null; is_active: boolean;
    price: number; cost_price: number; wac: number; stock: number; available_stock: number; brand_name: string | null;
  } | null;
  range_days: number;
  prev_range: { from: string; to: string } | null;
  summary: Summary | null;
  prev: Prev | null;
  customers: { unique_customers: number; repeat_customers: number; repeat_rate: number } | null;
  health: {
    units_no_cost: number; delivered_no_courier_cost: number; delivered_unreconciled: number;
    unattributed_orders: number; total_orders: number;
  } | null;
  money: { collected: number; fees: number; payout: number; settled_orders: number } | null;
  ads: { ad_spend: number; attributed_orders: number } | null;
  variants: { label: string; sku: string; color_hex: string; units: number; delivered_units: number; returned_units: number; revenue: number; orders: number }[];
  by_status: Bucket[];
  by_source: Bucket[];
  by_district: Bucket[];
  daily: { day: string; orders: number; units: number; delivered_orders: number; returned_orders: number; cogs: number; revenue: number }[];
  campaigns: { campaign_id: string; campaign_name: string; ad_spend: number; orders: number; delivered_orders: number; revenue: number; cogs: number }[];
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

const num = (v: unknown) => Number(v ?? 0);
const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);

/** Small stat tile used across the deep-dive. */
function Stat({
  label, value, hint, tone, className,
}: { label: string; value: string; hint?: string; tone?: "good" | "bad" | "warn"; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border/60 bg-card px-3.5 py-2.5", className)}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 font-display text-[19px] font-bold tabular-nums tracking-tight",
          tone === "good" && "text-emerald-600 dark:text-emerald-400",
          tone === "bad" && "text-rose-600 dark:text-rose-400",
          tone === "warn" && "text-amber-600 dark:text-amber-400",
        )}
      >
        {value}
      </p>
      {hint && <p className="text-[11px] leading-tight text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Horizontal profit bridge — each step scaled against delivered revenue. */
function BridgeRow({
  label, amount, base, negative, bold,
}: { label: string; amount: number; base: number; negative?: boolean; bold?: boolean }) {
  const w = Math.min(100, Math.max(1.5, pct(Math.abs(amount), Math.max(1, base))));
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className={cn("w-44 shrink-0 text-xs", bold ? "font-semibold" : "text-muted-foreground")}>{label}</span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            bold ? (amount >= 0 ? "bg-emerald-500" : "bg-rose-500") : negative ? "bg-rose-400/70" : "bg-primary",
          )}
          style={{ width: `${w}%` }}
        />
      </div>
      <span
        className={cn(
          "w-32 shrink-0 text-right text-xs tabular-nums",
          bold ? "font-bold" : "text-muted-foreground",
          bold && amount >= 0 && "text-emerald-600 dark:text-emerald-400",
          bold && amount < 0 && "text-rose-600 dark:text-rose-400",
        )}
      >
        {negative ? `− ${fmtBdt(Math.abs(amount))}` : fmtBdt(amount)}
      </span>
    </div>
  );
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
  const p = d?.prev;
  const money = d?.money;
  const health = d?.health;
  const adSpend = num(d?.ads?.ad_spend);
  const days = Math.max(1, num(d?.range_days));

  // ---- canonical profit bridge -------------------------------------------
  const revenue = num(s?.delivered_revenue);
  const cogs = num(s?.cogs);
  const grossProfit = revenue - cogs;
  const courier = num(s?.courier_cost);
  const packaging = num(s?.packaging_cost);
  const returnCost = num(s?.return_courier_cost);
  const opsCost = courier + packaging + returnCost;
  const contribution = grossProfit - opsCost;
  const netProfit = contribution - adSpend;
  const marginPct = pct(netProfit, revenue);
  const grossMarginPct = pct(grossProfit, revenue);
  const roas = adSpend > 0 ? revenue / adSpend : 0;

  // previous-period equivalents (for delta chips)
  const prevRevenue = num(p?.delivered_revenue);
  const prevGross = prevRevenue - num(p?.cogs);
  const prevNet = prevGross - (num(p?.courier_cost) + num(p?.packaging_cost) + num(p?.return_courier_cost)) - num(p?.ad_spend);
  const hasPrev = !!p && (num(p.orders) > 0 || prevRevenue > 0);

  // unit economics per delivered unit
  const dUnits = Math.max(0, num(s?.delivered_units));
  const per = (v: number) => (dUnits > 0 ? v / dUnits : 0);
  const dOrders = Math.max(0, num(s?.delivered_orders));
  const aov = dOrders > 0 ? revenue / dOrders : 0;
  const cac = dOrders > 0 ? adSpend / dOrders : 0;
  const velocity = dUnits / days;
  const coverDays = velocity > 0 ? num(picked?.stock) / velocity : 0;
  const breakEvenUnits = per(revenue) - per(cogs) - per(opsCost) > 0
    ? adSpend / (per(revenue) - per(cogs) - per(opsCost))
    : 0;

  const kpis: Kpi[] = s
    ? [
        { label: "Orders placed", value: num(s.orders), kind: "number", prev: hasPrev ? num(p?.orders) : null,
          hint: `${num(s.units_ordered).toLocaleString()} units · booked ${fmtBdt(s.booked_value)}` },
        { label: "Delivered", value: num(s.delivered_orders), kind: "number", tone: "good", prev: hasPrev ? num(p?.delivered_orders) : null,
          hint: `${dUnits.toLocaleString()} units · ${num(s.delivery_rate).toFixed(1)}% delivery rate` },
        { label: "Delivered revenue", value: revenue, prev: hasPrev ? prevRevenue : null,
          hint: `AOV ${fmtBdt(aov)} · product lines only` },
        { label: "Product cost (COGS)", value: cogs, goodWhen: "down", prev: hasPrev ? num(p?.cogs) : null,
          hint: num(s.units_no_cost) > 0 ? `⚠ ${num(s.units_no_cost)} units missing cost` : "cost fully resolved" },
        { label: "Gross profit", value: grossProfit, tone: grossProfit >= 0 ? "good" : "bad", prev: hasPrev ? prevGross : null,
          hint: `${grossMarginPct.toFixed(1)}% gross margin` },
        { label: "Courier + return + pack", value: opsCost, tone: "bad", goodWhen: "down",
          hint: `delivery ${fmtBdt(courier)} · return ${fmtBdt(returnCost)}` },
        { label: "Marketing spend", value: adSpend, tone: "bad", goodWhen: "down", prev: hasPrev ? num(p?.ad_spend) : null,
          hint: `ROAS ${roas.toFixed(2)}x · CAC ${fmtBdt(cac)}` },
        { label: "Net profit", value: netProfit, tone: netProfit >= 0 ? "good" : "bad", prev: hasPrev ? prevNet : null,
          hint: `${marginPct.toFixed(1)}% net margin` },
      ]
    : [];

  const chart = useMemo(
    () => (d?.daily ?? []).map((r) => ({
      day: r.day.slice(5),
      orders: num(r.orders),
      revenue: num(r.revenue),
      profit: num(r.revenue) - num(r.cogs),
    })),
    [d?.daily],
  );

  const districts = d?.by_district ?? [];
  const maxDistrict = Math.max(1, ...districts.map((r) => num(r.orders)));
  const variants = (d?.variants ?? []).filter((v) => num(v.units) > 0);
  const showVariants = variants.length > 1;

  const healthItems = health
    ? [
        { label: "Units missing cost", value: num(health.units_no_cost), suffix: "units" },
        { label: "Delivered w/o courier cost", value: num(health.delivered_no_courier_cost), suffix: "orders" },
        { label: "Delivered not reconciled", value: num(health.delivered_unreconciled), suffix: "orders" },
        { label: "Orders without ad attribution", value: num(health.unattributed_orders), suffix: "orders" },
      ]
    : [];
  const healthClean = healthItems.every((h) => h.value === 0);

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
                  ["Metric", "Value", "Previous period"],
                  ["Orders placed", num(s.orders), num(p?.orders)],
                  ["Units ordered", num(s.units_ordered), num(p?.units_ordered)],
                  ["Confirmed orders", num(s.confirmed_orders), ""],
                  ["Cancelled orders", num(s.cancelled_orders), ""],
                  ["Delivered orders", num(s.delivered_orders), num(p?.delivered_orders)],
                  ["Delivered units", dUnits, num(p?.delivered_units)],
                  ["Returned orders", num(s.returned_orders), ""],
                  ["Returned units", num(s.returned_units), ""],
                  ["Delivery rate %", num(s.delivery_rate), num(p?.delivery_rate)],
                  ["Return rate %", num(s.return_rate), num(p?.return_rate)],
                  ["Avg days to deliver", num(s.avg_days_to_deliver), ""],
                  [],
                  ["Profit bridge", "Amount"],
                  ["Delivered revenue", revenue],
                  ["Discount given", -num(s.discount)],
                  ["COGS", -cogs],
                  ["Gross profit", grossProfit],
                  ["Courier (delivery)", -courier],
                  ["Packaging", -packaging],
                  ["Return courier loss", -returnCost],
                  ["Contribution profit", contribution],
                  ["Marketing spend", -adSpend],
                  ["Net profit", netProfit],
                  ["Net margin %", Number(marginPct.toFixed(2))],
                  ["ROAS", Number(roas.toFixed(2))],
                  [],
                  ["Per delivered unit", "Amount"],
                  ["Revenue / unit", per(revenue)],
                  ["Cost / unit", per(cogs)],
                  ["Courier+pack / unit", per(courier + packaging)],
                  ["Ad spend / unit", per(adSpend)],
                  ["Net profit / unit", per(netProfit)],
                  [],
                  ["Money after delivery", "Amount"],
                  ["Courier collected", num(money?.collected)],
                  ["Courier fees", num(money?.fees)],
                  ["Courier payout received", num(money?.payout)],
                  ["Advance collected", num(s.advance_collected)],
                  [],
                  ["Pipeline", "Value"],
                  ["Open orders", num(s.open_orders)],
                  ["Open units", num(s.open_units)],
                  ["Open booked value", num(s.open_value)],
                  [],
                  ["Data health", "Count"],
                  ...healthItems.map((h) => [h.label, h.value]),
                  [],
                  ...(showVariants
                    ? [
                        ["Variant", "Orders", "Units", "Delivered", "Returned", "Revenue"],
                        ...variants.map((v) => [v.label, num(v.orders), num(v.units), num(v.delivered_units), num(v.returned_units), num(v.revenue)]),
                        [],
                      ]
                    : []),
                  ["Channel", "Orders", "Units", "Delivered", "Value"],
                  ...(d?.by_source ?? []).map((r) => [SOURCE_LABEL[r.label] ?? r.label, num(r.orders), num(r.units), num(r.delivered), num(r.value)]),
                  [],
                  ["Status", "Orders", "Units", "Value"],
                  ...(d?.by_status ?? []).map((r) => [r.label, num(r.orders), num(r.units), num(r.value)]),
                  [],
                  ["District", "Orders", "Delivered", "Returned", "Return rate %", "Revenue"],
                  ...districts.map((r) => [
                    r.label, num(r.orders), num(r.delivered), num(r.returned),
                    Number(pct(num(r.returned), Math.max(1, num(r.delivered) + num(r.returned))).toFixed(1)),
                    num(r.revenue),
                  ]),
                  [],
                  ["Campaign", "Ad spend", "Orders", "Delivered", "Revenue", "Gross profit", "ROAS"],
                  ...(d?.campaigns ?? []).map((r) => [
                    r.campaign_name, num(r.ad_spend), num(r.orders), num(r.delivered_orders), num(r.revenue),
                    num(r.revenue) - num(r.cogs),
                    Number((num(r.ad_spend) > 0 ? num(r.revenue) / num(r.ad_spend) : 0).toFixed(2)),
                  ]),
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
            {/* Data health — trust indicator before any number is read */}
            <div
              className={cn(
                "flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border px-4 py-2.5 text-xs",
                healthClean
                  ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
                  : "border-amber-500/30 bg-amber-500/5",
              )}
            >
              {healthClean ? (
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Data clean — সব number সম্পূর্ণ ভরসাযোগ্য
                </span>
              ) : (
                <>
                  <span className="inline-flex items-center gap-1.5 font-semibold text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5" /> Data health
                  </span>
                  {healthItems.map((h) => (
                    <span key={h.label} className={cn("tabular-nums", h.value === 0 ? "text-muted-foreground" : "font-medium")}>
                      {h.label}: <span className={h.value === 0 ? "" : "text-amber-700 dark:text-amber-400"}>{h.value.toLocaleString()}</span> {h.suffix}
                    </span>
                  ))}
                </>
              )}
              {hasPrev && d?.prev_range && (
                <span className="ml-auto text-[11px] text-muted-foreground">
                  Compared with {d.prev_range.from} → {d.prev_range.to}
                </span>
              )}
            </div>

            <KpiStrip items={kpis} />

            {/* Unit economics — the sharpest view of whether the product works */}
            <Panel title="Unit economics" subtitle="প্রতি delivered unit-এ আসল হিসাব">
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <Stat label="Revenue / unit" value={fmtBdt(per(revenue))} hint={`${dUnits.toLocaleString()} delivered units`} />
                <Stat label="Cost / unit" value={fmtBdt(per(cogs))} hint="COGS (WAC fallback)" />
                <Stat label="Courier + pack / unit" value={fmtBdt(per(courier + packaging))} hint={`return loss ${fmtBdt(per(returnCost))}`} />
                <Stat label="Ad spend / unit" value={fmtBdt(per(adSpend))} hint={`CAC ${fmtBdt(cac)} / delivered order`} />
                <Stat
                  label="Profit / unit"
                  value={fmtBdt(per(netProfit))}
                  tone={per(netProfit) >= 0 ? "good" : "bad"}
                  hint={`${marginPct.toFixed(1)}% net margin`}
                />
                <Stat
                  label="Break-even units"
                  value={breakEvenUnits > 0 ? Math.ceil(breakEvenUnits).toLocaleString() : "—"}
                  tone={breakEvenUnits > 0 && dUnits >= breakEvenUnits ? "good" : "warn"}
                  hint={breakEvenUnits > 0 ? `ad খরচ তুলতে দরকার · আছে ${dUnits.toLocaleString()}` : "contribution ≤ 0"}
                />
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label="Sales velocity" value={`${velocity.toFixed(1)} /day`} hint={`${days} দিনের গড়`} />
                <Stat
                  label="Stock cover"
                  value={coverDays > 0 ? `${Math.round(coverDays)} days` : "—"}
                  tone={coverDays > 0 && coverDays < 14 ? "warn" : undefined}
                  hint={`stock ${num(picked.stock).toLocaleString()} pcs`}
                />
                <Stat label="Avg delivery time" value={`${num(s.avg_days_to_deliver).toFixed(1)} days`} hint="order → delivered" />
                <Stat
                  label="Repeat buyers"
                  value={`${num(d?.customers?.repeat_customers).toLocaleString()}`}
                  hint={`${num(d?.customers?.unique_customers).toLocaleString()} unique · ${num(d?.customers?.repeat_rate).toFixed(1)}% repeat`}
                />
              </div>
            </Panel>

            {/* Profit bridge */}
            <Panel title="Profit bridge" subtitle="Revenue থেকে net profit পর্যন্ত প্রতিটা কাটা">
              <div className="divide-y divide-border/50">
                <BridgeRow label="Delivered revenue" amount={revenue} base={revenue} bold />
                <BridgeRow label="Product cost (COGS)" amount={cogs} base={revenue} negative />
                <BridgeRow label="Gross profit" amount={grossProfit} base={revenue} bold />
                <BridgeRow label="Courier (delivery)" amount={courier} base={revenue} negative />
                {packaging > 0 && <BridgeRow label="Packaging" amount={packaging} base={revenue} negative />}
                <BridgeRow label="Return courier loss" amount={returnCost} base={revenue} negative />
                <BridgeRow label="Contribution profit" amount={contribution} base={revenue} bold />
                <BridgeRow label="Marketing spend" amount={adSpend} base={revenue} negative />
                <BridgeRow label="Net profit" amount={netProfit} base={revenue} bold />
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">
                Discount ইতিমধ্যে line total-এ ধরা · এই range-এ allocated discount {fmtBdt(num(s.discount))} · ROAS {roas.toFixed(2)}x
              </p>
            </Panel>

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
                          style={{ width: `${Math.max(2, pct(num(r.orders), Math.max(1, num(s.orders))))}%` }}
                        />
                      </div>
                      <span className="w-14 shrink-0 text-right text-xs tabular-nums font-medium">{num(r.orders)}</span>
                      <span className="w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{fmtBdt(r.value ?? 0)}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Stat label="Confirmed" value={num(s.confirmed_orders).toLocaleString()} hint={`${(100 - num(s.cancel_rate)).toFixed(0)}% of placed`} />
                  <Stat label="Cancelled" value={num(s.cancelled_orders).toLocaleString()} hint={`${num(s.cancel_rate).toFixed(1)}% cancel rate`} />
                  <Stat
                    label="Returned"
                    value={num(s.returned_orders).toLocaleString()}
                    tone={num(s.return_rate) > 15 ? "bad" : undefined}
                    hint={`${num(s.return_rate).toFixed(1)}% · ${fmtBdt(s.returned_value)} lost`}
                  />
                  <Stat
                    label="In pipeline"
                    value={num(s.open_orders).toLocaleString()}
                    hint={`${num(s.open_units).toLocaleString()} units · ${fmtBdt(s.open_value)}`}
                  />
                </div>
                {num(s.open_orders) > 0 && (
                  <p className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-muted/50 px-2.5 py-1.5 text-[11px] text-muted-foreground">
                    <TrendingUp className="h-3.5 w-3.5" />
                    Pipeline delivered হলে আরও ≈ {fmtBdt(num(s.open_value) * (num(s.delivery_rate) / 100))} revenue আসতে পারে
                    (current {num(s.delivery_rate).toFixed(0)}% delivery rate ধরে)
                  </p>
                )}
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
                        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, pct(num(r.orders), Math.max(1, num(s.orders))))}%` }} />
                      </div>
                      <p className="mt-1 flex flex-wrap gap-x-2 text-[11px] text-muted-foreground">
                        <span>{num(r.units).toLocaleString()} units</span>
                        <span>· {num(r.delivered).toLocaleString()} delivered ({pct(num(r.delivered), Math.max(1, num(r.orders))).toFixed(0)}%)</span>
                        {num(r.returned) > 0 && <span className="text-rose-600 dark:text-rose-400">· {num(r.returned)} returned</span>}
                        <span>· {fmtBdt(r.revenue ?? 0)} delivered value</span>
                      </p>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>

            {showVariants && (
              <Panel title="Variant performance" subtitle={`${variants.length} variants · কোনটা বেশি চলছে`}>
                <div className="overflow-auto rounded-lg border">
                  <Table>
                    <TableHeader className="bg-muted/60">
                      <TableRow>
                        <TableHead>Variant</TableHead>
                        <TableHead className="text-right">Orders</TableHead>
                        <TableHead className="text-right">Units</TableHead>
                        <TableHead className="text-right">Delivered</TableHead>
                        <TableHead className="text-right">Returned</TableHead>
                        <TableHead className="text-right">Return %</TableHead>
                        <TableHead className="text-right">Revenue</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {variants.map((v) => {
                        const rr = pct(num(v.returned_units), Math.max(1, num(v.delivered_units) + num(v.returned_units)));
                        return (
                          <TableRow key={`${v.label}-${v.sku}`}>
                            <TableCell className="text-xs font-medium">
                              <span className="inline-flex items-center gap-2">
                                {v.color_hex && (
                                  <span className="h-3 w-3 rounded-full border border-border/60" style={{ background: v.color_hex }} />
                                )}
                                <span>{v.label}</span>
                                {v.sku && <span className="font-mono text-[10px] text-muted-foreground">{v.sku}</span>}
                              </span>
                            </TableCell>
                            <TableCell className="text-right text-xs tabular-nums">{num(v.orders)}</TableCell>
                            <TableCell className="text-right text-xs tabular-nums font-medium">{num(v.units)}</TableCell>
                            <TableCell className="text-right text-xs tabular-nums text-emerald-600 dark:text-emerald-400">{num(v.delivered_units)}</TableCell>
                            <TableCell className="text-right text-xs tabular-nums text-rose-600 dark:text-rose-400">{num(v.returned_units)}</TableCell>
                            <TableCell className={cn("text-right text-xs tabular-nums", rr > 15 && "text-rose-600 dark:text-rose-400 font-medium")}>
                              {rr.toFixed(1)}%
                            </TableCell>
                            <TableCell className="text-right text-xs tabular-nums">{fmtBdt(v.revenue)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </Panel>
            )}

            <Panel title="Money after delivery" subtitle="Courier থেকে কত collect হয়েছে, fee কেটে কত payout পাওয়া গেছে">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label="COD collected" value={fmtBdt(num(money?.collected))} hint={`${num(money?.settled_orders).toLocaleString()} reconciled orders`} />
                <Stat label="Courier fees" value={fmtBdt(num(money?.fees))} tone="bad" hint="delivery + COD + return fee" />
                <Stat label="Payout received" value={fmtBdt(num(money?.payout))} tone="good" hint="wallet-এ ঢুকেছে" />
                <Stat label="Advance collected" value={fmtBdt(num(s.advance_collected))} hint={`${num(s.paid_orders).toLocaleString()} orders marked paid`} />
              </div>
              {num(health?.delivered_unreconciled) > 0 && (
                <p className="mt-3 text-[11px] text-amber-600 dark:text-amber-400">
                  ⚠ {num(health?.delivered_unreconciled)} delivered order এখনো reconcile হয়নি — payout সংখ্যা বাড়বে।
                </p>
              )}
            </Panel>

            <Panel title="Daily trend" subtitle="Orders · delivered revenue · gross profit">
              {chart.length === 0 ? (
                <EmptyState text="No daily data." />
              ) : (
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chart} margin={{ left: 4, right: 8 }}>
                      <defs>
                        <linearGradient id="p360rev" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="p360profit" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--chart-3)" stopOpacity={0.28} />
                          <stop offset="100%" stopColor="var(--chart-3)" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="day" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                      <YAxis yAxisId="l" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                      <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                      <Tooltip
                        formatter={(v: number, n: string) => (n === "Orders" ? [Number(v).toLocaleString(), n] : [fmtBdt(v), n])}
                        contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Area yAxisId="l" type="monotone" dataKey="revenue" name="Revenue" stroke="var(--primary)" fill="url(#p360rev)" strokeWidth={2} />
                      <Area yAxisId="l" type="monotone" dataKey="profit" name="Gross profit" stroke="var(--chart-3)" fill="url(#p360profit)" strokeWidth={2} />
                      <Area yAxisId="r" type="monotone" dataKey="orders" name="Orders" stroke="var(--chart-2)" fill="transparent" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Panel>

            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title="District-wise performance" subtitle={`${districts.length} districts · return rate সহ`}>
                {districts.length === 0 ? (
                  <EmptyState text="No district data." />
                ) : (
                  <div className="max-h-[380px] space-y-1.5 overflow-auto pr-1">
                    {districts.slice(0, 30).map((r) => {
                      const rr = pct(num(r.returned), Math.max(1, num(r.delivered) + num(r.returned)));
                      return (
                        <div key={r.label} className="flex items-center gap-3">
                          <span className="w-28 shrink-0 truncate text-xs">{r.label}</span>
                          <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-muted">
                            <div className="h-full bg-emerald-500" style={{ width: `${pct(num(r.delivered), maxDistrict)}%` }} />
                            <div className="h-full bg-rose-500" style={{ width: `${pct(num(r.returned), maxDistrict)}%` }} />
                            <div className="h-full bg-primary/25" style={{ width: `${pct(Math.max(0, num(r.orders) - num(r.delivered) - num(r.returned)), maxDistrict)}%` }} />
                          </div>
                          <span className="w-10 shrink-0 text-right text-xs tabular-nums font-medium">{num(r.orders)}</span>
                          <span className={cn("w-12 shrink-0 text-right text-[11px] tabular-nums", rr > 20 ? "text-rose-600 dark:text-rose-400 font-medium" : "text-muted-foreground")}>
                            {rr.toFixed(0)}%
                          </span>
                          <span className="w-24 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">{fmtBdt(r.revenue ?? 0)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                <p className="mt-3 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" />Delivered</span>
                  <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-500" />Returned</span>
                  <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary/25" />In pipeline</span>
                  <span className="ml-auto">% = return rate</span>
                </p>
              </Panel>

              <Panel title="Campaign results" subtitle={`Meta spend ${fmtBdt(adSpend)} · ROAS ${roas.toFixed(2)}x`}>
                {(d?.campaigns ?? []).length === 0 ? (
                  <EmptyState text="No attributed campaign spend in this range." />
                ) : (
                  <div className="max-h-[380px] overflow-auto rounded-lg border">
                    <Table>
                      <TableHeader className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
                        <TableRow>
                          <TableHead>Campaign</TableHead>
                          <TableHead className="text-right">Spend</TableHead>
                          <TableHead className="text-right">Del.</TableHead>
                          <TableHead className="text-right">Revenue</TableHead>
                          <TableHead className="text-right">Profit</TableHead>
                          <TableHead className="text-right">ROAS</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(d?.campaigns ?? []).map((c) => {
                          const r = num(c.ad_spend) > 0 ? num(c.revenue) / num(c.ad_spend) : 0;
                          const profit = num(c.revenue) - num(c.cogs) - num(c.ad_spend);
                          return (
                            <TableRow key={c.campaign_id}>
                              <TableCell className="max-w-[200px] truncate text-xs font-medium" title={c.campaign_name}>{c.campaign_name}</TableCell>
                              <TableCell className="text-right text-xs tabular-nums">{fmtBdt(c.ad_spend)}</TableCell>
                              <TableCell className="text-right text-xs tabular-nums text-muted-foreground">{num(c.delivered_orders)}</TableCell>
                              <TableCell className="text-right text-xs tabular-nums">{fmtBdt(c.revenue)}</TableCell>
                              <TableCell className={cn("text-right text-xs tabular-nums", profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                                {fmtBdt(profit)}
                              </TableCell>
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
                <p className="mt-2 inline-flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <Layers className="h-3 w-3" /> Profit = delivered revenue − COGS − এই campaign-এ allocated spend
                </p>
              </Panel>
            </div>
          </>
        )
      )}
    </>
  );
}
