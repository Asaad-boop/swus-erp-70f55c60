import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { fmtBdt } from "@/lib/erp/finance";
import { exportAoaXlsx } from "@/lib/erp/utils/excel";
import { Panel, KpiStrip, EmptyState, type Kpi , REPORT_QUERY_OPTS } from "@/components/erp/reports/report-kit";
import type { RpcArgs } from "@/components/erp/reports/customers-tab";
import { DailyCashPanel, WalletAccountsPanel, ArApPanel } from "@/components/erp/reports/finance-extras";

export type PnlV2 = {
  gross_sales: number; discounts: number; net_revenue: number; shipping_income: number;
  total_revenue: number; cogs: number;
  gross_profit: number; gross_margin_pct: number; courier_cost: number; packaging_cost: number;
  return_loss: number; refunds: number; return_courier_cost: number; contribution_profit: number;
  ad_spend: number; opex_total: number; opex_by_category: Record<string, number>;
  other_income: number; net_profit: number; net_margin_pct: number;
  delivered_orders: number; units_sold: number; cost_missing_units: number;
};

type Line = { label: string; value: number; kind?: "sub" | "total" | "grand"; hint?: string };

type CourierCash = {
  order_value: number; advance_total: number; cod_expected: number;
  courier_collected: number; courier_charge: number; collection_diff: number;
  reconciled_orders: number;
};

