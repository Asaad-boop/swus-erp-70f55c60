import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, Store, Globe } from "lucide-react";
import { useBrand } from "@/contexts/brand-context";
import {
  useProductListings,
  useSaveProductListings,
  type ListingDraft,
} from "@/hooks/erp/use-product-listings";
import { cn } from "@/lib/utils";

type Props = {
  productId: string | null;
  ownerBrandId: string;
  productSlug: string;
  productPrice: string;
};

export function BrandListingsEditor({ productId, ownerBrandId, productSlug, productPrice }: Props) {
  const { brands } = useBrand();
  const listingsQ = useProductListings(productId);
  const save = useSaveProductListings(productId);
  const [drafts, setDrafts] = useState<Record<string, ListingDraft>>({});

  useEffect(() => {
    if (!listingsQ.data) return;
    const map: Record<string, ListingDraft> = {};
    for (const l of listingsQ.data) {
      map[l.brand_id] = {
        brand_id: l.brand_id,
        price: l.price,
        compare_at_price: l.compare_at_price,
        slug: l.slug,
        title_override: l.title_override,
        image_override: l.image_override,
        description_override: l.description_override,
        is_active: l.is_active,
      };
    }
    setDrafts(map);
  }, [listingsQ.data]);

  if (!productId) {
    return (
      <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
        Save korar por brand listings edit korte parben.
      </div>
    );
  }
  if (listingsQ.isLoading) {
    return <div className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> Loading listings…</div>;
  }

  const toggleBrand = (brandId: string, on: boolean) => {
    setDrafts((prev) => {
      const next = { ...prev };
      if (on) {
        next[brandId] = {
          brand_id: brandId,
          price: null,
          compare_at_price: null,
          slug: productSlug,
          title_override: null,
          image_override: null,
          description_override: null,
          is_active: true,
        };
      } else {
        delete next[brandId];
      }
      return next;
    });
  };

  const update = (brandId: string, patch: Partial<ListingDraft>) => {
    setDrafts((prev) => ({ ...prev, [brandId]: { ...prev[brandId], ...patch } }));
  };

  const onSave = async () => {
    const list = Object.values(drafts);
    if (list.length === 0) {
      toast.error("At least one brand listing must remain");
      return;
    }
    // slug required per listing
    for (const d of list) {
      if (!d.slug.trim()) {
        toast.error("Slug required for every listing");
        return;
      }
    }
    try {
      await save.mutateAsync(list);
      toast.success("Listings saved");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save listings");
    }
  };

  const listedBrands = Object.keys(drafts);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-muted-foreground">
            Ei product kon kon brand er storefront e dekhabe? Owner brand: <Badge variant="outline" className="ml-1">{brands.find((b) => b.id === ownerBrandId)?.name ?? "—"}</Badge>
          </div>
        </div>
        {listedBrands.length > 1 && (
          <Badge variant="secondary" className="gap-1"><Globe className="h-3 w-3" /> Shared on {listedBrands.length} brands</Badge>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button" size="sm" variant="outline" className="h-7 text-xs"
          onClick={() =>
            setDrafts((prev) => {
              const next = { ...prev };
              for (const b of brands) {
                if (!next[b.id]) {
                  next[b.id] = {
                    brand_id: b.id, price: null, compare_at_price: null, slug: productSlug,
                    title_override: null, image_override: null, description_override: null, is_active: true,
                  };
                }
              }
              return next;
            })
          }
        >
          Select all brands
        </Button>
        <Button
          type="button" size="sm" variant="ghost" className="h-7 text-xs"
          onClick={() =>
            setDrafts((prev) => (prev[ownerBrandId] ? { [ownerBrandId]: prev[ownerBrandId] } : {
              [ownerBrandId]: {
                brand_id: ownerBrandId, price: null, compare_at_price: null, slug: productSlug,
                title_override: null, image_override: null, description_override: null, is_active: true,
              },
            }))
          }
        >
          Owner brand only
        </Button>
      </div>

      <div className="space-y-2">
        {brands.map((b) => {
          const on = !!drafts[b.id];
          const d = drafts[b.id];
          return (
            <div key={b.id} className={cn("rounded-lg border p-3", on ? "bg-card" : "bg-muted/20")}>
              <div className="flex items-center gap-3">
                <Checkbox checked={on} onCheckedChange={(v) => toggleBrand(b.id, !!v)} />
                <Store className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1 font-medium text-sm">{b.name}</div>
                {on && (
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground">Active</Label>
                    <Switch checked={d.is_active} onCheckedChange={(v) => update(b.id, { is_active: v })} />
                  </div>
                )}
              </div>
              {on && (
                <div className="mt-3 grid grid-cols-2 gap-3 pl-7">
                  <div>
                    <Label className="text-xs">Price override (BDT)</Label>
                    <Input
                      type="number"
                      placeholder={`Default ৳${productPrice || "—"}`}
                      value={d.price ?? ""}
                      onChange={(e) => update(b.id, { price: e.target.value === "" ? null : Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Compare-at (BDT)</Label>
                    <Input
                      type="number"
                      value={d.compare_at_price ?? ""}
                      onChange={(e) => update(b.id, { compare_at_price: e.target.value === "" ? null : Number(e.target.value) })}
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Slug on {b.name} <span className="text-muted-foreground">(URL path)</span></Label>
                    <Input value={d.slug} onChange={(e) => update(b.id, { slug: e.target.value })} />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Title override</Label>
                    <Input
                      placeholder="Leave empty to use product title"
                      value={d.title_override ?? ""}
                      onChange={(e) => update(b.id, { title_override: e.target.value || null })}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={onSave} disabled={save.isPending}>
          {save.isPending && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
          Save listings
        </Button>
      </div>
    </div>
  );
}