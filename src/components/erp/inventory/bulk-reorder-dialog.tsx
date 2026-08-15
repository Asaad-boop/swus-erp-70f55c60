import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProductRow } from "@/lib/erp/inventory";

export function BulkReorderDialog({
  open, products, onClose,
}: {
  open: boolean;
  products: ProductRow[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [reorderPoint, setReorderPoint] = useState("10");
  const [reorderQty, setReorderQty] = useState("");
  const [threshold, setThreshold] = useState("");

  const mut = useMutation({
    mutationFn: async () => {
      const ids = products.map((p) => p.id);
      const patch: Record<string, number> = {};
      if (reorderPoint !== "") patch.reorder_point = Number(reorderPoint);
      if (reorderQty !== "") patch.reorder_qty = Number(reorderQty);
      if (threshold !== "") patch.low_stock_threshold = Number(threshold);
      if (Object.keys(patch).length === 0) throw new Error("Kichu ekta value din");
      const prev = products.map((p) => ({
        id: p.id,
        reorder_point: p.reorder_point ?? 0,
        reorder_qty: p.reorder_qty ?? 0,
        low_stock_threshold: p.low_stock_threshold ?? 5,
      }));
      const { error } = await supabase.from("products").update(patch).in("id", ids);
      if (error) throw error;
      return { count: ids.length, prev, patch };
    },
    onSuccess: ({ count, prev, patch }) => {
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["inventory-summary"] });
      toast.success(`${count} product${count === 1 ? "" : "s"} updated`, {
        action: {
          label: "Undo",
          onClick: async () => {
            for (const p of prev) {
              const revert: Record<string, number> = {};
              for (const k of Object.keys(patch)) revert[k] = (p as never as Record<string, number>)[k];
              await supabase.from("products").update(revert).eq("id", p.id);
            }
            qc.invalidateQueries({ queryKey: ["inventory"] });
            toast.success("Restored");
          },
        },
        duration: 8000,
      });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reorder settings — {products.length} products</DialogTitle>
          <DialogDescription>Khali field gulo unchanged thakbe.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="space-y-1.5">
            <Label>Reorder point</Label>
            <Input type="number" min={0} value={reorderPoint} onChange={(e) => setReorderPoint(e.target.value)} placeholder="e.g. 10" />
          </div>
          <div className="space-y-1.5">
            <Label>Reorder quantity (optional)</Label>
            <Input type="number" min={0} value={reorderQty} onChange={(e) => setReorderQty(e.target.value)} placeholder="e.g. 50" />
          </div>
          <div className="space-y-1.5">
            <Label>Low stock threshold (optional)</Label>
            <Input type="number" min={0} value={threshold} onChange={(e) => setThreshold(e.target.value)} placeholder="e.g. 5" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mut.isPending}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>{mut.isPending ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
