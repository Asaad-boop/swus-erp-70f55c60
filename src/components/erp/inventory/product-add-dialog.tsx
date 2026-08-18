import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/brand-context";
import {
  Package, Tag, Barcode, DollarSign, AlertTriangle, RotateCcw, ImagePlus,
  Truck, Sparkles, X, Plus, Loader2, Star, Zap, Info, Film, Play, Palette, Trash2, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Props = { open: boolean; onClose: () => void };

type ColorDraft = {
  color_name: string;
  color_hex: string;
  sku: string;
  image: string;
  opening_stock: number;
  reorder_point: number;
};

const SWATCHES = [
  "#ef4444","#f97316","#f59e0b","#eab308","#84cc16","#22c55e","#10b981","#14b8a6",
  "#06b6d4","#0ea5e9","#3b82f6","#6366f1","#8b5cf6","#a855f7","#d946ef","#ec4899",
  "#f43f5e","#000000","#ffffff","#6b7280","#a3a3a3","#78350f","#1e3a8a","#365314",
];

type Form = {
  title: string;
  slug: string;
  description: string;
  brand_id: string;
  category_id: string;
  price: string;
  old_price: string;
  cost_price: string;
  sku: string;
  barcode: string;
  initial_stock: string;
  low_stock_threshold: string;
  reorder_point: string;
  reorder_qty: string;
  shipping_fee_inside: string;
  shipping_fee_outside: string;
  is_active: boolean;
  is_featured: boolean;
  is_new_arrival: boolean;
  benefits: string[];
  specs: { key: string; value: string }[];
  image: string;
  gallery: string[];
  video_url: string;
  age_group: string;
  colors: ColorDraft[];
  listing_brand_ids: string[];
};

const empty = (brandId: string): Form => ({
  title: "", slug: "", description: "",
  brand_id: brandId, category_id: "",
  price: "", old_price: "", cost_price: "",
  sku: "", barcode: "",
  initial_stock: "0",
  low_stock_threshold: "5", reorder_point: "", reorder_qty: "",
  shipping_fee_inside: "", shipping_fee_outside: "",
  is_active: true, is_featured: false, is_new_arrival: false,
  benefits: [], specs: [],
  image: "", gallery: [], video_url: "",
  age_group: "",
  colors: [],
  listing_brand_ids: brandId ? [brandId] : [],
});

const slugify = (s: string) =>
  s.toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);