export function FinanceTab({ args, enabled }: { args: RpcArgs; enabled: boolean }) {
  const base = { _brand_ids: args._brand_ids, _from: args._from, _to: args._to };
  const key = JSON.stringify(base);

  const q = useQuery({
    queryKey: ["rpt-pnl-v2", key],
    enabled,
    ...REPORT_QUERY_OPTS,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpt_pnl_v2", base as never);
      if (error) throw error;
      return data as unknown as PnlV2;
    },
  });

  const p = q.data;

  const cashQ = useQuery({
    queryKey: ["rpt-finance-courier-cash", JSON.stringify(args)],
    enabled,
    ...REPORT_QUERY_OPTS,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpt_order_ledger_summary", {
        ...args, _search: null, _status: "all", _courier: "all",
      } as never);
      if (error) throw error;
      return data as unknown as CourierCash;
    },
  });
  const c = cashQ.data;

  // Verified manual corrections (e.g. courier portal vs imported invoice gaps).
  const adjQ = useQuery({
    queryKey: ["rpt-recon-adjustments", JSON.stringify(base)],
    enabled,
    ...REPORT_QUERY_OPTS,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("erp_recon_adjustments")
        .select("adj_date, courier, amount, reason, note")
        .in("brand_id", base._brand_ids)
        .gte("adj_date", base._from)
        .lte("adj_date", base._to)
        .order("adj_date");
      if (error) throw error;
      return data ?? [];
    },
  });
  const adjustments = adjQ.data ?? [];
  const adjTotal = adjustments.reduce((a, r) => a + Number(r.amount ?? 0), 0);

  const cashLines: Line[] = c
    ? [
        { label: "Order value (invoice total incl. delivery)", value: Number(c.order_value) },
        { label: "Advance received (bKash / Nagad etc.)", value: Number(c.advance_total), kind: "sub" },
        { label: "COD expected from courier", value: Number(c.cod_expected), kind: "sub" },
        { label: "Received from courier (actual payout)", value: Number(c.courier_collected), kind: "total", hint: `${Number(c.reconciled_orders).toLocaleString()} orders reconciled` },
        { label: "Courier charge deducted", value: -Number(c.courier_charge), kind: "sub" },
        { label: "Collection difference (expected − received)", value: -Number(c.collection_diff), kind: "sub" },
        ...(adjTotal !== 0
          ? [{
              label: "Verified corrections (already inside received above)",
              value: adjTotal,
              kind: "sub" as const,
              hint: adjustments.map((a) => `${a.adj_date} ${a.courier}: ${fmtBdt(Number(a.amount))}${a.reason ? ` — ${a.reason}` : ""}`).join(" · "),
            }]
          : []),
        { label: "Total cash in hand (advance + courier payout)", value: Number(c.advance_total) + Number(c.courier_collected), kind: "grand" },
      ]
    : [];

  const kpis: Kpi[] = p
    ? [
        { label: "Total revenue (accrual)", value: p.total_revenue ?? p.net_revenue, hint: `${p.delivered_orders} delivered orders · incl. delivery charge` },
        { label: "Received from courier", value: Number(c?.courier_collected ?? 0), tone: "good", hint: c ? `after ৳${Number(c.courier_charge).toLocaleString()} courier charge · actual payout` : "actual payout" },
        { label: "Gross profit", value: p.gross_profit, tone: p.gross_profit >= 0 ? "good" : "bad", hint: `${p.gross_margin_pct}% margin` },
        { label: "Contribution profit", value: p.contribution_profit, tone: p.contribution_profit >= 0 ? "good" : "bad", hint: "after courier & returns" },
        { label: "Net profit", value: p.net_profit, tone: p.net_profit >= 0 ? "good" : "bad", hint: `${p.net_margin_pct}% net margin` },
      ]
    : [];

  const lines: Line[] = useMemo(() => {
    if (!p) return [];
    const opex = Object.entries(p.opex_by_category ?? {}).sort((a, b) => b[1] - a[1]);
    return [
      { label: "Gross sales", value: p.gross_sales },
      { label: "Discounts", value: -p.discounts, kind: "sub" },
      { label: "Net revenue", value: p.net_revenue, kind: "total" },
      { label: "Delivery charge income", value: p.shipping_income ?? 0, kind: "sub" },
      { label: "Total revenue", value: p.total_revenue ?? p.net_revenue, kind: "total" },
      { label: "COGS", value: -p.cogs, kind: "sub", hint: p.cost_missing_units > 0 ? `${p.cost_missing_units} units without cost` : undefined },
      { label: "Gross profit", value: p.gross_profit, kind: "total" },
      { label: "Courier cost", value: -p.courier_cost, kind: "sub" },
      { label: "Packaging cost", value: -p.packaging_cost, kind: "sub" },
      { label: "Return loss (refund + return courier)", value: -p.return_loss, kind: "sub" },
      { label: "Contribution profit", value: p.contribution_profit, kind: "total" },
      { label: "Ad spend (Meta + manual marketing)", value: -p.ad_spend, kind: "sub" },
      ...opex.map<Line>(([name, v]) => ({ label: `Opex — ${name}`, value: -Number(v), kind: "sub" })),
      { label: "Other income", value: p.other_income, kind: "sub" },
      { label: "Net profit", value: p.net_profit, kind: "grand" },
    ];
  }, [p]);

  return (
    <div className="space-y-4">
      <KpiStrip items={kpis} loading={q.isLoading} />

      <Panel
        title="Profit & Loss (canonical)"
        subtitle="Delivery-date basis · Asia/Dhaka · COGS, courier, returns and ad spend as separate lines"
        action={
          <Button
            variant="outline"
            size="sm"
            disabled={!p}
            onClick={() =>
              exportAoaXlsx(
                [["Line", "Amount (BDT)"], ...lines.map((l) => [l.label, l.value])],
                "P&L", `pnl-${base._from}-to-${base._to}`,
              )
            }
          >
            <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />Excel
          </Button>
        }
      >
        {q.isLoading ? (
          <Skeleton className="h-[420px] rounded-lg" />
        ) : !p ? (
          <EmptyState text="No data in this range." />
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Line</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l) => (
                  <TableRow
                    key={l.label}
                    className={cn(
                      l.kind === "total" && "bg-muted/40 font-semibold",
                      l.kind === "grand" && "bg-primary/5 text-base font-bold",
                    )}
                  >
                    <TableCell className={cn(l.kind === "sub" && "pl-8 text-muted-foreground")}>
                      {l.label}
                      {l.hint && <span className="ml-2 text-[11px] text-amber-600 dark:text-amber-400">{l.hint}</span>}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums",
                        l.value < 0 && "text-rose-600 dark:text-rose-400",
                        l.kind === "grand" && (l.value >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"),
                      )}
                    >
                      {fmtBdt(l.value)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Panel>

      <Panel
        title="Courier cash — actual money received"
        subtitle="Reconciled courier payout (original amount after charges), not accrual revenue"
        action={
          <Button
            variant="outline"
            size="sm"
            disabled={!c}
            onClick={() =>
              exportAoaXlsx(
                [["Line", "Amount (BDT)"], ...cashLines.map((l) => [l.label, l.value])],
                "Courier cash", `courier-cash-${base._from}-to-${base._to}`,
              )
            }
          >
            <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />Excel
          </Button>
        }
      >
        {cashQ.isLoading ? (
          <Skeleton className="h-[260px] rounded-lg" />
        ) : !c ? (
          <EmptyState text="No courier data in this range." />
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Line</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cashLines.map((l) => (
                  <TableRow
                    key={l.label}
                    className={cn(
                      l.kind === "total" && "bg-muted/40 font-semibold",
                      l.kind === "grand" && "bg-primary/5 text-base font-bold",
                    )}
                  >
                    <TableCell className={cn(l.kind === "sub" && "pl-8 text-muted-foreground")}>
                      {l.label}
                      {l.hint && <span className="ml-2 text-[11px] text-muted-foreground">{l.hint}</span>}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums",
                        l.value < 0 && "text-rose-600 dark:text-rose-400",
                        l.kind === "grand" && "text-emerald-600 dark:text-emerald-400",
                      )}
                    >
                      {fmtBdt(l.value)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Panel>

      <DailyCashPanel args={args} enabled={enabled} />
      <WalletAccountsPanel args={args} enabled={enabled} />
      <ArApPanel args={args} enabled={enabled} />

      <p className="text-xs text-muted-foreground">
        Balance sheet, trial balance, general ledger and cash flow statements stay in{" "}
        <a className="underline underline-offset-2" href="/erp/finance/reports">Finance → Reports</a>.
      </p>
    </div>
  );
}