import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STOCK_REASONS } from "@/lib/erp/inventory";
import type { CatalogProduct } from "@/lib/erp/product-catalog";
import { cn } from "@/lib/utils";
import { ArrowDownCircle, ArrowUpCircle, History, Layers, TrendingDown, TrendingUp, Wallet } from "lucide-react";

type Mode = "in" | "out";
const money = (n: number) => `৳${(Math.round(n * 100) / 100).toLocaleString("en-BD")}`;

/** Existing avg cost: WAC first, else manual cost price. */
function baseCost(p: CatalogProduct) {
  const wac = Number(p.weighted_avg_cost ?? 0);
  const cp = Number(p.cost_price ?? 0);
  const value = wac > 0 ? wac : cp;
  return { value, source: wac > 0 ? ("wac" as const) : cp > 0 ? ("manual" as const) : ("none" as const) };
}

type LineState = { qty: string; cost: string };

export function CatalogStockDialog({
  open, mode, products, onClose,
}: {
  open: boolean;
  mode: Mode;
  products: CatalogProduct[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const single = products.length === 1 ? products[0] : null;
  const [lines, setLines] = useState<Record<string, LineState>>({});
  const [reason, setReason] = useState<string>(mode === "in" ? "stock_in" : "stock_out");
  const [note, setNote] = useState("");
  const [variantId, setVariantId] = useState<string | null>(null);
  const [applyCostAll, setApplyCostAll] = useState("");

  // reset on open
  useEffect(() => {
    if (!open) return;
    const init: Record<string, LineState> = {};
    for (const p of products) init[p.id] = { qty: "1", cost: mode === "in" ? (baseCost(p).value ? String(baseCost(p).value) : "") : "" };
    setLines(init);
    setReason(mode === "in" ? "stock_in" : "stock_out");
    setNote("");
    setVariantId(null);
    setApplyCostAll("");
  }, [open, mode, products.map((p) => p.id).join(",")]);

  // last purchase history for single product
  const history = useQuery({
    queryKey: ["catalog-stock-history", single?.id],
    enabled: !!single && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_movements")
        .select("id,created_at,quantity,unit_cost_bdt,reason,note")
        .eq("product_id", single!.id)
        .order("created_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      return data ?? [];
    },
  });

  const setLine = (id: string, patch: Partial<LineState>) =>
    setLines((s) => ({ ...s, [id]: { ...(s[id] ?? { qty: "1", cost: "" }), ...patch } }));

  const totals = useMemo(() => {
    let units = 0;
    let value = 0;
    for (const p of products) {
      const l = lines[p.id];
      const q = Number(l?.qty ?? 0) || 0;
      const c = mode === "in" ? Number(l?.cost ?? 0) || baseCost(p).value : baseCost(p).value;
      units += q;
      value += q * c;
    }
    return { units, value };
  }, [lines, products, mode]);

  const mut = useMutation({
    mutationFn: async () => {
      const failed: string[] = [];
      let done = 0;
      for (const p of products) {
        const q = Number(lines[p.id]?.qty ?? 0) || 0;
        if (q <= 0) continue;
        const uc = mode === "in" ? Number(lines[p.id]?.cost ?? 0) || undefined : undefined;
        const { error } = await supabase.rpc("adjust_stock_v2", {
          _product_id: p.id,
          _variant_id: (single && variantId ? variantId : null) as unknown as string,
          _delta: mode === "in" ? q : -q,
          _reason: reason,
          _note: note || undefined,
          _unit_cost: uc,
          _source: "manual",
        } as never);
        if (error) failed.push(`${p.title}: ${error.message}`);
        else done += 1;
      }
      if (done === 0 && failed.length === 0) throw new Error("Quantity দাও আগে");
      return { done, failed };
    },
    onSuccess: ({ done, failed }) => {
      for (const k of ["products-catalog", "products-catalog-stats", "inventory", "inventory-summary", "stock-movements", "low-stock"]) {
        qc.invalidateQueries({ queryKey: [k] });
      }
      if (failed.length) toast.warning(`${done} applied, ${failed.length} failed`, { description: failed.slice(0, 3).join(" | "), duration: 8000 });
      else toast.success(`${done} product ${mode === "in" ? "stock in" : "stock out"} হয়েছে`);
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isIn = mode === "in";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isIn ? <ArrowDownCircle className="h-5 w-5 text-emerald-600" /> : <ArrowUpCircle className="h-5 w-5 text-red-600" />}
            {isIn ? "Stock In" : "Stock Out"} {single ? `— ${single.title}` : `— ${products.length} products`}
          </DialogTitle>
          <DialogDescription>
            {isIn
              ? "নতুন কেনা মালের quantity ও cost price দাও — আগের কেনা দামের সাথে মিলিয়ে weighted average cost (WAC) আপডেট হবে।"
              : "Manual stock out — reserved stock-এর নিচে নামলে server reject করবে।"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {single && (single.variants?.length ?? 0) > 0 && (
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><Layers className="h-3.5 w-3.5" /> Variant</Label>
              <Select value={variantId ?? "__product"} onValueChange={(v) => setVariantId(v === "__product" ? null : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__product">Product-level ({single.stock} pcs)</SelectItem>
                  {single.variants.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.color_name ?? v.sku ?? v.id.slice(0, 6)} — {v.stock} pcs
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {products.length > 1 && isIn && (
            <div className="flex items-end gap-2 rounded-lg border bg-muted/30 p-2">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">সব প্রোডাক্টে একই cost বসাও (optional)</Label>
                <Input type="number" min={0} step="0.01" value={applyCostAll} onChange={(e) => setApplyCostAll(e.target.value)} placeholder="যেমন 250" />
              </div>
              <Button
                type="button" variant="secondary" size="sm"
                onClick={() => {
                  if (!applyCostAll) return;
                  setLines((s) => {
                    const n = { ...s };
                    for (const p of products) n[p.id] = { ...(n[p.id] ?? { qty: "1", cost: "" }), cost: applyCostAll };
                    return n;
                  });
                }}
              >Apply</Button>
            </div>
          )}

          <div className="max-h-[42vh] overflow-y-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/60 backdrop-blur">
                <tr className="text-left">
                  <th className="px-2 py-2 font-medium">Product</th>
                  <th className="px-2 py-2 text-right font-medium">Now</th>
                  <th className="px-2 py-2 text-right font-medium">Qty</th>
                  {isIn && <th className="px-2 py-2 text-right font-medium">Unit cost</th>}
                  <th className="px-2 py-2 text-right font-medium">{isIn ? "New WAC" : "After"}</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const bc = baseCost(p);
                  const l = lines[p.id] ?? { qty: "1", cost: "" };
                  const q = Number(l.qty) || 0;
                  const uc = Number(l.cost) || 0;
                  const cur = single && variantId ? (single.variants.find((v) => v.id === variantId)?.stock ?? 0) : Number(p.stock ?? 0);
                  const after = Math.max(cur + (isIn ? q : -q), isIn ? 0 : Number.NEGATIVE_INFINITY);
                  const newWac = isIn && q > 0
                    ? ((Math.max(cur, 0) * bc.value) + q * (uc || bc.value)) / Math.max(cur + q, 1)
                    : bc.value;
                  const wacUp = isIn && uc > 0 && bc.value > 0 && newWac > bc.value;
                  return (
                    <tr key={p.id} className="border-t">
                      <td className="px-2 py-2">
                        <div className="truncate font-medium">{p.title}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {p.sku ?? "no SKU"} · আগের cost {bc.source === "none" ? "—" : money(bc.value)}
                          {bc.source !== "none" && <span className="ml-1 uppercase">{bc.source}</span>}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{cur}</td>
                      <td className="px-2 py-2 text-right">
                        <Input
                          className="h-8 w-20 text-right" inputMode="numeric"
                          value={l.qty} onChange={(e) => setLine(p.id, { qty: e.target.value.replace(/[^\d]/g, "") })}
                        />
                      </td>
                      {isIn && (
                        <td className="px-2 py-2 text-right">
                          <Input
                            className="h-8 w-24 text-right" inputMode="decimal" placeholder={bc.value ? String(bc.value) : "0"}
                            value={l.cost} onChange={(e) => setLine(p.id, { cost: e.target.value.replace(/[^\d.]/g, "") })}
                          />
                        </td>
                      )}
                      <td className="px-2 py-2 text-right tabular-nums">
                        {isIn ? (
                          <div className={cn("flex items-center justify-end gap-1", wacUp ? "text-amber-600" : "text-emerald-600")}>
                            {uc > 0 && bc.value > 0 && (wacUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />)}
                            {money(newWac || 0)}
                          </div>
                        ) : (
                          <span className={cn(after < 0 && "text-red-600")}>{after}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Reason</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STOCK_REASONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Note (optional)</Label>
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Supplier / invoice ref…" />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Wallet className="h-3.5 w-3.5" /> Total</span>
            <span className="text-sm font-semibold tabular-nums">
              {totals.units} pcs · {money(totals.value)}
            </span>
          </div>

          {single && (history.data?.length ?? 0) > 0 && (
            <div className="rounded-lg border">
              <div className="flex items-center gap-1.5 border-b px-3 py-2 text-xs font-medium">
                <History className="h-3.5 w-3.5" /> আগের movement (last 6)
              </div>
              <div className="divide-y text-[11px]">
                {(history.data ?? []).map((m: any) => (
                  <div key={m.id} className="flex items-center justify-between px-3 py-1.5">
                    <span className="text-muted-foreground">
                      {new Date(m.created_at).toLocaleDateString("en-GB")} · {m.reason}
                    </span>
                    <span className="tabular-nums">
                      <span className={cn(Number(m.quantity) >= 0 ? "text-emerald-600" : "text-red-600")}>
                        {Number(m.quantity) >= 0 ? "+" : ""}{m.quantity}
                      </span>
                      {m.unit_cost_bdt ? <span className="ml-2 text-muted-foreground">@ {money(Number(m.unit_cost_bdt))}</span> : null}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mut.isPending}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || totals.units <= 0}>
            {mut.isPending ? "Applying…" : `${isIn ? "Stock In" : "Stock Out"} ${totals.units} pcs`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
