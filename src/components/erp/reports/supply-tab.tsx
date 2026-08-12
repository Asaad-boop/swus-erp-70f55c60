import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { fmtBdt } from "@/lib/erp/finance";
import { exportAoaXlsx } from "@/lib/erp/utils/excel";
import { Panel, KpiStrip, EmptyState, type Kpi , REPORT_QUERY_OPTS } from "@/components/erp/reports/report-kit";
import type { RpcArgs } from "@/components/erp/reports/customers-tab";
import { SupplierPerformancePanel, CargoLedgerPanel } from "@/components/erp/reports/supply-extras";

type SupSummary = {
  pos: number; import_pos: number; local_pos: number; units_ordered: number; po_value: number;
  paid: number; due: number; payments_in_range: number; avg_landed_cost: number;
  cartons_in_transit: number; in_transit_value: number; cartons_received: number;
};

type SupRow = {
  kind: string; po_id: string; po_number: string; supplier: string; order_date: string | null;
  status: string; units: number; total: number; paid: number; due: number;
  landed_per_unit: number; cartons: number; cartons_received: number;
  in_range: boolean;
};

type Filter = "all" | "import" | "local" | "due" | "in range";

export function SupplyTab({ args, enabled }: { args: RpcArgs; enabled: boolean }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const base = { _brand_ids: args._brand_ids, _from: args._from, _to: args._to };
  const key = JSON.stringify(base);

  const sumQ = useQuery({
    queryKey: ["rpt-sup-sum", key],
    enabled,
    ...REPORT_QUERY_OPTS,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpt_supply_summary", base as never);
      if (error) throw error;
      return data as unknown as SupSummary;
    },
  });

  const rowsQ = useQuery({
    queryKey: ["rpt-sup-rows", key],
    enabled,
    ...REPORT_QUERY_OPTS,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpt_supply_rows", base as never);
      if (error) throw error;
      return (data ?? []) as unknown as SupRow[];
    },
  });

  const s = sumQ.data;
  const kpis: Kpi[] = s
    ? [
        { label: "Purchase orders", value: Number(s.pos), kind: "number", hint: `${Number(s.import_pos)} import · ${Number(s.local_pos)} local` },
        { label: "PO value", value: Number(s.po_value) },
        { label: "Paid", value: Number(s.paid), tone: "good" },
        { label: "Due", value: Number(s.due), tone: Number(s.due) > 0 ? "bad" : "good" },
        { label: "Units ordered", value: Number(s.units_ordered), kind: "number" },
        { label: "Avg landed cost", value: Number(s.avg_landed_cost || 0), hint: "per unit" },
        { label: "Cartons in transit", value: Number(s.cartons_in_transit), kind: "number", hint: `${fmtBdt(s.in_transit_value)} stuck in transit` },
        { label: "Payments in range", value: Number(s.payments_in_range), hint: "cash out to suppliers/agents" },
      ]
    : [];

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (rowsQ.data ?? []).filter((r) => {
      if (filter === "import" && r.kind !== "import") return false;
      if (filter === "local" && r.kind !== "local") return false;
      if (filter === "due" && Number(r.due) <= 0) return false;
      if (filter === "in range" && !r.in_range) return false;
      if (!term) return true;
      return (r.po_number ?? "").toLowerCase().includes(term) || (r.supplier ?? "").toLowerCase().includes(term);
    });
  }, [rowsQ.data, filter, search]);

  return (
    <>
      <KpiStrip items={kpis} loading={sumQ.isLoading} />

      <Panel
        title="Purchase orders"
        subtitle={`${rows.length} POs · ${fmtBdt(rows.reduce((a, r) => a + Number(r.total), 0))} value · ${fmtBdt(rows.reduce((a, r) => a + Number(r.due), 0))} due`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1">
              {(["all", "import", "local", "due", "in range"] as const).map((k) => (
                <Button key={k} size="sm" variant={filter === k ? "default" : "outline"} className="h-7 px-2.5 text-xs capitalize" onClick={() => setFilter(k)}>{k}</Button>
              ))}
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="PO or supplier" className="h-7 w-[180px] pl-7 text-xs" />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                exportAoaXlsx(
                  [["Type", "PO", "Supplier", "Order date", "Status", "Units", "Total", "Paid", "Due", "Landed/unit", "Cartons", "Cartons received"],
                   ...rows.map((r) => [r.kind, r.po_number, r.supplier, r.order_date ?? "", r.status, r.units, r.total, r.paid, r.due, r.landed_per_unit, r.cartons, r.cartons_received])],
                  "Supply", "supply-chain",
                )
              }
            >
              <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />Excel
            </Button>
          </div>
        }
      >
        {rowsQ.isLoading ? (
          <Skeleton className="h-[320px] rounded-lg" />
        ) : rows.length === 0 ? (
          <EmptyState text="No purchase orders in this range." />
        ) : (
          <div className="max-h-[560px] overflow-auto rounded-lg border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
                <TableRow>
                  <TableHead>PO</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead className="text-right">Units</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Due</TableHead>
                  <TableHead className="text-right">Landed/unit</TableHead>
                  <TableHead className="text-right">Cartons</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.kind + r.po_id}>
                    <TableCell>
                      <div className="font-medium">{r.po_number}</div>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[10px] uppercase">{r.kind}</Badge>
                        {!r.in_range && <Badge variant="outline" className="text-[10px] uppercase text-muted-foreground">carried over</Badge>}
                        <span className="text-xs text-muted-foreground">{r.status?.replace(/_/g, " ")}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-[200px] truncate">{r.supplier}</div>
                      <div className="text-xs text-muted-foreground">{r.order_date ?? "—"}</div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{Number(r.units).toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtBdt(r.total)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{fmtBdt(r.paid)}</TableCell>
                    <TableCell className={`text-right tabular-nums ${Number(r.due) > 0 ? "text-rose-600 dark:text-rose-400" : ""}`}>{fmtBdt(r.due)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{Number(r.landed_per_unit) > 0 ? fmtBdt(r.landed_per_unit) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {Number(r.cartons) > 0 ? `${Number(r.cartons_received)}/${Number(r.cartons)}` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Panel>

      <SupplierPerformancePanel args={args} enabled={enabled} />
      <CargoLedgerPanel args={args} enabled={enabled} />
    </>
  );
}