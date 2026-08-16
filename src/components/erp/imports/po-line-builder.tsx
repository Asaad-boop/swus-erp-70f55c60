import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2, Package, Boxes, Truck, AlertTriangle, SplitSquareHorizontal, Palette } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { ProductPicker, type PickedProduct } from "@/components/erp/imports/product-picker";
import { fmtBdt } from "@/lib/erp/imports/types";

export type VariantMeta = {
  id: string;
  color_name: string | null;
  color_hex: string | null;
  image: string | null;
  sku?: string | null;
  stock?: number | null;
};

export type PoItemDraft = {
  id: string;
  picked: PickedProduct;
  quantity: number;
  unit_cost_foreign: number;
  allocations?: Record<string, number>; // variant_id -> qty
};

export type PoCartonDraft = {
  id: string;
  carton_number: number;
  weight_kg: number;
  allocations: Record<string, number>; // `${itemId}|${variantId ?? ''}` -> qty
};

export const poUid = () => Math.random().toString(36).slice(2, 10);
export const emptyPick = (): PickedProduct => ({ id: null, title: "", sku: null, image: null });
export const emptyPoItem = (patch?: Partial<PoItemDraft>): PoItemDraft => ({
  id: poUid(),
  picked: emptyPick(),
  quantity: 1,
  unit_cost_foreign: 0,
  ...patch,
});
export const emptyPoCarton = (n = 1): PoCartonDraft => ({ id: poUid(), carton_number: n, weight_kg: 0, allocations: {} });

export const leafKey = (itemId: string, variantId: string | null) => `${itemId}|${variantId ?? ""}`;
export const variantLabelOf = (v: VariantMeta) => v.color_name || v.sku || `Variant ${v.id.slice(0, 4)}`;

export type PoLeaf = {
  key: string;
  itemId: string;
  variantId: string | null;
  title: string;
  image: string | null;
  variantLabel: string | null;
  variantHex: string | null;
  qty: number;
};

export function buildLeaves(
  items: PoItemDraft[],
  variantsByProduct: Record<string, VariantMeta[]>,
): PoLeaf[] {
  const out: PoLeaf[] = [];
  for (const it of items) {
    const allocs = it.allocations ? Object.entries(it.allocations).filter(([, q]) => q > 0) : [];
    if (allocs.length > 0) {
      const vmap = new Map((variantsByProduct[it.picked.id ?? ""] ?? []).map((v) => [v.id, v]));
      for (const [vid, q] of allocs) {
        const v = vmap.get(vid);
        out.push({
          key: leafKey(it.id, vid),
          itemId: it.id,
          variantId: vid,
          title: it.picked.title || "—",
          image: v?.image || it.picked.image || null,
          variantLabel: v ? variantLabelOf(v) : `Variant ${vid.slice(0, 4)}`,
          variantHex: v?.color_hex ?? null,
          qty: Number(q) || 0,
        });
      }
    } else {
      out.push({
        key: leafKey(it.id, null),
        itemId: it.id,
        variantId: null,
        title: it.picked.title || "—",
        image: it.picked.image || null,
        variantLabel: null,
        variantHex: null,
        qty: it.quantity,
      });
    }
  }
  return out;
}

