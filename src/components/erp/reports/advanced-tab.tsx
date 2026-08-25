import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { fmtBdt } from "@/lib/erp/finance";
import { Panel, KpiStrip, EmptyState, ExportMenu, REPORT_QUERY_OPTS, type Kpi } from "@/components/erp/reports/report-kit";
import type { RpcArgs } from "@/components/erp/reports/customers-tab";

type AbcRow = {
  product_id: string; product_name: string; sku: string | null; units: number;
  net_revenue: number; gross_profit: number; margin_pct: number;
  revenue_share: number; cum_share: number; abc_class: "A" | "B" | "C";
};

type CohortRow = { cohort_month: string; month_index: number; customers: number; orders: number; revenue: number };

type Breakeven = {
  fixed_cost: number; opex: number; ad_spend: number; contribution_profit: number;
  delivered_orders: number; contribution_per_order: number; contribution_margin_pct: number;
  breakeven_orders: number | null; breakeven_revenue: number | null; net_profit: number; aov: number;
};

type ForecastRow = {
  product_id: string; product_name: string; sku: string | null; stock: number;
  daily_run_rate: number; days_of_cover: number; stockout_date: string | null;
  forecast_units: number; forecast_revenue: number; reorder_units: number; cash_required: number;
};

const CLASS_TONE: Record<string, string> = {
  A: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
  B: "border-amber-500/40 text-amber-600 dark:text-amber-400",
  C: "border-rose-500/40 text-rose-600 dark:text-rose-400",
};

