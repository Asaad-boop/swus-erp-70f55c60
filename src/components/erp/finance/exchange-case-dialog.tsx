import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Props = {
  open: boolean;
  onClose: () => void;
  brandId: string;
  productId: string;
  productName?: string;
};

const EX_TYPES = ["normal", "damage", "different_product", "refund_only"] as const;
const CONDITIONS = ["sellable", "damaged", "missing", "disposed"] as const;

export function ExchangeCaseDialog({ open, onClose, brandId, productId, productName }: Props) {
  const qc = useQueryClient();
  const [origItemId, setOrigItemId] = useState("");
  const [exType, setExType] = useState<(typeof EX_TYPES)[number]>("normal");
  const [oldCondition, setOldCondition] = useState<(typeof CONDITIONS)[number]>("sellable");
  const [replacementProductId, setReplacementProductId] = useState<string>("");
  const [replacementQty, setReplacementQty] = useState("1");
  const [exchangeCharge, setExchangeCharge] = useState("0");
  const [replacementDelivery, setReplacementDelivery] = useState("0");
  const [returnDelivery, setReturnDelivery] = useState("0");
  const [productCostLoss, setProductCostLoss] = useState("0");
  const [refund, setRefund] = useState("0");
  const [note, setNote] = useState("");
  const [productSearch, setProductSearch] = useState("");

  const itemsQ = useQuery({
    queryKey: ["exch-dialog-items", brandId, productId],
    enabled: open && !!productId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("id, order_id, quantity, line_total, unit_cost_snapshot, orders!inner(order_number, brand_id)")
        .eq("product_id", productId)
        .eq("orders.brand_id", brandId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const replacementsQ = useQuery({
    queryKey: ["exch-replacements", brandId, productSearch],
    enabled: open,
    queryFn: async () => {
      let q = supabase.from("products").select("id,title,sku").eq("is_active", true).order("title").limit(30);
      if (productSearch.trim()) q = q.or(`title.ilike.%${productSearch}%,sku.ilike.%${productSearch}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const selected = (itemsQ.data ?? []).find((i) => i.id === origItemId);

  const mut = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Select an original order item");
      const { error } = await supabase.from("erp_exchange_cases").insert({
        brand_id: brandId,
        original_order_id: selected.order_id,
        original_order_item_id: selected.id,
        original_product_id: productId,
        exchange_type: exType,
        old_item_condition: oldCondition,
        replacement_product_id: replacementProductId || null,
        replacement_qty: Number(replacementQty || 1),
        exchange_charge_collected: Number(exchangeCharge || 0),
        replacement_delivery_cost: Number(replacementDelivery || 0),
        return_delivery_cost: Number(returnDelivery || 0),
        product_cost_loss: Number(productCostLoss || 0),
        refund_amount: Number(refund || 0),
        note: note || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Exchange case recorded");
      qc.invalidateQueries({ queryKey: ["pp-report"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Create Exchange</DialogTitle>
          {productName && <DialogDescription>{productName}</DialogDescription>}
        </DialogHeader>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto">
          <div>
            <Label>Original order item</Label>
            <Select value={origItemId} onValueChange={(v) => {
              setOrigItemId(v);
              const it = (itemsQ.data ?? []).find((x) => x.id === v);
              if (it) setProductCostLoss(String(Number(it.unit_cost_snapshot ?? 0) * Number(it.quantity ?? 1)));
            }}>
              <SelectTrigger><SelectValue placeholder={itemsQ.isLoading ? "Loading…" : "Pick item"} /></SelectTrigger>
              <SelectContent>
                {(itemsQ.data ?? []).map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    #{i.orders?.order_number ?? i.order_id.slice(0, 8)} · qty {i.quantity} · ৳{Number(i.line_total ?? 0)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Exchange type</Label>
              <Select value={exType} onValueChange={(v: any) => setExType(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{EX_TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace("_", " ")}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Old item condition</Label>
              <Select value={oldCondition} onValueChange={(v: any) => setOldCondition(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CONDITIONS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="border-t pt-3">
            <Label>Replacement product (optional)</Label>
            <Input placeholder="Search products…" value={productSearch} onChange={(e) => setProductSearch(e.target.value)} className="mb-2" />
            <Select value={replacementProductId} onValueChange={setReplacementProductId}>
              <SelectTrigger><SelectValue placeholder="Same product (default)" /></SelectTrigger>
              <SelectContent>
                {(replacementsQ.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.title}{p.sku ? ` · ${p.sku}` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Replacement qty</Label><Input type="number" value={replacementQty} onChange={(e) => setReplacementQty(e.target.value)} /></div>
            <div><Label>Exchange charge collected</Label><Input type="number" value={exchangeCharge} onChange={(e) => setExchangeCharge(e.target.value)} /></div>
            <div><Label>Replacement delivery cost</Label><Input type="number" value={replacementDelivery} onChange={(e) => setReplacementDelivery(e.target.value)} /></div>
            <div><Label>Return delivery cost</Label><Input type="number" value={returnDelivery} onChange={(e) => setReturnDelivery(e.target.value)} /></div>
            <div><Label>Product cost loss</Label><Input type="number" value={productCostLoss} onChange={(e) => setProductCostLoss(e.target.value)} /></div>
            <div><Label>Refund amount</Label><Input type="number" value={refund} onChange={(e) => setRefund(e.target.value)} /></div>
          </div>
          <div><Label>Note</Label><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || !origItemId}>{mut.isPending ? "Saving…" : "Save Exchange"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}