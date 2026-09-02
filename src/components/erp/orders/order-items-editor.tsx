import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { keepPreviousData } from "@tanstack/react-query";
import { Loader2, Minus, Plus, Package, Search, Trash2, Save, X, PackagePlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type EditableItem = {
  id?: string;
  product_id: string;
  variant_id: string | null;
  variant_label: string | null;
  name: string;
  image: string | null;
  unit_price: number;
  quantity: number;
};

type ProductHit = {
  id: string;
  title: string;
  price: number;
  image: string | null;
  stock: number;
  sku: string | null;
  brand: string | null;
};

type Variant = { id: string; color_name: string | null; sku: string | null; stock: number; is_active: boolean };

function Thumb({ src, alt }: { src: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg border bg-muted">
      {!src || failed ? (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground"><Package className="h-4 w-4 opacity-50" /></div>
      ) : (
        <img src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="h-full w-full object-cover" />
      )}
    </div>
  );
}

/** Product + variant picker used to append a line to an existing order. */
function AddProductPopover({ onAdd, disabled }: { onAdd: (i: EditableItem) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [picked, setPicked] = useState<ProductHit | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 250);
    return () => clearTimeout(t);
  }, [term]);

  const { data: products = [], isFetching } = useQuery({
    queryKey: ["drawer-item-products", debounced],
    enabled: open,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const clean = debounced.replace(/[,&()]/g, " ");
      let q = supabase
        .from("products")
        .select("id,title,price,image,stock,sku,brands(name)")
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(30);
      if (clean) q = q.or(`title.ilike.%${clean}%,sku.ilike.%${clean}%,barcode.ilike.%${clean}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((p) => ({
        id: p.id as string,
        title: p.title as string,
        price: Number(p.price ?? 0),
        image: (p.image as string | null) ?? null,
        stock: Number(p.stock ?? 0),
        sku: (p.sku as string | null) ?? null,
        brand: ((p as { brands?: { name: string } | null }).brands?.name) ?? null,
      })) as ProductHit[];
    },
  });

  const { data: variants = [], isFetching: loadingVariants } = useQuery({
    queryKey: ["drawer-item-variants", picked?.id],
    enabled: !!picked?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_variants")
        .select("id,color_name,sku,stock,is_active")
        .eq("product_id", picked!.id)
        .eq("is_active", true);
      if (error) throw error;
      return (data ?? []) as Variant[];
    },
  });

  const commit = (p: ProductHit, v: Variant | null) => {
    onAdd({
      product_id: p.id,
      variant_id: v?.id ?? null,
      variant_label: v?.color_name ?? null,
      name: p.title,
      image: p.image,
      unit_price: p.price,
      quantity: 1,
    });
    setPicked(null);
    setTerm("");
    setOpen(false);
  };

  const choose = async (p: ProductHit) => {
    const { data } = await supabase
      .from("product_variants")
      .select("id")
      .eq("product_id", p.id)
      .eq("is_active", true)
      .limit(1);
    if ((data ?? []).length > 0) setPicked(p);
    else commit(p, null);
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setPicked(null); }}>
      <PopoverTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 text-xs" disabled={disabled}>
          <PackagePlus className="h-3.5 w-3.5" /> Add product
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] p-0">
        {picked ? (
          <div className="p-3">
            <div className="mb-2 flex items-center gap-2">
              <Thumb src={picked.image} alt={picked.title} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{picked.title}</div>
                <div className="text-[11px] text-muted-foreground">Variant select kora baddhotamulok</div>
              </div>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setPicked(null)}><X className="h-3.5 w-3.5" /></Button>
            </div>
            {loadingVariants ? (
              <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
            ) : (
              <div className="max-h-56 space-y-1 overflow-y-auto">
                {variants.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => commit(picked, v)}
                    className="flex w-full items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-left text-xs transition hover:bg-accent"
                  >
                    <span className="truncate font-medium">{v.color_name ?? v.sku ?? "Variant"}</span>
                    <span className={cn("tabular-nums text-[11px]", v.stock > 0 ? "text-emerald-600" : "text-rose-600")}>{v.stock} in stock</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 border-b px-3 py-2">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                autoFocus
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Product name / SKU…"
                className="h-7 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              {isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </div>
            <div className="max-h-72 overflow-y-auto p-1.5">
              {products.length === 0 && (
                <div className="py-6 text-center text-xs text-muted-foreground">No products found</div>
              )}
              {products.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => void choose(p)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition hover:bg-accent"
                >
                  <Thumb src={p.image} alt={p.title} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium">{p.title}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {p.brand ? `${p.brand} · ` : ""}{p.sku ?? "—"} · stock {p.stock}
                    </div>
                  </div>
                  <div className="shrink-0 text-xs font-bold tabular-nums">৳ {p.price.toLocaleString()}</div>
                </button>
              ))}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

type Props = {
  orderId: string;
  items: EditableItem[];
  shippingFee: number;
  discountAmount: number;
  disabled?: boolean;
  onDone: () => void;
};

/** Inline editor: change qty / price, remove or append lines, then persist + recompute totals. */
export function OrderItemsEditor({ orderId, items, shippingFee, discountAmount, disabled, onDone }: Props) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<EditableItem[]>(items);
  const [removed, setRemoved] = useState<string[]>([]);

  const subtotal = useMemo(() => rows.reduce((s, r) => s + r.unit_price * r.quantity, 0), [rows]);
  const total = Math.max(0, subtotal + shippingFee - discountAmount);

  const patch = (idx: number, next: Partial<EditableItem>) =>
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...next } : r)));

  const remove = (idx: number) => {
    const row = rows[idx];
    if (row?.id) setRemoved((p) => [...p, row.id!]);
    setRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const save = useMutation({
    mutationFn: async () => {
      if (rows.length === 0) throw new Error("Kompokkhe ekta product lagbe");
      if (rows.some((r) => r.quantity < 1)) throw new Error("Quantity 1 er kom hote parbe na");

      if (removed.length > 0) {
        const { error } = await supabase.from("order_items").delete().in("id", removed);
        if (error) throw error;
      }
      for (const r of rows.filter((x) => x.id)) {
        const { error } = await supabase
          .from("order_items")
          .update({
            quantity: r.quantity,
            price: r.unit_price,
            unit_price: r.unit_price,
            line_total: r.unit_price * r.quantity,
          })
          .eq("id", r.id!);
        if (error) throw error;
      }
      const fresh = rows.filter((x) => !x.id);
      if (fresh.length > 0) {
        const { error } = await supabase.from("order_items").insert(
          fresh.map((r) => ({
            order_id: orderId,
            product_id: r.product_id,
            name: r.name,
            image: r.image,
            price: r.unit_price,
            unit_price: r.unit_price,
            quantity: r.quantity,
            line_total: r.unit_price * r.quantity,
            variant_id: r.variant_id,
            variant_label: r.variant_label,
          })),
        );
        if (error) throw error;
      }
      const { error: orderErr } = await supabase
        .from("orders")
        .update({ subtotal, total })
        .eq("id", orderId);
      if (orderErr) throw orderErr;
    },
    onSuccess: () => {
      toast.success("Items update hoyeche ✓");
      qc.invalidateQueries({ queryKey: ["order-detail", orderId] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["web-orders"] });
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-2">
      {rows.map((r, idx) => (
        <div key={r.id ?? `${r.product_id}-${r.variant_id ?? "base"}-${idx}`} className="flex items-center gap-2.5 rounded-lg border bg-background p-2.5">
          <Thumb src={r.image} alt={r.name} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{r.name}</div>
            {r.variant_label && <div className="text-[11px] text-muted-foreground">{r.variant_label}</div>}
            <div className="mt-1.5 flex items-center gap-2">
              <div className="inline-flex items-center rounded-md border">
                <button type="button" className="px-2 py-1 text-muted-foreground hover:text-foreground" onClick={() => patch(idx, { quantity: Math.max(1, r.quantity - 1) })}>
                  <Minus className="h-3 w-3" />
                </button>
                <input
                  value={r.quantity}
                  onChange={(e) => patch(idx, { quantity: Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1) })}
                  className="w-10 bg-transparent text-center text-xs font-semibold tabular-nums outline-none"
                />
                <button type="button" className="px-2 py-1 text-muted-foreground hover:text-foreground" onClick={() => patch(idx, { quantity: r.quantity + 1 })}>
                  <Plus className="h-3 w-3" />
                </button>
              </div>
              <span className="text-xs text-muted-foreground">×</span>
              <Input
                value={String(r.unit_price)}
                onChange={(e) => patch(idx, { unit_price: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 })}
                className="h-7 w-24 text-xs tabular-nums"
              />
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span className="text-sm font-bold tabular-nums">৳ {(r.unit_price * r.quantity).toLocaleString()}</span>
            <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => remove(idx)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <AddProductPopover disabled={disabled || save.isPending} onAdd={(i) => setRows((p) => [...p, i])} />
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">New total <b className="text-foreground tabular-nums">৳ {total.toLocaleString()}</b></span>
          <Button size="sm" variant="ghost" className="h-8" onClick={onDone} disabled={save.isPending}>Cancel</Button>
          <Button size="sm" className="h-8 gap-1.5" disabled={disabled || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save items
          </Button>
        </div>
      </div>
    </div>
  );
}
