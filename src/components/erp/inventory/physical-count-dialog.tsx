import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ClipboardCheck, AlertTriangle, RefreshCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ProductRow } from "@/lib/erp/inventory";

type Line = { key: string; variantId: string | null; label: string; system: number; counted: string };

/**
 * Physical stock count — শেলফে যা আছে সেটাই সত্য।
 * System stock এর সাথে পার্থক্য হলে variant/product level এ correction movement পোস্ট করে।
 */
export function PhysicalCountDialog({ product, onClose }: { product: ProductRow | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const variants = useMemo(() => (product?.variants ?? []).filter((v) => v.is_active !== false), [product]);

  const initial = useMemo<Line[]>(() => {
    if (!product) return [];
    if (variants.length > 0) {
      return variants.map((v) => ({
        key: v.id,
        variantId: v.id,
        label: v.sku ?? v.label ?? v.color_name ?? v.id.slice(0, 6),
        system: Number(v.stock ?? 0),
        counted: "",
      }));
    }
    return [{ key: "product", variantId: null, label: product.sku ?? "Product level", system: Number(product.stock ?? 0), counted: "" }];
  }, [product, variants]);

  const [lines, setLines] = useState<Line[]>(initial);
  const [seed, setSeed] = useState<string | null>(null);
  if (product && seed !== product.id) {
    setSeed(product.id);
    setLines(initial);
    setNote("");
  }

  const filled = lines.filter((l) => l.counted.trim() !== "");
  const deltas = filled.map((l) => ({ ...l, delta: Number(l.counted) - l.system }));
  const netDelta = deltas.reduce((a, l) => a + l.delta, 0);
  const reserved = Number(product?.reserved_stock ?? 0);
  const countedTotal = lines.reduce((a, l) => a + (l.counted.trim() === "" ? l.system : Number(l.counted) || 0), 0);
  const shortfall = countedTotal - reserved;

  const mut = useMutation({
    mutationFn: async () => {
      if (!product) throw new Error("No product");
      const changes = deltas.filter((l) => l.delta !== 0 && Number.isFinite(l.delta));
      if (!changes.length) throw new Error("কোনো পার্থক্য নেই — count বসাও");
      for (const c of changes) {
        const { error } = await supabase.rpc("adjust_stock_v2", {
          _product_id: product.id,
          _variant_id: (c.variantId ?? null) as unknown as string,
          _delta: c.delta,
          _reason: "correction",
          _note: `physical_audit${note ? ` · ${note}` : ""} · counted ${c.counted} vs system ${c.system}`,
          _source: "stocktake",
        });
        if (error) throw error;
      }
      return changes.length;
    },
    onSuccess: (n) => {
      toast.success(`Physical count applied · ${n} line${n === 1 ? "" : "s"} corrected`);
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["inventory-summary"] });
      qc.invalidateQueries({ queryKey: ["stock-movements"] });
      qc.invalidateQueries({ queryKey: ["low-stock"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resync = useMutation({
    mutationFn: async () => {
      if (!product) throw new Error("No product");
      const { error } = await supabase.rpc("resync_order_stock_for_product", { p_product_id: product.id } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Order ledger resynced");
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["stock-movements"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4" />Physical count — {product?.title}
          </DialogTitle>
          <DialogDescription>শেলফে গুনে যা পেলে সেটাই বসাও। শুধু যেগুলোতে count দিবে সেগুলোই adjust হবে।</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-3 gap-2 rounded-lg border bg-muted/30 p-2 text-xs">
            <div><div className="text-muted-foreground">System stock</div><div className="font-mono text-base font-semibold">{product?.stock ?? 0}</div></div>
            <div><div className="text-muted-foreground">Reserved</div><div className={cn("font-mono text-base font-semibold", reserved > 0 && "text-amber-600 dark:text-amber-400")}>{reserved}</div></div>
            <div><div className="text-muted-foreground">After count</div><div className={cn("font-mono text-base font-semibold", shortfall < 0 && "text-red-600 dark:text-red-400")}>{countedTotal}</div></div>
          </div>

          <div className="space-y-2">
            {lines.map((l, i) => {
              const d = l.counted.trim() === "" ? null : Number(l.counted) - l.system;
              return (
                <div key={l.key} className="flex items-center gap-2 rounded-lg border p-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-xs">{l.label}</div>
                    <div className="text-[11px] text-muted-foreground">System {l.system}</div>
                  </div>
                  <Input
                    type="number" min={0} inputMode="numeric" placeholder="count"
                    className="h-9 w-24 text-right font-mono"
                    value={l.counted}
                    onChange={(e) => setLines((prev) => prev.map((x, xi) => (xi === i ? { ...x, counted: e.target.value } : x)))}
                  />
                  <div className={cn(
                    "w-14 text-right font-mono text-xs",
                    d == null ? "text-muted-foreground/40" : d === 0 ? "text-muted-foreground" : d > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
                  )}>
                    {d == null ? "—" : d > 0 ? `+${d}` : d}
                  </div>
                </div>
              );
            })}
          </div>

          {shortfall < 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-400/60 bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Count ({countedTotal}) reserved ({reserved}) থেকে কম — {Math.abs(shortfall)} pcs pending order shortfall হবে।</span>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Note (optional)</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="যেমন: shelf audit 29 Aug" />
          </div>

          <button
            type="button"
            onClick={() => resync.mutate()}
            disabled={resync.isPending}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50"
          >
            <RefreshCcw className={cn("h-3.5 w-3.5", resync.isPending && "animate-spin")} />
            Order ledger resync করো (missing order movements ঠিক করে)
          </button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || deltas.every((d) => d.delta === 0)}>
            {mut.isPending ? "Applying…" : `Apply count${netDelta ? ` (${netDelta > 0 ? "+" : ""}${netDelta})` : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
