import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { fmtBdt } from "@/lib/erp/finance";
import { exportAoaXlsx } from "@/lib/erp/utils/excel";
import { Panel, EmptyState, REPORT_QUERY_OPTS } from "@/components/erp/reports/report-kit";
import type { RpcArgs } from "@/components/erp/reports/customers-tab";

type SupplierRow = {
  supplier_id: string; supplier: string; country: string; supplier_type: string;
  pos: number; units: number; po_value: number; paid: number; due: number;
  avg_lead_days: number; on_time_pct: number | null; completed_pos: number; cancelled_pos: number;
  avg_landed_cost: number; last_order: string | null;
};

type CargoRow = {
  agent_id: string; agent: string; entries: number; deposits: number;
  charges: number; net: number; balance: number; last_entry: string | null;
};

export function SupplierPerformancePanel({ args, enabled }: { args: RpcArgs; enabled: boolean }) {
  const base = { _brand_ids: args._brand_ids, _from: args._from, _to: args._to };
  const q = useQuery({
    queryKey: ["rpt-supplier-perf", JSON.stringify(base)], enabled, ...REPORT_QUERY_OPTS,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpt_supplier_performance", base as never);
      if (error) throw error;
      return (data ?? []) as unknown as SupplierRow[];
    },
  });
  const rows = q.data ?? [];

  return (
    <Panel
      title="Supplier performance"
      subtitle={`${rows.length} suppliers · ${fmtBdt(rows.reduce((a, r) => a + Number(r.po_value), 0))} ordered · ${fmtBdt(rows.reduce((a, r) => a + Number(r.due), 0))} due`}
      action={
        <Button
          variant="outline" size="sm" disabled={rows.length === 0}
          onClick={() =>
            exportAoaXlsx(
              [["Supplier", "Country", "Type", "POs", "Units", "PO value", "Paid", "Due", "Avg lead days", "On-time %", "Completed", "Cancelled", "Avg landed cost", "Last order"],
               ...rows.map((r) => [r.supplier, r.country, r.supplier_type, Number(r.pos), Number(r.units), Number(r.po_value), Number(r.paid), Number(r.due), Number(r.avg_lead_days), r.on_time_pct ?? "", Number(r.completed_pos), Number(r.cancelled_pos), Number(r.avg_landed_cost), r.last_order ?? ""])],
              "Suppliers", "supplier-performance",
            )
          }
        >
          <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />Excel
        </Button>
      }
    >
      {q.isLoading ? <Skeleton className="h-[240px] rounded-lg" />
      : rows.length === 0 ? <EmptyState text="No supplier purchase orders in this range." />
      : (
        <div className="max-h-[460px] overflow-auto rounded-lg border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
              <TableRow>
                <TableHead>Supplier</TableHead>
                <TableHead className="text-right">POs</TableHead>
                <TableHead className="text-right">Units</TableHead>
                <TableHead className="text-right">PO value</TableHead>
                <TableHead className="text-right">Due</TableHead>
                <TableHead className="text-right">Lead time</TableHead>
                <TableHead className="text-right">On-time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.supplier_id}>
                  <TableCell>
                    <div className="max-w-[240px] truncate font-medium">{r.supplier}</div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {r.country && <span>{r.country}</span>}
                      {r.supplier_type && <Badge variant="outline" className="text-[10px] uppercase">{r.supplier_type}</Badge>}
                      {r.last_order && <span>last {r.last_order}</span>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {Number(r.pos).toLocaleString()}
                    {Number(r.cancelled_pos) > 0 && <span className="ml-1 text-xs text-rose-600 dark:text-rose-400">({r.cancelled_pos} cxl)</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{Number(r.units).toLocaleString()}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{fmtBdt(r.po_value)}</TableCell>
                  <TableCell className={`text-right tabular-nums ${Number(r.due) > 0 ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"}`}>{fmtBdt(r.due)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{Number(r.avg_lead_days) > 0 ? `${Number(r.avg_lead_days).toFixed(0)}d` : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.on_time_pct == null ? <span className="text-muted-foreground">—</span> : (
                      <span className={Number(r.on_time_pct) >= 80 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}>
                        {Number(r.on_time_pct).toFixed(0)}%
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Panel>
  );
}

export function CargoLedgerPanel({ args, enabled }: { args: RpcArgs; enabled: boolean }) {
  const base = { _brand_ids: args._brand_ids, _from: args._from, _to: args._to };
  const q = useQuery({
    queryKey: ["rpt-cargo-ledger", JSON.stringify(base)], enabled, ...REPORT_QUERY_OPTS,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpt_cargo_ledger", base as never);
      if (error) throw error;
      return (data ?? []) as unknown as CargoRow[];
    },
  });
  const rows = q.data ?? [];
  if (!q.isLoading && rows.length === 0) return null;

  return (
    <Panel
      title="Cargo agent ledger"
      subtitle="Deposits and charges in range · balance as of end date"
      action={
        <Button
          variant="outline" size="sm" disabled={rows.length === 0}
          onClick={() =>
            exportAoaXlsx(
              [["Agent", "Entries", "Deposits", "Charges", "Net", "Balance", "Last entry"],
               ...rows.map((r) => [r.agent, Number(r.entries), Number(r.deposits), Number(r.charges), Number(r.net), Number(r.balance), r.last_entry ?? ""])],
              "Cargo", "cargo-ledger",
            )
          }
        >
          <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />Excel
        </Button>
      }
    >
      {q.isLoading ? <Skeleton className="h-[180px] rounded-lg" /> : (
        <div className="max-h-[360px] overflow-auto rounded-lg border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead className="text-right">Deposits</TableHead>
                <TableHead className="text-right">Charges</TableHead>
                <TableHead className="text-right">Net in range</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.agent_id}>
                  <TableCell>
                    <div className="font-medium">{r.agent}</div>
                    <div className="text-xs text-muted-foreground">{Number(r.entries).toLocaleString()} entries{r.last_entry ? ` · last ${r.last_entry}` : ""}</div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">{fmtBdt(r.deposits)}</TableCell>
                  <TableCell className="text-right tabular-nums text-rose-600 dark:text-rose-400">{fmtBdt(r.charges)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtBdt(r.net)}</TableCell>
                  <TableCell className={`text-right font-medium tabular-nums ${Number(r.balance) < 0 ? "text-rose-600 dark:text-rose-400" : ""}`}>{fmtBdt(r.balance)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Panel>
  );
}
