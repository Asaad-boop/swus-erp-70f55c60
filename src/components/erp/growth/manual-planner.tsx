import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Copy, Calculator, Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtValue, shiftMonth, monthLabel } from "@/lib/erp/hub/hub-data";

export type PlanScenarioRow = {
  id: string;
  brand_id: string | null;
  month: string;
  product_name: string;
  qty: number;
  sell_price: number;
  cost_price: number;
  marketing_cost: number;
  note: string | null;
  position: number;
};

const bdt = (n: number) => fmtValue(n, "bdt");
const num = (n: number) => Math.round(n).toLocaleString("en-BD");

async function fetchScenarioRows(brandId: string | null, month: string) {
  let q = supabase.from("hub_plan_scenarios").select("*").eq("month", month).order("position").order("created_at");
  q = brandId ? q.eq("brand_id", brandId) : q.is("brand_id", null);
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as unknown as PlanScenarioRow[]).map((r) => ({
    ...r,
    qty: Number(r.qty ?? 0),
    sell_price: Number(r.sell_price ?? 0),
    cost_price: Number(r.cost_price ?? 0),
    marketing_cost: Number(r.marketing_cost ?? 0),
  }));
}

function rowMath(r: PlanScenarioRow) {
  const revenue = r.qty * r.sell_price;
  const cogs = r.qty * r.cost_price;
  const marketing = r.marketing_cost;
  const profit = revenue - cogs - marketing;
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
  return { revenue, cogs, marketing, profit, margin };
}

