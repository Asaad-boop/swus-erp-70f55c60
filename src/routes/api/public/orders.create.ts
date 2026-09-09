import { createFileRoute } from "@tanstack/react-router";

/**
 * POST /api/public/orders/create
 *   Header: x-api-key: <API key from ERP → Settings → API & Webhooks>
 *
 * Body:
 * {
 *   "external_order_id": "1024",
 *   "customer": { "name": "...", "phone": "...", "email": "...",
 *                 "address": "...", "city": "...", "area": "..." },
 *   "items": [ { "sku": "ABC-001", "quantity": 2, "price": 990 } ],
 *   "shipping_fee": 80, "discount": 0,
 *   "payment_method": "cod" | "bkash" | ..., "paid_amount": 0,
 *   "note": "...", "source": "mysite"
 * }
 *
 * Idempotent on (external_platform, external_order_id).
 */

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, x-api-key, authorization",
};

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const Route = createFileRoute("/api/public/orders/create")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async () =>
        Response.json({ ok: true, hint: "POST an order here with x-api-key" }, { headers: CORS }),
      POST: async ({ request }) => {
        const { tryGetSupabaseAdmin } = await import("@/integrations/supabase/client.server");
        const supabaseAdmin = tryGetSupabaseAdmin();
        if (!supabaseAdmin) {
          return Response.json({ error: "Service unavailable" }, { status: 503, headers: CORS });
        }

        const { verifyApiKey } = await import("@/lib/erp/integrations/webhooks.server");
        const client = await verifyApiKey(request, supabaseAdmin, "orders:create");
        if (!client) {
          return Response.json({ error: "Invalid API key" }, { status: 401, headers: CORS });
        }

        let body: any;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400, headers: CORS });
        }

        const brandId: string | null = client.brand_id ?? body?.brand_id ?? null;
        if (!brandId) {
          return Response.json(
            { error: "No brand linked to this API key — set a brand in ERP → Settings → API & Webhooks" },
            { status: 400, headers: CORS },
          );
        }

        const customer = body?.customer ?? {};
        const name = String(customer.name ?? body?.name ?? "").trim();
        const phone = String(customer.phone ?? body?.phone ?? "").trim();
        if (!phone) {
          return Response.json({ error: "customer.phone is required" }, { status: 400, headers: CORS });
        }

        const items: any[] = Array.isArray(body?.items) ? body.items : [];
        if (items.length === 0) {
          return Response.json({ error: "items[] is required" }, { status: 400, headers: CORS });
        }

        const platform = String(body?.source ?? client.name ?? "external").slice(0, 60);
        const externalOrderId =
          body?.external_order_id != null ? String(body.external_order_id) : null;

        // Idempotency
        if (externalOrderId) {
          const { data: existing } = await supabaseAdmin
            .from("orders")
            .select("id, invoice_no")
            .eq("external_platform", platform)
            .eq("external_order_id", externalOrderId)
            .maybeSingle();
          if (existing) {
            return Response.json(
              { ok: true, duplicate: true, order_id: existing.id, invoice_no: existing.invoice_no },
              { headers: CORS },
            );
          }
        }

        // ---- Resolve products by SKU / id ----
        const skus = Array.from(
          new Set(items.map((i) => String(i?.sku ?? "").trim()).filter(Boolean)),
        );
        const directIds = Array.from(
          new Set(items.map((i) => String(i?.product_id ?? "").trim()).filter(Boolean)),
        );

        const bySku = new Map<string, { id: string; title: string; price: number }>();
        const variantBySku = new Map<
          string,
          { id: string; product_id: string; sku: string | null; color_name: string | null }
        >();
        const byId = new Map<string, { id: string; title: string; price: number }>();

        if (skus.length) {
          const { data: prods } = await supabaseAdmin
            .from("products")
            .select("id,title,price,sku")
            .eq("brand_id", brandId)
            .in("sku", skus);
          for (const p of prods ?? []) {
            if (p.sku) bySku.set(String(p.sku).trim(), { id: p.id, title: p.title, price: Number(p.price ?? 0) });
          }

          const { data: variants } = await supabaseAdmin
            .from("product_variants")
            .select("id,product_id,sku,color_name")
            .in("sku", skus);
          const vProductIds = Array.from(new Set((variants ?? []).map((v: any) => v.product_id)));
          const allowed = new Set<string>();
          if (vProductIds.length) {
            const { data: vp } = await supabaseAdmin
              .from("products")
              .select("id,title,price")
              .eq("brand_id", brandId)
              .in("id", vProductIds);
            for (const p of vp ?? []) {
              allowed.add(p.id);
              byId.set(p.id, { id: p.id, title: p.title, price: Number(p.price ?? 0) });
            }
          }
          for (const v of variants ?? []) {
            if (v.sku && allowed.has(v.product_id)) variantBySku.set(String(v.sku).trim(), v as any);
          }
        }

        if (directIds.length) {
          const { data: prods } = await supabaseAdmin
            .from("products")
            .select("id,title,price")
            .eq("brand_id", brandId)
            .in("id", directIds);
          for (const p of prods ?? []) byId.set(p.id, { id: p.id, title: p.title, price: Number(p.price ?? 0) });
        }

        const unmatched: string[] = [];
        const resolved = items.flatMap((raw) => {
          const sku = String(raw?.sku ?? "").trim();
          const pid = String(raw?.product_id ?? "").trim();
          const variant = sku ? variantBySku.get(sku) : undefined;
          const product =
            (variant ? byId.get(variant.product_id) : undefined) ??
            (sku ? bySku.get(sku) : undefined) ??
            (pid ? byId.get(pid) : undefined);
          if (!product) {
            unmatched.push(sku || pid || String(raw?.name ?? "unknown item"));
            return [];
          }
          const qty = Math.max(1, Number(raw?.quantity ?? raw?.qty ?? 1) || 1);
          const price = raw?.price != null ? num(raw.price) : product.price;
          return [
            {
              product_id: product.id,
              variant_id: variant?.id ?? null,
              variant_label: variant
                ? [variant.color_name, variant.sku].filter(Boolean).join(" · ")
                : null,
              name: String(raw?.name ?? product.title),
              price,
              unit_price: price,
              quantity: qty,
              line_total: price * qty,
              source_type: platform,
            },
          ];
        });

        if (unmatched.length) {
          return Response.json(
            {
              error: "Some items could not be matched to ERP products",
              unmatched_items: unmatched,
              hint: "Use the exact product/variant SKU from ERP inventory",
            },
            { status: 422, headers: CORS },
          );
        }

        const subtotal = resolved.reduce((s, r) => s + r.line_total, 0);
        const shippingFee = num(body?.shipping_fee ?? body?.shipping ?? 0);
        const discount = num(body?.discount ?? body?.discount_amount ?? 0);
        const total =
          body?.total != null ? num(body.total) : Math.max(0, subtotal + shippingFee - discount);
        const paymentMethod = String(body?.payment_method ?? "cod").toLowerCase();
        const paid = Math.min(total, Math.max(0, num(body?.paid_amount ?? body?.advance_amount ?? 0)));

        const orderRow: Record<string, unknown> = {
          brand_id: brandId,
          external_platform: platform,
          external_order_id: externalOrderId,
          source: "website",
          source_platform: platform,
          status: "new",
          web_status: "processing",
          subtotal,
          shipping_fee: shippingFee,
          discount_amount: discount,
          total,
          payment_method: paymentMethod,
          advance_amount: paid,
          advance_source: paid > 0 ? paymentMethod : null,
          advance_txn_id: paid > 0 ? (body?.payment_reference ?? externalOrderId) : null,
          payment_status: paid > 0 ? (paid >= total ? "paid" : "partial") : "unpaid",
          shipping_name: name || null,
          shipping_phone: phone,
          shipping_address: customer.address ?? body?.address ?? null,
          shipping_city: customer.city ?? body?.city ?? null,
          shipping_thana: customer.area ?? body?.area ?? null,
          is_guest_order: true,
          guest_name: name || null,
          guest_phone: phone,
          guest_email: customer.email ?? body?.email ?? null,
          notes: body?.note ?? body?.notes ?? null,
        };

        const { data: inserted, error: insErr } = await supabaseAdmin
          .from("orders")
          .insert(orderRow as any)
          .select("id, invoice_no")
          .single();

        if (insErr || !inserted) {
          if ((insErr as any)?.code === "23505") {
            return Response.json({ ok: true, duplicate: true }, { headers: CORS });
          }
          console.error("[orders.create] insert failed:", insErr?.message);
          return Response.json(
            { error: "Order could not be created", detail: insErr?.message },
            { status: 500, headers: CORS },
          );
        }

        const { error: itemErr } = await supabaseAdmin
          .from("order_items")
          .insert(resolved.map((r) => ({ ...r, order_id: inserted.id })) as any);
        if (itemErr) console.error("[orders.create] items insert failed:", itemErr.message);

        return Response.json(
          {
            ok: true,
            order_id: inserted.id,
            invoice_no: inserted.invoice_no,
            items: resolved.length,
            total,
          },
          { headers: CORS },
        );
      },
    },
  },
});