/** Build the `items` + `cartons` payload arrays for createImportPo. */
export function buildPoPayloadParts(
  items: PoItemDraft[],
  cartons: PoCartonDraft[],
  receiveMode: "carton" | "quantity",
) {
  const itemList: any[] = [];
  const leafIndex: Record<string, number> = {};
  for (const it of items) {
    const allocs = it.allocations ? Object.entries(it.allocations).filter(([, q]) => q > 0) : [];
    if (allocs.length > 0) {
      for (const [variant_id, qty] of allocs) {
        leafIndex[leafKey(it.id, variant_id)] = itemList.length;
        itemList.push({
          product_id: it.picked.id ?? undefined,
          variant_id,
          name_snapshot: it.picked.title.trim(),
          sku_snapshot: it.picked.sku ?? undefined,
          image_snapshot: it.picked.image ?? undefined,
          quantity: qty,
          unit_cost_foreign: it.unit_cost_foreign,
        });
      }
    } else {
      leafIndex[leafKey(it.id, null)] = itemList.length;
      itemList.push({
        product_id: it.picked.id ?? undefined,
        name_snapshot: it.picked.title.trim(),
        sku_snapshot: it.picked.sku ?? undefined,
        image_snapshot: it.picked.image ?? undefined,
        quantity: it.quantity,
        unit_cost_foreign: it.unit_cost_foreign,
      });
    }
  }

  const cartonList =
    receiveMode === "carton"
      ? cartons.map((c) => {
          const allocations: { item_index: number; quantity: number }[] = [];
          for (const [k, qty] of Object.entries(c.allocations)) {
            const q = Number(qty) || 0;
            if (q <= 0) continue;
            const idx = leafIndex[k];
            if (idx === undefined) continue;
            allocations.push({ item_index: idx, quantity: q });
          }
          return { carton_number: c.carton_number, weight_kg: c.weight_kg || 0, allocations };
        })
      : [];

  return { items: itemList, cartons: cartonList };
}

type Props = {
  brandId: string;
  currency?: string;
  fxRate: number;
  items: PoItemDraft[];
  setItems: React.Dispatch<React.SetStateAction<PoItemDraft[]>>;
  cartons: PoCartonDraft[];
  setCartons: React.Dispatch<React.SetStateAction<PoCartonDraft[]>>;
  receiveMode: "carton" | "quantity";
  setReceiveMode: (m: "carton" | "quantity") => void;
  variantsByProduct: Record<string, VariantMeta[]>;
  setVariantsByProduct: React.Dispatch<React.SetStateAction<Record<string, VariantMeta[]>>>;
  /** compact = dialog friendly (no Card wrappers) */
  compact?: boolean;
};