/** Manual multi-product plan with 10/20/30% profit scenarios, archived per month. */
export function ManualPlanner({
  brandId,
  month,
  onTotals,
}: {
  brandId: string | null;
  month: string;
  onTotals?: (t: { qty: number; revenue: number; cogs: number; marketing: number; profit: number }) => void;
}) {
  const qc = useQueryClient();
  const key = ["hub-plan-scenarios", brandId, month];
  const rowsQ = useQuery({ queryKey: key, queryFn: () => fetchScenarioRows(brandId, month) });
  const [draft, setDraft] = useState<Record<string, Partial<PlanScenarioRow>>>({});

  useEffect(() => setDraft({}), [brandId, month]);

  const rows = useMemo(
    () => (rowsQ.data ?? []).map((r) => ({ ...r, ...draft[r.id] }) as PlanScenarioRow),
    [rowsQ.data, draft],
  );

  const invalidate = () => qc.invalidateQueries({ queryKey: key });

  const addRow = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("hub_plan_scenarios").insert({
        brand_id: brandId,
        month,
        product_name: "",
        position: rows.length,
      } as never);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const saveRow = useMutation({
    mutationFn: async (r: PlanScenarioRow) => {
      const { error } = await supabase
        .from("hub_plan_scenarios")
        .update({
          product_name: r.product_name,
          qty: r.qty,
          sell_price: r.sell_price,
          cost_price: r.cost_price,
          marketing_cost: r.marketing_cost,
        } as never)
        .eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: (_d, r) => {
      setDraft((d) => {
        const n = { ...d };
        delete n[r.id];
        return n;
      });
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delRow = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hub_plan_scenarios").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const copyPrev = useMutation({
    mutationFn: async () => {
      const prev = shiftMonth(month, -1);
      const src = await fetchScenarioRows(brandId, prev);
      if (src.length === 0) throw new Error(`${monthLabel(prev)}-এ কোনো row নেই`);
      const { error } = await supabase.from("hub_plan_scenarios").insert(
        src.map((r, i) => ({
          brand_id: brandId,
          month,
          product_name: r.product_name,
          qty: r.qty,
          sell_price: r.sell_price,
          cost_price: r.cost_price,
          marketing_cost: r.marketing_cost,
          note: r.note,
          position: rows.length + i,
        })) as never,
      );
      if (error) throw error;
      return src.length;
    },
    onSuccess: (n) => {
      toast.success(`${n}টি row কপি হয়েছে`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totals = useMemo(
    () =>
      rows.reduce(
        (a, r) => {
          const m = rowMath(r);
          return {
            qty: a.qty + r.qty,
            revenue: a.revenue + m.revenue,
            cogs: a.cogs + m.cogs,
            marketing: a.marketing + m.marketing,
            profit: a.profit + m.profit,
          };
        },
        { qty: 0, revenue: 0, cogs: 0, marketing: 0, profit: 0 },
      ),
    [rows],
  );
  const totalMargin = totals.revenue > 0 ? (totals.profit / totals.revenue) * 100 : 0;

  useEffect(() => {
    onTotals?.(totals);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totals]);

  const scenarios = [10, 20, 30].map((pct) => {
    const targetProfit = (totals.revenue * pct) / 100;
    // Revenue needed if cost + marketing stays same and margin = pct
    const baseCost = totals.cogs + totals.marketing;
    const neededRevenue = pct < 100 ? baseCost / (1 - pct / 100) : 0;
    const priceFactor = totals.revenue > 0 ? neededRevenue / totals.revenue : 0;
    return { pct, targetProfit, neededRevenue, gap: targetProfit - totals.profit, priceFactor };
  });

  const exportCsv = () => {
    const head = ["Product", "Qty", "Sell price", "Cost price", "Marketing", "Revenue", "COGS", "Profit", "Margin %"];
    const body = rows.map((r) => {
      const m = rowMath(r);
      return [r.product_name, r.qty, r.sell_price, r.cost_price, r.marketing_cost, m.revenue, m.cogs, m.profit, m.margin.toFixed(1)];
    });
    const csv = [head, ...body].map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `manual-plan-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const patch = (id: string, p: Partial<PlanScenarioRow>) =>
    setDraft((d) => ({ ...d, [id]: { ...d[id], ...p } }));

  const NumCell = ({ r, field }: { r: PlanScenarioRow; field: keyof PlanScenarioRow }) => (
    <Input
      type="number"
      inputMode="decimal"
      className="h-8 w-24 text-right"
      value={String(r[field] ?? 0)}
      onChange={(e) => patch(r.id, { [field]: Number(e.target.value) } as Partial<PlanScenarioRow>)}
      onBlur={() => draft[r.id] && saveRow.mutate(r)}
    />
  );

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Calculator className="h-4 w-4 text-primary" />
            <h3 className="font-display text-sm font-semibold">Manual product plan — {monthLabel(month)}</h3>
            <Badge variant="secondary">{rows.length} product</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => copyPrev.mutate()} disabled={copyPrev.isPending}>
              <Copy className="mr-1 h-3.5 w-3.5" /> আগের মাস কপি
            </Button>
            <Button size="sm" variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
              <Download className="mr-1 h-3.5 w-3.5" /> CSV
            </Button>
            <Button size="sm" onClick={() => addRow.mutate()} disabled={addRow.isPending}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Product যোগ
            </Button>
          </div>
        </div>

        {rowsQ.isLoading ? (
          <Skeleton className="h-32 w-full rounded-lg" />
        ) : rows.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            এখনো কোনো product দেওয়া হয়নি — "Product যোগ" দিয়ে নাম, piece, sell price, cost price ও marketing cost বসাও।
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Product</th>
                  <th className="px-3 py-2 text-right font-medium">Qty (pcs)</th>
                  <th className="px-3 py-2 text-right font-medium">Sell price</th>
                  <th className="px-3 py-2 text-right font-medium">Cost price</th>
                  <th className="px-3 py-2 text-right font-medium">Marketing</th>
                  <th className="px-3 py-2 text-right font-medium">Revenue</th>
                  <th className="px-3 py-2 text-right font-medium">Profit</th>
                  <th className="px-3 py-2 text-right font-medium">Margin</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const m = rowMath(r);
                  return (
                    <tr key={r.id} className="border-t">
                      <td className="px-3 py-1.5">
                        <Input
                          className="h-8 min-w-[180px]"
                          placeholder="Product নাম"
                          value={r.product_name}
                          onChange={(e) => patch(r.id, { product_name: e.target.value })}
                          onBlur={() => draft[r.id] && saveRow.mutate(r)}
                        />
                      </td>
                      <td className="px-3 py-1.5 text-right"><NumCell r={r} field="qty" /></td>
                      <td className="px-3 py-1.5 text-right"><NumCell r={r} field="sell_price" /></td>
                      <td className="px-3 py-1.5 text-right"><NumCell r={r} field="cost_price" /></td>
                      <td className="px-3 py-1.5 text-right"><NumCell r={r} field="marketing_cost" /></td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{bdt(m.revenue)}</td>
                      <td className={`px-3 py-1.5 text-right tabular-nums ${m.profit < 0 ? "text-destructive" : "text-emerald-600"}`}>
                        {bdt(m.profit)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{m.margin.toFixed(1)}%</td>
                      <td className="px-2 py-1.5 text-right">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => delRow.mutate(r.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t bg-muted/30 font-medium">
                <tr>
                  <td className="px-3 py-2">Total</td>
                  <td className="px-3 py-2 text-right tabular-nums">{num(totals.qty)}</td>
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2 text-right tabular-nums">{bdt(totals.cogs)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{bdt(totals.marketing)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{bdt(totals.revenue)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${totals.profit < 0 ? "text-destructive" : "text-emerald-600"}`}>
                    {bdt(totals.profit)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{totalMargin.toFixed(1)}%</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Profit scenarios */}
        <div className="grid gap-3 sm:grid-cols-3">
          {scenarios.map((s) => (
            <div key={s.pct} className="rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{s.pct}% profit হলে</span>
                <Badge variant={totalMargin >= s.pct ? "default" : "secondary"}>
                  {totalMargin >= s.pct ? "পৌঁছেছে" : "বাকি"}
                </Badge>
              </div>
              <p className="mt-1 font-display text-lg font-semibold tabular-nums">{bdt(s.targetProfit)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                দরকার revenue {bdt(s.neededRevenue)} • price ×{s.priceFactor ? s.priceFactor.toFixed(2) : "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                বর্তমান থেকে {s.gap >= 0 ? "কম" : "বেশি"} {bdt(Math.abs(s.gap))}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}