export function AdvancedTab({ args, enabled }: { args: RpcArgs; enabled: boolean }) {
  const base = { _brand_ids: args._brand_ids, _from: args._from, _to: args._to };
  const bkey = JSON.stringify(base);

  const beQ = useQuery({
    queryKey: ["rpt-breakeven", bkey], enabled, ...REPORT_QUERY_OPTS,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpt_breakeven", base as never);
      if (error) throw error;
      return data as unknown as Breakeven;
    },
  });

  const abcQ = useQuery({
    queryKey: ["rpt-abc", bkey], enabled, ...REPORT_QUERY_OPTS,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpt_abc_analysis", base as never);
      if (error) throw error;
      return (data ?? []) as unknown as AbcRow[];
    },
  });

  const cohortQ = useQuery({
    queryKey: ["rpt-cohort", args._brand_ids.join(",")], enabled, ...REPORT_QUERY_OPTS,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpt_customer_cohort", {
        _brand_ids: args._brand_ids, _months: 6,
      } as never);
      if (error) throw error;
      return (data ?? []) as unknown as CohortRow[];
    },
  });

  const fcQ = useQuery({
    queryKey: ["rpt-forecast", bkey], enabled, ...REPORT_QUERY_OPTS,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpt_forecast", { ...base, _horizon: 30 } as never);
      if (error) throw error;
      return (data ?? []) as unknown as ForecastRow[];
    },
  });

  const be = beQ.data;
  const abc = abcQ.data ?? [];
  const cohort = cohortQ.data ?? [];
  const fc = fcQ.data ?? [];

  const kpis: Kpi[] = be
    ? [
        { label: "Break-even orders", value: be.breakeven_orders ?? 0, kind: "number", goodWhen: "down", hint: `এখন delivered ${Number(be.delivered_orders).toLocaleString()} · contribution/order ${fmtBdt(be.contribution_per_order)}` },
        { label: "Break-even revenue", value: be.breakeven_revenue ?? 0, goodWhen: "down", hint: `contribution margin ${Number(be.contribution_margin_pct).toFixed(1)}%` },
        { label: "Fixed cost (opex + ads)", value: be.fixed_cost, goodWhen: "down", hint: `opex ${fmtBdt(be.opex)} · ads ${fmtBdt(be.ad_spend)}` },
        { label: "Net profit", value: be.net_profit, tone: be.net_profit >= 0 ? "good" : "bad" },
        { label: "AOV", value: be.aov },
      ]
    : [];

  const cohortMonths = Array.from(new Set(cohort.map((c) => c.cohort_month))).sort().reverse();
  const maxIdx = Math.max(0, ...cohort.map((c) => c.month_index));

  return (
    <div className="space-y-[var(--rpt-gap)]">
      <KpiStrip items={kpis} loading={beQ.isLoading} />

      <Panel
        title="ABC analysis"
        subtitle="Revenue share অনুযায়ী — A = প্রথম 80%, B = পরের 15%, C = বাকি"
        action={
          <ExportMenu
            aoa={() => [
              ["Class", "Product", "SKU", "Units", "Net revenue", "Gross profit", "Margin %", "Share %", "Cumulative %"],
              ...abc.map((r) => [r.abc_class, r.product_name, r.sku ?? "", r.units, r.net_revenue, r.gross_profit, r.margin_pct, r.revenue_share, r.cum_share]),
            ]}
            filename={`abc-${base._from}-to-${base._to}`}
            title="ABC analysis"
            disabled={abc.length === 0}
          />
        }
        flush
      >
        {abcQ.isLoading ? (
          <Skeleton className="m-4 h-[300px] rounded-lg" />
        ) : abc.length === 0 ? (
          <div className="p-4"><EmptyState text="এই range-এ delivered sale নেই." /></div>
        ) : (
          <div className="max-h-[520px] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-muted/90 backdrop-blur">
                <TableRow>
                  <TableHead>Class</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Units</TableHead>
                  <TableHead className="text-right">Net revenue</TableHead>
                  <TableHead className="text-right">Gross profit</TableHead>
                  <TableHead className="text-right">Share</TableHead>
                  <TableHead className="text-right">Cumulative</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {abc.map((r) => (
                  <TableRow key={`${r.product_id}-${r.sku ?? ""}`}>
                    <TableCell><Badge variant="outline" className={CLASS_TONE[r.abc_class]}>{r.abc_class}</Badge></TableCell>
                    <TableCell className="max-w-[280px]">
                      <div className="truncate">{r.product_name}</div>
                      {r.sku && <div className="font-mono text-[10px] text-muted-foreground">{r.sku}</div>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{Number(r.units).toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{fmtBdt(r.net_revenue)}</TableCell>
                    <TableCell className={cn("text-right tabular-nums", Number(r.gross_profit) < 0 && "text-rose-600 dark:text-rose-400")}>{fmtBdt(r.gross_profit)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{Number(r.revenue_share).toFixed(1)}%</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{Number(r.cum_share).toFixed(1)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Panel>

      {(fcQ.isLoading || fc.length > 0) && (
        <Panel
          title="Stock & cash forecast (next 30 days)"
          subtitle="Trailing velocity থেকে expected sale, stock-out date, reorder qty ও cash requirement"
          action={
            <ExportMenu
              aoa={() => [
                ["Product", "SKU", "Stock", "Daily run rate", "Days of cover", "Stock-out", "Forecast units", "Forecast revenue", "Reorder units", "Cash required"],
                ...fc.map((r) => [r.product_name, r.sku ?? "", r.stock, r.daily_run_rate, r.days_of_cover, r.stockout_date ?? "", r.forecast_units, r.forecast_revenue, r.reorder_units, r.cash_required]),
              ]}
              filename={`forecast-${base._to}`}
              title="Stock & cash forecast"
              disabled={fc.length === 0}
            />
          }
          flush
        >
          {fcQ.isLoading ? (
            <Skeleton className="m-4 h-[280px] rounded-lg" />
          ) : (
            <>
              <div className="border-b bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
                মোট reorder cash প্রয়োজন:{" "}
                <span className="font-semibold text-foreground">{fmtBdt(fc.reduce((a, r) => a + Number(r.cash_required), 0))}</span>
              </div>
              <div className="max-h-[520px] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-muted/90 backdrop-blur">
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Stock</TableHead>
                      <TableHead className="text-right">Per day</TableHead>
                      <TableHead className="text-right">Cover</TableHead>
                      <TableHead>Stock-out</TableHead>
                      <TableHead className="text-right">30d units</TableHead>
                      <TableHead className="text-right">Reorder</TableHead>
                      <TableHead className="text-right">Cash needed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fc.map((r) => (
                      <TableRow key={r.product_id}>
                        <TableCell className="max-w-[260px]">
                          <div className="truncate">{r.product_name}</div>
                          {r.sku && <div className="font-mono text-[10px] text-muted-foreground">{r.sku}</div>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{Number(r.stock).toLocaleString()}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{Number(r.daily_run_rate).toFixed(2)}</TableCell>
                        <TableCell className={cn("text-right tabular-nums", Number(r.days_of_cover) < 14 && "text-rose-600 dark:text-rose-400")}>
                          {Number(r.days_of_cover).toFixed(0)}d
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">{r.stockout_date ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{Number(r.forecast_units).toFixed(0)}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{Number(r.reorder_units).toLocaleString()}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtBdt(r.cash_required)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </Panel>
      )}

      {cohort.length > 0 && (
        <Panel
          title="Customer cohort retention"
          subtitle="প্রথম কেনার মাস অনুযায়ী — পরের মাসগুলোতে কতজন আবার কিনেছে"
          action={
            <ExportMenu
              aoa={() => [
                ["Cohort", "Month index", "Customers", "Orders", "Revenue"],
                ...cohort.map((c) => [c.cohort_month, c.month_index, c.customers, c.orders, c.revenue]),
              ]}
              filename="customer-cohort"
              title="Customer cohort"
            />
          }
          flush
        >
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Cohort</TableHead>
                  {Array.from({ length: maxIdx + 1 }).map((_, i) => (
                    <TableHead key={i} className="text-right">M{i}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {cohortMonths.map((m) => {
                  const base0 = cohort.find((c) => c.cohort_month === m && c.month_index === 0)?.customers ?? 0;
                  return (
                    <TableRow key={m}>
                      <TableCell className="font-medium">{m}</TableCell>
                      {Array.from({ length: maxIdx + 1 }).map((_, i) => {
                        const cell = cohort.find((c) => c.cohort_month === m && c.month_index === i);
                        if (!cell) return <TableCell key={i} className="text-right text-muted-foreground">—</TableCell>;
                        const pct = base0 > 0 ? (Number(cell.customers) / base0) * 100 : 0;
                        return (
                          <TableCell key={i} className="text-right tabular-nums">
                            <span className="font-medium">{Number(cell.customers).toLocaleString()}</span>
                            {i > 0 && <span className="ml-1 text-[10px] text-muted-foreground">{pct.toFixed(0)}%</span>}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Panel>
      )}
    </div>
  );
}
