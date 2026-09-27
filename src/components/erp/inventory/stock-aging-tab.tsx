import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { cn } from "@/lib/utils";

type Row = {
  product_id: string; title: string; sku: string | null; stock: number; unit_cost: number;
  stock_value: number; last_sold_at: string | null; days_idle: number; bucket: string;
};
const BUCKETS = ["0-30", "31-60", "61-90", "90+"] as const;
const fmt = (n: number) => "৳" + Math.round(n || 0).toLocaleString("en-BD");

export function StockAgingTab({ brandId }: { brandId: string }) {
  const [bucket, setBucket] = useState<string>("90+");
  const { data = [], isLoading, error } = useQuery({
    queryKey: ["stock-aging", brandId],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("inv_stock_aging", { p_brand_ids: [brandId] });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const summary = useMemo(() => BUCKETS.map((b) => {
    const rs = data.filter((r) => r.bucket === b);
    return { b, count: rs.length, units: rs.reduce((s, r) => s + Number(r.stock), 0), value: rs.reduce((s, r) => s + Number(r.stock_value), 0) };
  }), [data]);
  const rows = data.filter((r) => r.bucket === bucket);

  const exportCsv = () => {
    const lines = [["Product", "SKU", "Stock", "Unit cost", "Value", "Last sold", "Days idle"].join(",")];
    for (const r of rows) lines.push([`"${r.title.replace(/"/g, "'")}"`, r.sku ?? "", r.stock, r.unit_cost, r.stock_value, r.last_sold_at?.slice(0, 10) ?? "never", r.days_idle].join(","));
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = `stock-aging-${bucket}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  if (error) return <Card className="p-6 text-sm text-destructive">Report load করা যায়নি: {(error as Error).message}</Card>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {summary.map((s) => (
          <button key={s.b} onClick={() => setBucket(s.b)} className="text-left">
            <Card className={cn("p-4 transition-colors", bucket === s.b ? "border-primary bg-primary/5" : "hover:bg-muted/40")}>
              <div className="text-xs text-muted-foreground">{s.b} দিন {s.b === "90+" && "· Dead stock"}</div>
              <div className="text-xl font-bold mt-1">{fmt(s.value)}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{s.count} product · {s.units} pcs</div>
            </Card>
          </button>
        ))}
      </div>
      <Card>
        <div className="flex items-center justify-between p-3 border-b">
          <div className="text-sm font-semibold">{bucket} দিন ধরে বিক্রি নাই — {rows.length} product</div>
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={!rows.length}><Download className="h-3.5 w-3.5 mr-1" />CSV</Button>
        </div>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Product</TableHead><TableHead className="text-right">Stock</TableHead>
            <TableHead className="text-right">Value</TableHead><TableHead>Last sold</TableHead><TableHead className="text-right">Days idle</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>}
            {!isLoading && !rows.length && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">এই bucket-এ কোনো product নাই</TableCell></TableRow>}
            {rows.map((r) => (
              <TableRow key={r.product_id}>
                <TableCell><div className="font-medium">{r.title}</div><div className="text-xs text-muted-foreground">{r.sku ?? "—"}</div></TableCell>
                <TableCell className="text-right font-mono">{r.stock}</TableCell>
                <TableCell className="text-right font-mono">{fmt(r.stock_value)}</TableCell>
                <TableCell className="text-xs">{r.last_sold_at ? new Date(r.last_sold_at).toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka" }) : "কখনো না"}</TableCell>
                <TableCell className="text-right font-mono">{r.days_idle}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
