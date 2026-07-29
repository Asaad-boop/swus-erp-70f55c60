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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/brand-context";
import type { ProductRow } from "@/lib/erp/inventory";
import {
  Package, Tag, Barcode, DollarSign, AlertTriangle, RotateCcw, ImagePlus,
  Truck, Sparkles, X, Plus, Loader2, Star, Zap, Info, Film, Play, Palette,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ColorsManager } from "./colors-manager";
import { BrandListingsEditor } from "./brand-listings-editor";
import { ComboItemsEditor } from "./combo-items-editor";

type Props = { product: ProductRow | null; onClose: () => void };

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
  low_stock_threshold: string;
  reorder_point: string;
  reorder_qty: string;
  shipping_fee_inside: string;
  shipping_fee_outside: string;
  is_active: boolean;
  is_featured: boolean;
  is_new_arrival: boolean;
  is_combo: boolean;
  benefits: string[];
  specs: { key: string; value: string }[];
  image: string;
  gallery: string[];
  video_url: string;
  age_group: string;
  is_preorder: boolean;
  preorder_expected_date: string;
};

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));

function toForm(p: Record<string, any>): Form {
  const specsObj = (p.specs && typeof p.specs === "object" && !Array.isArray(p.specs)) ? p.specs as Record<string, string> : {};
  return {
    title: str(p.title),
    slug: str(p.slug),
    description: str(p.description),
    brand_id: str(p.brand_id),
    category_id: str(p.category_id),
    price: str(p.price),
    old_price: str(p.old_price),
    cost_price: str(p.cost_price),
    sku: str(p.sku),
    barcode: str(p.barcode),
    low_stock_threshold: str(p.low_stock_threshold),
    reorder_point: str(p.reorder_point),
    reorder_qty: str(p.reorder_qty),
    shipping_fee_inside: str(p.shipping_fee_inside),
    shipping_fee_outside: str(p.shipping_fee_outside),
    is_active: !!p.is_active,
    is_featured: !!p.is_featured,
    is_new_arrival: !!p.is_new_arrival,
    is_combo: !!p.is_combo,
    benefits: Array.isArray(p.benefits) ? p.benefits.filter(Boolean) : [],
    specs: Object.entries(specsObj).map(([k, v]) => ({ key: k, value: String(v) })),
    image: str(p.image),
    gallery: Array.isArray(p.gallery) ? p.gallery : [],
    video_url: str(p.video_url),
    age_group: str(p.age_group),
    is_preorder: !!p.is_preorder,
    preorder_expected_date: str(p.preorder_expected_date).slice(0, 10),
  };
}

