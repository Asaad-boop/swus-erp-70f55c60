import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Trash2, Lock, Save, Copy, Package, Palette } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { ProductPicker } from "@/components/erp/imports/product-picker";
import { listImportSuppliers, updateImportPo } from "@/lib/erp/imports/imports.functions";
import { fmtBdt } from "@/lib/erp/imports/types";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type VariantMeta = {
  id: string;
  product_id: string;
  color_name: string | null;
  color_hex: string | null;
  image: string | null;
  sku: string | null;
  stock: number | null;
};

const variantLabel = (v: VariantMeta) => v.color_name || v.sku || `Variant ${v.id.slice(0, 4)}`;

type Line = {
  key: string;
  id?: string;
  product_id: string | null;
  variant_id: string | null;
  sku_snapshot: string | null;
  name_snapshot: string;
  image_snapshot: string | null;
  qty: string;
  unit: string;
  locked: boolean; // allocated to a carton/release -> cannot remove
};

export function EditPoDialog({
  open, onOpenChange, po, items, cartons, releases,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  po: any;
  items: any[];
  cartons: any[];
  releases: any[];
}) {
  const qc = useQueryClient();
  const saveFn = useServerFn(updateImportPo);
  const suppliersFn = useServerFn(listImportSuppliers);

  const itemsLocked = useMemo(
    () =>
      cartons.some((c: any) => ["released", "in_stock"].includes(c.status)) ||
      (releases?.length ?? 0) > 0,
    [cartons, releases],
  );

  const allocatedItemIds = useMemo(() => {
    const s = new Set<string>();
    for (const c of cartons) for (const ci of c.items ?? []) if (ci.po_item_id) s.add(ci.po_item_id);
    for (const r of releases ?? []) for (const ri of r.items ?? []) if (ri.po_item_id) s.add(ri.po_item_id);
    return s;
  }, [cartons, releases]);

  const [orderDate, setOrderDate] = useState("");
  const [supplierId, setSupplierId] = useState<string>("");
  const [currency, setCurrency] = useState("CNY");
  const [fx, setFx] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([]);

  useEffect(() => {
    if (!open) return;
    setOrderDate(po.order_date ?? "");
    setSupplierId(po.supplier_id ?? "");
    setCurrency(po.currency ?? "CNY");
    setFx(String(po.fx_rate ?? ""));
    setNotes(po.notes ?? "");
    setLines(
      items.map((it: any, i: number) => ({
        key: it.id ?? `k${i}`,
        id: it.id,
        product_id: it.product_id ?? null,
        variant_id: it.variant_id ?? null,
        sku_snapshot: it.sku_snapshot ?? null,
        name_snapshot: it.name_snapshot ?? it.product?.title ?? "Item",
        image_snapshot: it.image_snapshot ?? null,
        qty: String(it.quantity ?? 0),
        unit: String(Number(it.unit_cost_foreign ?? 0)),
        locked: allocatedItemIds.has(it.id),
      })),
    );
  }, [open, po, items, allocatedItemIds]);

  const { data: suppliers = [] } = useQuery({
    queryKey: ["imp-suppliers", po.brand_id],
    enabled: open && !!po.brand_id,
    queryFn: () => suppliersFn({ data: { brandId: po.brand_id } }) as Promise<any[]>,
  });

  const fxNum = Number(fx) || 0;
  const subtotalForeign = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unit) || 0), 0);
  const subtotalBdt = subtotalForeign * fxNum;
  const totalQty = lines.reduce((s, l) => s + (Number(l.qty) || 0), 0);
  const cartonAllocated = cartons.reduce((s: number, c: any) => s + Number(c.expected_quantity || 0), 0);

  const setLine = (key: string, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const addLine = () =>
    setLines((prev) => [
      ...prev,
      {
        key: `new_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        product_id: null, variant_id: null, sku_snapshot: null,
        name_snapshot: "", image_snapshot: null, qty: "1", unit: "0", locked: false,
      },
    ]);

  const mut = useMutation({
    mutationFn: async () => {
      if (!orderDate) throw new Error("Order date lagbe");
      if (!itemsLocked) {
        if (fxNum <= 0) throw new Error("FX rate 0 er beshi hote hobe");
        if (lines.length === 0) throw new Error("At least 1 product lagbe");
        for (const l of lines) {
          if (!l.name_snapshot.trim()) throw new Error("Product name khali ache");
          if ((Number(l.qty) || 0) <= 0) throw new Error(`"${l.name_snapshot}" — quantity 0 er beshi hote hobe`);
        }
      }
      return saveFn({
        data: {
          poId: po.id,
          order_date: orderDate,
          supplier_id: supplierId || undefined,
          currency,
          fx_rate: itemsLocked ? undefined : fxNum,
          notes: notes.trim() ? notes.trim() : null,
          items: itemsLocked
            ? undefined
            : lines.map((l) => ({
                id: l.id,
                product_id: l.product_id,
                variant_id: l.variant_id,
                sku_snapshot: l.sku_snapshot,
                name_snapshot: l.name_snapshot.trim(),
                image_snapshot: l.image_snapshot,
                quantity: Number(l.qty) || 0,
                unit_cost_foreign: Number(l.unit) || 0,
              })),
        } as any,
      });
    },
    onSuccess: (r: any) => {
      toast.success(r?.items_updated ? "Purchase order updated" : "PO details updated");
      qc.invalidateQueries({ queryKey: ["imp-po", po.id] });
      qc.invalidateQueries({ queryKey: ["imp-pos"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Update failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Purchase Order — {po.po_number}</DialogTitle>
          <DialogDescription>
            Header info shob shomoy edit kora jabe. Product lines tokhoni edit hobe jokhon kono carton release/in-stock hoy nai.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <Label>Order date</Label>
            <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
          </div>
          <div className="space-y-1.5 col-span-2 md:col-span-1">
            <Label>Supplier</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger><SelectValue placeholder="Choose supplier" /></SelectTrigger>
              <SelectContent>
                {suppliers.map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Currency</Label>
            <Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
          </div>
          <div className="space-y-1.5">
            <Label>FX rate ({currency}→BDT)</Label>
            <Input
              type="number" step="0.0001" value={fx} disabled={itemsLocked}
              onChange={(e) => setFx(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Notes</Label>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal note…" />
        </div>

        <div className="rounded-lg border">
          <div className="flex items-center justify-between gap-2 p-3 border-b bg-muted/40">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">Products</span>
              <Badge variant="outline" className="text-[10px]">{lines.length} lines · {totalQty} pcs</Badge>
            </div>
            {itemsLocked ? (
              <Badge variant="secondary" className="text-[10px] gap-1"><Lock className="h-3 w-3" />Locked (released/in-stock)</Badge>
            ) : (
              <Button size="sm" variant="outline" onClick={addLine}><Plus className="h-3.5 w-3.5 mr-1" />Add product</Button>
            )}
          </div>

          <div className="divide-y">
            {lines.map((l) => {
              const lineTotal = (Number(l.qty) || 0) * (Number(l.unit) || 0) * fxNum;
              return (
                <div key={l.key} className="p-3 grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-12 md:col-span-5 space-y-1.5">
                    <Label className="text-[11px] text-muted-foreground">Product</Label>
                    {po.brand_id && !l.id ? (
                      <ProductPicker
                        brandId={po.brand_id}
                        value={{ id: l.product_id, title: l.name_snapshot, sku: l.sku_snapshot, image: l.image_snapshot }}
                        onChange={(p) =>
                          setLine(l.key, {
                            product_id: p.id,
                            name_snapshot: p.title,
                            sku_snapshot: p.sku ?? null,
                            image_snapshot: p.image ?? null,
                          })
                        }
                      />
                    ) : (
                      <Input
                        value={l.name_snapshot}
                        disabled={itemsLocked}
                        onChange={(e) => setLine(l.key, { name_snapshot: e.target.value })}
                      />
                    )}
                    {l.sku_snapshot && <div className="text-[10px] font-mono text-muted-foreground">{l.sku_snapshot}</div>}
                  </div>
                  <div className="col-span-4 md:col-span-2 space-y-1.5">
                    <Label className="text-[11px] text-muted-foreground">Qty</Label>
                    <Input
                      type="number" min={1} value={l.qty} disabled={itemsLocked}
                      onChange={(e) => setLine(l.key, { qty: e.target.value })}
                    />
                  </div>
                  <div className="col-span-4 md:col-span-2 space-y-1.5">
                    <Label className="text-[11px] text-muted-foreground">Unit {currency}</Label>
                    <Input
                      type="number" step="0.01" min={0} value={l.unit} disabled={itemsLocked}
                      onChange={(e) => setLine(l.key, { unit: e.target.value })}
                    />
                  </div>
                  <div className="col-span-3 md:col-span-2 space-y-1.5">
                    <Label className="text-[11px] text-muted-foreground">Line total</Label>
                    <div className="h-9 flex items-center justify-end px-2 rounded-md bg-muted/50 text-sm tabular-nums font-medium">
                      {fmtBdt(lineTotal)}
                    </div>
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <Button
                      size="icon" variant="ghost"
                      className="text-destructive hover:text-destructive"
                      disabled={itemsLocked || l.locked}
                      title={l.locked ? "Carton/release e allocated" : "Remove line"}
                      onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="p-3 border-t bg-muted/30 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">
              Subtotal: <span className="font-mono">{subtotalForeign.toFixed(2)} {currency}</span>
            </span>
            <span className="font-semibold tabular-nums">{fmtBdt(subtotalBdt)}</span>
          </div>
        </div>

        {!itemsLocked && cartonAllocated > 0 && totalQty !== cartonAllocated && (
          <div className="rounded-md border border-orange-300/70 bg-orange-50/60 dark:bg-orange-950/20 px-3 py-2 text-[12px] text-orange-800 dark:text-orange-200">
            Carton e allocate kora ache <b>{cartonAllocated}</b> pcs, kintu product lines e <b>{totalQty}</b> pcs — carton quantity mile nite bhulben na.
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
