import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useBrand } from "@/contexts/brand-context";
import {
  searchOrdersForCase, listItemsForOrder, createReturnCase,
} from "@/lib/erp/returns/returns.functions";

const RETURN_TYPES = ["normal", "paid_return", "damaged", "missing", "partial"];
const CONDITIONS = ["sellable", "damaged", "missing"];

export function NewReturnDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { brandIds, activeBrand } = useBrand();
  const qc = useQueryClient();
  const searchOrders = useServerFn(searchOrdersForCase);
  const listItems = useServerFn(listItemsForOrder);
  const create = useServerFn(createReturnCase);

  const [q, setQ] = useState("");
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderBrandId, setOrderBrandId] = useState<string | null>(null);
  const [itemId, setItemId] = useState<string | null>(null);
  const [returnType, setReturnType] = useState("normal");
  const [condition, setCondition] = useState("sellable");
  const [qty, setQty] = useState(1);
  const [refundAmount, setRefundAmount] = useState(0);
  const [trackingId, setTrackingId] = useState("");
  const [courierName, setCourierName] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => { if (!open) { setQ(""); setOrderId(null); setItemId(null); setQty(1); setRefundAmount(0); setTrackingId(""); setCourierName(""); setNote(""); setReturnType("normal"); setCondition("sellable"); } }, [open]);

  const ordersQ = useQuery({
    queryKey: ["ret-search-orders", brandIds, q],
    enabled: open && brandIds.length > 0,
    queryFn: () => searchOrders({ data: { brandIds, q } }),
  });

  const itemsQ = useQuery({
    queryKey: ["ret-order-items", orderId],
    enabled: !!orderId,
    queryFn: () => listItems({ data: { orderId: orderId! } }),
  });

  const selectedItem = useMemo(() => (itemsQ.data ?? []).find((i: any) => i.id === itemId), [itemsQ.data, itemId]);

  // Single-item order hole auto-select — na hole item link chhara case toiri hoye jay.
  useEffect(() => {
    const items = itemsQ.data ?? [];
    if (!itemId && items.length === 1) setItemId(items[0].id);
  }, [itemsQ.data, itemId]);

  useEffect(() => {
    if (selectedItem) {
      setQty(Number(selectedItem.quantity ?? 1));
      setRefundAmount(Number(selectedItem.line_total ?? selectedItem.unit_price ?? 0));
    }
  }, [selectedItem]);

  const mut = useMutation({
    mutationFn: () => create({ data: {
      brandId: orderBrandId || activeBrand?.id || brandIds[0],
      orderId: orderId!,
      orderItemId: itemId ?? undefined,
      productId: selectedItem?.product_id ?? undefined,
      variantId: selectedItem?.variant_id ?? undefined,
      sku: selectedItem?.product?.sku ?? undefined,
      returnType, itemCondition: condition,
      qty, refundAmount,
      courierTrackingId: trackingId || undefined,
      courierName: courierName || undefined,
      note: note || undefined,
    }}),
    onSuccess: () => {
      toast.success("Return case created");
      qc.invalidateQueries({ queryKey: ["returns-list"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSubmit = !!orderId && !!itemId && qty > 0;
  const selectedOrder = (ordersQ.data ?? []).find((o: any) => o.id === orderId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>New Return Case</DialogTitle></DialogHeader>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          {/* Order picker */}
          <Field label="Search Order (order ID, customer name, phone)">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8 h-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type to search…" />
            </div>
            {!orderId && (
              <div className="mt-2 max-h-48 overflow-y-auto rounded-md border bg-card">
                {ordersQ.isLoading && <div className="p-3 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin inline mr-1" />Loading…</div>}
                {!ordersQ.isLoading && (ordersQ.data ?? []).length === 0 && <div className="p-3 text-xs text-muted-foreground">No orders found</div>}
                {(ordersQ.data ?? []).map((o: any) => (
                  <button key={o.id} type="button" onClick={() => { setOrderId(o.id); setOrderBrandId(o.brand_id); setItemId(null); }}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-muted/50 border-b last:border-b-0">
                    <div className="font-mono">{o.invoice_no ?? `#${String(o.id).slice(0, 8)}`} · {o.shipping_name ?? "—"}</div>
                    <div className="text-muted-foreground">{o.shipping_phone ?? "—"} · ৳{Number(o.total ?? 0).toLocaleString("en-IN")} · {o.status}</div>
                  </button>
                ))}
              </div>
            )}
            {orderId && (
              <div className="mt-2 flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-xs">
                <span className="font-mono">{selectedOrder?.invoice_no ?? `Order #${String(orderId).slice(0, 8)}`}</span>
                <button type="button" onClick={() => { setOrderId(null); setItemId(null); }} className="text-sky-600 hover:underline">Change</button>
              </div>
            )}
          </Field>

          {orderId && (
            <Field label="Order Item (required)">
              <div className="max-h-40 overflow-y-auto rounded-md border bg-card">
                {itemsQ.isLoading && <div className="p-3 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin inline mr-1" />Loading items…</div>}
                {!itemsQ.isLoading && (itemsQ.data ?? []).length === 0 && (
                  <div className="p-3 text-xs text-muted-foreground">This order has no items — return case toiri kora jabe na.</div>
                )}
                {(itemsQ.data ?? []).map((i: any) => (
                  <button key={i.id} type="button" onClick={() => setItemId(i.id)}
                    className={"w-full text-left px-3 py-2 text-xs border-b last:border-b-0 " + (itemId === i.id ? "bg-emerald-50" : "hover:bg-muted/50")}>
                    <div className="font-medium">{i.product?.title ?? i.name ?? "—"}</div>
                    <div className="text-muted-foreground">Qty {i.quantity} · ৳{Number(i.unit_price ?? 0).toLocaleString("en-IN")}{i.variant_label ? " · " + i.variant_label : ""}</div>
                  </button>
                ))}
              </div>
              {!itemId && (itemsQ.data ?? []).length > 0 && (
                <div className="mt-1 text-[11px] text-amber-600">Ekta item select korun — product link chhara QC/restock kaj korbe na.</div>
              )}
            </Field>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Return Type">
              <div className="flex flex-wrap gap-1">
                {RETURN_TYPES.map((t) => (
                  <Chip key={t} active={returnType === t} onClick={() => setReturnType(t)}>{t.replace(/_/g, " ")}</Chip>
                ))}
              </div>
            </Field>
            <Field label="Condition">
              <div className="flex flex-wrap gap-1">
                {CONDITIONS.map((c) => (
                  <Chip key={c} active={condition === c} onClick={() => setCondition(c)}>{c}</Chip>
                ))}
              </div>
            </Field>
            <Field label="Qty">
              <Input type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value) || 1)} className="h-9" />
            </Field>
            <Field label="Refund Amount (৳)">
              <Input type="number" min={0} value={refundAmount} onChange={(e) => setRefundAmount(Number(e.target.value) || 0)} className="h-9" />
            </Field>
            <Field label="Courier Tracking ID (optional)">
              <Input value={trackingId} onChange={(e) => setTrackingId(e.target.value)} className="h-9" />
            </Field>
            <Field label="Courier (optional)">
              <Input value={courierName} onChange={(e) => setCourierName(e.target.value)} className="h-9" placeholder="pathao / steadfast / other" />
            </Field>
          </div>

          <Field label="Note">
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!canSubmit || mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Return"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><div className="text-[11px] font-medium text-muted-foreground mb-1">{label}</div>{children}</div>;
}
function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick}
    className={"px-2 py-1 rounded-md border text-[11px] capitalize transition-colors " + (active ? "bg-emerald-100 border-emerald-400 text-emerald-900" : "bg-card hover:bg-muted/50")}>{children}</button>;
}