export function PoLineBuilder({
  brandId,
  currency = "CNY",
  fxRate,
  items,
  setItems,
  cartons,
  setCartons,
  receiveMode,
  setReceiveMode,
  variantsByProduct,
  setVariantsByProduct,
  compact,
}: Props) {
  const registerVariants = (productId: string, vs: VariantMeta[]) =>
    setVariantsByProduct((m) => {
      const prev = m[productId];
      if (prev && prev.length === vs.length && prev.every((x, i) => x.id === vs[i].id)) return m;
      return { ...m, [productId]: vs };
    });

  const leaves = useMemo(() => buildLeaves(items, variantsByProduct), [items, variantsByProduct]);

  const totalAllocated = useMemo(() => {
    const map: Record<string, number> = {};
    leaves.forEach((l) => { map[l.key] = 0; });
    cartons.forEach((c) => {
      Object.entries(c.allocations).forEach(([k, q]) => {
        if (map[k] !== undefined) map[k] += Number(q) || 0;
      });
    });
    return map;
  }, [leaves, cartons]);

  const errors = useMemo(
    () =>
      leaves.flatMap((l) => {
        const a = totalAllocated[l.key] ?? 0;
        if (a !== l.qty) {
          const label = l.variantLabel ? `${l.title} — ${l.variantLabel}` : l.title;
          return [`${label}: allocated ${a} / ${l.qty}`];
        }
        return [];
      }),
    [leaves, totalAllocated],
  );

  const addItem = () => setItems((xs) => [...xs, emptyPoItem()]);
  const removeItem = (id: string) => setItems((xs) => xs.filter((x) => x.id !== id));
  const updItem = (id: string, patch: Partial<PoItemDraft>) =>
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const addCarton = () => setCartons((cs) => [...cs, emptyPoCarton(cs.length + 1)]);
  const removeCarton = (id: string) =>
    setCartons((cs) => cs.filter((c) => c.id !== id).map((c, i) => ({ ...c, carton_number: i + 1 })));
  const updCarton = (id: string, patch: Partial<PoCartonDraft>) =>
    setCartons((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const setAlloc = (cartonId: string, key: string, q: number) =>
    setCartons((cs) =>
      cs.map((c) => {
        if (c.id !== cartonId) return c;
        const next = { ...c.allocations };
        if (q > 0) next[key] = q; else delete next[key];
        return { ...c, allocations: next };
      }),
    );

  const autoSplit = () => {
    if (cartons.length === 0) return;
    setCartons((cs) =>
      cs.map((c, ci) => {
        const newAlloc: Record<string, number> = {};
        leaves.forEach((l) => {
          const base = Math.floor(l.qty / cs.length);
          const rem = l.qty - base * cs.length;
          const share = base + (ci < rem ? 1 : 0);
          if (share > 0) newAlloc[l.key] = share;
        });
        return { ...c, allocations: newAlloc };
      }),
    );
  };

  const subtotalForeign = items.reduce((s, i) => s + i.quantity * i.unit_cost_foreign, 0);
  const totalUnits = items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);

  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    compact ? <div className="rounded-lg border p-3">{children}</div> : <Card className="p-4 md:p-5">{children}</Card>;

  return (
    <div className="space-y-3">
      {/* Receive mode */}
      <Wrapper>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Receive mode</div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {([
            { v: "carton" as const, title: "Carton wise", desc: "Carton banaye allocation, carton dhore receive hobe." },
            { v: "quantity" as const, title: "Quantity wise", desc: "Total piece order — BD te ese piece by piece release." },
          ]).map((o) => (
            <button
              key={o.v}
              type="button"
              onClick={() => setReceiveMode(o.v)}
              className={cn(
                "rounded-lg border p-2.5 text-left transition",
                receiveMode === o.v ? "border-primary bg-primary/5 ring-1 ring-primary/40" : "border-border hover:border-primary/40",
              )}
            >
              <div className="text-sm font-semibold">{o.title}</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">{o.desc}</div>
            </button>
          ))}
        </div>
      </Wrapper>

      {/* Items */}
      <Wrapper>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Boxes className="h-4 w-4 text-primary" />
            <h3 className="font-semibold">Items ({items.length})</h3>
          </div>
          <Button size="sm" variant="outline" onClick={addItem}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add item
          </Button>
        </div>
        <div className="mt-3 space-y-2">
          {items.map((it) => {
            const subBdt = it.quantity * it.unit_cost_foreign * (fxRate || 0);
            return (
              <div key={it.id} className="relative rounded-lg border border-border bg-muted/10 p-3">
                <div className="flex flex-col gap-3 md:flex-row">
                  <div className="flex-shrink-0">
                    {it.picked.image ? (
                      <img src={it.picked.image} alt={it.picked.title} className="h-14 w-14 rounded-md border object-cover" />
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-md border border-dashed bg-muted">
                        <Package className="h-6 w-6 text-muted-foreground/60" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Product</Label>
                    <ProductPicker brandId={brandId} value={it.picked} onChange={(p) => updItem(it.id, { picked: p })} />
                    <div className="flex flex-wrap items-center gap-2 pt-0.5 text-[11px] text-muted-foreground">
                      {it.picked.sku && <span className="rounded bg-muted px-1.5 py-0.5 font-mono">{it.picked.sku}</span>}
                      {it.picked.id ? (
                        <Badge variant="outline" className="h-4 px-1.5 text-[10px]">Inventory linked</Badge>
                      ) : it.picked.title ? (
                        <Badge variant="outline" className="h-4 px-1.5 text-[10px]">Ad-hoc</Badge>
                      ) : null}
                    </div>
                  </div>
                  <div className="grid flex-shrink-0 grid-cols-3 gap-2 md:w-[320px]">
                    <div>
                      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Qty</Label>
                      <Input
                        type="number" min={1} value={it.quantity} disabled={!!it.allocations}
                        onChange={(e) => updItem(it.id, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                        className="h-9 text-center font-semibold tabular-nums"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Unit ({currency})</Label>
                      <Input
                        type="number" step="0.01" value={it.unit_cost_foreign}
                        onChange={(e) => updItem(it.id, { unit_cost_foreign: Number(e.target.value) || 0 })}
                        className="h-9 text-right tabular-nums"
                      />
                    </div>
                    <div className="flex flex-col">
                      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Subtotal</Label>
                      <div className="flex h-9 items-center justify-end text-sm font-bold tabular-nums text-primary">{fmtBdt(subBdt)}</div>
                    </div>
                  </div>
                  <div className="absolute right-2 top-2 md:static md:self-start">
                    <Button size="icon" variant="ghost" className="h-7 w-7" disabled={items.length === 1} onClick={() => removeItem(it.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    </Button>
                  </div>
                </div>
                {it.picked.id && (
                  <div className="pt-3">
                    <VariantAllocator
                      productId={it.picked.id}
                      allocations={it.allocations}
                      onChange={(allocs) => {
                        const total = Object.values(allocs).reduce((s, n) => s + n, 0);
                        updItem(it.id, {
                          allocations: Object.keys(allocs).length ? allocs : undefined,
                          quantity: total > 0 ? total : it.quantity,
                        });
                      }}
                      onVariantsLoaded={(vs) => registerVariants(it.picked.id!, vs)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex justify-end gap-4 text-xs text-muted-foreground">
          <span>Total units: <span className="font-semibold tabular-nums text-foreground">{totalUnits}</span></span>
          <span>{subtotalForeign.toFixed(2)} {currency} ≈ <span className="font-semibold text-foreground">{fmtBdt(subtotalForeign * (fxRate || 0))}</span></span>
        </div>
      </Wrapper>

      {/* Cartons */}
      {receiveMode === "carton" ? (
        <Wrapper>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-primary" />
              <h3 className="font-semibold">Cartons ({cartons.length})</h3>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={autoSplit}>
                <SplitSquareHorizontal className="mr-1 h-3.5 w-3.5" /> Auto-split
              </Button>
              <Button size="sm" variant="outline" onClick={addCarton}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Add carton
              </Button>
            </div>
          </div>
          {errors.length > 0 && (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-orange-200 bg-orange-50 p-2.5 text-xs dark:border-orange-900 dark:bg-orange-950/30">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-orange-600" />
              <div className="text-orange-700 dark:text-orange-300">
                <div className="mb-1 font-semibold">Carton allocation mismatch</div>
                {errors.map((e, i) => <div key={i}>• {e}</div>)}
              </div>
            </div>
          )}
          <div className="mt-3 space-y-3">
            {cartons.map((c) => (
              <div key={c.id} className="rounded-md border bg-card/50 p-3">
                <div className="mb-2 flex flex-wrap items-center gap-3">
                  <div className="rounded bg-primary/10 px-2 py-1 font-mono text-sm font-semibold text-primary">CTN-{c.carton_number}</div>
                  <div className="flex items-center gap-2">
                    <Label className="whitespace-nowrap text-xs">Weight (kg)</Label>
                    <Input type="number" step="0.1" className="h-8 w-24" value={c.weight_kg}
                      onChange={(e) => updCarton(c.id, { weight_kg: Number(e.target.value) || 0 })} />
                  </div>
                  <div className="ml-auto">
                    <Button size="icon" variant="ghost" disabled={cartons.length === 1} onClick={() => removeCarton(c.id)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {leaves.map((l) => {
                    const alloc = c.allocations[l.key] ?? 0;
                    const over = alloc > l.qty;
                    return (
                      <div key={l.key} className={cn("flex items-center gap-2 rounded border bg-background/60 p-1.5 text-xs", over ? "border-red-300" : "border-border/60")}>
                        {l.image ? (
                          <img src={l.image} alt="" className="h-9 w-9 flex-shrink-0 rounded border object-cover" />
                        ) : (
                          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded border border-dashed bg-muted">
                            <Package className="h-4 w-4 text-muted-foreground/60" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 truncate font-medium">
                            {l.variantLabel && (
                              <span className="h-3 w-3 shrink-0 rounded-sm border" style={{ background: l.variantHex || "#e5e7eb" }} />
                            )}
                            <span className="truncate">{l.title}</span>
                          </div>
                          <div className="truncate text-[10px] tabular-nums text-muted-foreground">
                            {l.variantLabel ? `${l.variantLabel} · ` : ""}of {l.qty}
                          </div>
                        </div>
                        <Input
                          type="number" min={0} max={l.qty} placeholder="0"
                          className={cn("h-8 w-16 text-right tabular-nums", over && "border-red-400 text-red-600")}
                          value={alloc || ""}
                          onChange={(e) => setAlloc(c.id, l.key, Number(e.target.value) || 0)}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </Wrapper>
      ) : (
        <Wrapper>
          <p className="text-xs text-muted-foreground">
            Carton allocation lagbe na. Total <span className="font-semibold tabular-nums">{totalUnits}</span> pcs order hocche — BD te
            arrive korar por PO detail page theke piece by piece release kora jabe.
          </p>
        </Wrapper>
      )}
    </div>
  );
}

/** Validation helper for carton mode. */
export function cartonAllocationErrors(
  items: PoItemDraft[],
  cartons: PoCartonDraft[],
  variantsByProduct: Record<string, VariantMeta[]>,
): string[] {
  const leaves = buildLeaves(items, variantsByProduct);
  const map: Record<string, number> = {};
  leaves.forEach((l) => { map[l.key] = 0; });
  cartons.forEach((c) =>
    Object.entries(c.allocations).forEach(([k, q]) => {
      if (map[k] !== undefined) map[k] += Number(q) || 0;
    }),
  );
  return leaves.flatMap((l) => ((map[l.key] ?? 0) !== l.qty ? [`${l.title}: ${map[l.key] ?? 0}/${l.qty}`] : []));
}

function VariantAllocator({
  productId, allocations, onChange, onVariantsLoaded,
}: {
  productId: string;
  allocations?: Record<string, number>;
  onChange: (a: Record<string, number>) => void;
  onVariantsLoaded?: (variants: VariantMeta[]) => void;
}) {
  const { data: variants = [], isLoading } = useQuery({
    queryKey: ["product-variants-active", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_variants")
        .select("id,color_name,color_hex,image,stock,sku")
        .eq("product_id", productId)
        .eq("is_active", true)
        .order("display_order");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  useEffect(() => {
    if (variants.length > 0) onVariantsLoaded?.(variants as VariantMeta[]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variants]);

  if (isLoading || variants.length === 0) return null;

  const set = (vid: string, qty: number) => {
    const next: Record<string, number> = { ...(allocations ?? {}) };
    if (qty > 0) next[vid] = qty; else delete next[vid];
    onChange(next);
  };
  const totalAlloc = Object.values(allocations ?? {}).reduce((s: number, n: number) => s + n, 0);

  return (
    <div className="space-y-2 rounded-lg border border-dashed bg-muted/20 p-2.5">
      <div className="flex items-center justify-between text-[11px]">
        <span className="inline-flex items-center gap-1.5 font-medium text-muted-foreground">
          <Palette className="h-3.5 w-3.5" /> Variation wise quantity
        </span>
        {totalAlloc > 0 && <Badge variant="secondary" className="tabular-nums">Total: {totalAlloc}</Badge>}
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {variants.map((v: any) => {
          const cur = allocations?.[v.id] ?? 0;
          const label = v.color_name || v.sku || `Variant ${v.id.slice(0, 4)}`;
          return (
            <div key={v.id} className={cn("flex items-center gap-2 rounded-md border bg-card/70 p-1.5", cur > 0 && "border-primary/40 ring-1 ring-primary/50")}>
              <div className="h-8 w-8 shrink-0 rounded border" style={{ background: v.color_hex || "#e5e7eb" }} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium">{label}</div>
                <div className="text-[10px] tabular-nums text-muted-foreground">Stock: {v.stock ?? 0}</div>
              </div>
              <Input
                type="number" min={0} value={cur || ""} placeholder="0"
                onChange={(e) => set(v.id, Math.max(0, Number(e.target.value) || 0))}
                className="h-7 w-14 text-center text-xs tabular-nums"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
