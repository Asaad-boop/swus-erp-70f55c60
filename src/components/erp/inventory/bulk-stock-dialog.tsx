import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STOCK_REASONS, type ProductRow } from "@/lib/erp/inventory";
import { AlertTriangle, Layers } from "lucide-react";

type Mode = "in" | "out";

export function BulkStockDialog({
  open, mode, products, onClose,
}: {
  open: boolean;
  mode: Mode;
  products: ProductRow[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState<string>(mode === "in" ? "stock_in" : "stock_out");
  const [note, setNote] = useState("");
  const [unitCost, setUnitCost] = useState("");

  const withVariants = products.filter((p) => (p.variants?.length ?? 0) > 0);

  const mut = useMutation({
    mutationFn: async () => {
      if (!qty || qty <= 0) throw new Error("Quantity must be > 0");
      const delta = mode === "in" ? qty : -qty;
      const uc = unitCost ? Number(unitCost) : undefined;
      const failed: string[] = [];
      let done = 0;
      for (const p of products) {
        const { error } = await supabase.rpc("adjust_stock_v2", {
          _product_id: p.id,
          _variant_id: null as unknown as string,
          _delta: delta,
          _reason: reason,
          _note: note || `Bulk ${mode === "in" ? "stock in" : "stock out"}`,
          _unit_cost: mode === "in" ? uc : undefined,
          _source: "manual",
        } as never);
        if (error) failed.push(`${p.title}: ${error.message}`);
        else done += 1;
      }
      return { done, failed };
    },
    onSuccess: ({ done, failed }) => {
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["inventory-summary"] });
      qc.invalidateQueries({ queryKey: ["stock-movements"] });
      qc.invalidateQueries({ queryKey: ["low-stock"] });
      if (failed.length) {
        toast.warning(`${done} updated, ${failed.length} failed`, { description: failed.slice(0, 3).join(" | "), duration: 8000 });
      } else {
        toast.success(`${done} product${done === 1 ? "" : "s"} ${mode === "in" ? "stocked in" : "stocked out"}`);
      }
      setQty(1); setNote(""); setUnitCost("");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bulk {mode === "in" ? "Stock In" : "Stock Out"} — {products.length} products</DialogTitle>
          <DialogDescription>
            Protita selected product-e product-level e same quantity apply hobe.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="max-h-32 overflow-y-auto rounded-md border bg-muted/30 p-2 text-xs space-y-1">
            {products.slice(0, 8).map((p) => (
              <div key={p.id} className="flex justify-between gap-2">
                <span className="truncate">• {p.title}</span>
                <span className="font-mono text-muted-foreground shrink-0">
                  {p.stock} → {Math.max(p.stock + (mode === "in" ? qty : -qty), 0)}
                </span>
              </div>
            ))}
            {products.length > 8 && <div className="text-muted-foreground">+{products.length - 8} more…</div>}
          </div>

          <div className="space-y-1.5">
            <Label>Quantity (per product)</Label>
            <Input type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value) || 0)} />
          </div>

          {mode === "in" && (
            <div className="space-y-1.5">
              <Label>Unit cost (BDT) — optional, updates weighted-avg cost</Label>
              <Input type="number" min={0} step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STOCK_REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Note (optional)</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          {withVariants.length > 0 && (
            <div className="flex items-start gap-2 rounded-md border border-amber-400 bg-amber-50 dark:bg-amber-950/30 p-2 text-xs text-amber-800 dark:text-amber-300">
              <Layers className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                {withVariants.length}-ta product-er variant ache. Bulk adjust product-level e hobe — variant-wise thik korte row expand kore alada adjust korun.
              </span>
            </div>
          )}
          {mode === "out" && (
            <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>Reserved stock-er niche neme gele server oi product-tar adjust reject korbe — baki gulo apply hobe.</span>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mut.isPending}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || products.length === 0}>
            {mut.isPending ? "Applying…" : `Apply to ${products.length}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
