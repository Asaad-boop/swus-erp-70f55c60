import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, ShieldAlert, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { CatalogProduct } from "@/lib/erp/product-catalog";

type Props = { products: CatalogProduct[]; onClose: () => void; onDeleted?: () => void };

/** Tables whose FK is RESTRICT / NO ACTION — a product referenced there cannot be deleted. */
const BLOCKERS: Array<{ table: string; column: string; label: string }> = [
  { table: "order_items", column: "product_id", label: "Orders" },
  { table: "imp_po_items", column: "product_id", label: "Import PO" },
  { table: "imp_carton_items", column: "product_id", label: "Cartons" },
  { table: "local_po_items", column: "product_id", label: "Local PO" },
  { table: "local_po_receipt_items", column: "product_id", label: "PO receipts" },
  { table: "stocktake_items", column: "product_id", label: "Stocktake" },
  { table: "reorder_suggestions", column: "product_id", label: "Reorder queue" },
  { table: "product_combo_items", column: "child_product_id", label: "Combo parent" },
];

export function ProductDeleteDialog({ products, onClose, onDeleted }: Props) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState("");
  const [checking, setChecking] = useState(true);
  const [blocked, setBlocked] = useState<Record<string, string[]>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setChecking(true);
      const ids = products.map((p) => p.id);
      const found: Record<string, string[]> = {};
      for (const b of BLOCKERS) {
        const { data } = await supabase.from(b.table as never).select(b.column).in(b.column, ids).limit(5000);
        for (const r of (data ?? []) as Array<Record<string, string>>) {
          const id = r[b.column];
          if (!id) continue;
          (found[id] ??= []).push(b.label);
        }
      }
      if (!cancelled) { setBlocked(found); setChecking(false); }
    })();
    return () => { cancelled = true; };
  }, [products]);

  const deletable = products.filter((p) => !blocked[p.id]);
  const locked = products.filter((p) => blocked[p.id]);

  const run = useMutation({
    mutationFn: async () => {
      const ids = deletable.map((p) => p.id);
      const fails: string[] = [];
      let ok = 0;
      for (const id of ids) {
        const { error } = await supabase.from("products").delete().eq("id", id);
        if (error) fails.push(error.message); else ok += 1;
      }
      return { ok, fails };
    },
    onSuccess: ({ ok, fails }) => {
      qc.invalidateQueries({ queryKey: ["products-catalog"] });
      qc.invalidateQueries({ queryKey: ["products-catalog-stats"] });
      if (fails.length) toast.warning(`${ok} deleted, ${fails.length} failed`, { description: fails[0] });
      else toast.success(`${ok} product permanently delete হয়েছে`);
      onDeleted?.();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deactivate = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("products").update({ is_active: false }).in("id", locked.map((p) => p.id));
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products-catalog"] });
      qc.invalidateQueries({ queryKey: ["products-catalog-stats"] });
      toast.success("Locked product গুলো inactive করা হয়েছে");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600"><ShieldAlert className="h-4 w-4" /> Permanent delete</DialogTitle>
          <DialogDescription>
            Database থেকে চিরতরে মুছে যাবে — variants, listings, reviews, stock movements সব সহ। Undo নেই।
          </DialogDescription>
        </DialogHeader>

        {checking ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Dependency check চলছে…</div>
        ) : (
          <div className="space-y-3">
            <ScrollArea className="max-h-52 rounded-lg border">
              <div className="divide-y text-sm">
                {products.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="truncate">{p.title}</span>
                    {blocked[p.id]
                      ? <span className="shrink-0 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">Locked · {[...new Set(blocked[p.id])].join(", ")}</span>
                      : <span className="shrink-0 rounded bg-red-100 px-2 py-0.5 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">Will delete</span>}
                  </div>
                ))}
              </div>
            </ScrollArea>

            {deletable.length > 0 && (
              <div className="space-y-1.5">
                <Label>নিশ্চিত করতে <code className="font-mono text-red-600">DELETE</code> লিখো</Label>
                <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="DELETE" />
              </div>
            )}
            {locked.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {locked.length}টি product order/PO-তে ব্যবহৃত — delete করা যাবে না। এগুলো inactive করে রাখা যায়।
              </p>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          {locked.length > 0 && (
            <Button variant="secondary" disabled={deactivate.isPending} onClick={() => deactivate.mutate()}>
              {locked.length} টা inactive করো
            </Button>
          )}
          <Button
            variant="destructive"
            disabled={checking || deletable.length === 0 || confirm !== "DELETE" || run.isPending}
            onClick={() => run.mutate()}
          >
            {run.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
            Delete {deletable.length}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
