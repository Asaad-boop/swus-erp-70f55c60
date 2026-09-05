import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  orderId: string;
  subtotal: number;
  shippingFee: number;
  discountAmount: number;
  advanceAmount: number;
  disabled?: boolean;
  onDone: () => void;
};

const num = (v: string) => Math.max(0, Number(v.replace(/[^\d.]/g, "")) || 0);

/** Inline billing editor: shipping fee, discount and advance — recomputes the order total. */
export function OrderBillingEditor({
  orderId,
  subtotal,
  shippingFee,
  discountAmount,
  advanceAmount,
  disabled,
  onDone,
}: Props) {
  const qc = useQueryClient();
  const [shipping, setShipping] = useState(String(shippingFee));
  const [discount, setDiscount] = useState(String(discountAmount));
  const [advance, setAdvance] = useState(String(advanceAmount));

  const gross = Math.max(0, subtotal + num(shipping) - num(discount));
  const due = Math.max(0, gross - num(advance));

  const save = useMutation({
    mutationFn: async () => {
      if (num(discount) > subtotal + num(shipping)) throw new Error("Discount total er cheye beshi hote parbe na");
      const { error } = await supabase
        .from("orders")
        .update({
          shipping_fee: num(shipping),
          discount_amount: num(discount),
          advance_amount: num(advance),
          total: gross,
        })
        .eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Billing update hoyeche ✓");
      qc.invalidateQueries({ queryKey: ["order-detail", orderId] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["web-orders"] });
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mt-3 space-y-2.5 rounded-md border bg-muted/30 p-2.5">
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Shipping charge</Label>
          <Input value={shipping} onChange={(e) => setShipping(e.target.value)} className="h-8 text-sm tabular-nums" />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Discount</Label>
          <Input value={discount} onChange={(e) => setDiscount(e.target.value)} className="h-8 text-sm tabular-nums" />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Advance paid</Label>
          <Input value={advance} onChange={(e) => setAdvance(e.target.value)} className="h-8 text-sm tabular-nums" />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-dashed pt-2">
        <span className="text-xs text-muted-foreground">
          Total <b className="text-foreground tabular-nums">৳ {gross.toLocaleString()}</b>
          {num(advance) > 0 && (
            <> · Due <b className="text-foreground tabular-nums">৳ {due.toLocaleString()}</b></>
          )}
        </span>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="ghost" className="h-7 gap-1 px-2" onClick={onDone} disabled={save.isPending}>
            <X className="h-3.5 w-3.5" /> Cancel
          </Button>
          <Button size="sm" className="h-7 gap-1 px-2" disabled={disabled || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
          </Button>
        </div>
      </div>
    </div>
  );
}