export function ProductAddDialog({ open, onClose }: Props) {
  const qc = useQueryClient();
  const { activeBrand, brands, isAllBrands } = useBrand();
  const defaultBrandId = activeBrand?.id ?? brands[0]?.id ?? "";
  const [f, setF] = useState<Form>(() => empty(defaultBrandId));
  const [tab, setTab] = useState("basics");
  const [slugTouched, setSlugTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setF(empty(defaultBrandId));
      setTab("basics");
      setSlugTouched(false);
    }
  }, [open, defaultBrandId]);

  // Auto-slug from title
  useEffect(() => {
    if (!slugTouched) setF((p) => ({ ...p, slug: slugify(p.title) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.title, slugTouched]);

  const categoriesQ = useQuery({
    queryKey: ["categories", f.brand_id],
    queryFn: async () => {
      let q = supabase.from("categories").select("id,name,brand_id").eq("is_active", true).order("display_order");
      if (f.brand_id) q = q.eq("brand_id", f.brand_id);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));

  const margin = useMemo(() => {
    const p = Number(f.price), c = Number(f.cost_price);
    if (!p || !c || p <= 0) return null;
    return Math.round(((p - c) / p) * 100);
  }, [f.price, f.cost_price]);

  const valid = f.title.trim() && f.slug.trim() && f.brand_id && Number(f.price) > 0;

  const hasColors = f.colors.some((c) => c.color_name.trim());
  const colorStockSum = f.colors.reduce((a, c) => a + (Math.max(0, Math.floor(c.opening_stock || 0))), 0);

  // Tab completeness dots — helps user see what's filled
  const tabDone = useMemo(() => ({
    basics: !!(f.title.trim() && f.slug.trim() && f.brand_id),
    images: !!f.image,
    pricing: Number(f.price) > 0,
    colors: hasColors,
    shipping: !!(f.shipping_fee_inside || f.shipping_fee_outside),
    details: f.benefits.length > 0 || f.specs.some((s) => s.key.trim()),
  }), [f, hasColors]);

  const save = useMutation({
    mutationFn: async () => {
      if (!valid) throw new Error("Title, slug, brand and price required");
      // Duplicate slug pre-check (per brand)
      const { data: dup } = await supabase
        .from("products")
        .select("id")
        .eq("brand_id", f.brand_id)
        .eq("slug", f.slug.trim())
        .maybeSingle();
      if (dup) throw new Error(`Slug "${f.slug}" already used by another product on this brand.`);

      const num = (v: string) => (v === "" ? null : Number(v));
      const cleanSpecs = f.specs.filter((s) => s.key.trim()).reduce<Record<string, string>>(
        (a, s) => { a[s.key.trim()] = s.value; return a; }, {},
      );
      // If color variants own the stock, use their sum as parent stock (single source of truth)
      const parentStock = hasColors ? colorStockSum : (Number(f.initial_stock) || 0);
      const payload: Record<string, unknown> = {
        title: f.title.trim(),
        slug: f.slug.trim(),
        description: f.description || null,
        brand_id: f.brand_id,
        category_id: f.category_id || null,
        price: Number(f.price),
        old_price: num(f.old_price),
        cost_price: f.cost_price === "" ? 0 : Number(f.cost_price),
        sku: f.sku || null,
        barcode: f.barcode || null,
        stock: parentStock,
        low_stock_threshold: num(f.low_stock_threshold),
        reorder_point: num(f.reorder_point),
        reorder_qty: num(f.reorder_qty),
        shipping_fee_inside: num(f.shipping_fee_inside),
        shipping_fee_outside: num(f.shipping_fee_outside),
        is_active: f.is_active,
        is_featured: f.is_featured,
        is_new_arrival: f.is_new_arrival,
        benefits: f.benefits.filter(Boolean),
        specs: cleanSpecs,
        image: f.image || null,
        gallery: f.gallery,
        video_url: f.video_url || null,
        age_group: f.age_group || null,
      };
      const { data, error } = await supabase.from("products").insert(payload as never).select("id").single();
      if (error) throw error;
      const newProductId = (data as { id: string }).id;

      // Brand listings (multi-brand storefront visibility)
      const listingBrands = Array.from(new Set([f.brand_id, ...f.listing_brand_ids])).filter(Boolean);
      if (listingBrands.length > 0) {
        const { error: lErr } = await supabase.from("product_brand_listings").insert(
          listingBrands.map((bid, idx) => ({
            product_id: newProductId,
            brand_id: bid,
            slug: f.slug.trim(),
            price: null,
            compare_at_price: null,
            is_active: true,
            display_order: idx,
          })) as never,
        );
        if (lErr) throw new Error(`Product saved, but brand listing failed: ${lErr.message}`);
      }

      // Seed parent-level opening stock movement ONLY if no color variants (variants seed their own below)
      const startStock = Number(f.initial_stock) || 0;
      if (!hasColors && startStock > 0) {
        await supabase.rpc("adjust_stock_v2", {
          _product_id: newProductId,
          _variant_id: null as unknown as string,
          _delta: startStock,
          _reason: "stock_in",
          _note: "Opening stock",
          _unit_cost: f.cost_price ? Number(f.cost_price) : undefined,
          _source: "manual",
        });
      }

      // Insert color variants
      const validColors = f.colors.filter((c) => c.color_name.trim());
      if (validColors.length > 0) {
        const rows = validColors.map((c, idx) => ({
          product_id: newProductId,
          color_name: c.color_name.trim(),
          color_hex: c.color_hex || null,
          sku: c.sku || null,
          image: c.image || null,
          stock: Math.max(0, Math.floor(c.opening_stock || 0)),
          reorder_point: Math.max(0, Math.floor(c.reorder_point || 0)),
          is_active: true,
          display_order: idx,
        }));
        const { data: inserted, error: vErr } = await supabase
          .from("product_variants")
          .insert(rows as never)
          .select("id,color_name,stock");
        if (vErr) throw vErr;
        // Opening stock movements per variant
        for (const v of (inserted ?? []) as { id: string; color_name: string; stock: number }[]) {
          if (v.stock > 0) {
            await supabase.from("stock_movements").insert({
              product_id: newProductId,
              variant_id: v.id,
              delta: v.stock,
              reason: "opening_stock",
              note: `Opening stock for ${v.color_name}`,
              movement_source: "manual",
            } as never);
          }
        }
      }
      return data;
    },
    onSuccess: () => {
      toast.success("Product created");
      qc.invalidateQueries({ queryKey: ["inventory"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="h-4 w-4" />
            </div>
            Add Product
          </DialogTitle>
          <DialogDescription>Full product details — images, pricing, stock, shipping & metadata.</DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="flex flex-col">
          <div className="px-6 pt-3">
            <TabsList className="grid grid-cols-6 w-full">
              <TabTrig value="basics" icon={<Info className="h-3.5 w-3.5" />} label="Basics" done={tabDone.basics} />
              <TabTrig value="images" icon={<ImagePlus className="h-3.5 w-3.5" />} label="Images" done={tabDone.images} />
              <TabTrig value="pricing" icon={<DollarSign className="h-3.5 w-3.5" />} label="Pricing" done={tabDone.pricing} />
              <TabTrig value="colors" icon={<Palette className="h-3.5 w-3.5" />} label="Colors" done={tabDone.colors} />
              <TabTrig value="shipping" icon={<Truck className="h-3.5 w-3.5" />} label="Shipping" done={tabDone.shipping} />
              <TabTrig value="details" icon={<Star className="h-3.5 w-3.5" />} label="Details" done={tabDone.details} />
            </TabsList>
          </div>

          <ScrollArea className="max-h-[60vh]">
            <div className="px-6 py-5">
              {/* BASICS */}
              <TabsContent value="basics" className="mt-0 space-y-4">
                <Field label="Title" required>
                  <Input value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Toyora Mini Excavator" />
                </Field>
                <Field label="Slug" required hint="Auto-generated — used in product URL">
                  <Input
                    value={f.slug}
                    onChange={(e) => { setSlugTouched(true); set("slug", slugify(e.target.value)); }}
                    placeholder="toyora-mini-excavator"
                  />
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Brand" required>
                    <Select value={f.brand_id} onValueChange={(v) => { set("brand_id", v); set("category_id", ""); }}>
                      <SelectTrigger><SelectValue placeholder="Select brand" /></SelectTrigger>
                      <SelectContent>
                        {brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {isAllBrands && <p className="text-[11px] text-amber-600 mt-1">Pick the brand explicitly</p>}
                  </Field>
                  <Field label="Category">
                    <Select value={f.category_id || "none"} onValueChange={(v) => set("category_id", v === "none" ? "" : v)} disabled={!f.brand_id}>
                      <SelectTrigger><SelectValue placeholder="Uncategorized" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Uncategorized</SelectItem>
                        {(categoriesQ.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <Field label="Shop by Age" hint="Toyora storefront e age filter er jonno">
                  <Select value={f.age_group || "none"} onValueChange={(v) => set("age_group", v === "none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="All ages" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">All ages</SelectItem>
                      <SelectItem value="0-2">0 – 2 years</SelectItem>
                      <SelectItem value="3-5">3 – 5 years</SelectItem>
                      <SelectItem value="6-8">6 – 8 years</SelectItem>
                      <SelectItem value="9-12">9 – 12 years</SelectItem>
                      <SelectItem value="13+">13+ years</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Description">
                  <Textarea rows={4} value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="Short product description shown on storefront…" />
                </Field>
                <div className="flex items-center gap-6 pt-1">
                  <ToggleRow icon={<Zap className="h-4 w-4 text-emerald-500" />} label="Active" checked={f.is_active} onChange={(v) => set("is_active", v)} />
                  <ToggleRow icon={<Star className="h-4 w-4 text-amber-500" />} label="Featured" checked={f.is_featured} onChange={(v) => set("is_featured", v)} />
                  <ToggleRow icon={<Sparkles className="h-4 w-4 text-blue-500" />} label="New arrival" checked={f.is_new_arrival} onChange={(v) => set("is_new_arrival", v)} />
                </div>
              </TabsContent>

              {/* IMAGES */}
              <TabsContent value="images" className="mt-0 space-y-4">
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Main image</Label>
                  <ImageUploader
                    value={f.image}
                    onChange={(url) => set("image", url)}
                    onClear={() => set("image", "")}
                  />
                </div>
                <Separator />
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Gallery ({f.gallery.length})</Label>
                  <GalleryUploader
                    items={f.gallery}
                    onAdd={(url) => set("gallery", [...f.gallery, url])}
                    onRemove={(i) => set("gallery", f.gallery.filter((_, idx) => idx !== i))}
                  />
                </div>
                <Separator />
                <div>
                  <Label className="text-xs font-medium text-muted-foreground inline-flex items-center gap-1.5">
                    <Film className="h-3.5 w-3.5" /> Product video
                    <span className="text-[10px] font-normal text-muted-foreground">(autoplays on thumbnail)</span>
                  </Label>
                  <VideoUploader
                    value={f.video_url}
                    poster={f.image}
                    onChange={(url) => set("video_url", url)}
                    onClear={() => set("video_url", "")}
                  />
                </div>
              </TabsContent>

              {/* PRICING */}
              <TabsContent value="pricing" className="mt-0 space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <Field label="Price (BDT)" required icon={<DollarSign className="h-3.5 w-3.5" />}>
                    <Input type="number" value={f.price} onChange={(e) => set("price", e.target.value)} placeholder="0" />
                  </Field>
                  <Field label="Compare-at price" hint="Shown struck-through">
                    <Input type="number" value={f.old_price} onChange={(e) => set("old_price", e.target.value)} placeholder="Optional" />
                  </Field>
                  <Field label="Cost price" icon={<DollarSign className="h-3.5 w-3.5" />}>
                    <Input type="number" value={f.cost_price} onChange={(e) => set("cost_price", e.target.value)} placeholder="Unit cost" />
                  </Field>
                </div>
                {margin !== null && (
                  <div className={cn(
                    "flex items-center gap-2 rounded-md border px-3 py-2 text-xs",
                    margin >= 30 ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : margin >= 10 ? "border-amber-200 bg-amber-50 text-amber-700"
                      : "border-red-200 bg-red-50 text-red-700",
                  )}>
                    <Sparkles className="h-3.5 w-3.5" />
                    Margin: <strong>{margin}%</strong>
                    <span className="text-muted-foreground">· profit ৳{(Number(f.price) - Number(f.cost_price)).toFixed(0)}</span>
                  </div>
                )}
                <Separator />
                <div className="grid grid-cols-2 gap-4">
                  <Field label="SKU" icon={<Tag className="h-3.5 w-3.5" />}>
                    <Input value={f.sku} onChange={(e) => set("sku", e.target.value)} placeholder="e.g. TOY-MX-001" />
                  </Field>
                  <Field label="Barcode" icon={<Barcode className="h-3.5 w-3.5" />}>
                    <Input value={f.barcode} onChange={(e) => set("barcode", e.target.value)} placeholder="Scan or type" />
                  </Field>
                </div>
                <Separator />
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Stock & reorder</div>
                <div className="grid grid-cols-4 gap-4">
                  <Field
                    label="Opening stock"
                    icon={<Package className="h-3.5 w-3.5" />}
                    hint={hasColors ? `Auto = ${colorStockSum} (sum of colors)` : undefined}
                  >
                    <Input
                      type="number"
                      value={hasColors ? String(colorStockSum) : f.initial_stock}
                      onChange={(e) => set("initial_stock", e.target.value)}
                      disabled={hasColors}
                    />
                  </Field>
                  <Field label="Low stock alert" icon={<AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}>
                    <Input type="number" value={f.low_stock_threshold} onChange={(e) => set("low_stock_threshold", e.target.value)} placeholder="5" />
                  </Field>
                  <Field label="Reorder point" icon={<RotateCcw className="h-3.5 w-3.5 text-blue-500" />}>
                    <Input type="number" value={f.reorder_point} onChange={(e) => set("reorder_point", e.target.value)} placeholder="Trigger" />
                  </Field>
                  <Field label="Reorder qty">
                    <Input type="number" value={f.reorder_qty} onChange={(e) => set("reorder_qty", e.target.value)} placeholder="Suggest" />
                  </Field>
                </div>
              </TabsContent>

              {/* SHIPPING */}
              <TabsContent value="colors" className="mt-0 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    Add color variants — protita color e separate stock track hobe. Khali rakhle single product (no colors).
                  </p>
                  <Button type="button" size="sm" variant="outline" onClick={() => {
                    const n = f.colors.length + 1;
                    const suffix = (f.sku ? f.sku + "-" : "") + `C${String(n).padStart(2, "0")}`;
                    set("colors", [...f.colors, {
                      color_name: "", color_hex: SWATCHES[(n - 1) % SWATCHES.length],
                      sku: suffix, image: "", opening_stock: 0, reorder_point: 0,
                    }]);
                  }} className="gap-1.5">
                    <Plus className="h-3.5 w-3.5" />Add color
                  </Button>
                </div>
                {f.colors.length === 0 && (
                  <div className="rounded-xl border-2 border-dashed py-8 grid place-items-center text-muted-foreground">
                    <Palette className="h-7 w-7 mb-2" />
                    <div className="text-sm font-medium">No colors</div>
                    <div className="text-[11px] mt-0.5">Add color hole opening stock e color-wise distribute hobe</div>
                  </div>
                )}
                <div className="space-y-2">
                  {f.colors.map((c, i) => (
                    <div key={i} className="rounded-xl border bg-card/40 p-3 space-y-2.5">
                      <div className="flex items-center gap-2.5">
                        <input
                          type="color"
                          value={c.color_hex || "#000000"}
                          onChange={(e) => set("colors", f.colors.map((x, idx) => idx === i ? { ...x, color_hex: e.target.value } : x))}
                          className="h-9 w-9 rounded-lg border-2 cursor-pointer bg-transparent shrink-0"
                        />
                        <Input
                          value={c.color_name}
                          onChange={(e) => set("colors", f.colors.map((x, idx) => idx === i ? { ...x, color_name: e.target.value } : x))}
                          placeholder="Color name (e.g. Red)"
                          className="font-medium"
                        />
                        <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0"
                          onClick={() => set("colors", f.colors.filter((_, idx) => idx !== i))}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-3 gap-2 pl-11">
                        <div>
                          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">SKU</Label>
                          <Input value={c.sku} className="h-8 text-xs"
                            onChange={(e) => set("colors", f.colors.map((x, idx) => idx === i ? { ...x, sku: e.target.value } : x))} />
                        </div>
                        <div>
                          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Opening stock</Label>
                          <Input type="number" min={0} value={c.opening_stock} className="h-8 text-xs"
                            onChange={(e) => set("colors", f.colors.map((x, idx) => idx === i ? { ...x, opening_stock: Math.max(0, Number(e.target.value) || 0) } : x))} />
                        </div>
                        <div>
                          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Low stock at</Label>
                          <Input type="number" min={0} value={c.reorder_point} className="h-8 text-xs"
                            onChange={(e) => set("colors", f.colors.map((x, idx) => idx === i ? { ...x, reorder_point: Math.max(0, Number(e.target.value) || 0) } : x))} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>
              <TabsContent value="shipping" className="mt-0 space-y-4">
                <p className="text-xs text-muted-foreground">Override default shipping rates for this product. Leave blank to use brand defaults.</p>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Inside Dhaka (BDT)" icon={<Truck className="h-3.5 w-3.5" />}>
                    <Input type="number" value={f.shipping_fee_inside} onChange={(e) => set("shipping_fee_inside", e.target.value)} placeholder="e.g. 60" />
                  </Field>
                  <Field label="Outside Dhaka (BDT)" icon={<Truck className="h-3.5 w-3.5" />}>
                    <Input type="number" value={f.shipping_fee_outside} onChange={(e) => set("shipping_fee_outside", e.target.value)} placeholder="e.g. 120" />
                  </Field>
                </div>
              </TabsContent>

              {/* DETAILS */}
              <TabsContent value="details" className="mt-0 space-y-5">
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Key benefits / bullet points</Label>
                  <ListEditor
                    items={f.benefits}
                    placeholder="e.g. Rechargeable battery"
                    onChange={(arr) => set("benefits", arr)}
                  />
                </div>
                <Separator />
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Specifications (key → value)</Label>
                  <SpecsEditor specs={f.specs} onChange={(arr) => set("specs", arr)} />
                </div>
              </TabsContent>
            </div>
          </ScrollArea>
        </Tabs>

        <DialogFooter className="border-t bg-muted/30 px-6 py-3 flex !justify-between items-center">
          <div className="text-[11px] text-muted-foreground flex items-center gap-2">
            {!valid ? (
              <button
                type="button"
                onClick={() => setTab("basics")}
                className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-amber-700 hover:bg-amber-100 transition"
              >
                <AlertTriangle className="h-3 w-3" />
                Missing: {[!f.title.trim() && "title", !f.slug.trim() && "slug", !f.brand_id && "brand", !(Number(f.price) > 0) && "price"].filter(Boolean).join(", ")}
              </button>
            ) : (
              <Badge variant="outline" className="text-emerald-700 border-emerald-300 gap-1">
                <Check className="h-3 w-3" /> Ready to save
                {hasColors && <span className="text-muted-foreground">· {f.colors.filter((c) => c.color_name.trim()).length} colors, {colorStockSum} pcs</span>}
              </Badge>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={save.isPending}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={!valid || save.isPending} className="gap-1.5">
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {save.isPending ? "Creating…" : "Create Product"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------ helpers ------------------ */

function Field({
  label, hint, icon, required, children,
}: {
  label: string; hint?: string; icon?: React.ReactNode; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground inline-flex items-center gap-1.5">
        {icon}{label}{required && <span className="text-red-500">*</span>}
      </Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function TabTrig({ value, icon, label, done }: { value: string; icon: React.ReactNode; label: string; done: boolean }) {
  return (
    <TabsTrigger value={value} className="gap-1.5 relative">
      {icon}
      <span>{label}</span>
      {done && <span className="ml-0.5 grid h-3.5 w-3.5 place-items-center rounded-full bg-emerald-500 text-white"><Check className="h-2.5 w-2.5" /></span>}
    </TabsTrigger>
  );
}

function ToggleRow({ icon, label, checked, onChange }: {
  icon: React.ReactNode; label: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <Label className="text-sm">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

async function uploadToBucket(file: File): Promise<string> {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `products/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("product-images").upload(path, file, {
    cacheControl: "3600", upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from("product-images").getPublicUrl(path);
  return data.publicUrl;
}

function VideoUploader({ value, poster, onChange, onClear }: {
  value: string; poster?: string; onChange: (url: string) => void; onClear: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (file: File) => {
    if (file.size > 50 * 1024 * 1024) {
      toast.error("Video too large (max 50MB)");
      return;
    }
    setBusy(true);
    try { onChange(await uploadToBucket(file)); toast.success("Video uploaded"); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="mt-2 flex items-start gap-3">
      <div
        onClick={() => !value && ref.current?.click()}
        className={cn(
          "relative h-32 w-32 shrink-0 rounded-xl border-2 border-dashed grid place-items-center overflow-hidden transition",
          value ? "border-transparent bg-black cursor-default" : "border-border hover:border-primary/40 hover:bg-muted/40 cursor-pointer",
        )}
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          : value ? (
              <video
                src={value}
                poster={poster || undefined}
                className="h-full w-full object-cover"
                muted autoPlay loop playsInline
              />
            )
          : <div className="text-center text-muted-foreground">
              <Play className="h-6 w-6 mx-auto mb-1" />
              <div className="text-[11px]">Click to upload</div>
            </div>}
        {value && !busy && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onClear(); }}
            className="absolute -top-2 -right-2 grid h-6 w-6 place-items-center rounded-full bg-background border shadow-sm hover:bg-destructive hover:text-white"
          ><X className="h-3.5 w-3.5" /></button>
        )}
      </div>
      <div className="flex-1 space-y-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Or paste video URL (mp4 / webm)"
        />
        <p className="text-[11px] text-muted-foreground">
          MP4 / WebM — autoplays muted on product thumbnail. Max 50MB. Falls back to main image as poster.
        </p>
      </div>
      <input ref={ref} type="file" accept="video/mp4,video/webm,video/quicktime" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
    </div>
  );
}

function ImageUploader({ value, onChange, onClear }: {
  value: string; onChange: (url: string) => void; onClear: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (file: File) => {
    setBusy(true);
    try { onChange(await uploadToBucket(file)); toast.success("Image uploaded"); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="mt-2 flex items-start gap-3">
      <div
        onClick={() => ref.current?.click()}
        className={cn(
          "relative h-32 w-32 shrink-0 rounded-xl border-2 border-dashed grid place-items-center cursor-pointer transition",
          value ? "border-transparent" : "border-border hover:border-primary/40 hover:bg-muted/40",
        )}
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          : value ? <img src={value} alt="" className="h-full w-full rounded-xl object-cover" />
          : <div className="text-center text-muted-foreground">
              <ImagePlus className="h-6 w-6 mx-auto mb-1" />
              <div className="text-[11px]">Click to upload</div>
            </div>}
        {value && !busy && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onClear(); }}
            className="absolute -top-2 -right-2 grid h-6 w-6 place-items-center rounded-full bg-background border shadow-sm hover:bg-destructive hover:text-white"
          ><X className="h-3.5 w-3.5" /></button>
        )}
      </div>
      <div className="flex-1 space-y-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Or paste image URL"
        />
        <p className="text-[11px] text-muted-foreground">PNG / JPG / WebP — auto-uploaded to product-images bucket.</p>
      </div>
      <input ref={ref} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
    </div>
  );
}

function GalleryUploader({ items, onAdd, onRemove }: {
  items: string[]; onAdd: (url: string) => void; onRemove: (i: number) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onFiles = async (files: FileList) => {
    setBusy(true);
    try {
      for (const file of Array.from(files)) onAdd(await uploadToBucket(file));
      toast.success(`${files.length} image(s) uploaded`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="mt-2 grid grid-cols-5 gap-2">
      {items.map((url, i) => (
        <div key={i} className="relative aspect-square rounded-lg overflow-hidden border">
          <img src={url} alt="" className="h-full w-full object-cover" />
          <button
            type="button"
            onClick={() => onRemove(i)}
            className="absolute top-1 right-1 grid h-5 w-5 place-items-center rounded-full bg-background/90 border shadow-sm hover:bg-destructive hover:text-white"
          ><X className="h-3 w-3" /></button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="aspect-square rounded-lg border-2 border-dashed grid place-items-center hover:border-primary/40 hover:bg-muted/40 transition text-muted-foreground"
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
      </button>
      <input ref={ref} type="file" accept="image/*" multiple hidden onChange={(e) => e.target.files && onFiles(e.target.files)} />
    </div>
  );
}

function ListEditor({ items, placeholder, onChange }: {
  items: string[]; placeholder?: string; onChange: (arr: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const add = () => { if (!draft.trim()) return; onChange([...items, draft.trim()]); setDraft(""); };
  return (
    <div className="mt-2 space-y-2">
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder={placeholder}
        />
        <Button type="button" variant="outline" onClick={add}><Plus className="h-4 w-4" /></Button>
      </div>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {items.map((it, i) => (
            <Badge key={i} variant="secondary" className="gap-1 pl-2 pr-1 py-1">
              {it}
              <button type="button" onClick={() => onChange(items.filter((_, idx) => idx !== i))} className="hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function SpecsEditor({ specs, onChange }: {
  specs: { key: string; value: string }[]; onChange: (s: { key: string; value: string }[]) => void;
}) {
  const update = (i: number, patch: Partial<{ key: string; value: string }>) =>
    onChange(specs.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  return (
    <div className="mt-2 space-y-2">
      {specs.map((s, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <Input value={s.key} onChange={(e) => update(i, { key: e.target.value })} placeholder="e.g. Material" />
          <Input value={s.value} onChange={(e) => update(i, { value: e.target.value })} placeholder="e.g. ABS Plastic" />
          <Button type="button" variant="ghost" size="icon" onClick={() => onChange(specs.filter((_, idx) => idx !== i))}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...specs, { key: "", value: "" }])} className="gap-1.5">
        <Plus className="h-3.5 w-3.5" />Add spec
      </Button>
    </div>
  );
}