import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Package2, Search, Boxes } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Props = {
  comboProductId: string;
  ownerBrandId: string | null;
  comboPrice: number;
};

type ComboItem = {
  id: string;
  combo_product_id: string;
  child_product_id: string;
  child_variant_id: string | null;
  quantity: number;
  display_order: number;
  child?: {
    title: string;
    image: string | null;
    cost_price: number | null;
    weighted_avg_cost: number | null;
    stock: number;
  };
  variant?: {
    color_name: string | null;
    image: string | null;
    stock: number;
    weighted_avg_cost: number | null;
  } | null;
};

type Summary = { total_cost: number; buildable_units: number; component_count: number };

export function ComboItemsEditor({ comboProductId, ownerBrandId, comboPrice }: Props) {
  const qc = useQueryClient();

  const itemsQ = useQuery({
    queryKey: ["combo-items", comboProductId],
    queryFn: async (): Promise<ComboItem[]> => {
      const { data, error } = await supabase
        .from("product_combo_items" as never)
        .select(
          "id,combo_product_id,child_product_id,child_variant_id,quantity,display_order," +
          "child:products!product_combo_items_child_product_id_fkey(title,image,cost_price,weighted_avg_cost,stock)," +
          "variant:product_variants!product_combo_items_child_variant_id_fkey(color_name,image,stock,weighted_avg_cost)"
        )
        .eq("combo_product_id", comboProductId)
        .order("display_order");
      if (error) throw error;
      return (data ?? []) as unknown as ComboItem[];
    },
  });

  const summaryQ = useQuery({
    queryKey: ["combo-summary", comboProductId],
    queryFn: async (): Promise<Summary> => {
      const { data, error } = await supabase
        .from("v_combo_summary" as never)
        .select("total_cost,buildable_units,component_count")
        .eq("combo_product_id", comboProductId)
        .maybeSingle();
      if (error) throw error;
      const d = (data ?? { total_cost: 0, buildable_units: 0, component_count: 0 }) as Summary;
      return d;
    },
  });

  const addItem = useMutation({
    mutationFn: async (payload: { child_product_id: string; child_variant_id: string | null; quantity: number }) => {
      const { error } = await supabase
        .from("product_combo_items" as never)
        .insert({
          combo_product_id: comboProductId,
          child_product_id: payload.child_product_id,
          child_variant_id: payload.child_variant_id,
          quantity: payload.quantity,
          display_order: (itemsQ.data?.length ?? 0),
        } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["combo-items", comboProductId] });
      qc.invalidateQueries({ queryKey: ["combo-summary", comboProductId] });
      toast.success("Component added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateQty = useMutation({
    mutationFn: async ({ id, quantity }: { id: string; quantity: number }) => {
      const { error } = await supabase
        .from("product_combo_items" as never)
        .update({ quantity } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["combo-items", comboProductId] });
      qc.invalidateQueries({ queryKey: ["combo-summary", comboProductId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("product_combo_items" as never)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["combo-items", comboProductId] });
      qc.invalidateQueries({ queryKey: ["combo-summary", comboProductId] });
      toast.success("Component removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const items = itemsQ.data ?? [];
  const totalCost = Number(summaryQ.data?.total_cost ?? 0);
  const buildable = Number(summaryQ.data?.buildable_units ?? 0);
  const margin = comboPrice > 0 && totalCost > 0 ? Math.round(((comboPrice - totalCost) / comboPrice) * 100) : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Components" value={String(items.length)} />
        <StatCard label="Total cost" value={`৳${totalCost.toFixed(0)}`} />
        <StatCard
          label="Margin"
          value={margin === null ? "—" : `${margin}%`}
          tone={margin === null ? undefined : margin >= 30 ? "good" : margin >= 10 ? "warn" : "bad"}
        />
        <StatCard label="Buildable" value={`${buildable} pcs`} icon={<Boxes className="h-3.5 w-3.5" />} />
      </div>

      <div className="rounded-lg border overflow-hidden">
        <div className="grid grid-cols-[minmax(0,1fr)_90px_100px_90px_36px] gap-2 bg-muted/60 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <div>Component</div>
          <div className="text-center">Qty</div>
          <div className="text-right">Unit cost</div>
          <div className="text-right">Line cost</div>
          <div />
        </div>
        {itemsQ.isLoading ? (
          <div className="py-6 grid place-items-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /></div>
        ) : items.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            No components yet. Add products to build this combo.
          </div>
        ) : (
          <ul className="divide-y">
            {items.map((it) => {
              const image = it.variant?.image ?? it.child?.image ?? null;
              const stock = it.child_variant_id ? Number(it.variant?.stock ?? 0) : Number(it.child?.stock ?? 0);
              const unitCost = Number(
                (it.child_variant_id ? it.variant?.weighted_avg_cost : it.child?.weighted_avg_cost) ||
                  it.child?.cost_price || 0
              );
              const line = unitCost * it.quantity;
              return (
                <li key={it.id} className="grid grid-cols-[minmax(0,1fr)_90px_100px_90px_36px] gap-2 items-center px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-10 w-10 rounded-md bg-muted overflow-hidden flex items-center justify-center shrink-0">
                      {image ? <img src={image} alt="" className="h-full w-full object-cover" /> : <Package2 className="h-4 w-4 text-muted-foreground" />}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-medium truncate">{it.child?.title ?? "—"}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {it.variant?.color_name && (
                          <span className="rounded bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.5 text-[9px] font-semibold">
                            {it.variant.color_name}
                          </span>
                        )}
                        <span className={cn(
                          "text-[10px]",
                          stock <= 0 ? "text-rose-600" : stock < 5 ? "text-amber-600" : "text-muted-foreground",
                        )}>Stock: {stock}</span>
                      </div>
                    </div>
                  </div>
                  <Input
                    type="number"
                    min={1}
                    value={it.quantity}
                    onChange={(e) => {
                      const q = Math.max(1, Number(e.target.value) || 1);
                      updateQty.mutate({ id: it.id, quantity: q });
                    }}
                    className="h-8 text-xs text-center tabular-nums"
                  />
                  <div className="text-right text-xs tabular-nums">৳{unitCost.toFixed(0)}</div>
                  <div className="text-right text-xs font-semibold tabular-nums">৳{line.toFixed(0)}</div>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-600 hover:bg-rose-500/10" onClick={() => removeItem.mutate(it.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <AddComponent
        brandId={ownerBrandId}
        excludeProductId={comboProductId}
        existingChildIds={new Set(items.map((i) => `${i.child_product_id}:${i.child_variant_id ?? ""}`))}
        onAdd={(p) => addItem.mutate(p)}
        pending={addItem.isPending}
      />
    </div>
  );
}

function StatCard({ label, value, tone, icon }: { label: string; value: string; tone?: "good" | "warn" | "bad"; icon?: React.ReactNode }) {
  return (
    <div className={cn(
      "rounded-lg border bg-card px-3 py-2",
      tone === "good" && "border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20",
      tone === "warn" && "border-amber-200 bg-amber-50/60 dark:bg-amber-950/20",
      tone === "bad" && "border-rose-200 bg-rose-50/60 dark:bg-rose-950/20",
    )}>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">{icon}{label}</div>
      <div className="text-base font-bold tabular-nums">{value}</div>
    </div>
  );
}

function AddComponent({
  brandId, excludeProductId, existingChildIds, onAdd, pending,
}: {
  brandId: string | null;
  excludeProductId: string;
  existingChildIds: Set<string>;
  onAdd: (p: { child_product_id: string; child_variant_id: string | null; quantity: number }) => void;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<{ id: string; title: string; image: string | null } | null>(null);
  const [variantId, setVariantId] = useState<string>("none");
  const [qty, setQty] = useState(1);

  const productsQ = useQuery({
    queryKey: ["combo-picker-products", brandId, search],
    enabled: open,
    queryFn: async () => {
      let q = supabase
        .from("products")
        .select("id,title,image,brand_id,is_combo")
        .eq("is_active", true)
        .eq("is_combo", false)
        .neq("id", excludeProductId)
        .order("title")
        .limit(30);
      // Cross-brand: dui brand er product-i combo te use kora jabe.
      if (search.trim()) q = q.ilike("title", `%${search.trim()}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const variantsQ = useQuery({
    queryKey: ["combo-picker-variants", picked?.id],
    enabled: !!picked?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_variants")
        .select("id,color_name,stock,image")
        .eq("product_id", picked!.id)
        .eq("is_active", true)
        .order("display_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  const reset = () => { setPicked(null); setVariantId("none"); setQty(1); setSearch(""); };

  const dupKey = picked ? `${picked.id}:${variantId === "none" ? "" : variantId}` : "";
  const isDup = !!picked && existingChildIds.has(dupKey);

  const commit = () => {
    if (!picked) return;
    if (isDup) { toast.error("This component already exists in the combo"); return; }
    onAdd({ child_product_id: picked.id, child_variant_id: variantId === "none" ? null : variantId, quantity: qty });
    reset();
    setOpen(false);
  };

  return (
    <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold">Add component</Label>
        {picked && <button className="text-[11px] text-muted-foreground hover:text-foreground" onClick={reset}>Clear</button>}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_160px_90px_auto] gap-2 items-center">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="h-9 justify-start font-normal">
              {picked ? (
                <span className="flex items-center gap-2 min-w-0">
                  {picked.image ? <img src={picked.image} alt="" className="h-5 w-5 rounded object-cover" /> : <Package2 className="h-4 w-4" />}
                  <span className="truncate">{picked.title}</span>
                </span>
              ) : (
                <span className="flex items-center gap-2 text-muted-foreground"><Search className="h-3.5 w-3.5" /> Search product…</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[360px] p-0" align="start">
            <div className="p-2 border-b">
              <Input autoFocus placeholder="Search products…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-8" />
            </div>
            <div className="max-h-64 overflow-auto">
              {productsQ.isFetching ? (
                <div className="grid place-items-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
              ) : (productsQ.data ?? []).length === 0 ? (
                <div className="py-6 text-center text-xs text-muted-foreground">No products found</div>
              ) : (
                <ul className="divide-y">
                  {(productsQ.data ?? []).map((p: { id: string; title: string; image: string | null }) => (
                    <li key={p.id}>
                      <button
                        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted"
                        onClick={() => { setPicked({ id: p.id, title: p.title, image: p.image }); setVariantId("none"); setOpen(false); }}
                      >
                        {p.image ? <img src={p.image} alt="" className="h-8 w-8 rounded object-cover" /> : <div className="h-8 w-8 rounded bg-muted grid place-items-center"><Package2 className="h-4 w-4 text-muted-foreground" /></div>}
                        <span className="text-xs truncate">{p.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </PopoverContent>
        </Popover>

        <Select value={variantId} onValueChange={setVariantId} disabled={!picked || (variantsQ.data?.length ?? 0) === 0}>
          <SelectTrigger className="h-9">
            <SelectValue placeholder={(variantsQ.data?.length ?? 0) === 0 ? "No variants" : "Variant (optional)"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">— No variant —</SelectItem>
            {(variantsQ.data ?? []).map((v: { id: string; color_name: string | null; stock: number }) => (
              <SelectItem key={v.id} value={v.id}>{v.color_name ?? "Variant"} · stock {v.stock}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} className="h-9 text-center tabular-nums" />

        <Button onClick={commit} disabled={!picked || pending} className="h-9 gap-1">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Add
        </Button>
      </div>
      {isDup && <div className="text-[11px] text-amber-700">This exact product/variant is already added. Increase qty instead.</div>}
    </div>
  );
}

export function ComboBadge({ productId }: { productId: string }) {
  const { data } = useQuery({
    queryKey: ["combo-summary", productId],
    queryFn: async (): Promise<Summary | null> => {
      const { data } = await supabase
        .from("v_combo_summary" as never)
        .select("total_cost,buildable_units,component_count")
        .eq("combo_product_id", productId)
        .maybeSingle();
      return (data as Summary | null) ?? null;
    },
    staleTime: 60_000,
  });
  const buildable = Number(data?.buildable_units ?? 0);
  return (
    <Badge variant="outline" className="gap-1 border-violet-300 bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
      <Boxes className="h-3 w-3" /> COMBO · {buildable} buildable
    </Badge>
  );
}
