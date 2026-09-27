import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useBrandPicker } from "@/components/erp/brand-picker-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { fmtBdt } from "@/lib/erp/finance";

export const Route = createFileRoute("/_authenticated/erp/finance/budgets")({
  head: () => ({ meta: [{ title: "Budgets — Finance ERP" }] }),
  component: BudgetsPage,
});

type COA = { id: string; code: string; name: string; account_type: string };
type Budget = { id: string; account_id: string; month: string; amount: number };
type Actual = { account_id: string; total: number };

function monthStart(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); }
function monthEnd(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10); }

function BudgetsPage() {
  const { brandId, effectiveBrand, picker } = useBrandPicker();
  const qc = useQueryClient();
  const [month, setMonth] = useState(() => monthStart(new Date()).slice(0, 7));
  const monthDate = month + "-01";

  const coaQ = useQuery({
    queryKey: ["coa_budget", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase.from("erp_chart_accounts")
        .select("id, code, name, account_type").eq("brand_id", brandId!)
        .eq("is_archived", false).in("account_type", ["expense", "income"]).order("code");
      if (error) throw error;
      return (data ?? []) as COA[];
    },
  });

  const budgetsQ = useQuery({
    queryKey: ["budgets", brandId, monthDate],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase.from("erp_budgets" as never)
        .select("id, account_id, month, amount").eq("brand_id", brandId!).eq("month", monthDate);
      if (error) throw error;
      return (data ?? []) as unknown as Budget[];
    },
  });

  const actualsQ = useQuery({
    queryKey: ["budget_actuals", brandId, monthDate],
    enabled: !!brandId,
    queryFn: async () => {
      const start = monthDate;
      const end = monthEnd(new Date(monthDate));
      const { fetchAllRows } = await import("@/lib/erp/fetch-all-rows");
      const data = await fetchAllRows((f, t) => supabase.from("erp_journal_lines")
        .select("id, account_id, debit, credit, erp_journal_entries!inner(brand_id, entry_date, status)")
        .eq("brand_id", brandId!)
        .gte("erp_journal_entries.entry_date", start)
        .lte("erp_journal_entries.entry_date", end)
        .eq("erp_journal_entries.status", "posted")
        .order("id").range(f, t));
      const map = new Map<string, number>();
      (data ?? []).forEach((l) => {
        const v = (map.get(l.account_id) ?? 0) + Number(l.debit) - Number(l.credit);
        map.set(l.account_id, v);
      });
      return Array.from(map.entries()).map(([account_id, total]) => ({ account_id, total })) as Actual[];
    },
  });

  const upsertMut = useMutation({
    mutationFn: async ({ account_id, amount }: { account_id: string; amount: number }) => {
      const row = { brand_id: brandId!, account_id, month: monthDate, amount };
      const { error } = await supabase.from("erp_budgets" as never)
        .upsert(row as never, { onConflict: "brand_id,account_id,month" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["budgets"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = useMemo(() => {
    const bmap = new Map((budgetsQ.data ?? []).map((b) => [b.account_id, Number(b.amount)]));
    const amap = new Map((actualsQ.data ?? []).map((a) => [a.account_id, Number(a.total)]));
    return (coaQ.data ?? []).map((a) => {
      const budget = bmap.get(a.id) ?? 0;
      const actual_raw = amap.get(a.id) ?? 0;
      // For income accounts, actual is shown as credit-positive
      const actual = a.account_type === "income" ? -actual_raw : actual_raw;
      const pct = budget > 0 ? Math.round((actual / budget) * 100) : 0;
      return { ...a, budget, actual, pct };
    });
  }, [coaQ.data, budgetsQ.data, actualsQ.data]);

  return (
    <div className="p-4 md:p-6 space-y-4">
      {picker && <div className="flex justify-end -mb-1">{picker}</div>}
      <header className="flex flex-wrap justify-between items-end gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Budgets</h1>
          <p className="text-sm text-muted-foreground">Monthly budget vs actual per account.</p>
        </div>
        <div className="min-w-[180px]">
          <Label className="text-xs">Month</Label>
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
      </header>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Account</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Budget</TableHead>
              <TableHead className="text-right">Actual</TableHead>
              <TableHead className="text-right">Used</TableHead>
              <TableHead className="text-right">Variance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {coaQ.isLoading && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>}
            {!coaQ.isLoading && rows.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No income/expense accounts.</TableCell></TableRow>
            )}
            {rows.map((r) => {
              const variance = r.budget - r.actual;
              const over = r.budget > 0 && r.actual > r.budget;
              return (
                <TableRow key={r.id}>
                  <TableCell><div className="font-medium text-sm">{r.code} · {r.name}</div></TableCell>
                  <TableCell><span className="text-xs text-muted-foreground capitalize">{r.account_type}</span></TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number" step="0.01" className="h-8 text-right font-mono w-32 ml-auto"
                      defaultValue={r.budget || ""}
                      onBlur={(e) => {
                        const v = Number(e.target.value) || 0;
                        if (v !== r.budget) upsertMut.mutate({ account_id: r.id, amount: v });
                      }}
                    />
                  </TableCell>
                  <TableCell className="text-right font-mono">{fmtBdt(r.actual)}</TableCell>
                  <TableCell className="text-right">
                    {r.budget > 0 ? (
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className={`h-full ${over ? "bg-red-500" : r.pct > 80 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, r.pct)}%` }} />
                        </div>
                        <span className={`text-xs font-mono ${over ? "text-red-600 font-semibold" : ""}`}>{r.pct}%</span>
                      </div>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className={`text-right font-mono ${variance < 0 ? "text-red-600" : "text-emerald-600"}`}>
                    {r.budget > 0 ? fmtBdt(variance) : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}