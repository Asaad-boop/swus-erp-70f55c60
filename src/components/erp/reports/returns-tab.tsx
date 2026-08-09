import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { fmtBdt } from "@/lib/erp/finance";
import { exportAoaXlsx } from "@/lib/erp/utils/excel";
import { Panel, KpiStrip, EmptyState, type Kpi } from "@/components/erp/reports/report-kit";
import type { RpcArgs } from "@/components/erp/reports/customers-tab";

type RetSummary = {
  delivered_orders: number; returned_orders: number; return_rate: number; returned_value: number;
  returned_cogs: number; return_courier_cost: number; cases: number; case_units: number;
  refunds: number; product_cost_loss: number; packaging_loss: number; case_delivery_loss: number;
  total_loss: number; case_total_loss: number; estimated_loss: number; loss_source: string;
  restocked_units: number; pending_cases: number; exchanges: number;
  exchange_charges: number; exchange_loss: number;
};

type RetProduct = {
  product_id: string; product_name: string; sku: string | null; units_sold: number;
  returned_units: number; return_rate: number; returned_value: number; cost_loss: number; orders: number;
};

type Reason = { dimension: string; label: string; cases: number; units: number; loss: number };

const DIM_TITLE: Record<string, string> = { type: "Return type", condition: "Item condition", courier: "Courier" };

export function ReturnsTab({ args, enabled }: { args: RpcArgs; enabled: boolean }) {
  const base = { _brand_ids: args._brand_ids, _from: args._from, _to: args._to };

  const sumQ = useQuery({
    queryKey: ["rpt-ret-sum", JSON.stringify(args)],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpt_returns_summary", args as never);
      if (error) throw error;
      return data as unknown as RetSummary;
    },
  });

  const prodQ = useQuery({
    queryKey: ["rpt-ret-prod", JSON.stringify(args)],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpt_returns_products", args as never);
      if (error) throw error;
      return (data ?? []) as unknown as RetProduct[];
    },
  });

  const reasonQ = useQuery({
    queryKey: ["rpt-ret-reason", JSON.stringify(base)],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpt_returns_reasons", base as never);
      if (error) throw error;
      return (data ?? []) as unknown as Reason[];
    },
  });

  const s = sumQ.data;
  const kpis: Kpi[] = s
    ? [
        { label: "Returned orders", value: Number(s.returned_orders), kind: "number", hint: `${Number(s.delivered_orders).toLocaleString()} delivered` },
        { label: "Return rate", value: Number(s.return_rate || 0), kind: "percent", tone: Number(s.return_rate) > 10 ? "bad" : "good", hint: "created-cohort · same as Sales tab" },
        { label: "Returned value", value: Number(s.returned_value), tone: "bad" },
        { label: "Stuck cost in returns", value: Number(s.returned_cogs), hint: "product cost of returned orders" },
        { label: "Return courier cost", value: Number(s.return_courier_cost), tone: "bad" },
        { label: "Return loss (net)", value: Number(s.total_loss), tone: Number(s.total_loss) > 0 ? "bad" : "good", hint: `${s.loss_source ?? "return cases"} · ${Number(s.cases).toLocaleString()} cases` },
        { label: "Restocked units", value: Number(s.restocked_units), kind: "number", hint: `${Number(s.pending_cases).toLocaleString()} cases pending` },
        { label: "Exchange loss", value: Number(s.exchange_loss), tone: Number(s.exchange_loss) > 0 ? "bad" : "good", hint: `${Number(s.exchanges).toLocaleString()} exchanges` },
      ]
    : [];

  const grouped = useMemo(() => {
    const map = new Map<string, Reason[]>();
    for (const r of reasonQ.data ?? []) {
      const list = map.get(r.dimension) ?? [];
      list.push(r);
      map.set(r.dimension, list);
    }
    return Array.from(map.entries());
  }, [reasonQ.data]);

  const prods = prodQ.data ?? [];

  return (
    <>
      <KpiStrip items={kpis} loading={sumQ.isLoading} />

      <Panel title="Return breakdown" subtitle="From return cases created in this range">
        {reasonQ.isLoading ? (
          <Skeleton className="h-[220px] rounded-lg" />
        ) : grouped.length === 0 ? (
          <EmptyState text="No return cases logged in this range." />
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            {grouped.map(([dim, rows]) => (
              <div key={dim} className="overflow-hidden rounded-lg border">
                <div className="border-b bg-muted/40 px-3 py-2 text-xs font-semibold">{DIM_TITLE[dim] ?? dim}</div>
                <Table>
                  <TableHeader className="bg-muted/20">
                    <TableRow>
                      <TableHead className="h-8 text-xs">Label</TableHead>
                      <TableHead className="h-8 text-right text-xs">Cases</TableHead>
                      <TableHead className="h-8 text-right text-xs">Loss</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={dim + r.label}>
                        <TableCell className="capitalize">{r.label.replace(/_/g, " ")}</TableCell>
                        <TableCell className="text-right tabular-nums">{Number(r.cases).toLocaleString()}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtBdt(r.loss)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel
        title="Worst returning products"
        subtitle={`${prods.length} products with returns in range`}
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              exportAoaXlsx(
                [["Product", "SKU", "Units sold", "Returned units", "Return %", "Returned value", "Cost stuck", "Returned orders"],
                 ...prods.map((p) => [p.product_name, p.sku ?? "", p.units_sold ?? 0, p.returned_units ?? 0, p.return_rate ?? 0, p.returned_value, p.cost_loss, p.orders])],
                "Returns", "returns-products",
              )
            }
          >
            <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />Excel
          </Button>
        }
      >
        {prodQ.isLoading ? (
          <Skeleton className="h-[300px] rounded-lg" />
        ) : prods.length === 0 ? (
          <EmptyState text="No product returns in this range." />
        ) : (
          <div className="max-h-[520px] overflow-auto rounded-lg border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Units sold</TableHead>
                  <TableHead className="text-right">Returned</TableHead>
                  <TableHead className="text-right">Return %</TableHead>
                  <TableHead className="text-right">Returned value</TableHead>
                  <TableHead className="text-right">Cost stuck</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {prods.map((p) => (
                  <TableRow key={p.product_id}>
                    <TableCell>
                      <div className="max-w-[320px] truncate font-medium">{p.product_name}</div>
                      {p.sku && <div className="font-mono text-xs text-muted-foreground">{p.sku}</div>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{Number(p.units_sold ?? 0).toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{Number(p.returned_units ?? 0).toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline" className={Number(p.return_rate) > 15 ? "border-rose-500/40 text-rose-600 dark:text-rose-400" : "border-border"}>
                        {Number(p.return_rate ?? 0).toFixed(1)}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmtBdt(p.returned_value)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{fmtBdt(p.cost_loss)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Panel>
    </>
  );
}