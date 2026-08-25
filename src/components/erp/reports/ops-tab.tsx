import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { fmtBdt } from "@/lib/erp/finance";
import { Panel, KpiStrip, EmptyState, ExportMenu, REPORT_QUERY_OPTS, type Kpi } from "@/components/erp/reports/report-kit";
import type { RpcArgs } from "@/components/erp/reports/customers-tab";

type WhRow = {
  warehouse_id: string; warehouse: string; code: string; skus: number;
  stock_qty: number; stock_value: number; qty_in: number; qty_out: number;
  damaged_qty: number; adjust_qty: number;
};

type TeamRow = {
  user_id: string; person: string; confirmed: number; packed: number; shipped: number;
  cancelled: number; delivered: number; total_actions: number; avg_pack_minutes: number;
};

type CostRow = {
  d: string; product_id: string; product_name: string; sku: string | null;
  supplier: string; source: string; reference: string; qty: number;
  unit_cost: number; landed_cost: number;
};

function WarehousePanel({ args, enabled }: { args: RpcArgs; enabled: boolean }) {
  const base = { _brand_ids: args._brand_ids, _from: args._from, _to: args._to };
  const q = useQuery({
    queryKey: ["rpt-warehouse-summary", JSON.stringify(base)],
    enabled,
    ...REPORT_QUERY_OPTS,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpt_warehouse_summary", base as never);
      if (error) throw error;
      return (data ?? []) as unknown as WhRow[];
    },
  });
  const rows = q.data ?? [];
  if (!q.isLoading && rows.length === 0) return null;

  return (
    <Panel
      title="Warehouse stock"
      subtitle="On-hand qty ও value (movement ledger থেকে) · period-এর stock in / out / damage / adjustment"
      action={
        <ExportMenu
          aoa={() => [
            ["Warehouse", "Code", "SKUs", "Stock qty", "Stock value", "Qty in", "Qty out", "Damaged", "Adjusted"],
            ...rows.map((r) => [r.warehouse, r.code, r.skus, r.stock_qty, r.stock_value, r.qty_in, r.qty_out, r.damaged_qty, r.adjust_qty]),
          ]}
          filename={`warehouse-${base._from}-to-${base._to}`}
          title="Warehouse stock"
          disabled={rows.length === 0}
        />
      }
      flush
    >
      {q.isLoading ? (
        <Skeleton className="m-4 h-[200px] rounded-lg" />
      ) : (
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Warehouse</TableHead>
              <TableHead className="text-right">SKUs</TableHead>
              <TableHead className="text-right">Stock qty</TableHead>
              <TableHead className="text-right">Stock value</TableHead>
              <TableHead className="text-right">In</TableHead>
              <TableHead className="text-right">Out</TableHead>
              <TableHead className="text-right">Damaged</TableHead>
              <TableHead className="text-right">Adjusted</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.warehouse_id}>
                <TableCell>
                  {r.warehouse}
                  {r.code && <span className="ml-1.5 text-xs text-muted-foreground">{r.code}</span>}
                </TableCell>
                <TableCell className="text-right tabular-nums">{Number(r.skus).toLocaleString()}</TableCell>
                <TableCell className="text-right tabular-nums">{Number(r.stock_qty).toLocaleString()}</TableCell>
                <TableCell className="text-right tabular-nums font-medium">{fmtBdt(r.stock_value)}</TableCell>
                <TableCell className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">{Number(r.qty_in).toLocaleString()}</TableCell>
                <TableCell className="text-right tabular-nums text-rose-600 dark:text-rose-400">{Number(r.qty_out).toLocaleString()}</TableCell>
                <TableCell className="text-right tabular-nums">{Number(r.damaged_qty).toLocaleString()}</TableCell>
                <TableCell className="text-right tabular-nums">{Number(r.adjust_qty).toLocaleString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Panel>
  );
}

function TeamPanel({ args, enabled }: { args: RpcArgs; enabled: boolean }) {
  const base = { _brand_ids: args._brand_ids, _from: args._from, _to: args._to };
  const q = useQuery({
    queryKey: ["rpt-team-performance", JSON.stringify(base)],
    enabled,
    ...REPORT_QUERY_OPTS,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpt_team_performance", base as never);
      if (error) throw error;
      return (data ?? []) as unknown as TeamRow[];
    },
  });
  const rows = q.data ?? [];
  if (!q.isLoading && rows.length === 0) return null;

  return (
    <Panel
      title="Team performance"
      subtitle="Order status history থেকে — কে কতটা confirm, pack, ship, cancel করেছে"
      action={
        <ExportMenu
          aoa={() => [
            ["Person", "Confirmed", "Packed", "Shipped", "Delivered", "Cancelled", "Total actions", "Avg pack (min)"],
            ...rows.map((r) => [r.person, r.confirmed, r.packed, r.shipped, r.delivered, r.cancelled, r.total_actions, r.avg_pack_minutes]),
          ]}
          filename={`team-${base._from}-to-${base._to}`}
          title="Team performance"
          disabled={rows.length === 0}
        />
      }
      flush
    >
      {q.isLoading ? (
        <Skeleton className="m-4 h-[200px] rounded-lg" />
      ) : (
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Person</TableHead>
              <TableHead className="text-right">Confirmed</TableHead>
              <TableHead className="text-right">Packed</TableHead>
              <TableHead className="text-right">Shipped</TableHead>
              <TableHead className="text-right">Delivered</TableHead>
              <TableHead className="text-right">Cancelled</TableHead>
              <TableHead className="text-right">Actions</TableHead>
              <TableHead className="text-right">Avg pack</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.user_id}>
                <TableCell>{r.person}</TableCell>
                <TableCell className="text-right tabular-nums">{Number(r.confirmed).toLocaleString()}</TableCell>
                <TableCell className="text-right tabular-nums">{Number(r.packed).toLocaleString()}</TableCell>
                <TableCell className="text-right tabular-nums">{Number(r.shipped).toLocaleString()}</TableCell>
                <TableCell className="text-right tabular-nums">{Number(r.delivered).toLocaleString()}</TableCell>
                <TableCell className="text-right tabular-nums text-rose-600 dark:text-rose-400">{Number(r.cancelled).toLocaleString()}</TableCell>
                <TableCell className="text-right tabular-nums font-medium">{Number(r.total_actions).toLocaleString()}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {Number(r.avg_pack_minutes) > 0 ? `${Number(r.avg_pack_minutes).toFixed(0)}m` : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Panel>
  );
}

function CostHistoryPanel({ args, enabled }: { args: RpcArgs; enabled: boolean }) {
  const [search, setSearch] = useState("");
  const q = useQuery({
    queryKey: ["rpt-product-cost-history", args._brand_ids.join(",")],
    enabled,
    ...REPORT_QUERY_OPTS,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpt_product_cost_history", {
        _brand_ids: args._brand_ids, _product_id: null,
      } as never);
      if (error) throw error;
      return (data ?? []) as unknown as CostRow[];
    },
  });

  const needle = search.trim().toLowerCase();
  const rows = (q.data ?? []).filter(
    (r) => !needle || [r.product_name, r.sku, r.supplier, r.reference].some((s) => (s ?? "").toLowerCase().includes(needle)),
  );
  if (!q.isLoading && (q.data ?? []).length === 0) return null;

  return (
    <Panel
      title="Product cost history"
      subtitle="প্রতিটা purchase-এ unit cost ও landed cost — costing drift track করার জন্য"
      action={
        <div className="flex items-center gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Product, SKU, supplier…"
            className="h-7 w-[180px] text-xs"
          />
          <ExportMenu
            aoa={() => [
              ["Date", "Product", "SKU", "Supplier", "Source", "Reference", "Qty", "Unit cost", "Landed cost"],
              ...rows.map((r) => [r.d, r.product_name, r.sku ?? "", r.supplier, r.source, r.reference, r.qty, r.unit_cost, r.landed_cost]),
            ]}
            filename="product-cost-history"
            title="Product cost history"
            disabled={rows.length === 0}
          />
        </div>
      }
      flush
    >
      {q.isLoading ? (
        <Skeleton className="m-4 h-[240px] rounded-lg" />
      ) : rows.length === 0 ? (
        <div className="p-4"><EmptyState text="কোনো purchase record মেলেনি." /></div>
      ) : (
        <div className="max-h-[520px] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-muted/90 backdrop-blur">
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Ref</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit cost</TableHead>
                <TableHead className="text-right">Landed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.slice(0, 300).map((r, i) => (
                <TableRow key={`${r.reference}-${r.product_id}-${i}`}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{r.d}</TableCell>
                  <TableCell className="max-w-[260px]">
                    <div className="truncate">{r.product_name}</div>
                    {r.sku && <div className="font-mono text-[10px] text-muted-foreground">{r.sku}</div>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{r.supplier}</TableCell>
                  <TableCell className="font-mono text-[11px] text-muted-foreground">{r.reference}</TableCell>
                  <TableCell className="text-right tabular-nums">{Number(r.qty).toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtBdt(r.unit_cost)}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{fmtBdt(r.landed_cost)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Panel>
  );
}

export function OpsTab({ args, enabled }: { args: RpcArgs; enabled: boolean }) {
  const base = { _brand_ids: args._brand_ids, _from: args._from, _to: args._to };
  const whQ = useQuery({
    queryKey: ["rpt-warehouse-summary", JSON.stringify(base)],
    enabled,
    ...REPORT_QUERY_OPTS,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpt_warehouse_summary", base as never);
      if (error) throw error;
      return (data ?? []) as unknown as WhRow[];
    },
  });
  const wh = whQ.data ?? [];
  const kpis: Kpi[] = wh.length
    ? [
        { label: "Stock value on hand", value: wh.reduce((a, r) => a + Number(r.stock_value), 0), hint: `${wh.length} warehouse` },
        { label: "Units on hand", value: wh.reduce((a, r) => a + Number(r.stock_qty), 0), kind: "number" },
        { label: "Units received (period)", value: wh.reduce((a, r) => a + Number(r.qty_in), 0), kind: "number" },
        { label: "Units shipped out (period)", value: wh.reduce((a, r) => a + Number(r.qty_out), 0), kind: "number", goodWhen: "up" },
        { label: "Damaged units", value: wh.reduce((a, r) => a + Number(r.damaged_qty), 0), kind: "number", goodWhen: "down" },
      ]
    : [];

  return (
    <div className="space-y-[var(--rpt-gap)]">
      <KpiStrip items={kpis} loading={whQ.isLoading} />
      <WarehousePanel args={args} enabled={enabled} />
      <TeamPanel args={args} enabled={enabled} />
      <CostHistoryPanel args={args} enabled={enabled} />
    </div>
  );
}