export function ProductEditDialog({ product, onClose }: Props) {
  const qc = useQueryClient();
  const { brands } = useBrand();
  const [f, setF] = useState<Form | null>(null);

  // Fetch full product row (edit dialog needs many fields not in list)
  const fullQ = useQuery({
    queryKey: ["product-full", product?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("id", product!.id)
        .single();
      if (error) throw error;
      return data as Record<string, any>;
    },
    enabled: !!product?.id,
  });

  useEffect(() => {
    if (fullQ.data) setF(toForm(fullQ.data));
  }, [fullQ.data, product?.id]);

  const categoriesQ = useQuery({
    queryKey: ["categories", f?.brand_id],
    queryFn: async () => {
      let q = supabase.from("categories").select("id,name,brand_id").eq("is_active", true).order("display_order");
      if (f?.brand_id) q = q.eq("brand_id", f.brand_id);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!f && !!product,
  });

  const set = <K extends keyof Form>(k: K, v: Form[K]) =>
    setF((p) => (p ? { ...p, [k]: v } : p));

  const margin = useMemo(() => {
    if (!f) return null;
    const p = Number(f.price), c = Number(f.cost_price);
    if (!p || !c || p <= 0) return null;
    return Math.round(((p - c) / p) * 100);
  }, [f?.price, f?.cost_price]);

  const valid = !!f && f.title.trim() && f.slug.trim() && f.brand_id && Number(f.price) > 0;

  const save = useMutation({
    mutationFn: async () => {
      if (!product || !f) return;
      if (!valid) throw new Error("Title, slug, brand and price required");
      const num = (v: string) => (v === "" ? null : Number(v));
      const cleanSpecs = f.specs.filter((s) => s.key.trim()).reduce<Record<string, string>>(
        (a, s) => { a[s.key.trim()] = s.value; return a; }, {},
      );
      const payload: Record<string, unknown> = {
        title: f.title.trim(),
        slug: f.slug.trim(),
        description: f.description || null,
        brand_id: f.brand_id,
        category_id: f.category_id || null,
        price: Number(f.price),
        old_price: num(f.old_price),
        cost_price: num(f.cost_price),
        sku: f.sku || null,
        barcode: f.barcode || null,
        low_stock_threshold: num(f.low_stock_threshold),
        reorder_point: num(f.reorder_point),
        reorder_qty: num(f.reorder_qty),
        shipping_fee_inside: num(f.shipping_fee_inside),
        shipping_fee_outside: num(f.shipping_fee_outside),
        is_active: f.is_active,
        is_featured: f.is_featured,
        is_new_arrival: f.is_new_arrival,
        is_combo: f.is_combo,
        benefits: f.benefits.filter(Boolean),
        specs: cleanSpecs,
        image: f.image || null,
        gallery: f.gallery,
        video_url: f.video_url || null,
        age_group: f.age_group || null,
        is_preorder: f.is_preorder,
        preorder_expected_date: f.is_preorder ? (f.preorder_expected_date || null) : null,
      };
      const { error } = await supabase
        .from("products")
        .update(payload as never)
        .eq("id", product.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Product updated");
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["product-full"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!product) return null;

  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-6xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-4 border-b bg-gradient-to-b from-muted/40 to-transparent">
          <DialogTitle className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
              <Package className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="text-base font-semibold truncate">{f?.title || "Edit Product"}</div>
              <DialogDescription className="text-xs">
                Basics • Images • Pricing • Shipping • Features — sob ek page e.
              </DialogDescription>
            </div>
          </DialogTitle>
        </DialogHeader>

        {!f ? (
          <div className="grid place-items-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <ScrollArea className="max-h-[72vh]">
              <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-0">
                {/* LEFT RAIL — Media */}
                <aside className="lg:border-r bg-muted/20 px-5 py-5 space-y-5 lg:sticky lg:top-0 lg:self-start">
                  <SectionHeader icon={<ImagePlus className="h-3.5 w-3.5" />} title="Main image" />
                  <CompactImage value={f.image} onChange={(url) => set("image", url)} onClear={() => set("image", "")} />

                  <SectionHeader icon={<Film className="h-3.5 w-3.5" />} title="Product video" hint="autoplays on thumbnail" />
                  <CompactVideo value={f.video_url} poster={f.image} onChange={(url) => set("video_url", url)} onClear={() => set("video_url", "")} />

                  <SectionHeader icon={<Plus className="h-3.5 w-3.5" />} title={`Gallery (${f.gallery.length})`} />
                  <GalleryUploader
                    items={f.gallery}
                    onAdd={(url) => set("gallery", [...f.gallery, url])}
                    onRemove={(i) => set("gallery", f.gallery.filter((_, idx) => idx !== i))}
                  />
                </aside>

                {/* RIGHT — All form sections stacked */}
                <div className="px-6 py-5 space-y-7">
                  {/* BASICS */}
                  <section className="space-y-4">
                    <SectionHeader icon={<Info className="h-4 w-4" />} title="Basics" big />
                    <Field label="Title" required>
                      <Input value={f.title} onChange={(e) => set("title", e.target.value)} />
                    </Field>
                    <div className="grid grid-cols-2 gap-4">
                      <Field label="Slug" required hint="Used in product URL">
                        <Input value={f.slug} onChange={(e) => set("slug", e.target.value)} />
                      </Field>
                      <Field label="Brand" required>
                        <Select value={f.brand_id} onValueChange={(v) => { set("brand_id", v); set("category_id", ""); }}>
                          <SelectTrigger><SelectValue placeholder="Select brand" /></SelectTrigger>
                          <SelectContent>
                            {brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </Field>
                    </div>
                    <Field label="Category">
                      <Select value={f.category_id || "none"} onValueChange={(v) => set("category_id", v === "none" ? "" : v)} disabled={!f.brand_id}>
                        <SelectTrigger><SelectValue placeholder="Uncategorized" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Uncategorized</SelectItem>
                          {(categoriesQ.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </Field>
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
                      <Textarea rows={3} value={f.description} onChange={(e) => set("description", e.target.value)} />
                    </Field>
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-1">
                      <ToggleRow icon={<Zap className="h-4 w-4 text-emerald-500" />} label="Active" checked={f.is_active} onChange={(v) => set("is_active", v)} />
                      <ToggleRow icon={<Star className="h-4 w-4 text-amber-500" />} label="Featured" checked={f.is_featured} onChange={(v) => set("is_featured", v)} />
                      <ToggleRow icon={<Sparkles className="h-4 w-4 text-blue-500" />} label="New arrival" checked={f.is_new_arrival} onChange={(v) => set("is_new_arrival", v)} />
                    </div>
                  </section>

                  <Separator />

                  {/* STOREFRONT LISTINGS */}
                  <section className="space-y-4">
                    <SectionHeader icon={<Sparkles className="h-4 w-4" />} title="Storefront listings (multi-brand)" big />
                    <BrandListingsEditor
                      productId={product?.id ?? null}
                      ownerBrandId={f.brand_id}
                      productSlug={f.slug}
                      productPrice={f.price}
                    />
                  </section>

                  <Separator />

                  {/* PRICING */}
                  <section className="space-y-4">
                    <SectionHeader icon={<DollarSign className="h-4 w-4" />} title="Pricing & inventory" big />
                    <div className="grid grid-cols-3 gap-4">
                      <Field label="Price (BDT)" required>
                        <Input type="number" value={f.price} onChange={(e) => set("price", e.target.value)} />
                      </Field>
                      <Field label="Compare-at" hint="Shown struck-through">
                        <Input type="number" value={f.old_price} onChange={(e) => set("old_price", e.target.value)} />
                      </Field>
                      <Field label="Cost price">
                        <Input type="number" value={f.cost_price} onChange={(e) => set("cost_price", e.target.value)} />
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
                    <div className="grid grid-cols-2 gap-4">
                      <Field label="SKU" icon={<Tag className="h-3.5 w-3.5" />}>
                        <Input value={f.sku} onChange={(e) => set("sku", e.target.value)} />
                      </Field>
                      <Field label="Barcode" icon={<Barcode className="h-3.5 w-3.5" />}>
                        <Input value={f.barcode} onChange={(e) => set("barcode", e.target.value)} />
                      </Field>
                    </div>
                    <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Reorder & alerts</div>
                      <div className="grid grid-cols-3 gap-3">
                        <Field label="Low stock" icon={<AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}>
                          <Input type="number" value={f.low_stock_threshold} onChange={(e) => set("low_stock_threshold", e.target.value)} />
                        </Field>
                        <Field label="Reorder pt" icon={<RotateCcw className="h-3.5 w-3.5 text-blue-500" />}>
                          <Input type="number" value={f.reorder_point} onChange={(e) => set("reorder_point", e.target.value)} />
                        </Field>
                        <Field label="Reorder qty">
                          <Input type="number" value={f.reorder_qty} onChange={(e) => set("reorder_qty", e.target.value)} />
                        </Field>
                      </div>
                    </div>
                  </section>

                  <Separator />

                  {/* COLOR VARIANTS */}
                  {/* PRE-ORDER */}
                  <section className="space-y-4">
                    <SectionHeader icon={<Sparkles className="h-4 w-4" />} title="Pre-order" big hint="Website e Buy Now → Pre-order button hoye jabe" />
                    <div className="flex items-center justify-between rounded-lg border bg-violet-500/5 border-violet-500/20 px-4 py-3">
                      <div>
                        <div className="text-sm font-medium">Sell as pre-order</div>
                        <div className="text-[11px] text-muted-foreground">
                          On korle HobbyShop / Toyora site e ei product e "Pre-order Now" button dekhabe, ar order ashle ERP-r Pre-order pipeline e jabe.
                        </div>
                      </div>
                      <Switch checked={f.is_preorder} onCheckedChange={(v) => set("is_preorder", v)} />
                    </div>
                    {f.is_preorder && (
                      <Field label="Expected delivery date" hint="Storefront e customer ke dekhano hobe">
                        <Input
                          type="date"
                          value={f.preorder_expected_date}
                          onChange={(e) => set("preorder_expected_date", e.target.value)}
                        />
                      </Field>
                    )}
                  </section>

                  <Separator />

                  <section className="space-y-4">
                    <SectionHeader icon={<Palette className="h-4 w-4" />} title="Colors & variants" big hint="Each color tracks its own stock" />
                    <ColorsManager productId={product.id} productSku={f.sku || null} baseImage={f.image || null} />
                  </section>

                  <Separator />

                  {/* COMBO / BUNDLE */}
                  <section className="space-y-4">
                    <SectionHeader icon={<Package className="h-4 w-4" />} title="Combo / bundle" big hint="Sell multiple products as one SKU" />
                    <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
                      <div>
                        <div className="text-sm font-medium">This is a combo product</div>
                        <div className="text-[11px] text-muted-foreground">
                          Combo hole nijer stock track hobe na — child products er stock kombe order er somoy.
                        </div>
                      </div>
                      <Switch checked={f.is_combo} onCheckedChange={(v) => set("is_combo", v)} />
                    </div>
                    {f.is_combo && (
                      <ComboItemsEditor
                        comboProductId={product.id}
                        ownerBrandId={f.brand_id || null}
                        comboPrice={Number(f.price) || 0}
                      />
                    )}
                  </section>

                  <Separator />

                  {/* SHIPPING */}
                  <section className="space-y-4">
                    <SectionHeader icon={<Truck className="h-4 w-4" />} title="Shipping overrides" big hint="Blank = brand default" />
                    <div className="grid grid-cols-2 gap-4">
                      <Field label="Inside Dhaka (BDT)">
                        <Input type="number" value={f.shipping_fee_inside} onChange={(e) => set("shipping_fee_inside", e.target.value)} />
                      </Field>
                      <Field label="Outside Dhaka (BDT)">
                        <Input type="number" value={f.shipping_fee_outside} onChange={(e) => set("shipping_fee_outside", e.target.value)} />
                      </Field>
                    </div>
                  </section>

                  <Separator />

                  {/* FEATURES / DETAILS */}
                  <section className="space-y-4">
                    <SectionHeader icon={<Star className="h-4 w-4" />} title="Features & specs" big />
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">Key benefits</Label>
                      <ListEditor
                        items={f.benefits}
                        placeholder="e.g. Rechargeable battery"
                        onChange={(arr) => set("benefits", arr)}
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">Specifications</Label>
                      <SpecsEditor specs={f.specs} onChange={(arr) => set("specs", arr)} />
                    </div>
                  </section>
                </div>
              </div>
            </ScrollArea>

            <DialogFooter className="border-t bg-muted/30 px-6 py-3 flex !justify-between items-center">
              <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                {!valid && <Badge variant="outline" className="text-amber-700 border-amber-300">Missing: title, slug, brand, price</Badge>}
                {valid && <Badge variant="outline" className="text-emerald-700 border-emerald-300">Ready to save</Badge>}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose} disabled={save.isPending}>Cancel</Button>
                <Button onClick={() => save.mutate()} disabled={!valid || save.isPending} className="gap-1.5">
                  {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {save.isPending ? "Saving…" : "Save Changes"}
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ------------------ helpers (mirror add dialog) ------------------ */

function SectionHeader({ icon, title, hint, big }: {
  icon: React.ReactNode; title: string; hint?: string; big?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <div className={cn(
        "inline-flex items-center gap-1.5 font-semibold",
        big ? "text-sm text-foreground" : "text-[11px] uppercase tracking-wide text-muted-foreground",
      )}>
        <span className={cn("text-muted-foreground", big && "text-primary")}>{icon}</span>
        {title}
      </div>
      {hint && <span className="text-[11px] text-muted-foreground">· {hint}</span>}
    </div>
  );
}

function CompactImage({ value, onChange, onClear }: {
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
    <div className="space-y-2">
      <div
        onClick={() => ref.current?.click()}
        className={cn(
          "relative aspect-square w-full rounded-xl border-2 border-dashed grid place-items-center cursor-pointer transition overflow-hidden",
          value ? "border-transparent ring-1 ring-border" : "border-border hover:border-primary/40 hover:bg-muted/40",
        )}
      >
        {busy ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          : value ? <img src={value} alt="" className="h-full w-full object-cover" />
          : <div className="text-center text-muted-foreground">
              <ImagePlus className="h-7 w-7 mx-auto mb-1" />
              <div className="text-xs">Click to upload</div>
            </div>}
        {value && !busy && (
          <button type="button" onClick={(e) => { e.stopPropagation(); onClear(); }}
            className="absolute top-2 right-2 grid h-6 w-6 place-items-center rounded-full bg-background/95 border shadow-sm hover:bg-destructive hover:text-white"
          ><X className="h-3.5 w-3.5" /></button>
        )}
      </div>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Or paste image URL" className="h-8 text-xs" />
      <input ref={ref} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
    </div>
  );
}

function CompactVideo({ value, poster, onChange, onClear }: {
  value: string; poster?: string; onChange: (url: string) => void; onClear: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const onFile = async (file: File) => {
    if (file.size > 50 * 1024 * 1024) { toast.error("Video too large (max 50MB)"); return; }
    setBusy(true);
    try { onChange(await uploadToBucket(file)); toast.success("Video uploaded"); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <div className="space-y-2">
      <div
        onClick={() => !value && ref.current?.click()}
        className={cn(
          "relative aspect-video w-full rounded-xl border-2 border-dashed grid place-items-center overflow-hidden transition",
          value ? "border-transparent bg-black cursor-default" : "border-border hover:border-primary/40 hover:bg-muted/40 cursor-pointer",
        )}
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          : value ? <video src={value} poster={poster || undefined} className="h-full w-full object-cover" muted autoPlay loop playsInline />
          : <div className="text-center text-muted-foreground">
              <Play className="h-6 w-6 mx-auto mb-1" />
              <div className="text-[11px]">Click to upload</div>
            </div>}
        {value && !busy && (
          <button type="button" onClick={(e) => { e.stopPropagation(); onClear(); }}
            className="absolute top-2 right-2 grid h-6 w-6 place-items-center rounded-full bg-background/95 border shadow-sm hover:bg-destructive hover:text-white"
          ><X className="h-3.5 w-3.5" /></button>
        )}
      </div>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Or paste video URL" className="h-8 text-xs" />
      <input ref={ref} type="file" accept="video/mp4,video/webm,video/quicktime" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
    </div>
  );
}

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
    if (file.size > 50 * 1024 * 1024) { toast.error("Video too large (max 50MB)"); return; }
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
              <video src={value} poster={poster || undefined} className="h-full w-full object-cover" muted autoPlay loop playsInline />
            )
          : <div className="text-center text-muted-foreground">
              <Play className="h-6 w-6 mx-auto mb-1" />
              <div className="text-[11px]">Click to upload</div>
            </div>}
        {value && !busy && (
          <button type="button" onClick={(e) => { e.stopPropagation(); onClear(); }}
            className="absolute -top-2 -right-2 grid h-6 w-6 place-items-center rounded-full bg-background border shadow-sm hover:bg-destructive hover:text-white"
          ><X className="h-3.5 w-3.5" /></button>
        )}
      </div>
      <div className="flex-1 space-y-2">
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Or paste video URL (mp4 / webm)" />
        <p className="text-[11px] text-muted-foreground">MP4 / WebM — autoplays muted on product thumbnail. Max 50MB.</p>
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
          <button type="button" onClick={(e) => { e.stopPropagation(); onClear(); }}
            className="absolute -top-2 -right-2 grid h-6 w-6 place-items-center rounded-full bg-background border shadow-sm hover:bg-destructive hover:text-white"
          ><X className="h-3.5 w-3.5" /></button>
        )}
      </div>
      <div className="flex-1 space-y-2">
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Or paste image URL" />
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
  const [url, setUrl] = useState("");
  const onFiles = async (files: FileList) => {
    setBusy(true);
    try {
      for (const file of Array.from(files)) onAdd(await uploadToBucket(file));
      toast.success(`${files.length} image(s) uploaded`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };
  const addUrl = () => {
    const v = url.trim();
    if (!v) return;
    if (!/^https?:\/\//i.test(v)) { toast.error("URL must start with http(s)://"); return; }
    onAdd(v);
    setUrl("");
  };
  return (
    <div className="mt-2 space-y-2">
      <div className="grid grid-cols-3 gap-2">
      {items.map((url, i) => (
        <div key={i} className="relative aspect-square rounded-lg overflow-hidden border">
          <img src={url} alt="" className="h-full w-full object-cover" />
          <button type="button" onClick={() => onRemove(i)}
            className="absolute top-1 right-1 grid h-5 w-5 place-items-center rounded-full bg-background/90 border shadow-sm hover:bg-destructive hover:text-white"
          ><X className="h-3 w-3" /></button>
        </div>
      ))}
      <button type="button" onClick={() => ref.current?.click()}
        className="aspect-square rounded-lg border-2 border-dashed grid place-items-center hover:border-primary/40 hover:bg-muted/40 transition text-muted-foreground"
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
      </button>
      <input ref={ref} type="file" accept="image/*" multiple hidden onChange={(e) => e.target.files && onFiles(e.target.files)} />
      </div>
      <div className="flex gap-2">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addUrl(); } }}
          placeholder="Paste image URL and press Enter"
          className="h-8 text-xs"
        />
        <Button type="button" variant="outline" size="sm" onClick={addUrl} className="h-8">
          <Plus className="h-3.5 w-3.5" /> Add URL
        </Button>
      </div>
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
        <Input value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder={placeholder} />
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