import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Plus, Trash2, Save, Loader2, ClipboardList, Boxes, FileText } from "lucide-react";
import { toast } from "sonner";
import { useBrand } from "@/contexts/brand-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createLocalPo, listLocalSuppliers } from "@/lib/erp/local-po/local-po.functions";
import { fmtBdt } from "@/lib/erp/local-po/types";
import { ProductPicker, type PickedProduct } from "@/components/erp/imports/product-picker";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Palette } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/erp/purchase-orders/new")({
  head: () => ({ meta: [
    { title: "New Purchase Order — SyncWithUs ERP" },
    { name: "description", content: "Create a supplier purchase order with product quantities and purchasing costs in SyncWithUs ERP." },
    { property: "og:title", content: "New Purchase Order — SyncWithUs ERP" },
    { property: "og:description", content: "Create a supplier purchase order with product quantities and purchasing costs." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: NewLocalPoPage,
});

type ItemDraft = {
  id: string;
  picked: PickedProduct;
  description: string;
  ordered_qty: number;
  unit_cost: number;
  // Per-color allocation: when product has variants, user assigns qty per color.
  // When non-empty, `ordered_qty` becomes the sum and payload expands to N rows.
  allocations?: Record<string, number>; // variant_id -> qty
};

const uid = () => Math.random().toString(36).slice(2, 10);
const emptyPick = (): PickedProduct => ({ id: null, title: "", sku: null, image: null });

function NewLocalPoPage() {
  const { activeBrand, brands, isAllBrands } = useBrand();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [pickedBrandId, setPickedBrandId] = useState("");
  const effectiveBrand = useMemo(
    () => activeBrand ?? brands.find((b) => b.id === pickedBrandId) ?? null,
    [activeBrand, brands, pickedBrandId],
  );
  const brandId = effectiveBrand?.id ?? null;

  const suppliersFn = useServerFn(listLocalSuppliers);
  const createFn = useServerFn(createLocalPo);

  const { data: suppliers = [] } = useQuery({
    queryKey: ["local-suppliers", brandId],
    enabled: !!brandId,
    queryFn: () => suppliersFn({ data: { brandId: brandId! } }),
  });

  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [expectedDate, setExpectedDate] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [discount, setDiscount] = useState(0);
  const [tax, setTax] = useState(0);
  const [shipping, setShipping] = useState(0);
  const [notes, setNotes] = useState("");

  const [items, setItems] = useState<ItemDraft[]>([
    { id: uid(), picked: emptyPick(), description: "", ordered_qty: 1, unit_cost: 0 },
  ]);

  // Hydrate prefill from sessionStorage (e.g. coming from Reorder Queue)
  const [prefillSuggestionIds, setPrefillSuggestionIds] = useState<string[]>([]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = sessionStorage.getItem("local-po-prefill");
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Array<{
        product_id: string; title: string; sku: string | null;
        ordered_qty: number; unit_cost: number; suggestion_id?: string;
      }>;
      if (Array.isArray(parsed) && parsed.length) {
        setItems(parsed.map((p) => ({
          id: uid(),
          picked: { id: p.product_id, title: p.title, sku: p.sku, image: null },
          description: p.title,
          ordered_qty: p.ordered_qty,
          unit_cost: p.unit_cost,
        })));
        setPrefillSuggestionIds(parsed.map((p) => p.suggestion_id).filter(Boolean) as string[]);
        toast.success(`Loaded ${parsed.length} item${parsed.length > 1 ? "s" : ""} from reorder queue`);
      }
    } catch { /* ignore */ }
    sessionStorage.removeItem("local-po-prefill");
  }, []);

  const subtotal = items.reduce((s, i) => s + i.ordered_qty * i.unit_cost, 0);
  const total = subtotal - discount + tax + shipping;

  const addItem = () => setItems((xs) => [...xs, { id: uid(), picked: emptyPick(), description: "", ordered_qty: 1, unit_cost: 0 }]);
  const removeItem = (id: string) => setItems((xs) => xs.filter((x) => x.id !== id));
  const updItem = (id: string, patch: Partial<ItemDraft>) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const submitMut = useMutation({
    mutationFn: async () => {
      if (!brandId) throw new Error("No brand");
      if (!supplierId) throw new Error("Supplier is required");
      if (items.some((i) => (!i.picked.title.trim() && !i.description.trim()) || i.ordered_qty <= 0)) {
        throw new Error("Each item needs a name & qty > 0");
      }
      // Expand color allocations into one row per variant
      const expandedItems = items.flatMap((it) => {
        const allocs = it.allocations ? Object.entries(it.allocations).filter(([, q]) => q > 0) : [];
        if (allocs.length > 0) {
          return allocs.map(([variant_id, qty]) => ({
            product_id: it.picked.id ?? undefined,
            variant_id,
            description: it.description || it.picked.title,
            ordered_qty: qty,
            unit_cost: it.unit_cost,
          }));
        }
        return [{
          product_id: it.picked.id ?? undefined,
          description: it.description || it.picked.title,
          ordered_qty: it.ordered_qty,
          unit_cost: it.unit_cost,
        }];
      });
      const payload = {
        brand_id: brandId,
        supplier_id: supplierId,
        order_date: orderDate,
        expected_date: expectedDate || undefined,
        discount, tax, shipping_cost: shipping,
        notes: notes || undefined,
        items: expandedItems,
      };
      return await createFn({ data: payload });
    },
    onSuccess: async (res: any) => {
      void qc.invalidateQueries({ queryKey: ["local-pos"] });
      toast.success(`PO ${res.po_number} created`);
      // Mark linked reorder suggestions as processed (fail-soft)
      if (prefillSuggestionIds.length) {
        try {
          const { bulkUpdateReorderSuggestions } = await import("@/lib/erp/inventory/reports.functions");
          await bulkUpdateReorderSuggestions({ data: { ids: prefillSuggestionIds, status: "processed" } });
        } catch { /* ignore */ }
      }
      navigate({ to: "/erp/purchase-orders/$poId", params: { poId: res.po_id } });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to create PO"),
  });

  if (!brandId) {
    if (isAllBrands) {
      return (
        <div className="p-6 max-w-md space-y-3">
          <h2 className="text-base font-semibold">Pick a brand</h2>
          <Select value={pickedBrandId} onValueChange={setPickedBrandId}>
            <SelectTrigger><SelectValue placeholder="Choose brand" /></SelectTrigger>
            <SelectContent>
              {brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      );
    }
    return <div className="p-6 text-sm text-muted-foreground">Select a brand.</div>;
  }

  const canSubmit = !!supplierId && items.length > 0 && items.every((i) => (i.picked.title.trim() || i.description.trim()) && i.ordered_qty > 0) && !submitMut.isPending;

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1400px] mx-auto pb-24">
      <div className="sticky top-0 z-20 -mx-4 md:-mx-6 px-4 md:px-6 py-3 bg-background/95 backdrop-blur border-b border-border flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Link to="/erp/purchase-orders"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />Back</Button></Link>
          <div>
            <h2 className="text-lg md:text-xl font-bold flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />New Purchase Order
            </h2>
            <p className="text-[11px] text-muted-foreground">Brand: {effectiveBrand?.name}</p>
          </div>
        </div>
        <Button size="sm" disabled={!canSubmit} onClick={() => submitMut.mutate()}>
          {submitMut.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating…</> : <><Save className="h-4 w-4 mr-2" />Create PO</>}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5 items-start">
        <div className="space-y-5 min-w-0">
          <Card className="p-4 md:p-5">
            <div className="flex items-center gap-2 mb-3">
              <ClipboardList className="h-4 w-4 text-primary" />
              <h3 className="font-semibold">Order info</h3>
            </div>
            <div className="grid md:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Order date</Label>
                <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Expected date</Label>
                <Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Supplier *</Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger><SelectValue placeholder="Pick supplier" /></SelectTrigger>
                  <SelectContent>
                    {(suppliers as any[]).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-3">
                <Label className="text-xs">Notes</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
              </div>
            </div>
          </Card>

          <Card className="p-4 md:p-5">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <div className="flex items-center gap-2">
                <Boxes className="h-4 w-4 text-primary" />
                <h3 className="font-semibold">Items ({items.length})</h3>
              </div>
              <Button size="sm" variant="outline" onClick={addItem}><Plus className="h-3.5 w-3.5 mr-1" />Add item</Button>
            </div>
            <div className="space-y-2">
              {items.map((it) => {
                const sub = it.ordered_qty * it.unit_cost;
                return (
                  <div key={it.id} className="grid grid-cols-12 gap-2 items-end p-3 rounded-md border border-border bg-card/50">
                    <div className="col-span-12 md:col-span-5">
                      <Label className="text-xs">Product</Label>
                      <ProductPicker brandId={brandId} value={it.picked} onChange={(p) => updItem(it.id, { picked: p, description: p.title, allocations: undefined })} />
                    </div>
                    <div className="col-span-4 md:col-span-2">
                      <Label className="text-xs">Qty</Label>
                      <Input type="number" min={1} value={it.ordered_qty}
                        disabled={!!it.allocations}
                        onChange={(e) => updItem(it.id, { ordered_qty: Math.max(1, Number(e.target.value) || 1) })} />
                    </div>
                    <div className="col-span-4 md:col-span-2">
                      <Label className="text-xs">Unit cost</Label>
                      <Input type="number" step="0.01" value={it.unit_cost}
                        onChange={(e) => updItem(it.id, { unit_cost: Number(e.target.value) || 0 })} />
                    </div>
                    <div className="col-span-3 md:col-span-2 text-right">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Subtotal</div>
                      <div className="font-semibold tabular-nums text-sm">{fmtBdt(sub)}</div>
                    </div>
                    <div className="col-span-1 text-right">
                      <Button size="icon" variant="ghost" disabled={items.length === 1} onClick={() => removeItem(it.id)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                    {it.picked.id && (
                      <div className="col-span-12">
                        <ColorAllocator
                          productId={it.picked.id}
                          allocations={it.allocations}
                          onChange={(allocs) => {
                            const total = Object.values(allocs).reduce((s, n) => s + n, 0);
                            updItem(it.id, {
                              allocations: Object.keys(allocs).length ? allocs : undefined,
                              ordered_qty: total > 0 ? total : it.ordered_qty,
                            });
                          }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        <Card className="p-4 md:p-5 lg:sticky lg:top-20 space-y-3">
          <h3 className="font-semibold text-sm">Summary</h3>
          <Row label="Subtotal" value={fmtBdt(subtotal)} />
          <div>
            <Label className="text-xs">Discount</Label>
            <Input type="number" step="0.01" value={discount} onChange={(e) => setDiscount(Number(e.target.value) || 0)} />
          </div>
          <div>
            <Label className="text-xs">Tax / VAT</Label>
            <Input type="number" step="0.01" value={tax} onChange={(e) => setTax(Number(e.target.value) || 0)} />
          </div>
          <div>
            <Label className="text-xs">Shipping</Label>
            <Input type="number" step="0.01" value={shipping} onChange={(e) => setShipping(Number(e.target.value) || 0)} />
          </div>
          <div className="border-t border-border pt-3">
            <div className="flex justify-between items-baseline">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="text-lg font-bold tabular-nums">{fmtBdt(total)}</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums font-medium">{value}</span>
    </div>
  );
}

/* ----------- ColorAllocator ----------- */

function ColorAllocator({
  productId, allocations, onChange,
}: {
  productId: string;
  allocations?: Record<string, number>;
  onChange: (a: Record<string, number>) => void;
}) {
  const { data: variants = [], isLoading } = useQuery({
    queryKey: ["product-variants-active", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_variants")
        .select("id,color_name,color_hex,image,stock,available_stock")
        .eq("product_id", productId)
        .eq("is_active", true)
        .order("display_order");
      if (error) throw error;
      return (data ?? []).filter((v: any) => v.color_name);
    },
  });

  if (isLoading || variants.length === 0) return null;

  const set = (vid: string, qty: number) => {
    const next = { ...(allocations ?? {}) };
    if (qty > 0) next[vid] = qty;
    else delete next[vid];
    onChange(next);
  };

  const totalAlloc = Object.values(allocations ?? {}).reduce((s, n) => s + n, 0);

  return (
    <div className="mt-1 rounded-lg border border-dashed border-border bg-muted/20 p-2.5 space-y-2">
      <div className="flex items-center justify-between text-[11px]">
        <span className="inline-flex items-center gap-1.5 font-medium text-muted-foreground">
          <Palette className="h-3.5 w-3.5" />
          Allocate by color
        </span>
        {totalAlloc > 0 && <Badge variant="secondary" className="tabular-nums">Total: {totalAlloc}</Badge>}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
        {variants.map((v: any) => {
          const cur = allocations?.[v.id] ?? 0;
          return (
            <div
              key={v.id}
              className={cn(
                "flex items-center gap-2 rounded-md border bg-card/70 p-1.5 transition",
                cur > 0 && "ring-1 ring-primary/50 border-primary/40",
              )}
            >
              <div className="h-8 w-8 rounded shrink-0 border" style={{ background: v.color_hex || "#e5e7eb" }} />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium truncate">{v.color_name}</div>
                <div className="text-[10px] text-muted-foreground tabular-nums">In stock: {v.stock ?? 0}</div>
              </div>
              <Input
                type="number"
                min={0}
                value={cur || ""}
                placeholder="0"
                onChange={(e) => set(v.id, Math.max(0, Number(e.target.value) || 0))}
                className="h-7 w-14 text-xs text-center tabular-nums"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}