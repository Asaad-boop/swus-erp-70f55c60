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

  const productIds = useMemo(
    () => Array.from(new Set(lines.map((l) => l.product_id).filter(Boolean) as string[])).sort(),
    [lines],
  );

  const { data: variantRows = [] } = useQuery({
    queryKey: ["imp-po-variants", productIds],
    enabled: open && productIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_variants")
        .select("id,product_id,color_name,color_hex,image,sku,stock")
        .in("product_id", productIds)
        .eq("is_active", true)
        .order("display_order");
      if (error) throw error;
      return (data ?? []) as VariantMeta[];
    },
  });

  const variantsByProduct = useMemo(() => {
    const m: Record<string, VariantMeta[]> = {};
    for (const v of variantRows) (m[v.product_id] ??= []).push(v);
    return m;
  }, [variantRows]);

  const fxNum = Number(fx) || 0;
  const subtotalForeign = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unit) || 0), 0);
  const subtotalBdt = subtotalForeign * fxNum;
  const totalQty = lines.reduce((s, l) => s + (Number(l.qty) || 0), 0);
  const cartonAllocated = cartons.reduce((s: number, c: any) => s + Number(c.expected_quantity || 0), 0);

  const setLine = (key: string, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  /** Color chip toggle: khali line e boshabe, na hole notun line banabe, ar off korle line remove/clear. */
  const toggleVariant = (line: Line, variantId: string) => {
    setLines((prev) => {
      if (line.variant_id === variantId) {
        return prev.map((l) => (l.key === line.key ? { ...l, variant_id: null } : l));
      }
      const other = prev.find(
        (l) => l.key !== line.key && l.product_id === line.product_id && l.variant_id === variantId,
      );
      if (other) {
        // already added on another line — toggle off (locked line remove kora jabe na)
        if (other.locked || other.id) return prev.map((l) => (l.key === other.key ? { ...l, variant_id: null } : l));
        return prev.filter((l) => l.key !== other.key);
      }
      if (!line.variant_id) {
        return prev.map((l) => (l.key === line.key ? { ...l, variant_id: variantId } : l));
      }
      const idx = prev.findIndex((l) => l.key === line.key);
      const clone: Line = {
        ...line,
        key: `new_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        id: undefined,
        variant_id: variantId,
        locked: false,
      };
      return [...prev.slice(0, idx + 1), clone, ...prev.slice(idx + 1)];
    });
  };

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
        const seen = new Set<string>();
        for (const l of lines) {
          const k = `${l.product_id ?? l.name_snapshot.trim()}|${l.variant_id ?? ""}`;
          if (seen.has(k)) throw new Error(`"${l.name_snapshot}" — same product/variation duplicate line ache`);
          seen.add(k);
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
              const vars = l.product_id ? (variantsByProduct[l.product_id] ?? []) : [];
              const picked = vars.find((v) => v.id === l.variant_id) ?? null;
              const usedVariantIds = new Set(
                lines.filter((x) => x.product_id === l.product_id && x.variant_id).map((x) => x.variant_id as string),
              );
              const thumb = picked?.image || l.image_snapshot;
              return (
                <div key={l.key} className="p-3 grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-12 md:col-span-5 space-y-1.5">
                    <Label className="text-[11px] text-muted-foreground">Product</Label>
                    <div className="flex items-start gap-2">
                      {thumb ? (
                        <img src={thumb} alt={l.name_snapshot} loading="lazy" className="h-9 w-9 shrink-0 rounded-md border object-cover" />
                      ) : (
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-muted">
                          <Package className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        {po.brand_id && !itemsLocked ? (
                          <ProductPicker
                            brandId={po.brand_id}
                            value={{ id: l.product_id, title: l.name_snapshot, sku: l.sku_snapshot, image: l.image_snapshot }}
                            onChange={(p) =>
                              setLine(l.key, {
                                product_id: p.id,
                                name_snapshot: p.title,
                                sku_snapshot: p.sku ?? null,
                                image_snapshot: p.image ?? null,
                                variant_id: null,
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
                        {(picked?.sku || l.sku_snapshot) && (
                          <div className="mt-0.5 truncate text-[10px] font-mono text-muted-foreground">
                            {picked?.sku || l.sku_snapshot}
                          </div>
                        )}
                      </div>
                    </div>

                    {vars.length > 0 ? (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                          <Palette className="h-3.5 w-3.5 shrink-0" /> Colors ({vars.length}) — multiple select kora jabe
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {vars.map((v) => {
                            const onThisLine = l.variant_id === v.id;
                            const onOtherLine = !onThisLine && usedVariantIds.has(v.id);
                            return (
                              <button
                                key={v.id}
                                type="button"
                                disabled={itemsLocked || l.locked}
                                onClick={() => toggleVariant(l, v.id)}
                                title={onOtherLine ? "Already added (onno line e)" : variantLabel(v)}
                                className={
                                  "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] transition disabled:opacity-50 " +
                                  (onThisLine
                                    ? "border-primary bg-primary/10 font-semibold text-primary"
                                    : onOtherLine
                                      ? "border-dashed border-primary/40 text-muted-foreground"
                                      : "border-border hover:border-primary/50")
                                }
                              >
                                <span className="h-3 w-3 rounded-full border" style={{ background: v.color_hex ?? "transparent" }} />
                                {variantLabel(v)}
                                {onOtherLine && <span className="text-[9px]">✓</span>}
                              </button>
                            );
                          })}
                          {l.variant_id && !itemsLocked && !l.locked && (
                            <button
                              type="button"
                              onClick={() => setLine(l.key, { variant_id: null })}
                              className="rounded-full border border-dashed px-2 py-1 text-[11px] text-muted-foreground hover:border-destructive/50 hover:text-destructive"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                      </div>
                    ) : l.variant_id ? (
                      <Badge variant="outline" className="text-[10px]">Variant {l.variant_id.slice(0, 6)}</Badge>
                    ) : null}
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
                    <div className="flex flex-col items-end">
                    {!itemsLocked && vars.length > 0 && (
                      <Button
                        size="icon" variant="ghost" title="Duplicate line for another color"
                        onClick={() => {
                          const next = vars.find((v) => !usedVariantIds.has(v.id));
                          setLines((prev) => [
                            ...prev,
                            {
                              ...l,
                              key: `new_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                              id: undefined,
                              locked: false,
                              variant_id: next?.id ?? null,
                            },
                          ]);
                        }}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    )}
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
