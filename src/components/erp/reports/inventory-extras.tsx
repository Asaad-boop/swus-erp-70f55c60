import { useMemo, useState } from "react";
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

type AdjSummary = {
  reason: string; movements: number; units_in: number; units_out: number; net_units: number;
  value_in: number; value_out: number; net_value: number;
};
type AdjRow = {
  id: string; day: string; reason: string; movement_source: string; product_name: string;
  sku: string; variant_label: string; warehouse: string; delta: number; stock_before: number;
  stock_after: number; unit_cost: number; value: number; note: string; reference_type: string; user_email: string;
};
type AgingRow = {
  product_id: string; product_name: string; sku: string; stock: number; unit_cost: number;
  stock_value: number; last_in: string | null; last_sold: string | null; age_days: number; bucket: string;
};
type TakeRow = {
  session_id: string; name: string; status: string; warehouse: string; started_at: string;
  completed_at: string | null; items_counted: number; items_with_variance: number;
  units_over: number; units_short: number; net_units: number; variance_value: number; accuracy_pct: number;
};

const BUCKETS = ["0-30 days", "31-60 days", "61-90 days", "91-180 days", "180+ days"];

function ExcelBtn({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={disabled}>
      <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />Excel
    </Button>
  );
}

export function StockAdjustmentsPanel({ args, enabled }: { args: RpcArgs; enabled: boolean }) {
  const [view, setView] = useState<"reason" | "lines">("reason");
  const base = { _brand_ids: args._brand_ids, _from: args._from, _to: args._to };
  const key = JSON.stringify(base);

  const sumQ = useQuery({
    queryKey: ["rpt-adj-sum", key], enabled, ...REPORT_QUERY_OPTS,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpt_stock_adjustments", base as never);
      if (error) throw error;
      return (data ?? []) as unknown as AdjSummary[];
    },
  });
  const rowsQ = useQuery({
    queryKey: ["rpt-adj-rows", key], enabled: enabled && view === "lines", ...REPORT_QUERY_OPTS,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpt_stock_adjustment_rows", { ...base, _limit: 2000 } as never);
      if (error) throw error;
      return (data ?? []) as unknown as AdjRow[];
    },
  });

  const sum = sumQ.data ?? [];
  const totals = sum.reduce(
    (a, r) => ({ in: a.in + Number(r.units_in), out: a.out + Number(r.units_out), net: a.net + Number(r.net_value) }),
    { in: 0, out: 0, net: 0 },
  );

  return (
    <Panel
      title="Stock adjustments"
      subtitle={`+${totals.in.toLocaleString()} / −${totals.out.toLocaleString()} units · net value ${fmtBdt(totals.net)}`}
      action={
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {(["reason", "lines"] as const).map((v) => (
              <Button key={v} size="sm" variant={view === v ? "default" : "outline"} className="h-7 px-2.5 text-xs capitalize" onClick={() => setView(v)}>
                {v === "reason" ? "By reason" : "Line by line"}
              </Button>
            ))}
          </div>
          <ExcelBtn
            disabled={view === "reason" ? sum.length === 0 : (rowsQ.data ?? []).length === 0}
            onClick={() =>
              view === "reason"
                ? exportAoaXlsx(
                    [["Reason", "Movements", "Units in", "Units out", "Net units", "Value in", "Value out", "Net value"],
                     ...sum.map((r) => [r.reason, Number(r.movements), Number(r.units_in), Number(r.units_out), Number(r.net_units), Number(r.value_in), Number(r.value_out), Number(r.net_value)])],
                    "Adjustments", "stock-adjustments",
                  )
                : exportAoaXlsx(
                    [["Day", "Reason", "Source", "Product", "Variant", "SKU", "Warehouse", "Delta", "Before", "After", "Unit cost", "Value", "Note", "User"],
                     ...(rowsQ.data ?? []).map((r) => [r.day, r.reason, r.movement_source, r.product_name, r.variant_label, r.sku, r.warehouse, Number(r.delta), Number(r.stock_before), Number(r.stock_after), Number(r.unit_cost), Number(r.value), r.note, r.user_email])],
                    "Adjustments", "stock-adjustment-lines",
                  )
            }
          />
        </div>
      }
    >
      {view === "reason" ? (
        sumQ.isLoading ? <Skeleton className="h-[240px] rounded-lg" />
        : sum.length === 0 ? <EmptyState text="No stock movements in this range." />
        : (
          <div className="max-h-[420px] overflow-auto rounded-lg border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
                <TableRow>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Moves</TableHead>
                  <TableHead className="text-right">Units in</TableHead>
                  <TableHead className="text-right">Units out</TableHead>
                  <TableHead className="text-right">Net units</TableHead>
                  <TableHead className="text-right">Net value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sum.map((r) => (
                  <TableRow key={r.reason}>
                    <TableCell className="font-medium capitalize">{r.reason.replace(/_/g, " ")}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{Number(r.movements).toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">{Number(r.units_in).toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums text-rose-600 dark:text-rose-400">{Number(r.units_out).toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{Number(r.net_units).toLocaleString()}</TableCell>
                    <TableCell className={`text-right font-medium tabular-nums ${Number(r.net_value) < 0 ? "text-rose-600 dark:text-rose-400" : ""}`}>{fmtBdt(r.net_value)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )
      ) : rowsQ.isLoading ? <Skeleton className="h-[320px] rounded-lg" />
        : (rowsQ.data ?? []).length === 0 ? <EmptyState text="No movement lines in this range." />
        : (
          <div className="max-h-[520px] overflow-auto rounded-lg border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
                <TableRow>
                  <TableHead>Day</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Delta</TableHead>
                  <TableHead className="text-right">After</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead>By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(rowsQ.data ?? []).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{r.day}</TableCell>
                    <TableCell>
                      <div className="max-w-[260px] truncate font-medium">{r.product_name}</div>
                      <div className="flex gap-1.5 text-xs text-muted-foreground">
                        {r.variant_label && <span>{r.variant_label}</span>}
                        {r.sku && <span className="font-mono">{r.sku}</span>}
                        {r.warehouse && <span>{r.warehouse}</span>}
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px] capitalize">{r.reason.replace(/_/g, " ")}</Badge></TableCell>
                    <TableCell className={`text-right tabular-nums ${Number(r.delta) < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                      {Number(r.delta) > 0 ? "+" : ""}{Number(r.delta).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{Number(r.stock_after).toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtBdt(r.value)}</TableCell>
                    <TableCell className="max-w-[160px] truncate text-xs text-muted-foreground">{r.user_email || r.movement_source || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
    </Panel>
  );
}

export function StockAgingPanel({ args, enabled }: { args: RpcArgs; enabled: boolean }) {
  const q = useQuery({
    queryKey: ["rpt-aging", JSON.stringify(args._brand_ids)], enabled, ...REPORT_QUERY_OPTS,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpt_stock_aging", { _brand_ids: args._brand_ids } as never);
      if (error) throw error;
      return (data ?? []) as unknown as AgingRow[];
    },
  });

  const rows = q.data ?? [];
  const buckets = useMemo(() => {
    const map = new Map(BUCKETS.map((b) => [b, { bucket: b, skus: 0, units: 0, value: 0 }]));
    for (const r of rows) {
      const b = map.get(r.bucket);
      if (!b) continue;
      b.skus += 1; b.units += Number(r.stock); b.value += Number(r.stock_value);
    }
    return Array.from(map.values());
  }, [rows]);
  const totalValue = buckets.reduce((a, b) => a + b.value, 0);
  const oldest = rows.slice(0, 25);

  return (
    <Panel
      title="Stock aging"
      subtitle="Days since last stock-in · current on-hand only"
      action={
        <ExcelBtn
          disabled={rows.length === 0}
          onClick={() =>
            exportAoaXlsx(
              [["Product", "SKU", "On hand", "Unit cost", "Stock value", "Last in", "Last sold", "Age days", "Bucket"],
               ...rows.map((r) => [r.product_name, r.sku, Number(r.stock), Number(r.unit_cost), Number(r.stock_value), r.last_in ?? "", r.last_sold ?? "", Number(r.age_days), r.bucket])],
              "Aging", "stock-aging",
            )
          }
        />
      }
    >
      {q.isLoading ? <Skeleton className="h-[240px] rounded-lg" />
      : rows.length === 0 ? <EmptyState text="No stock on hand." />
      : (
        <>
          <div className="grid gap-2 sm:grid-cols-5">
            {buckets.map((b) => (
              <div key={b.bucket} className="rounded-lg border bg-card/50 p-3">
                <div className="text-xs text-muted-foreground">{b.bucket}</div>
                <div className="mt-1 text-lg font-semibold tabular-nums">{fmtBdt(b.value)}</div>
                <div className="text-xs text-muted-foreground">{b.skus} SKU · {b.units.toLocaleString()} units</div>
                <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary/70" style={{ width: `${totalValue > 0 ? (b.value / totalValue) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 max-h-[400px] overflow-auto rounded-lg border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
                <TableRow>
                  <TableHead>Oldest stock</TableHead>
                  <TableHead className="text-right">Age</TableHead>
                  <TableHead className="text-right">On hand</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead className="text-right">Last sold</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {oldest.map((r) => (
                  <TableRow key={r.product_id}>
                    <TableCell>
                      <div className="max-w-[280px] truncate font-medium">{r.product_name}</div>
                      {r.sku && <div className="font-mono text-xs text-muted-foreground">{r.sku}</div>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <Badge variant="outline" className={Number(r.age_days) > 180 ? "border-rose-500/40 text-rose-600 dark:text-rose-400" : ""}>{r.age_days}d</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{Number(r.stock).toLocaleString()}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{fmtBdt(r.stock_value)}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">{r.last_sold ?? "never"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </Panel>
  );
}

export function StocktakeVariancePanel({ args, enabled }: { args: RpcArgs; enabled: boolean }) {
  const base = { _brand_ids: args._brand_ids, _from: args._from, _to: args._to };
  const q = useQuery({
    queryKey: ["rpt-stocktake", JSON.stringify(base)], enabled, ...REPORT_QUERY_OPTS,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpt_stocktake_variance", base as never);
      if (error) throw error;
      return (data ?? []) as unknown as TakeRow[];
    },
  });
  const rows = q.data ?? [];
  if (!q.isLoading && rows.length === 0) return null;

  return (
    <Panel
      title="Stocktake variance"
      subtitle="Counted vs system, per session"
      action={
        <ExcelBtn
          disabled={rows.length === 0}
          onClick={() =>
            exportAoaXlsx(
              [["Session", "Status", "Warehouse", "Started", "Items counted", "With variance", "Units over", "Units short", "Net units", "Variance value", "Accuracy %"],
               ...rows.map((r) => [r.name, r.status, r.warehouse, r.started_at, Number(r.items_counted), Number(r.items_with_variance), Number(r.units_over), Number(r.units_short), Number(r.net_units), Number(r.variance_value), Number(r.accuracy_pct)])],
              "Stocktake", "stocktake-variance",
            )
          }
        />
      }
    >
      {q.isLoading ? <Skeleton className="h-[200px] rounded-lg" /> : (
        <div className="max-h-[420px] overflow-auto rounded-lg border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
              <TableRow>
                <TableHead>Session</TableHead>
                <TableHead className="text-right">Counted</TableHead>
                <TableHead className="text-right">Variance items</TableHead>
                <TableHead className="text-right">Over / short</TableHead>
                <TableHead className="text-right">Variance value</TableHead>
                <TableHead className="text-right">Accuracy</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.session_id}>
                  <TableCell>
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.warehouse ? `${r.warehouse} · ` : ""}{new Date(r.started_at).toLocaleDateString()} · {r.status}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{Number(r.items_counted).toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{Number(r.items_with_variance).toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums text-xs">
                    <span className="text-emerald-600 dark:text-emerald-400">+{Number(r.units_over).toLocaleString()}</span>
                    {" / "}
                    <span className="text-rose-600 dark:text-rose-400">−{Number(r.units_short).toLocaleString()}</span>
                  </TableCell>
                  <TableCell className={`text-right font-medium tabular-nums ${Number(r.variance_value) < 0 ? "text-rose-600 dark:text-rose-400" : ""}`}>{fmtBdt(r.variance_value)}</TableCell>
                  <TableCell className="text-right tabular-nums">{Number(r.accuracy_pct).toFixed(1)}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Panel>
  );
}
