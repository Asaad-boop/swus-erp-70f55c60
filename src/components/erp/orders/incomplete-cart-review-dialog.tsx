import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { CheckCircle2, ImageIcon, Loader2, Minus, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PhoneActions } from "@/components/erp/orders/contact-actions";
import { BrandBadge } from "@/components/erp/brand-badge";
import {
  convertAbandonedCartFn,
  updateAbandonedCartFn,
  type AbandonedCartRow,
} from "@/lib/erp/abandoned-carts.functions";

type ReviewItem = {
  product_id: string;
  variant_id: string | null;
  variant_label: string | null;
  name: string;
  image: string | null;
  unit_price: number;
  quantity: number;
};

function toReviewItems(cart: AbandonedCartRow): ReviewItem[] {
  const raw = Array.isArray(cart.cart_items) ? cart.cart_items : [];
  return raw
    .map((it) => ({
      product_id: String(it.product_id ?? it.id ?? ""),
      variant_id: it.variant_id ?? null,
      variant_label: it.variant_label ?? null,
      name: it.name ?? "Item",
      image: it.image ?? null,
      unit_price: Number(it.unit_price ?? it.price ?? 0),
      quantity: Math.max(1, Math.round(Number(it.quantity ?? it.qty ?? 1))),
    }))
    .filter((it) => it.product_id && Number(it.quantity) > 0);
}

const money = (n: number) => `৳${Math.round(n).toLocaleString()}`;

/**
 * Open = review only. Staff calls the customer, fixes address / phone / items,
 * and nothing is created until "Confirm order" is pressed.
 */
