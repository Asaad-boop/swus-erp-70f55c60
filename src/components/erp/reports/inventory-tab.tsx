import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { fmtBdt } from "@/lib/erp/finance";
import { exportAoaXlsx } from "@/lib/erp/utils/excel";
import { Panel, KpiStrip, EmptyState, type Kpi , REPORT_QUERY_OPTS } from "@/components/erp/reports/report-kit";
import type { RpcArgs } from "@/components/erp/reports/customers-tab";

type InvSummary = {
  skus: number; units_on_hand: number; stock_value: number; out_of_stock: number; low_stock: number;
  dead_skus: number; dead_value: number; units_sold: number; sell_through: number; no_cost_skus: number;
};

type InvRow = {
  product_id: string; variant_id: string | null; product_name: string; variant_label: string | null;
  sku: string | null; stock: number; reserved: number; available: number; unit_cost: number;
  stock_value: number; units_sold: number; revenue: number; daily_run_rate: number;
  days_of_cover: number | null; sell_through: number; last_sold: string | null;
  is_dead: boolean; is_low: boolean;
};

type Filter = "all" | "low" | "out" | "dead" | "nocost";
type Sort = "stock_value" | "units_sold" | "revenue" | "stock" | "days_of_cover" | "sell_through";

const SORTS: { key: Sort; label: string }[] = [
  { key: "stock_value", label: "Stock value" },
  { key: "units_sold", label: "Units sold" },
  { key: "revenue", label: "Revenue" },
  { key: "stock", label: "On hand" },
  { key: "sell_through", label: "Sell-through" },
  { key: "days_of_cover", label: "Days of cover" },
];

