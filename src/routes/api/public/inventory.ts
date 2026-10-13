import { createFileRoute } from "@tanstack/react-router";

/**
 * GET /api/public/inventory
 *   Header: x-api-key: <API key created in ERP → Settings → API & Webhooks>
 *   ?limit=200&offset=0&updated_since=<ISO>&brand_id=<uuid>
 *
 * Returns product + variant stock/price so the external storefront can sync.
 * No cost/profit fields are ever exposed.
 */

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "content-type, x-api-key, authorization",
};

export const Route = createFileRoute("/api/public/inventory")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const { tryGetSupabaseAdmin } = await import("@/integrations/supabase/client.server");
        const supabaseAdmin = tryGetSupabaseAdmin();
        if (!supabaseAdmin) {
          return Response.json({ error: "Service unavailable" }, { status: 503, headers: CORS });
        }

        const { verifyApiKey } = await import("@/lib/erp/integrations/webhooks.server");
        const client = await verifyApiKey(request, supabaseAdmin, "catalog:read");
        if (!client) {
          return Response.json({ error: "Invalid API key" }, { status: 401, headers: CORS });
        }

        const url = new URL(request.url);
        const limit = Math.min(Number(url.searchParams.get("limit") ?? 200), 1000);
        const offset = Number(url.searchParams.get("offset") ?? 0);
        const updatedSince = url.searchParams.get("updated_since");
        const brandId = client.brand_id ?? url.searchParams.get("brand_id");

        let q = supabaseAdmin
          .from("products")
          .select(
            "id,title,slug,sku,barcode,price,old_price,stock,available_stock,reserved_stock,is_active," +
              "is_preorder,brand_id,category_id,image,updated_at," +
              "product_variants(id,sku,color_name,color_hex,stock,available_stock,is_active)",
            { count: "exact" },
          )
          .order("updated_at", { ascending: false })
          .range(offset, offset + limit - 1);

        q = q.neq("product_kind", "component");
        if (brandId) q = q.eq("brand_id", brandId);
        if (updatedSince) q = q.gte("updated_at", updatedSince);

        const { data, error, count } = await q;
        if (error) return Response.json({ error: error.message }, { status: 500, headers: CORS });

        const products = ((data ?? []) as any[]).map((p) => ({
          id: p.id,
          title: p.title,
          slug: p.slug,
          sku: p.sku,
          barcode: p.barcode,
          price: Number(p.price ?? 0),
          compare_at_price: p.old_price,
          stock: Number(p.stock ?? 0),
          available_stock: Number(p.available_stock ?? p.stock ?? 0),
          reserved_stock: Number(p.reserved_stock ?? 0),
          is_active: !!p.is_active,
          is_preorder: !!p.is_preorder,
          brand_id: p.brand_id,
          category_id: p.category_id,
          image: p.image,
          updated_at: p.updated_at,
          variants: (p.product_variants ?? []).map((v: any) => ({
            id: v.id,
            sku: v.sku,
            color_name: v.color_name,
            color_hex: v.color_hex,
            stock: Number(v.stock ?? 0),
            available_stock: Number(v.available_stock ?? v.stock ?? 0),
            is_active: !!v.is_active,
          })),
        }));

        return Response.json(
          { products, count: products.length, total: count ?? products.length },
          { headers: CORS },
        );
      },
    },
  },
});
