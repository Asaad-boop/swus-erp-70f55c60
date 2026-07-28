import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

// GET /api/public/catalog/:brandSlug
//   ?slug=<listing-slug>   → single product
//   ?limit=50&offset=0     → list
//   ?category=<uuid>       → filter by category
// Returns brand-scoped active listings joined with product data.
// CORS: open (storefronts on other domains).

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "content-type",
};

export const Route = createFileRoute("/api/public/catalog/$brandSlug")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request, params }) => {
        const url = new URL(request.url);
        const slug = url.searchParams.get("slug");
        const category = url.searchParams.get("category");
        const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
        const offset = Number(url.searchParams.get("offset") ?? 0);

        const sb = createClient<Database>(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_PUBLISHABLE_KEY!,
          { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
        );

        // Resolve brand slug → id
        const { data: brand, error: bErr } = await sb
          .from("brands")
          .select("id,name,slug,logo_url")
          .eq("slug", params.brandSlug)
          .eq("is_active", true)
          .maybeSingle();
        if (bErr) return Response.json({ error: bErr.message }, { status: 500, headers: CORS });
        if (!brand) return Response.json({ error: "Brand not found" }, { status: 404, headers: CORS });

        // Business rule: storefront ALWAYS shows in-stock and accepts orders,
        // regardless of internal inventory (which may be zero or negative).
        // Real stock is verified inside the ERP after the order arrives.
        const allowOversell = true;

        let q = sb
          .from("product_brand_listings")
          .select(
            "id,price,compare_at_price,slug,title_override,image_override,description_override,display_order," +
            "products!inner(id,title,description,price,old_price,image,gallery,benefits,specs,rating,reviews," +
            "stock,available_stock,is_active,is_featured,is_new_arrival,category_id,sku,barcode," +
            "shipping_fee_inside,shipping_fee_outside,age_group,video_url,is_preorder,preorder_expected_date," +
            "product_variants(id,sku,color_name,color_hex,image,display_order,stock,available_stock,is_active))",
          )
          .eq("brand_id", brand.id)
          .eq("is_active", true)
          .eq("products.is_active", true)
          .order("display_order", { ascending: true });

        if (slug) q = q.eq("slug", slug);
        if (category) q = q.eq("products.category_id", category);
        if (!slug) q = q.range(offset, offset + limit - 1);

        const { data, error } = await q;
        if (error) return Response.json({ error: error.message }, { status: 500, headers: CORS });

        type Row = {
          id: string;
          price: number | null;
          compare_at_price: number | null;
          slug: string;
          title_override: string | null;
          image_override: string | null;
          description_override: string | null;
          display_order: number;
          products: Record<string, unknown> & {
            id: string; title: string; description: string; price: number; old_price: number | null;
            image: string; gallery: unknown; stock: number; available_stock: number | null;
            product_variants?: Array<{
              id: string; sku: string | null; color_name: string | null; color_hex: string | null;
              image: string | null; display_order: number | null; stock: number | null;
              available_stock: number | null; is_active: boolean;
            }> | null;
          };
        };
        // Storefront must never show "sold out" when backorders are allowed.
        const publicStock = (raw: number | null | undefined) => {
          const s = Number(raw ?? 0);
          return allowOversell && s <= 0 ? 9999 : s;
        };
        const products = ((data ?? []) as unknown as Row[]).map((r) => ({
          listing_id: r.id,
          id: r.products.id,
          slug: r.slug,
          title: r.title_override ?? r.products.title,
          description: r.description_override ?? r.products.description,
          price: Number(r.price ?? r.products.price),
          compare_at_price: r.compare_at_price ?? r.products.old_price,
          image: r.image_override ?? r.products.image,
          gallery: r.products.gallery,
          stock: publicStock(r.products.available_stock ?? r.products.stock),
          allow_backorder: allowOversell,
          variants: (r.products.product_variants ?? [])
            .filter((v) => v.is_active)
            .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
            .map((v) => ({
              id: v.id,
              sku: v.sku,
              color_name: v.color_name,
              color_hex: v.color_hex,
              image: v.image,
              stock: publicStock(v.available_stock ?? v.stock),
              available_stock: publicStock(v.available_stock ?? v.stock),
              in_stock: allowOversell ? true : Number(v.available_stock ?? v.stock ?? 0) > 0,
              allow_backorder: allowOversell,
            })),
          brand: { id: brand.id, name: brand.name, slug: brand.slug, logo_url: brand.logo_url },
          // pass through remaining product fields
          benefits: r.products.benefits,
          specs: r.products.specs,
          rating: r.products.rating,
          reviews: r.products.reviews,
          is_featured: r.products.is_featured,
          is_new_arrival: r.products.is_new_arrival,
          category_id: r.products.category_id,
          sku: r.products.sku,
          barcode: r.products.barcode,
          shipping_fee_inside: r.products.shipping_fee_inside,
          shipping_fee_outside: r.products.shipping_fee_outside,
          age_group: r.products.age_group,
          video_url: r.products.video_url,
          is_preorder: r.products.is_preorder,
          preorder_expected_date: r.products.preorder_expected_date,
        }));

        if (slug) {
          const one = products[0];
          if (!one) return Response.json({ error: "Product not found" }, { status: 404, headers: CORS });
          return Response.json({ product: one }, { headers: { ...CORS, "cache-control": "public, max-age=60" } });
        }
        return Response.json(
          { brand: { id: brand.id, name: brand.name, slug: brand.slug, logo_url: brand.logo_url }, products, count: products.length },
          { headers: { ...CORS, "cache-control": "public, max-age=60" } },
        );
      },
    },
  },
});