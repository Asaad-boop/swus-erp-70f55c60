import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { fmtBdt } from "@/lib/erp/finance";
import { Panel, KpiStrip, EmptyState, ExportMenu, REPORT_QUERY_OPTS, type Kpi } from "@/components/erp/reports/report-kit";
import type { RpcArgs } from "@/components/erp/reports/customers-tab";

type ExpRow = {
  label: string; amount: number; txns: number;
  budget: number | null; variance: number | null; in_pnl: boolean;
};

const DIMS = [
  { v: "category", l: "By category" },
  { v: "month", l: "By month" },
  { v: "brand", l: "By brand" },
  { v: "account", l: "By account (vs budget)" },
  { v: "source", l: "By source" },
] as const;

export function ExpensesTab({ args, enabled }: { args: RpcArgs; enabled: boolean }) {
  const [dim, setDim] = useState<string>("category");
  const base = { _brand_ids: args._brand_ids, _from: args._from, _to: args._to, _dim: dim };

  const q = useQuery({
    queryKey: ["rpt-expense-breakdown", JSON.stringify(base)],
    enabled,
    ...REPORT_QUERY_OPTS,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpt_expense_breakdown", base as never);
      if (error) throw error;
      return (data ?? []) as unknown as ExpRow[];
    },
  });

  const rows = q.data ?? [];
  const total = rows.reduce((a, r) => a + Number(r.amount), 0);
  const inPnl = rows.filter((r) => r.in_pnl).reduce((a, r) => a + Number(r.amount), 0);
  const budgeted = rows.reduce((a, r) => a + Number(r.budget ?? 0), 0);
  const top = rows[0];

  const kpis: Kpi[] = rows.length
    ? [
        { label: "Total expense", value: total, goodWhen: "down", hint: `${rows.length} ${dim === "month" ? "months" : "groups"} · ${rows.reduce((a, r) => a + Number(r.txns), 0)} entries` },
        { label: "Counted in P&L", value: inPnl, goodWhen: "down", hint: "reference-linked & excluded categories বাদ" },
        ...(top ? [{ label: `Biggest — ${top.label}`, value: Number(top.amount), goodWhen: "down" as const, hint: total > 0 ? `${((Number(top.amount) / total) * 100).toFixed(1)}% of spend` : undefined }] : []),
        ...(budgeted > 0 ? [{ label: "Budget", value: budgeted, hint: `variance ${fmtBdt(budgeted - total)}` }] : []),
      ]
    : [];

  return (
    <div className="space-y-[var(--rpt-gap)]">
      <KpiStrip items={kpis} loading={q.isLoading} />

      <Panel
        title="Expense breakdown"
        subtitle="Transaction-date basis · সব expense entry, P&L flag সহ"
        action={
          <div className="flex items-center gap-2">
            <Select value={dim} onValueChange={setDim}>
              <SelectTrigger className="h-7 w-[190px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DIMS.map((d) => <SelectItem key={d.v} value={d.v} className="text-xs">{d.l}</SelectItem>)}
              </SelectContent>
            </Select>
            <ExportMenu
              aoa={() => [
                ["Group", "Amount (BDT)", "Entries", "Budget", "Variance", "In P&L"],
                ...rows.map((r) => [r.label, r.amount, r.txns, r.budget ?? "", r.variance ?? "", r.in_pnl ? "yes" : "no"]),
                ["Total", total, "", budgeted || "", "", ""],
              ]}
              filename={`expenses-${dim}-${args._from}-to-${args._to}`}
              title="Expense breakdown"
              rangeLabel={`${args._from} → ${args._to}`}
              disabled={rows.length === 0}
            />
          </div>
        }
        flush
      >
        {q.isLoading ? (
          <Skeleton className="m-4 h-[360px] rounded-lg" />
        ) : rows.length === 0 ? (
          <div className="p-4"><EmptyState text="এই range-এ কোনো expense entry নেই." /></div>
        ) : (
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Group</TableHead>
                <TableHead className="text-right">Entries</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Share</TableHead>
                {budgeted > 0 && <TableHead className="text-right">Budget</TableHead>}
                {budgeted > 0 && <TableHead className="text-right">Variance</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.label}>
                  <TableCell className="max-w-[280px]">
                    <span className="truncate">{r.label}</span>
                    {!r.in_pnl && <Badge variant="outline" className="ml-2 text-[10px]">not in P&L</Badge>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{r.txns}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{fmtBdt(r.amount)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {total > 0 ? `${((Number(r.amount) / total) * 100).toFixed(1)}%` : "—"}
                  </TableCell>
                  {budgeted > 0 && <TableCell className="text-right tabular-nums text-muted-foreground">{r.budget != null ? fmtBdt(r.budget) : "—"}</TableCell>}
                  {budgeted > 0 && (
                    <TableCell className={cn("text-right tabular-nums", Number(r.variance ?? 0) < 0 && "text-rose-600 dark:text-rose-400")}>
                      {r.variance != null ? fmtBdt(r.variance) : "—"}
                    </TableCell>
                  )}
                </TableRow>
              ))}
              <TableRow className="bg-muted/40 font-semibold">
                <TableCell>Total</TableCell>
                <TableCell />
                <TableCell className="text-right tabular-nums">{fmtBdt(total)}</TableCell>
                <TableCell className="text-right">100%</TableCell>
                {budgeted > 0 && <TableCell className="text-right tabular-nums">{fmtBdt(budgeted)}</TableCell>}
                {budgeted > 0 && <TableCell className="text-right tabular-nums">{fmtBdt(budgeted - total)}</TableCell>}
              </TableRow>
            </TableBody>
          </Table>
        )}
      </Panel>
    </div>
  );
}
