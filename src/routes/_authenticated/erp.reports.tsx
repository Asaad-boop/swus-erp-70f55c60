import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart, Area, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { FileSpreadsheet, AlertTriangle, RefreshCw, Search, GitCompareArrows } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMultiBrandPicker } from "@/components/erp/brand-picker-gate";
import { DateRangePicker, buildPreset, type MktRangeValue } from "@/components/erp/marketing/date-range-picker";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { fmtBdt } from "@/lib/erp/finance";
import { exportAoaXlsx } from "@/lib/erp/utils/excel";
import {
  Panel, KpiStrip, EmptyState, ExportMenu, REPORT_QUERY_OPTS, type Kpi,
} from "@/components/erp/reports/report-kit";
import { CustomersTab } from "@/components/erp/reports/customers-tab";
import { InventoryTab } from "@/components/erp/reports/inventory-tab";
import { MarketingTab } from "@/components/erp/reports/marketing-tab";
import { ReturnsTab } from "@/components/erp/reports/returns-tab";
import { SupplyTab } from "@/components/erp/reports/supply-tab";
import { FinanceTab } from "@/components/erp/reports/finance-tab";
import { OrderLedgerPanel } from "@/components/erp/reports/order-ledger";
import { ControlTab } from "@/components/erp/reports/control-tab";
import { AdsPanel } from "@/components/erp/reports/marketing-extras";
import { CourierPerformancePanel, DeliveryAreaPanel } from "@/components/erp/reports/delivery-extras";
import { ReportIndexDrawer } from "@/components/erp/reports/report-index-drawer";
import { Product360Panel } from "@/components/erp/reports/product-360";


const TAB_VALUES = [
  "overview", "sales", "orders", "products", "customers",
  "inventory", "marketing", "returns", "supply", "finance", "control",
] as const;
type TabValue = (typeof TAB_VALUES)[number];

export const Route = createFileRoute("/_authenticated/erp/reports")({
  validateSearch: (search: Record<string, unknown>): { tab?: TabValue } => {
    const t = String(search.tab ?? "");
    return TAB_VALUES.includes(t as TabValue) ? { tab: t as TabValue } : {};
  },
  head: () => ({
    meta: [
      { title: "Reports Hub — ERP" },
      { name: "description", content: "Accurate sales, profit and operations reporting across all brands." },
    ],
  }),
  component: ReportsHub,
});

type Basis = "delivered" | "created" | "confirmed";

type Summary = {
  orders_placed: number; open_orders: number; delivered_orders: number;
  returned_orders: number; cancelled_orders: number; units_sold: number;
  gross_sales: number; discounts: number; net_revenue: number;
  shipping_income: number; total_revenue: number; cogs: number;
  gross_profit: number; courier_cost: number; packaging_cost: number; refunds: number;
  returned_value: number; return_courier_cost: number; contribution_profit: number;
  aov: number; delivery_rate: number; return_rate: number; cancel_rate: number;
  cost_missing_units: number;
};

type Health = {
  delivered_lines: number; cost_missing_units: number; cost_missing_products: number;
  orders_without_courier_cost: number; orders_without_delivered_at: number; unmatched_recon_rows: number;
};

type SeriesRow = {
  day: string; orders: number; delivered_orders: number; units: number;
  net_revenue: number; cogs: number; gross_profit: number; courier_cost: number; contribution_profit: number;
};

type BreakdownRow = {
  label: string; orders: number; delivered_orders: number; units: number;
  net_revenue: number; cogs: number; gross_profit: number; courier_cost: number; return_rate: number;
};

type Funnel = {
  placed: number; confirmed: number; shipped: number; delivered: number;
  returned: number; cancelled: number; open_orders: number;
  delivered_value: number; placed_value: number; aov: number;
  confirm_rate: number; delivery_rate: number; return_rate: number; cancel_rate: number;
  hours_to_confirm: number; hours_to_ship: number; hours_to_deliver: number;
};

type OpsRow = {
  label: string; placed: number; confirmed: number; delivered: number; returned: number;
  cancelled: number; delivery_rate: number; return_rate: number; cancel_rate: number;
  delivered_value: number; aov: number;
};

type ProductRow = {
  product_id: string; variant_id: string | null; product_name: string; variant_label: string | null;
  sku: string | null; orders: number; units: number; gross_sales: number; discounts: number;
  net_revenue: number; cogs: number; gross_profit: number; margin_pct: number; courier_cost: number;
  contribution_profit: number; avg_price: number; avg_cost: number; returned_units: number;
  return_rate: number; cost_missing_units: number;
};

const BASIS_LABEL: Record<Basis, string> = {
  delivered: "Delivery date",
  created: "Order date",
  confirmed: "Confirm date",
};

/** Immediately-preceding window of the same length (inclusive dates). */
function prevPeriod(from: string, to: string) {
  const f = new Date(`${from}T00:00:00Z`);
  const t = new Date(`${to}T00:00:00Z`);
  const days = Math.max(1, Math.round((t.getTime() - f.getTime()) / 86400000) + 1);
  const pTo = new Date(f.getTime() - 86400000);
  const pFrom = new Date(pTo.getTime() - (days - 1) * 86400000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(pFrom), to: iso(pTo) };
}

