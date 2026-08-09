import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart, Area, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { FileSpreadsheet, AlertTriangle, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMultiBrandPicker } from "@/components/erp/brand-picker-gate";
import { DateRangePicker, buildPreset, type MktRangeValue } from "@/components/erp/marketing/date-range-picker";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtBdt } from "@/lib/erp/finance";
import { exportAoaXlsx } from "@/lib/erp/utils/excel";
import { Panel, KpiStrip, EmptyState, type Kpi } from "@/components/erp/reports/report-kit";

export const Route = createFileRoute("/_authenticated/erp/reports")({
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
  gross_sales: number; discounts: number; net_revenue: number; cogs: number;
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

const BASIS_LABEL: Record<Basis, string> = {
  delivered: "Delivery date",
  created: "Order date",
  confirmed: "Confirm date",
};

function ReportsHub() {
  const { brandIds, picker } = useMultiBrandPicker();
  const [range, setRange] = useState<MktRangeValue>(() => buildPreset("30d"));
  const [basis, setBasis] = useState<Basis>("delivered");

  const enabled = brandIds.length > 0;
  const args = { _brand_ids: brandIds, _from: range.from, _to: range.to, _basis: basis };
  const key = [brandIds.join(","), range.from, range.to, basis];

  const summaryQ = useQuery({
    queryKey: ["rpt-summary", ...key],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpt_sales_summary", args);
      if (error) throw error;
      return data as unknown as Summary;
    },
  });

  const healthQ = useQuery({
    queryKey: ["rpt-health", ...key],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpt_data_health", args);
      if (error) throw error;
      return data as unknown as Health;
    },
  });

  const seriesQ = useQuery({
    queryKey: ["rpt-series", ...key],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpt_sales_timeseries", args);
      if (error) throw error;
      return (data ?? []) as unknown as SeriesRow[];
    },
  });

  const s = summaryQ.data;

  const kpis: Kpi[] = s
    ? [
        { label: "Net revenue", value: s.net_revenue, hint: `${s.delivered_orders} delivered orders` },
        { label: "Gross profit", value: s.gross_profit, tone: s.gross_profit >= 0 ? "good" : "bad", hint: s.net_revenue > 0 ? `${((s.gross_profit / s.net_revenue) * 100).toFixed(1)}% margin` : undefined },
        { label: "Contribution profit", value: s.contribution_profit, tone: s.contribution_profit >= 0 ? "good" : "bad", hint: "after courier, packaging, returns" },
        { label: "COGS", value: s.cogs },
        { label: "Units sold", value: s.units_sold, kind: "number" },
        { label: "AOV", value: s.aov },
        { label: "Delivery rate", value: s.delivery_rate, kind: "percent", hint: "orders placed in range" },
        { label: "Return rate", value: s.return_rate, kind: "percent", tone: s.return_rate > 15 ? "bad" : "default" },
      ]
    : [];

  return (
    <div className="space-y-5 p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground">
            All numbers come from one accounting source — Dhaka time, {BASIS_LABEL[basis].toLowerCase()} basis.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {picker}
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
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={() => { summaryQ.refetch(); healthQ.refetch(); seriesQ.refetch(); }}
            aria-label="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {!enabled ? (
        <Panel><EmptyState text="Pick at least one brand to see reports." /></Panel>
      ) : (
        <>
          <DataHealth data={healthQ.data} loading={healthQ.isLoading} />

          <Tabs defaultValue="overview">
            <TabsList className="flex-wrap">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="sales">Sales</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-4 space-y-4">
              <KpiStrip items={kpis} loading={summaryQ.isLoading} />
              <TrendPanel rows={seriesQ.data ?? []} loading={seriesQ.isLoading} />
              {s && <ProfitBridge s={s} />}
            </TabsContent>

            <TabsContent value="sales" className="mt-4 space-y-4">
              <TrendPanel rows={seriesQ.data ?? []} loading={seriesQ.isLoading} showTable />
              <BreakdownPanel args={args} enabled={enabled} />
            </TabsContent>
          </Tabs>
        </>
      )}
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

function TrendPanel({ rows, loading, showTable }: { rows: SeriesRow[]; loading?: boolean; showTable?: boolean }) {
  const data = useMemo(
    () => rows.map((r) => ({
      ...r,
      net_revenue: Number(r.net_revenue),
      gross_profit: Number(r.gross_profit),
      contribution_profit: Number(r.contribution_profit),
      label: r.day.slice(5),
    })),
    [rows],
  );

  return (
    <Panel
      title="Daily revenue & profit"
      subtitle="Delivered lines only"
      action={
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            exportAoaXlsx(
              [["Day", "Orders", "Delivered", "Units", "Net revenue", "COGS", "Gross profit", "Courier", "Contribution"],
               ...rows.map((r) => [r.day, r.orders, r.delivered_orders, r.units, r.net_revenue, r.cogs, r.gross_profit, r.courier_cost, r.contribution_profit])],
              "Daily sales", "daily-sales",
            )
          }
        >
          <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />Excel
        </Button>
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
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={64} />
                <Tooltip
                  formatter={(v: number, n: string) => [fmtBdt(v), n]}
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 10, fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="net_revenue" name="Net revenue" stroke="hsl(var(--primary))" fill="url(#revFill)" strokeWidth={2} />
                <Area type="monotone" dataKey="gross_profit" name="Gross profit" stroke="hsl(var(--chart-2, 160 60% 45%))" fill="transparent" strokeWidth={2} />
                <Area type="monotone" dataKey="contribution_profit" name="Contribution" stroke="hsl(var(--chart-4, 35 90% 55%))" fill="transparent" strokeWidth={2} strokeDasharray="4 3" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {showTable && (
            <div className="mt-4 max-h-[420px] overflow-auto rounded-lg border">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
                  <TableRow>
                    <TableHead>Day</TableHead>
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
                      <TableCell className="font-medium">{r.day}</TableCell>
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
    { label: "COGS", value: -s.cogs },
    { label: "Gross profit", value: s.gross_profit, strong: true },
    { label: "Courier charge", value: -s.courier_cost },
    { label: "Packaging", value: -s.packaging_cost },
    { label: "Refunds", value: -s.refunds },
    { label: "Return courier loss", value: -s.return_courier_cost },
    { label: "Contribution profit", value: s.contribution_profit, strong: true },
  ];
  return (
    <Panel title="Profit bridge" subtitle="Gross sales → contribution profit">
      <div className="divide-y">
        {rows.map((r) => (
          <div key={r.label} className={`flex items-center justify-between py-2 text-sm ${r.strong ? "font-semibold" : ""}`}>
            <span className={r.strong ? "" : "text-muted-foreground"}>{r.label}</span>
            <span className={`tabular-nums ${r.value < 0 ? "text-rose-600 dark:text-rose-400" : ""}`}>{fmtBdt(r.value)}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

const DIMS = [
  { key: "source", label: "Channel" },
  { key: "payment", label: "Payment" },
  { key: "courier", label: "Courier" },
  { key: "city", label: "City" },
  { key: "brand", label: "Brand" },
  { key: "status", label: "Status" },
];

function BreakdownPanel({ args, enabled }: { args: Record<string, unknown>; enabled: boolean }) {
  const [dim, setDim] = useState("source");
  const q = useQuery({
    queryKey: ["rpt-breakdown", JSON.stringify(args), dim],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpt_sales_breakdown", { ...(args as never), _dim: dim } as never);
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
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="label" width={110} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                <Tooltip formatter={(v: number) => fmtBdt(v)} contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 10, fontSize: 12 }} />
                <Bar dataKey="net_revenue" name="Net revenue" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} />
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
