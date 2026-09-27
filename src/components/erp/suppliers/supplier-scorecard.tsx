import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";

type Row = {
  supplier_id: string; name: string; po_count: number; total_bdt: number; due_bdt: number;
  avg_lead_days: number | null; late_count: number; open_count: number; score: string;
};
const fmt = (n: number) => "৳" + Math.round(Number(n) || 0).toLocaleString("en-BD");
const scoreVariant = (s: string) => (s === "A" ? "default" : s === "C" ? "destructive" : "secondary") as any;

export function SupplierScorecard({ brandIds }: { brandIds: string[] }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["supplier-scorecard", brandIds.join(",")],
    enabled: brandIds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("supplier_scorecard", { p_brand_ids: brandIds });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
  if (!isLoading && data.length === 0) return null;

  return (
    <div className="rounded-md border bg-card">
      <div className="p-3 border-b">
        <div className="text-sm font-semibold">Supplier scorecard</div>
        <div className="text-xs text-muted-foreground">Order থেকে BD পৌঁছাতে গড় দিন · ৩০ দিনের বেশি = late · A ভালো, C খারাপ</div>
      </div>
      <Table>
        <TableHeader><TableRow>
          <TableHead>Supplier</TableHead><TableHead className="text-right">PO</TableHead>
          <TableHead className="text-right">মোট</TableHead><TableHead className="text-right">Due</TableHead>
          <TableHead className="text-right">গড় দিন</TableHead><TableHead className="text-right">Late</TableHead>
          <TableHead className="text-right">Open</TableHead><TableHead className="text-center">Score</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {isLoading && <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">Loading…</TableCell></TableRow>}
          {data.map((r) => (
            <TableRow key={r.supplier_id}>
              <TableCell className="font-medium">{r.name}</TableCell>
              <TableCell className="text-right font-mono">{r.po_count}</TableCell>
              <TableCell className="text-right font-mono">{fmt(r.total_bdt)}</TableCell>
              <TableCell className="text-right font-mono">{fmt(r.due_bdt)}</TableCell>
              <TableCell className="text-right font-mono">{r.avg_lead_days ?? "—"}</TableCell>
              <TableCell className="text-right font-mono">{r.late_count}</TableCell>
              <TableCell className="text-right font-mono">{r.open_count}</TableCell>
              <TableCell className="text-center"><Badge variant={scoreVariant(r.score)}>{r.score}</Badge></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