export function IncompleteCartReviewDialog({
  cart,
  fallbackBrandId,
  onClose,
  onConfirmed,
}: {
  cart: AbandonedCartRow | null;
  fallbackBrandId: string | null;
  onClose: () => void;
  onConfirmed: (orderId: string) => void;
}) {
  const qc = useQueryClient();
  const convert = useServerFn(convertAbandonedCartFn);
  const save = useServerFn(updateAbandonedCartFn);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [district, setDistrict] = useState("");
  const [thana, setThana] = useState("");
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [shippingFee, setShippingFee] = useState("0");
  const [discount, setDiscount] = useState("0");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!cart) return;
    setName(cart.customer_name ?? "");
    setPhone(cart.customer_phone ?? "");
    setAddress(cart.shipping_address ?? "");
    setDistrict(cart.shipping_district ?? cart.shipping_city ?? "");
    setThana(cart.shipping_thana ?? "");
    setItems(toReviewItems(cart));
    setShippingFee("0");
    setDiscount("0");
    setNote("");
  }, [cart?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const subtotal = useMemo(() => items.reduce((s, it) => s + it.unit_price * it.quantity, 0), [items]);
  const fee = Math.max(0, Number(shippingFee) || 0);
  const disc = Math.min(Math.max(0, Number(discount) || 0), subtotal);
  const total = Math.max(0, subtotal + fee - disc);
  const brandId = cart?.brand_id ?? fallbackBrandId;

  const missing: string[] = [];
  if (!name.trim()) missing.push("name");
  if (phone.replace(/\D/g, "").length < 10) missing.push("phone");
  if (!address.trim()) missing.push("address");
  if (items.length === 0) missing.push("product");

  const customerPayload = () => ({
    customer_name: name,
    customer_phone: phone,
    shipping_address: address,
    shipping_district: district,
    shipping_city: district,
    shipping_thana: thana,
    items,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["abandoned-carts"] });
    qc.invalidateQueries({ queryKey: ["abandoned-carts-count"] });
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!cart) throw new Error("No cart");
      if (items.length === 0) throw new Error("Kom pokkhe 1ta product rakhun");
      return save({ data: { id: cart.id, ...customerPayload() } });
    },
    onSuccess: () => {
      toast.success("Changes saved — order ekhono create hoy nai");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const confirmMut = useMutation({
    mutationFn: async () => {
      if (!cart) throw new Error("No cart");
      if (!brandId) throw new Error("Brand select koro");
      return convert({
        data: {
          id: cart.id,
          brandId,
          ...customerPayload(),
          shippingFee: fee,
          discount: disc,
          note: note.trim() || null,
        },
      });
    },
    onSuccess: (res) => {
      toast.success(`Order confirmed${res.invoiceNo ? " · " + res.invoiceNo : ""}`);
      refresh();
      qc.invalidateQueries({ queryKey: ["orders"] });
      onClose();
      onConfirmed(res.orderId);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const busy = saveMut.isPending || confirmMut.isPending;

  const setQty = (idx: number, q: number) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, quantity: Math.max(1, Math.min(999, q)) } : it)));
  const setPrice = (idx: number, p: number) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, unit_price: Math.max(0, p) } : it)));
  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));

  return (
    <Dialog open={!!cart} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Incomplete checkout
            {cart && <BrandBadge brandId={cart.brand_id} />}
          </DialogTitle>
          <DialogDescription>
            Customer er sathe kotha bolun, dorkar hole address / product thik korun. "Confirm order" chapar
            age kono order create hobe na.
            {cart && (
              <span className="block mt-1 text-xs">
                Started {format(new Date(cart.created_at), "dd/MM/yyyy h:mm a")}
                {cart.last_step ? ` · reached: ${cart.last_step}` : ""}
                {cart.source_site ? ` · ${cart.source_site}` : ""}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <section className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ic-phone">Phone</Label>
              <div className="flex items-center gap-2">
                <Input id="ic-phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
                {phone.replace(/\D/g, "").length >= 10 && <PhoneActions phone={phone} />}
              </div>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ic-name">Name</Label>
              <Input id="ic-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ic-addr">Address</Label>
              <Textarea id="ic-addr" rows={2} value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ic-thana">Thana / Area</Label>
              <Input id="ic-thana" value={thana} onChange={(e) => setThana(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ic-dist">District</Label>
              <Input id="ic-dist" value={district} onChange={(e) => setDistrict(e.target.value)} />
            </div>
          </section>

          <section className="space-y-2">
            <Label>Products</Label>
            {items.length === 0 && (
              <p className="text-sm text-destructive">Kono product nai — order confirm korte kom pokkhe 1ta lagbe.</p>
            )}
            <div className="divide-y rounded-lg border">
              {items.map((it, idx) => (
                <div key={`${it.product_id}-${it.variant_id ?? ""}-${idx}`} className="flex items-center gap-3 p-2.5">
                  <div className="h-11 w-11 shrink-0 overflow-hidden rounded-md border bg-muted grid place-items-center">
                    {it.image ? (
                      <img src={it.image} alt="" className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <ImageIcon className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{it.name}</div>
                    {it.variant_label && <div className="truncate text-xs text-muted-foreground">{it.variant_label}</div>}
                    <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      ৳
                      <Input
                        type="number"
                        min={0}
                        value={it.unit_price}
                        onChange={(e) => setPrice(idx, Number(e.target.value))}
                        className="h-7 w-24 text-xs"
                        aria-label="Unit price"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button type="button" size="icon" variant="outline" className="h-7 w-7" onClick={() => setQty(idx, it.quantity - 1)} aria-label="Decrease">
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-7 text-center text-sm tabular-nums">{it.quantity}</span>
                    <Button type="button" size="icon" variant="outline" className="h-7 w-7" onClick={() => setQty(idx, it.quantity + 1)} aria-label="Increase">
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="w-20 text-right text-sm font-semibold tabular-nums">{money(it.unit_price * it.quantity)}</div>
                  <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeItem(idx)} aria-label="Remove">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ic-fee">Delivery charge</Label>
              <Input id="ic-fee" type="number" min={0} value={shippingFee} onChange={(e) => setShippingFee(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ic-disc">Discount</Label>
              <Input id="ic-disc" type="number" min={0} value={discount} onChange={(e) => setDiscount(e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ic-note">Note (optional)</Label>
              <Textarea id="ic-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Call e ki kotha holo…" />
            </div>
          </section>

          <section className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">{money(subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Delivery</span><span className="tabular-nums">{money(fee)}</span></div>
            {disc > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span className="tabular-nums">− {money(disc)}</span></div>}
            <div className="flex justify-between border-t pt-1.5 font-bold"><span>Total (COD)</span><span className="tabular-nums">{money(total)}</span></div>
          </section>
        </div>

        <DialogFooter className="gap-2 sm:gap-2 flex-col-reverse sm:flex-row">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Close</Button>
          <Button variant="outline" onClick={() => saveMut.mutate()} disabled={busy || items.length === 0}>
            {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
            Save changes
          </Button>
          <Button
            onClick={() => confirmMut.mutate()}
            disabled={busy || missing.length > 0 || !brandId}
            title={missing.length ? `Missing: ${missing.join(", ")}` : undefined}
          >
            {confirmMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
            Confirm order · {money(total)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