export function InventoryTab({ args, enabled }: { args: RpcArgs; enabled: boolean }) {
  const [level, setLevel] = useState<"product" | "variant">("product");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("stock_value");
  const [search, setSearch] = useState("");

  const base = { _brand_ids: args._brand_ids, _from: args._from, _to: args._to };

  const sumQ = useQuery({
    queryKey: ["rpt-inv-sum", JSON.stringify(base)],
    enabled,
    ...REPORT_QUERY_OPTS,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpt_inventory_summary", base as never);
      if (error) throw error;
      return data as unknown as InvSummary;
    },
  });

  const rowsQ = useQuery({
    queryKey: ["rpt-inv-rows", JSON.stringify(base), level],
    enabled,
    ...REPORT_QUERY_OPTS,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpt_inventory_rows", { ...base, _level: level } as never);
      if (error) throw error;
      return (data ?? []) as unknown as InvRow[];
    },
  });

  const s = sumQ.data;
  const kpis: Kpi[] = s
    ? [
        { label: "Stock value", value: Number(s.stock_value), hint: `${Number(s.skus).toLocaleString()} active SKUs` },
        { label: "Units on hand", value: Number(s.units_on_hand), kind: "number" },
        { label: "Units sold (range)", value: Number(s.units_sold), kind: "number" },
        { label: "Sell-through", value: Number(s.sell_through), kind: "percent", tone: Number(s.sell_through) >= 30 ? "good" : "default" },
        { label: "Out of stock", value: Number(s.out_of_stock), kind: "number", tone: Number(s.out_of_stock) > 0 ? "bad" : "good" },
        { label: "Low stock", value: Number(s.low_stock), kind: "number", tone: Number(s.low_stock) > 0 ? "bad" : "good" },
        { label: "Dead stock SKUs", value: Number(s.dead_skus), kind: "number", hint: "no sales in range" },
        { label: "Dead stock value", value: Number(s.dead_value), tone: Number(s.dead_value) > 0 ? "bad" : "good" },
      ]
    : [];

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = (rowsQ.data ?? []).filter((r) => {
      if (filter === "low" && !r.is_low) return false;
      if (filter === "out" && Number(r.stock) > 0) return false;
      if (filter === "dead" && !r.is_dead) return false;
      if (filter === "nocost" && !(Number(r.unit_cost) === 0 && Number(r.stock) > 0)) return false;
      if (!term) return true;
      return r.product_name?.toLowerCase().includes(term) || (r.sku ?? "").toLowerCase().includes(term);
    });
    return [...list].sort((a, b) => {
      const av = a[sort] == null ? -1 : Number(a[sort]);
      const bv = b[sort] == null ? -1 : Number(b[sort]);
      return bv - av;
    });
  }, [rowsQ.data, search, sort, filter]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({
          stock: acc.stock + Number(r.stock),
          stock_value: acc.stock_value + Number(r.stock_value),
          units_sold: acc.units_sold + Number(r.units_sold),
          revenue: acc.revenue + Number(r.revenue),
        }),
        { stock: 0, stock_value: 0, units_sold: 0, revenue: 0 },
      ),
    [rows],
  );

  return (
    <>
      <KpiStrip items={kpis} loading={sumQ.isLoading} />

      <Panel
        title="Stock health"
        subtitle={`${rows.length} rows · value ${fmtBdt(totals.stock_value)} · ${totals.units_sold.toLocaleString()} units sold in range`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1">
              <Button size="sm" variant={level === "product" ? "default" : "outline"} className="h-7 px-2.5 text-xs" onClick={() => setLevel("product")}>Product</Button>
              <Button size="sm" variant={level === "variant" ? "default" : "outline"} className="h-7 px-2.5 text-xs" onClick={() => setLevel("variant")}>Variant</Button>
            </div>
            <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
              <SelectTrigger className="h-7 w-[135px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All SKUs</SelectItem>
                <SelectItem value="low">Low stock</SelectItem>
                <SelectItem value="out">Out of stock</SelectItem>
                <SelectItem value="dead">Dead stock</SelectItem>
                <SelectItem value="nocost">Missing cost</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Product / SKU" className="h-7 w-[170px] pl-7 text-xs" />
            </div>
            <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
              <SelectTrigger className="h-7 w-[140px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{SORTS.map((x) => <SelectItem key={x.key} value={x.key}>{x.label}</SelectItem>)}</SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                exportAoaXlsx(
                  [["Product", "Variant", "SKU", "On hand", "Reserved", "Available", "Unit cost", "Stock value", "Units sold", "Revenue", "Daily run rate", "Days of cover", "Sell-through %", "Last sold", "Dead", "Low"],
                   ...rows.map((r) => [r.product_name, r.variant_label ?? "", r.sku ?? "", r.stock, r.reserved, r.available, r.unit_cost, r.stock_value, r.units_sold, r.revenue, r.daily_run_rate, r.days_of_cover ?? "", r.sell_through, r.last_sold ?? "", r.is_dead ? "Yes" : "", r.is_low ? "Yes" : ""])],
                  "Inventory", `inventory-${level}`,
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
          <EmptyState text="No stock rows for this filter." />
        ) : (
          <div className="max-h-[560px] overflow-auto rounded-lg border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">On hand</TableHead>
                  <TableHead className="text-right">Available</TableHead>
                  <TableHead className="text-right">Unit cost</TableHead>
                  <TableHead className="text-right">Stock value</TableHead>
                  <TableHead className="text-right">Sold</TableHead>
                  <TableHead className="text-right">Sell-through</TableHead>
                  <TableHead className="text-right">Cover</TableHead>
                  <TableHead className="text-right">Last sold</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={`${r.product_id}-${r.variant_id ?? "all"}`}>
                    <TableCell>
                      <div className="font-medium">{r.product_name}</div>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        {r.variant_label && <span>{r.variant_label}</span>}
                        {r.sku && <span className="font-mono">{r.sku}</span>}
                        {Number(r.stock) <= 0 && <Badge variant="outline" className="border-rose-500/40 text-rose-600 dark:text-rose-400">Out</Badge>}
                        {r.is_low && Number(r.stock) > 0 && <Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-400">Low</Badge>}
                        {r.is_dead && <Badge variant="outline" className="border-slate-500/40 text-slate-600 dark:text-slate-300">Dead</Badge>}
                        {Number(r.unit_cost) === 0 && Number(r.stock) > 0 && <Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-400">No cost</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{Number(r.stock).toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{Number(r.available).toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{fmtBdt(r.unit_cost)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{fmtBdt(r.stock_value)}</TableCell>
                    <TableCell className="text-right tabular-nums">{Number(r.units_sold).toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{Number(r.sell_through).toFixed(1)}%</TableCell>
                    <TableCell className="text-right tabular-nums">{r.days_of_cover == null ? "—" : `${Number(r.days_of_cover).toFixed(0)}d`}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">{r.last_sold ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableBody>
                <TableRow className="bg-muted/40 font-semibold">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right tabular-nums">{totals.stock.toLocaleString()}</TableCell>
                  <TableCell />
                  <TableCell />
                  <TableCell className="text-right tabular-nums">{fmtBdt(totals.stock_value)}</TableCell>
                  <TableCell className="text-right tabular-nums">{totals.units_sold.toLocaleString()}</TableCell>
                  <TableCell colSpan={3} className="text-right tabular-nums">{fmtBdt(totals.revenue)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </Panel>
    </>
  );
}