function ReportsHub() {
  const { brandIds, picker } = useMultiBrandPicker();
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [range, setRange] = useState<MktRangeValue>(() => buildPreset("30d"));
  const [basis, setBasis] = useState<Basis>("delivered");
  const [compare, setCompare] = useState(false);

  const enabled = brandIds.length > 0;
  const args = { _brand_ids: brandIds, _from: range.from, _to: range.to, _basis: basis };
  const key = [brandIds.join(","), range.from, range.to, basis];
  const rangeLabel = `${range.from} → ${range.to} · ${BASIS_LABEL[basis]}`;
  const prevRange = useMemo(() => prevPeriod(range.from, range.to), [range.from, range.to]);

  // One round trip for summary + health + trend (was 3 separate RPCs).
  const overviewQ = useQuery({
    queryKey: ["rpt-overview", ...key],
    enabled,
    ...REPORT_QUERY_OPTS,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpt_overview", args as never);
      if (error) throw error;
      const d = (data ?? {}) as any;
      return {
        summary: d.summary as Summary,
        health: d.health as Health,
        series: (d.series ?? []) as SeriesRow[],
      };
    },
  });

  const prevQ = useQuery({
    queryKey: ["rpt-summary-prev", brandIds.join(","), prevRange.from, prevRange.to, basis],
    enabled: enabled && compare,
    ...REPORT_QUERY_OPTS,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpt_sales_summary", {
        _brand_ids: brandIds, _from: prevRange.from, _to: prevRange.to, _basis: basis,
      } as never);
      if (error) throw error;
      return data as unknown as Summary;
    },
  });

  const s = overviewQ.data?.summary;
  const series = overviewQ.data?.series ?? [];
  const prev = compare ? prevQ.data : undefined;
  const pv = (fn: (x: Summary) => number) => (prev ? Number(fn(prev)) : undefined);

  const kpis: Kpi[] = s
    ? [
        { label: "Total revenue", value: s.total_revenue ?? s.net_revenue, prev: pv((x) => x.total_revenue ?? x.net_revenue), hint: `${s.delivered_orders} delivered orders · incl. delivery charge` },
        { label: "Gross profit", value: s.gross_profit, prev: pv((x) => x.gross_profit), tone: s.gross_profit >= 0 ? "good" : "bad", hint: s.net_revenue > 0 ? `${((s.gross_profit / s.net_revenue) * 100).toFixed(1)}% margin` : undefined },
        { label: "Contribution profit", value: s.contribution_profit, prev: pv((x) => x.contribution_profit), tone: s.contribution_profit >= 0 ? "good" : "bad", hint: "after courier, packaging, returns" },
        { label: "COGS", value: s.cogs, prev: pv((x) => x.cogs), goodWhen: "down" },
        { label: "Units sold", value: s.units_sold, kind: "number", prev: pv((x) => x.units_sold) },
        { label: "AOV", value: s.aov, prev: pv((x) => x.aov) },
        { label: "Delivery rate", value: s.delivery_rate, kind: "percent", prev: pv((x) => x.delivery_rate), hint: "orders placed in range" },
        { label: "Return rate", value: s.return_rate, kind: "percent", prev: pv((x) => x.return_rate), goodWhen: "down", tone: s.return_rate > 15 ? "bad" : "default" },
      ]
    : [];

  return (
    <div className="space-y-5 pb-8">
      <header className="sticky top-0 z-30 -mb-1 border-b border-border/60 bg-background/85 px-4 py-3 backdrop-blur-xl md:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">
            Reports<span className="text-primary">.</span>
          </h1>
          <p className="text-xs text-muted-foreground md:text-sm">
            All numbers come from one accounting source — Dhaka time, {BASIS_LABEL[basis].toLowerCase()} basis.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {picker}
          <ReportIndexDrawer onOpenTab={(t) => navigate({ search: { tab: t as TabValue }, replace: true })} />
          <DateRangePicker value={range} onChange={setRange} />
          <Select value={basis} onValueChange={(v) => setBasis(v as Basis)}>
            <SelectTrigger className="h-9 w-[150px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="delivered">Delivery date</SelectItem>
              <SelectItem value="created">Order date</SelectItem>
              <SelectItem value="confirmed">Confirm date</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant={compare ? "default" : "outline"}
            size="sm"
            className="h-9"
            onClick={() => setCompare((v) => !v)}
            title={`Compare with ${prevRange.from} → ${prevRange.to}`}
          >
            <GitCompareArrows className="mr-1.5 h-3.5 w-3.5" />
            Compare
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={() => { overviewQ.refetch(); prevQ.refetch(); }}
            aria-label="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${overviewQ.isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
        </div>
      </header>

      <div className="space-y-5 px-4 md:px-6">
      {!enabled ? (
        <Panel><EmptyState text="Pick at least one brand to see reports." /></Panel>
      ) : (
        <>
          <DataHealth data={overviewQ.data?.health} loading={overviewQ.isLoading} />

          <Tabs
            value={tab ?? "overview"}
            onValueChange={(v) => navigate({ search: { tab: v as TabValue }, replace: true })}
          >
            <div className="sticky top-[68px] z-20 -mx-1 overflow-x-auto px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <TabsList className="h-auto w-max gap-1 rounded-full border border-border/60 bg-card/80 p-1 shadow-sm backdrop-blur-xl">
                {[
                  ["overview", "Overview"], ["sales", "Sales"], ["orders", "Orders"],
                  ["products", "Products"], ["customers", "Customers"], ["inventory", "Inventory"],
                  ["marketing", "Marketing"], ["returns", "Returns"], ["supply", "Supply chain"],
                  ["finance", "Finance"], ["control", "Control"],
                ].map(([v, label]) => (
                  <TabsTrigger
                    key={v}
                    value={v}
                    className="rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
                  >
                    {label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <TabsContent value="overview" className="mt-4 space-y-4">
              {compare && (
                <p className="text-xs text-muted-foreground">
                  Comparing against previous period: <span className="font-medium">{prevRange.from} → {prevRange.to}</span>
                  {prevQ.isLoading ? " (loading…)" : ""}
                </p>
              )}
              <KpiStrip items={kpis} loading={overviewQ.isLoading} />
              <TrendPanel rows={series} loading={overviewQ.isLoading} rangeLabel={rangeLabel} kpis={kpis} />
              {s && <ProfitBridge s={s} />}
            </TabsContent>

            <TabsContent value="sales" className="mt-4 space-y-4">
              <TrendPanel rows={series} loading={overviewQ.isLoading} showTable rangeLabel={rangeLabel} kpis={kpis} />
              <BreakdownPanel args={args} enabled={enabled} />
            </TabsContent>

            <TabsContent value="orders" className="mt-4 space-y-4">
              <OrdersTab args={args} enabled={enabled} />
            </TabsContent>

            <TabsContent value="products" className="mt-4 space-y-4">
              <ProductsTab args={args} enabled={enabled} rangeLabel={rangeLabel} />
            </TabsContent>


            <TabsContent value="customers" className="mt-4 space-y-4">
              <CustomersTab args={args} enabled={enabled} />
            </TabsContent>

            <TabsContent value="inventory" className="mt-4 space-y-4">
              <InventoryTab args={args} enabled={enabled} />
            </TabsContent>

            <TabsContent value="marketing" className="mt-4 space-y-4">
              <MarketingTab args={args} enabled={enabled} />
              <AdsPanel args={args} enabled={enabled} rangeLabel={rangeLabel} />
            </TabsContent>

            <TabsContent value="returns" className="mt-4 space-y-4">
              <ReturnsTab args={args} enabled={enabled} />
              <CourierPerformancePanel args={args} enabled={enabled} rangeLabel={rangeLabel} />
              <DeliveryAreaPanel args={args} enabled={enabled} rangeLabel={rangeLabel} />
            </TabsContent>

            <TabsContent value="supply" className="mt-4 space-y-4">
              <SupplyTab args={args} enabled={enabled} />
            </TabsContent>

            <TabsContent value="finance" className="mt-4 space-y-4">
              <FinanceTab args={args} enabled={enabled} />
            </TabsContent>

            <TabsContent value="control" className="mt-4 space-y-4">
              <ControlTab args={args} enabled={enabled} />
            </TabsContent>
          </Tabs>
        </>
      )}
      </div>
    </div>
  );
}

function DataHealth({ data, loading }: { data?: Health; loading?: boolean }) {
  if (loading) return <Skeleton className="h-11 rounded-xl" />;
  if (!data) return null;
  const issues: string[] = [];
  if (Number(data.cost_missing_units) > 0)
    issues.push(`${data.cost_missing_units} units without cost (${data.cost_missing_products} products)`);
  if (Number(data.orders_without_courier_cost) > 0)
    issues.push(`${data.orders_without_courier_cost} delivered orders without reconciled courier charge`);
  if (Number(data.orders_without_delivered_at) > 0)
    issues.push(`${data.orders_without_delivered_at} delivered orders missing delivery date`);
  if (Number(data.unmatched_recon_rows) > 0)
    issues.push(`${data.unmatched_recon_rows} unmatched reconciliation rows`);

  if (issues.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-2.5 text-sm">
        <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400">Data health OK</Badge>
        <span className="text-muted-foreground">All delivered lines have cost and reconciled courier charges.</span>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 text-sm">
      <AlertTriangle className="h-4 w-4 text-amber-500" />
      <span className="font-medium">Data health</span>
      {issues.map((i) => (
        <Badge key={i} variant="outline" className="border-amber-500/40 font-normal">{i}</Badge>
      ))}
    </div>
  );
}

type Grain = "day" | "week" | "month";

/** Roll a daily series up to week (Saturday start, Dhaka) or month buckets. */
function rollup(rows: SeriesRow[], grain: Grain): SeriesRow[] {
  if (grain === "day") return rows;
  const bucketOf = (day: string) => {
    if (grain === "month") return `${day.slice(0, 7)}-01`;
    const d = new Date(`${day}T00:00:00Z`);
    const back = (d.getUTCDay() + 1) % 7; // Saturday = week start
    d.setUTCDate(d.getUTCDate() - back);
    return d.toISOString().slice(0, 10);
  };
  const map = new Map<string, SeriesRow>();
  for (const r of rows) {
    const b = bucketOf(r.day);
    const cur = map.get(b) ?? {
      day: b, orders: 0, delivered_orders: 0, units: 0,
      net_revenue: 0, cogs: 0, gross_profit: 0, courier_cost: 0, contribution_profit: 0,
    };
    cur.orders += Number(r.orders) || 0;
    cur.delivered_orders += Number(r.delivered_orders) || 0;
    cur.units += Number(r.units) || 0;
    cur.net_revenue += Number(r.net_revenue) || 0;
    cur.cogs += Number(r.cogs) || 0;
    cur.gross_profit += Number(r.gross_profit) || 0;
    cur.courier_cost += Number(r.courier_cost) || 0;
    cur.contribution_profit += Number(r.contribution_profit) || 0;
    map.set(b, cur);
  }
  return Array.from(map.values()).sort((a, b) => a.day.localeCompare(b.day));
}

function TrendPanel({
  rows: rawRows, loading, showTable, rangeLabel, kpis,
}: { rows: SeriesRow[]; loading?: boolean; showTable?: boolean; rangeLabel?: string; kpis?: Kpi[] }) {
  const [grain, setGrain] = useState<Grain>("day");
  const rows = useMemo(() => rollup(rawRows, grain), [rawRows, grain]);
  const grainLabel = grain === "day" ? "Daily" : grain === "week" ? "Weekly" : "Monthly";
  const data = useMemo(
    () => rows.map((r) => ({
      ...r,
      net_revenue: Number(r.net_revenue),
      gross_profit: Number(r.gross_profit),
      contribution_profit: Number(r.contribution_profit),
      label: grain === "month" ? r.day.slice(0, 7) : r.day.slice(5),
    })),
    [rows, grain],
  );

  return (
    <Panel
      title={`${grainLabel} revenue & profit`}
      subtitle={grain === "week" ? "Delivered lines only · weeks start Saturday (Dhaka)" : "Delivered lines only"}
      action={
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-full border border-border/60 bg-muted/40 p-0.5">
            {(["day", "week", "month"] as Grain[]).map((g) => (
              <Button
                key={g}
                size="sm"
                variant={grain === g ? "default" : "ghost"}
                className="h-7 rounded-full px-3 text-xs capitalize"
                onClick={() => setGrain(g)}
              >
                {g}
              </Button>
            ))}
          </div>
          <ExportMenu
            title={`${grainLabel} revenue & profit`}
            subtitle="Delivered lines only"
            rangeLabel={rangeLabel}
            kpis={kpis}
            filename={`${grain}-sales`}
            disabled={rows.length === 0}
            aoa={() => [
              [grain === "day" ? "Day" : grain === "week" ? "Week starting" : "Month", "Orders", "Delivered", "Units", "Net revenue", "COGS", "Gross profit", "Courier", "Contribution"],
              ...rows.map((r) => [grain === "month" ? r.day.slice(0, 7) : r.day, Number(r.orders), Number(r.delivered_orders), Number(r.units), Number(r.net_revenue), Number(r.cogs), Number(r.gross_profit), Number(r.courier_cost), Number(r.contribution_profit)]),
            ]}
          />
        </div>
      }
    >
      {loading ? (
        <Skeleton className="h-[280px] rounded-lg" />
      ) : data.length === 0 ? (
        <EmptyState text="No data in this range." />
      ) : (
        <>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={64} />
                <Tooltip
                  formatter={(v: number, n: string) => [fmtBdt(v), n]}
                  contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="net_revenue" name="Net revenue" stroke="var(--primary)" fill="url(#revFill)" strokeWidth={2} />
                <Area type="monotone" dataKey="gross_profit" name="Gross profit" stroke="var(--chart-2)" fill="transparent" strokeWidth={2} />
                <Area type="monotone" dataKey="contribution_profit" name="Contribution" stroke="var(--chart-4)" fill="transparent" strokeWidth={2} strokeDasharray="4 3" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {showTable && (
            <div className="mt-4 max-h-[420px] overflow-auto rounded-lg border">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
                  <TableRow>
                    <TableHead>{grain === "day" ? "Day" : grain === "week" ? "Week starting" : "Month"}</TableHead>
                    <TableHead className="text-right">Delivered</TableHead>
                    <TableHead className="text-right">Units</TableHead>
                    <TableHead className="text-right">Net revenue</TableHead>
                    <TableHead className="text-right">COGS</TableHead>
                    <TableHead className="text-right">Gross profit</TableHead>
                    <TableHead className="text-right">Contribution</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.day}>
                      <TableCell className="font-medium">{grain === "month" ? r.day.slice(0, 7) : r.day}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.delivered_orders}</TableCell>
                      <TableCell className="text-right tabular-nums">{Number(r.units)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtBdt(r.net_revenue)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{fmtBdt(r.cogs)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtBdt(r.gross_profit)}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{fmtBdt(r.contribution_profit)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}

function ProfitBridge({ s }: { s: Summary }) {
  const rows = [
    { label: "Gross sales", value: s.gross_sales },
    { label: "Discounts", value: -s.discounts },
    { label: "Net revenue", value: s.net_revenue, strong: true },
    { label: "Delivery charge income", value: s.shipping_income ?? 0 },
    { label: "COGS", value: -s.cogs },
    { label: "Gross profit", value: s.gross_profit, strong: true },
    { label: "Courier charge", value: -s.courier_cost },
    { label: "Packaging", value: -s.packaging_cost },
    { label: "Refunds", value: -s.refunds },
    { label: "Return courier loss", value: -s.return_courier_cost },
    { label: "Contribution profit", value: s.contribution_profit, strong: true },
  ];
  const max = Math.max(1, ...rows.map((r) => Math.abs(Number(r.value) || 0)));
  return (
    <Panel title="Profit bridge" subtitle="Gross sales → contribution profit">
      <div className="divide-y divide-border/50">
        {rows.map((r) => {
          const pct = (Math.abs(Number(r.value) || 0) / max) * 100;
          const neg = Number(r.value) < 0;
          return (
            <div
              key={r.label}
              className={`group py-2 text-sm ${r.strong ? "font-semibold" : ""}`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className={r.strong ? "" : "text-muted-foreground"}>{r.label}</span>
                <span className={`tabular-nums ${neg ? "text-rose-600 dark:text-rose-400" : ""}`}>{fmtBdt(r.value)}</span>
              </div>
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    neg ? "bg-rose-500/70" : r.strong ? "bg-primary" : "bg-primary/40"
                  }`}
                  style={{ width: `${Math.max(pct, 1.5)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

const DIMS = [
  { key: "source", label: "Channel" },
  { key: "category", label: "Category" },
  { key: "payment", label: "Payment" },
  { key: "courier", label: "Courier" },
  { key: "city", label: "City" },
  { key: "zone", label: "Zone" },
  { key: "brand", label: "Brand" },
  { key: "status", label: "Status" },
];

function BreakdownPanel({ args, enabled }: { args: { _brand_ids: string[]; _from: string; _to: string; _basis: string }; enabled: boolean }) {
  const [dim, setDim] = useState("source");
  const q = useQuery({
    queryKey: ["rpt-breakdown", JSON.stringify(args), dim],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpt_sales_breakdown", { ...args, _dim: dim } as never);
      if (error) throw error;
      return (data ?? []) as unknown as BreakdownRow[];
    },
  });
  const rows = q.data ?? [];

  return (
    <Panel
      title="Breakdown"
      action={
        <div className="flex items-center gap-2">
          <div className="flex flex-wrap gap-1">
            {DIMS.map((d) => (
              <Button
                key={d.key}
                size="sm"
                variant={dim === d.key ? "default" : "outline"}
                className="h-7 px-2.5 text-xs"
                onClick={() => setDim(d.key)}
              >
                {d.label}
              </Button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              exportAoaXlsx(
                [["Label", "Orders", "Delivered", "Units", "Net revenue", "COGS", "Gross profit", "Courier", "Return %"],
                 ...rows.map((r) => [r.label, r.orders, r.delivered_orders, r.units, r.net_revenue, r.cogs, r.gross_profit, r.courier_cost, r.return_rate])],
                "Breakdown", `breakdown-${dim}`,
              )
            }
          >
            <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />Excel
          </Button>
        </div>
      }
    >
      {q.isLoading ? (
        <Skeleton className="h-[240px] rounded-lg" />
      ) : rows.length === 0 ? (
        <EmptyState text="No data in this range." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows.slice(0, 10).map((r) => ({ ...r, net_revenue: Number(r.net_revenue) }))} layout="vertical" margin={{ left: 8, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="label" width={110} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                <Tooltip formatter={(v: number) => fmtBdt(v)} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }} />
                <Bar dataKey="net_revenue" name="Net revenue" fill="var(--primary)" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="max-h-[300px] overflow-auto rounded-lg border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
                <TableRow>
                  <TableHead>Label</TableHead>
                  <TableHead className="text-right">Delivered</TableHead>
                  <TableHead className="text-right">Net revenue</TableHead>
                  <TableHead className="text-right">Gross profit</TableHead>
                  <TableHead className="text-right">Return %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.label}>
                    <TableCell className="font-medium">{r.label}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.delivered_orders}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtBdt(r.net_revenue)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtBdt(r.gross_profit)}</TableCell>
                    <TableCell className="text-right tabular-nums">{Number(r.return_rate).toFixed(1)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </Panel>
  );
}

type RpcArgs = { _brand_ids: string[]; _from: string; _to: string; _basis: string };

const OPS_DIMS = [
  { key: "courier", label: "Courier" },
  { key: "source", label: "Channel" },
  { key: "city", label: "City" },
  { key: "payment", label: "Payment" },
  { key: "brand", label: "Brand" },
  { key: "status", label: "Status" },
];

function OrdersTab({ args, enabled }: { args: RpcArgs; enabled: boolean }) {
  const [dim, setDim] = useState("courier");

  const funnelQ = useQuery({
    queryKey: ["rpt-funnel", JSON.stringify(args)],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpt_order_performance", args as never);
      if (error) throw error;
      return data as unknown as Funnel;
    },
  });

  const opsQ = useQuery({
    queryKey: ["rpt-ops", JSON.stringify(args), dim],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpt_order_ops_breakdown", { ...args, _dim: dim } as never);
      if (error) throw error;
      return (data ?? []) as unknown as OpsRow[];
    },
  });

  const f = funnelQ.data;
  const rows = opsQ.data ?? [];

  const kpis: Kpi[] = f
    ? [
        { label: "Orders placed", value: f.placed, kind: "number", hint: fmtBdt(f.placed_value) },
        { label: "Confirmed", value: f.confirmed, kind: "number", hint: `${Number(f.confirm_rate).toFixed(1)}% of placed` },
        { label: "Delivered", value: f.delivered, kind: "number", hint: fmtBdt(f.delivered_value) },
        { label: "Open / in pipeline", value: f.open_orders, kind: "number" },
        { label: "Delivery rate", value: f.delivery_rate, kind: "percent", tone: Number(f.delivery_rate) >= 80 ? "good" : "default" },
        { label: "Return rate", value: f.return_rate, kind: "percent", tone: Number(f.return_rate) > 15 ? "bad" : "default" },
        { label: "Cancel rate", value: f.cancel_rate, kind: "percent", tone: Number(f.cancel_rate) > 10 ? "bad" : "default" },
        { label: "AOV (delivered)", value: f.aov },
      ]
    : [];

  const funnelSteps = f
    ? [
        { label: "Placed", value: Number(f.placed) },
        { label: "Confirmed", value: Number(f.confirmed) },
        { label: "Shipped", value: Number(f.shipped) },
        { label: "Delivered", value: Number(f.delivered) },
      ]
    : [];
  const maxStep = funnelSteps[0]?.value || 1;

  return (
    <>
      <KpiStrip items={kpis} loading={funnelQ.isLoading} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Order funnel" subtitle="Cohort of orders in the selected range">
          {funnelQ.isLoading ? (
            <Skeleton className="h-[200px] rounded-lg" />
          ) : !f ? (
            <EmptyState text="No orders in this range." />
          ) : (
            <div className="space-y-3">
              {funnelSteps.map((s2) => (
                <div key={s2.label}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium">{s2.label}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {s2.value.toLocaleString()} · {((s2.value / maxStep) * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, (s2.value / maxStep) * 100)}%` }} />
                  </div>
                </div>
              ))}
              <div className="grid grid-cols-2 gap-2 pt-2 text-sm">
                <div className="rounded-lg border p-2.5">
                  <div className="text-xs text-muted-foreground">Returned</div>
                  <div className="font-semibold tabular-nums text-rose-600 dark:text-rose-400">{Number(f.returned).toLocaleString()}</div>
                </div>
                <div className="rounded-lg border p-2.5">
                  <div className="text-xs text-muted-foreground">Cancelled</div>
                  <div className="font-semibold tabular-nums text-rose-600 dark:text-rose-400">{Number(f.cancelled).toLocaleString()}</div>
                </div>
              </div>
            </div>
          )}
        </Panel>

        <Panel title="Handling speed" subtitle="Average time between stages">
          {funnelQ.isLoading ? (
            <Skeleton className="h-[200px] rounded-lg" />
          ) : !f ? (
            <EmptyState text="No data." />
          ) : (
            <div className="divide-y">
              {[
                { label: "Order → Confirm", h: Number(f.hours_to_confirm) },
                { label: "Confirm → Ship", h: Number(f.hours_to_ship) },
                { label: "Ship → Deliver", h: Number(f.hours_to_deliver) },
              ].map((r) => (
                <div key={r.label} className="flex items-center justify-between py-3 text-sm">
                  <span className="text-muted-foreground">{r.label}</span>
                  <span className="font-semibold tabular-nums">
                    {r.h >= 24 ? `${(r.h / 24).toFixed(1)} days` : `${r.h.toFixed(1)} hrs`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel
        title="Operations breakdown"
        subtitle="Delivery, return and cancel performance"
        action={
          <div className="flex items-center gap-2">
            <div className="flex flex-wrap gap-1">
              {OPS_DIMS.map((d) => (
                <Button key={d.key} size="sm" variant={dim === d.key ? "default" : "outline"} className="h-7 px-2.5 text-xs" onClick={() => setDim(d.key)}>
                  {d.label}
                </Button>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                exportAoaXlsx(
                  [["Label", "Placed", "Confirmed", "Delivered", "Returned", "Cancelled", "Delivery %", "Return %", "Cancel %", "Delivered value", "AOV"],
                   ...rows.map((r) => [r.label, r.placed, r.confirmed, r.delivered, r.returned, r.cancelled, r.delivery_rate, r.return_rate, r.cancel_rate, r.delivered_value, r.aov])],
                  "Order ops", `order-ops-${dim}`,
                )
              }
            >
              <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />Excel
            </Button>
          </div>
        }
      >
        {opsQ.isLoading ? (
          <Skeleton className="h-[240px] rounded-lg" />
        ) : rows.length === 0 ? (
          <EmptyState text="No orders in this range." />
        ) : (
          <div className="max-h-[420px] overflow-auto rounded-lg border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
                <TableRow>
                  <TableHead>Label</TableHead>
                  <TableHead className="text-right">Placed</TableHead>
                  <TableHead className="text-right">Delivered</TableHead>
                  <TableHead className="text-right">Delivery %</TableHead>
                  <TableHead className="text-right">Return %</TableHead>
                  <TableHead className="text-right">Cancel %</TableHead>
                  <TableHead className="text-right">Delivered value</TableHead>
                  <TableHead className="text-right">AOV</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.label}>
                    <TableCell className="font-medium">{r.label}</TableCell>
                    <TableCell className="text-right tabular-nums">{Number(r.placed).toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{Number(r.delivered).toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{Number(r.delivery_rate).toFixed(1)}%</TableCell>
                    <TableCell className={`text-right tabular-nums ${Number(r.return_rate) > 15 ? "text-rose-600 dark:text-rose-400" : ""}`}>{Number(r.return_rate).toFixed(1)}%</TableCell>
                    <TableCell className="text-right tabular-nums">{Number(r.cancel_rate).toFixed(1)}%</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtBdt(r.delivered_value)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtBdt(r.aov)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Panel>

      <OrderLedgerPanel args={args} enabled={enabled} />
    </>
  );
}

type ProductSort = "net_revenue" | "gross_profit" | "units" | "margin_pct" | "return_rate";

const PRODUCT_SORTS: { key: ProductSort; label: string }[] = [
  { key: "net_revenue", label: "Revenue" },
  { key: "gross_profit", label: "Profit" },
  { key: "units", label: "Units" },
  { key: "margin_pct", label: "Margin %" },
  { key: "return_rate", label: "Return %" },
];

function ProductsTab({ args, enabled, rangeLabel }: { args: RpcArgs; enabled: boolean; rangeLabel?: string }) {
  const [level, setLevel] = useState<"product" | "variant">("product");
  const [sort, setSort] = useState<ProductSort>("net_revenue");
  const [search, setSearch] = useState("");


  const q = useQuery({
    queryKey: ["rpt-products", JSON.stringify(args), level],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpt_product_performance", { ...args, _level: level } as never);
      if (error) throw error;
      return (data ?? []) as unknown as ProductRow[];
    },
  });

  // Meta campaign linked ad spend per product (campaign ↔ product links)
  const adQ = useQuery({
    queryKey: ["rpt-products-adspend", JSON.stringify(args)],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("mkt_product_perf", {
        _brand_ids: args._brand_ids, _from: args._from, _to: args._to,
      } as never);
      if (error) throw error;
      const list = (Array.isArray(data) ? data : []) as { product_id: string; ad_spend: number; attributed_orders: number }[];
      const map = new Map<string, { ad_spend: number; attributed_orders: number }>();
      for (const r of list) {
        if (!r?.product_id) continue;
        const prev = map.get(r.product_id) ?? { ad_spend: 0, attributed_orders: 0 };
        map.set(r.product_id, {
          ad_spend: prev.ad_spend + (Number(r.ad_spend) || 0),
          attributed_orders: prev.attributed_orders + (Number(r.attributed_orders) || 0),
        });
      }
      return map;
    },
  });

  const adSpendOf = (productId: string) => adQ.data?.get(productId)?.ad_spend ?? 0;

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = (q.data ?? []).filter((r) =>
      !term ||
      r.product_name?.toLowerCase().includes(term) ||
      (r.sku ?? "").toLowerCase().includes(term) ||
      (r.variant_label ?? "").toLowerCase().includes(term),
    );
    return [...list].sort((a, b) => Number(b[sort] ?? 0) - Number(a[sort] ?? 0));
  }, [q.data, search, sort]);

  const totals = useMemo(() => {
    const seen = new Set<string>();
    return rows.reduce(
      (acc, r) => {
        let spend = 0;
        if (!seen.has(r.product_id)) {
          seen.add(r.product_id);
          spend = adSpendOf(r.product_id);
        }
        return {
          units: acc.units + Number(r.units),
          net_revenue: acc.net_revenue + Number(r.net_revenue),
          cogs: acc.cogs + Number(r.cogs),
          gross_profit: acc.gross_profit + Number(r.gross_profit),
          contribution_profit: acc.contribution_profit + Number(r.contribution_profit),
          ad_spend: acc.ad_spend + spend,
        };
      },
      { units: 0, net_revenue: 0, cogs: 0, gross_profit: 0, contribution_profit: 0, ad_spend: 0 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, adQ.data]);

  const chartRows = rows.slice(0, 10).map((r) => ({
    label: (r.variant_label ? `${r.product_name} · ${r.variant_label}` : r.product_name).slice(0, 26),
    gross_profit: Number(r.gross_profit),
    net_revenue: Number(r.net_revenue),
  }));

  return (
    <>
      <Product360Panel
        brandIds={args._brand_ids}
        from={args._from}
        to={args._to}
        enabled={enabled}
        rangeLabel={rangeLabel}
      />

      <Panel title={`Top ${level === "variant" ? "variants" : "products"} by ${PRODUCT_SORTS.find((s) => s.key === sort)?.label.toLowerCase()}`}>

        {q.isLoading ? (
          <Skeleton className="h-[300px] rounded-lg" />
        ) : chartRows.length === 0 ? (
          <EmptyState text="No delivered product lines in this range." />
        ) : (
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartRows} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="label" width={170} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                <Tooltip formatter={(v: number, n: string) => [fmtBdt(v), n]} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="net_revenue" name="Net revenue" fill="var(--primary)" radius={[0, 6, 6, 0]} />
                <Bar dataKey="gross_profit" name="Gross profit" fill="var(--chart-2)" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>

      <Panel
        title="Product profitability"
        subtitle={`${rows.length} rows · net revenue ${fmtBdt(totals.net_revenue)} · gross profit ${fmtBdt(totals.gross_profit)} · Meta ad spend ${fmtBdt(totals.ad_spend)} (linked campaigns)`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1">
              <Button size="sm" variant={level === "product" ? "default" : "outline"} className="h-7 px-2.5 text-xs" onClick={() => setLevel("product")}>Product</Button>
              <Button size="sm" variant={level === "variant" ? "default" : "outline"} className="h-7 px-2.5 text-xs" onClick={() => setLevel("variant")}>Variant</Button>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search product / SKU" className="h-7 w-[190px] pl-7 text-xs" />
            </div>
            <Select value={sort} onValueChange={(v) => setSort(v as ProductSort)}>
              <SelectTrigger className="h-7 w-[130px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRODUCT_SORTS.map((s2) => <SelectItem key={s2.key} value={s2.key}>{s2.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                exportAoaXlsx(
                  [["Product", "Variant", "SKU", "Orders", "Units", "Net revenue", "COGS", "Gross profit", "Margin %", "Courier", "Contribution", "Ad spend (Meta)", "Net after ads", "ROAS", "Avg price", "Avg cost", "Returned units", "Return %", "Units missing cost"],
                   ...rows.map((r) => { const sp = adSpendOf(r.product_id); return [r.product_name, r.variant_label ?? "", r.sku ?? "", r.orders, r.units, r.net_revenue, r.cogs, r.gross_profit, r.margin_pct, r.courier_cost, r.contribution_profit, sp, Number(r.contribution_profit) - sp, sp > 0 ? Number(r.net_revenue) / sp : "", r.avg_price, r.avg_cost, r.returned_units, r.return_rate, r.cost_missing_units]; })],
                  "Products", `product-profit-${level}`,
                )
              }
            >
              <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />Excel
            </Button>
          </div>
        }
      >
        {q.isLoading ? (
          <Skeleton className="h-[320px] rounded-lg" />
        ) : rows.length === 0 ? (
          <EmptyState text="No delivered product lines in this range." />
        ) : (
          <div className="max-h-[560px] overflow-auto rounded-lg border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Units</TableHead>
                  <TableHead className="text-right">Net revenue</TableHead>
                  <TableHead className="text-right">COGS</TableHead>
                  <TableHead className="text-right">Gross profit</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                  <TableHead className="text-right">Contribution</TableHead>
                  <TableHead className="text-right">Ad spend</TableHead>
                  <TableHead className="text-right">Net after ads</TableHead>
                  <TableHead className="text-right">ROAS</TableHead>
                  <TableHead className="text-right">Return %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const spend = adSpendOf(r.product_id);
                  const netAfterAds = Number(r.contribution_profit) - spend;
                  const roas = spend > 0 ? Number(r.net_revenue) / spend : null;
                  return (
                  <TableRow key={`${r.product_id}-${r.variant_id ?? "all"}`}>
                    <TableCell>
                      <div className="font-medium">{r.product_name}</div>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        {r.variant_label && <span>{r.variant_label}</span>}
                        {r.sku && <span className="font-mono">{r.sku}</span>}
                        {Number(r.cost_missing_units) > 0 && (
                          <Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-400">
                            {Number(r.cost_missing_units)} units no cost
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{Number(r.units).toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtBdt(r.net_revenue)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{fmtBdt(r.cogs)}</TableCell>
                    <TableCell className={`text-right tabular-nums ${Number(r.gross_profit) < 0 ? "text-rose-600 dark:text-rose-400" : ""}`}>{fmtBdt(r.gross_profit)}</TableCell>
                    <TableCell className="text-right tabular-nums">{Number(r.margin_pct).toFixed(1)}%</TableCell>
                    <TableCell className={`text-right font-medium tabular-nums ${Number(r.contribution_profit) < 0 ? "text-rose-600 dark:text-rose-400" : ""}`}>{fmtBdt(r.contribution_profit)}</TableCell>
                    <TableCell className={`text-right tabular-nums ${Number(r.return_rate) > 15 ? "text-rose-600 dark:text-rose-400" : ""}`}>{Number(r.return_rate).toFixed(1)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableBody>
                <TableRow className="bg-muted/40 font-semibold">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right tabular-nums">{totals.units.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtBdt(totals.net_revenue)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtBdt(totals.cogs)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtBdt(totals.gross_profit)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {totals.net_revenue > 0 ? `${((totals.gross_profit / totals.net_revenue) * 100).toFixed(1)}%` : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmtBdt(totals.contribution_profit)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </Panel>
    </>
  );
}