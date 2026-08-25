import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Tag, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { fmtBdt } from "@/lib/erp/finance";
import { Panel, EmptyState, REPORT_QUERY_OPTS } from "@/components/erp/reports/report-kit";
import type { RpcArgs } from "@/components/erp/reports/customers-tab";

type Row = {
  id: string;
  transaction_date: string;
  txn_type: string;
  amount: number;
  description: string | null;
  account: string | null;
};

type Cat = { id: string; name: string; excluded_from_pnl: boolean };

/**
 * Uncategorized income/expense fixer.
 * These rows land in P&L as "Uncategorized" and silently distort net profit,
 * so they are surfaced here with inline categorisation instead of being guessed.
 */
export function UncategorizedPanel({ args, enabled }: { args: RpcArgs; enabled: boolean }) {
  const qc = useQueryClient();
  const base = { _brand_ids: args._brand_ids, _from: args._from, _to: args._to };
  const key = JSON.stringify(base);
  const [saving, setSaving] = useState<string | null>(null);

  const rowsQ = useQuery({
    queryKey: ["rpt-uncategorized", key],
    enabled,
    ...REPORT_QUERY_OPTS,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("erp_transactions")
        .select("id, transaction_date, txn_type, amount, description, erp_accounts:account_id(name)")
        .in("brand_id", base._brand_ids)
        .in("txn_type", ["income", "expense"])
        .is("category_id", null)
        .is("reference_type", null)
        .gte("transaction_date", base._from)
        .lte("transaction_date", base._to)
        .order("amount", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id,
        transaction_date: r.transaction_date,
        txn_type: r.txn_type,
        amount: Number(r.amount ?? 0),
        description: r.description,
        account: (r as unknown as { erp_accounts?: { name?: string } }).erp_accounts?.name ?? null,
      })) as Row[];
    },
  });

  const catsQ = useQuery({
    queryKey: ["rpt-expense-categories", base._brand_ids.join(",")],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("erp_expense_categories")
        .select("id, name, excluded_from_pnl")
        .order("name");
      if (error) throw error;
      const seen = new Set<string>();
      return (data ?? []).filter((c) => {
        if (seen.has(c.name)) return false;
        seen.add(c.name);
        return true;
      }) as Cat[];
    },
  });

  const rows = rowsQ.data ?? [];
  const total = rows.reduce((a, r) => a + (r.txn_type === "expense" ? r.amount : -r.amount), 0);

  async function assign(id: string, categoryId: string) {
    setSaving(id);
    const { error } = await supabase.from("erp_transactions").update({ category_id: categoryId }).eq("id", id);
    setSaving(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Category set — P&L updated");
    void qc.invalidateQueries({ queryKey: ["rpt-uncategorized"] });
    void qc.invalidateQueries({ queryKey: ["rpt-pnl-v2"] });
  }

  if (!rowsQ.isLoading && rows.length === 0) return null;

  return (
    <Panel
      title="Uncategorized income & expense"
      subtitle="These rows hit P&L as “Uncategorized”. Assign a category to fix net profit — no number is changed, only its classification."
      action={
        <Badge variant="outline" className="border-amber-500/40 font-normal text-amber-600 dark:text-amber-400">
          <Tag className="mr-1 h-3 w-3" />
          {rows.length} rows · net {fmtBdt(total)}
        </Badge>
      }
    >
      {rowsQ.isLoading ? (
        <Skeleton className="h-40 rounded-lg" />
      ) : rows.length === 0 ? (
        <EmptyState text="Everything is categorized." />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="w-[240px]">Category</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap tabular-nums">{r.transaction_date}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-normal capitalize">{r.txn_type}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{r.account ?? "—"}</TableCell>
                  <TableCell className="max-w-[320px] truncate text-muted-foreground">
                    {r.description || <span className="italic">no description</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmtBdt(r.amount)}</TableCell>
                  <TableCell>
                    {saving === r.id ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      <Select onValueChange={(v) => void assign(r.id, v)}>
                        <SelectTrigger className="h-8">
                          <SelectValue placeholder="Set category…" />
                        </SelectTrigger>
                        <SelectContent>
                          {(catsQ.data ?? []).map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                              {c.excluded_from_pnl ? " · not in P&L" : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
