import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STOCK_REASONS, type ProductRow } from "@/lib/erp/inventory";
import { AlertTriangle } from "lucide-react";

type Mode = "in" | "out";
type Props = {
  product: ProductRow | null;
  mode: Mode;
  onClose: () => void;
  initialVariantId?: string | null;
};

export function StockAdjustDialog({ product, mode, onClose, initialVariantId = null }: Props) {
  const qc = useQueryClient();
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState<string>(mode === "in" ? "stock_in" : "stock_out");
  const [note, setNote] = useState("");
  const [unitCost, setUnitCost] = useState<string>("");
  const [variantId, setVariantId] = useState<string | null>(initialVariantId);

  const variants = product?.variants ?? [];
  const selectedVariant = variants.find((v) => v.id === variantId) ?? null;

  const currentStock = selectedVariant ? selectedVariant.stock : product?.stock ?? 0;
  const currentReserved = selectedVariant ? selectedVariant.reserved_stock : (product?.reserved_stock ?? 0);
  const currentAvailable = selectedVariant ? selectedVariant.available_stock : (product?.available_stock ?? currentStock - currentReserved);
  const newStock = Math.max(currentStock + (mode === "in" ? qty : -qty), 0);
  const belowReserved = mode === "out" && newStock < currentReserved;

  const mut = useMutation({
    mutationFn: async () => {
      if (!product) throw new Error("No product");
      if (!qty || qty <= 0) throw new Error("Quantity must be > 0");
      const delta = mode === "in" ? qty : -qty;
      const uc = unitCost ? Number(unitCost) : null;
      const { error } = await supabase.rpc("adjust_stock_v2", {
        _product_id: product.id,
        _variant_id: (variantId ?? null) as unknown as string,
        _delta: delta,
        _reason: reason,
        _note: note || undefined,
        _unit_cost: uc ?? undefined,
        _source: "manual",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(mode === "in" ? "Stock added" : "Stock removed");
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["stock-movements"] });
      qc.invalidateQueries({ queryKey: ["low-stock"] });
      setQty(1); setNote(""); setUnitCost("");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const open = !!product;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "in" ? "Stock In" : "Stock Out"} — {product?.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          {variants.length > 0 && (
            <div className="space-y-1.5">
              <Label>Variant</Label>
              <Select value={variantId ?? "__product"} onValueChange={(v) => setVariantId(v === "__product" ? null : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__product">Product-level ({product?.sku ?? "main"})</SelectItem>
                  {variants.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.sku ?? v.id.slice(0, 6)} · stock {v.stock} · reserved {v.reserved_stock}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-3 gap-2 rounded-md border bg-muted/30 p-2 text-xs">
            <div><div className="text-muted-foreground">In stock</div><div className="font-mono font-semibold text-base">{currentStock}</div></div>
            <div><div className="text-muted-foreground">Reserved</div><div className={`font-mono font-semibold text-base ${currentReserved > 0 ? "text-amber-600" : ""}`}>{currentReserved}</div></div>
            <div><div className="text-muted-foreground">Available</div><div className="font-mono font-semibold text-base">{currentAvailable}</div></div>
          </div>
          <div className="space-y-1.5">
            <Label>Quantity</Label>
            <Input type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value) || 0)} />
          </div>
          {mode === "in" && (
            <div className="space-y-1.5">
              <Label>Unit cost (BDT) — optional, updates weighted-avg cost</Label>
              <Input type="number" min={0} step="0.01" placeholder={selectedVariant ? `WAC: ৳${selectedVariant.weighted_avg_cost}` : `WAC: ৳${product?.weighted_avg_cost ?? 0}`} value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
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
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
          <div className="text-xs text-muted-foreground">
            New stock will be: <span className="font-semibold text-foreground">{newStock}</span>
          </div>
          {belowReserved && (
            <div className="flex items-start gap-2 rounded-md border border-amber-400 bg-amber-50 dark:bg-amber-950/30 p-2 text-xs text-amber-800 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>Adjusting below reserved ({currentReserved}). Server will reject — packing stage orders will still need this stock.</span>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || belowReserved}>
            {mut.isPending ? "Saving…" : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}