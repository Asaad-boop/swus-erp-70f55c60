const SHOP_DOMAIN_TO_BRAND: Record<string, string> = {
  "hobbyshopbd.myshopify.com": "1f1f366d-ad85-4513-85ab-2dbb6b23c513",
  "toyorakids.myshopify.com": "40abf6fa-404e-4c3f-b0df-f35c1535e95d",
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function firstText(values: unknown[]): string | null {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return null;
}

function paymentLabel(gateways: string[]): string {
  const joined = gateways.join(" ").toLowerCase();
  if (joined.includes("bkash") || joined.includes("b-kash")) return "bKash";
  if (joined.includes("nagad")) return "Nagad";
  if (joined.includes("rocket")) return "Rocket";
  if (joined.includes("card") || joined.includes("visa") || joined.includes("mastercard")) return "Card";
  return firstText(gateways) ?? "online";
}

function paidAmountFromShopify(order: any, total: number, isCod: boolean): number {
  if (isCod) return 0;
  const explicitPaid = num(order?.total_paid ?? order?.current_total_paid);
  if (explicitPaid > 0) return Math.min(total, explicitPaid);

  const outstandingRaw = firstText([
    order?.total_outstanding,
    order?.current_total_outstanding,
    order?.total_outstanding_set?.shop_money?.amount,
    order?.current_total_outstanding_set?.shop_money?.amount,
  ]);
  if (outstandingRaw != null) {
    return Math.min(total, Math.max(0, total - num(outstandingRaw)));
  }

  const financialStatus = String(order?.financial_status ?? "").toLowerCase();
  if (["paid", "partially_paid", "partially_refunded"].includes(financialStatus)) {
    return financialStatus === "paid" ? total : 0;
  }
  return 0;
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacBase64(secret: string, rawBody: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const bytes = new Uint8Array(sig);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export async function handleShopifyOrderWebhook(request: Request): Promise<Response> {
  const rawBody = await request.text();

  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[shopify webhook] SHOPIFY_WEBHOOK_SECRET not configured");
    return new Response("Webhook not configured", { status: 500 });
  }

  const providedHmac = request.headers.get("x-shopify-hmac-sha256") ?? "";
  const expectedHmac = await hmacBase64(secret, rawBody);
  if (!providedHmac || !timingSafeEqualStr(providedHmac, expectedHmac)) {
    return new Response("Invalid signature", { status: 401 });
  }

  const shopDomain = (request.headers.get("x-shopify-shop-domain") ?? "").toLowerCase().trim();
  const brandId = SHOP_DOMAIN_TO_BRAND[shopDomain];
  if (!brandId) {
    console.warn("[shopify webhook] unknown shop domain:", shopDomain);
    return new Response("Unknown shop domain", { status: 400 });
  }

  let order: any;
  try {
    order = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const externalOrderId = order?.id != null ? String(order.id) : null;
  if (!externalOrderId) return new Response("Missing order id", { status: 400 });

  const { tryGetSupabaseAdmin } = await import("@/integrations/supabase/client.server");
  const supabaseAdmin = tryGetSupabaseAdmin();
  if (!supabaseAdmin) {
    console.error("[shopify webhook] supabase admin client unavailable");
    return new Response("Supabase admin unavailable", { status: 500 });
  }

  try {
    const { data: existing } = await supabaseAdmin
      .from("orders")
      .select("id")
      .eq("external_platform", "shopify")
      .eq("external_order_id", externalOrderId)
      .maybeSingle();

    if (existing) {
      return Response.json({ ok: true, duplicate: true, order_id: existing.id });
    }

    const ship = order?.shipping_address ?? {};
    const gateways: string[] = [
      ...(Array.isArray(order?.payment_gateway_names) ? order.payment_gateway_names : []),
      order?.gateway ?? "",
    ].map((g: string) => String(g ?? "").toLowerCase());
    const isCod = gateways.some((g) => g.includes("cash on delivery") || g.includes("cod"));
    const totalPrice = num(order?.total_price);
    const paidAmount = paidAmountFromShopify(order, totalPrice, isCod);
    const paymentMethod = isCod ? "cod" : paymentLabel(gateways);
    const paymentRef = paidAmount > 0
      ? firstText([order?.confirmation_number, order?.checkout_token, order?.name, externalOrderId])
      : null;
    const addressParts = [ship?.address1, ship?.address2].filter(Boolean);

    const orderRow = {
      brand_id: brandId,
      external_platform: "shopify",
      external_order_id: externalOrderId,
      source: "shopify" as const,
      source_platform: "shopify",
      status: "new" as const,
      web_status: "processing" as const,
      total: totalPrice,
      subtotal: num(order?.subtotal_price),
      shipping_fee: num(order?.total_shipping_price_set?.shop_money?.amount),
      payment_method: paymentMethod,
      advance_amount: paidAmount,
      advance_source: paidAmount > 0 ? paymentMethod : null,
      advance_txn_id: paymentRef,
      verified_at: paidAmount > 0 ? new Date().toISOString() : null,
      payment_status: paidAmount > 0 ? (paidAmount >= totalPrice ? "paid" : "partial") : "unpaid",
      shipping_name:
        [ship?.first_name, ship?.last_name].filter(Boolean).join(" ").trim() || ship?.name || null,
      shipping_phone: ship?.phone ?? order?.phone ?? order?.customer?.phone ?? null,
      shipping_address: addressParts.length ? addressParts.join(", ") : null,
      shipping_city: ship?.city ?? null,
      is_guest_order: true,
      guest_name:
        [order?.customer?.first_name, order?.customer?.last_name].filter(Boolean).join(" ").trim() ||
        [ship?.first_name, ship?.last_name].filter(Boolean).join(" ").trim() ||
        null,
      guest_phone: order?.customer?.phone ?? ship?.phone ?? order?.phone ?? null,
      guest_email: order?.email ?? order?.customer?.email ?? null,
      invoice_no: order?.name ?? null,
    };

    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("orders")
      .insert(orderRow as any)
      .select("id")
      .single();

    if (insErr || !inserted) {
      if ((insErr as any)?.code === "23505") {
        return Response.json({ ok: true, duplicate: true });
      }
      console.error("[shopify webhook] order insert failed:", insErr?.message);
      return new Response("Order insert failed", { status: 500 });
    }

    const lineItems: any[] = Array.isArray(order?.line_items) ? order.line_items : [];
    const skus = Array.from(new Set(lineItems.map((li) => (li?.sku ? String(li.sku).trim() : "")).filter(Boolean)));

    const skuToProduct = new Map<string, { id: string; title: string | null }>();
    const skuToVariant = new Map<string, { id: string; product_id: string; sku: string | null; color_name: string | null }>();

    if (skus.length) {
      const { data: products } = await supabaseAdmin
        .from("products")
        .select("id, title, sku")
        .eq("brand_id", brandId)
        .in("sku", skus);
      for (const p of products ?? []) {
        if (p.sku) skuToProduct.set(String(p.sku).trim(), { id: p.id, title: p.title ?? null });
      }

      const { data: variants } = await supabaseAdmin
        .from("product_variants")
        .select("id, product_id, sku, color_name")
        .in("sku", skus);

      const variantProductIds = Array.from(new Set((variants ?? []).map((v) => v.product_id).filter(Boolean)));
      const allowedVariantProductIds = new Set<string>();
      if (variantProductIds.length) {
        const { data: variantProducts } = await supabaseAdmin
          .from("products")
          .select("id")
          .eq("brand_id", brandId)
          .in("id", variantProductIds);
        for (const p of variantProducts ?? []) allowedVariantProductIds.add(p.id);
      }

      for (const v of variants ?? []) {
        if (v.sku && allowedVariantProductIds.has(v.product_id)) skuToVariant.set(String(v.sku).trim(), v);
      }
    }

    const unmapped: string[] = [];
    const itemRows = lineItems.flatMap((li) => {
      const sku = li?.sku ? String(li.sku).trim() : "";
      const variant = sku ? skuToVariant.get(sku) : undefined;
      const product = sku ? skuToProduct.get(sku) : undefined;
      const productId = variant?.product_id ?? product?.id;
      if (!productId) {
        unmapped.push(sku || `(no sku) ${li?.title ?? "unknown"}`);
        return [];
      }
      const qty = Number(li?.quantity) || 1;
      const price = num(li?.price);
      return [
        {
          order_id: inserted.id,
          product_id: productId,
          variant_id: variant?.id ?? null,
          variant_label: variant ? [variant.color_name, variant.sku].filter(Boolean).join(" · ") : null,
          name: String(li?.title ?? li?.name ?? product?.title ?? sku),
          price,
          unit_price: price,
          quantity: qty,
          line_total: price * qty,
          source_type: "shopify",
        },
      ];
    });

    if (unmapped.length) {
      console.warn(`[shopify webhook] unmapped SKUs for order ${externalOrderId} (${shopDomain}):`, unmapped.join(", "));
    }

    if (itemRows.length) {
      const { error: itemErr } = await supabaseAdmin.from("order_items").insert(itemRows as any);
      if (itemErr) {
        console.error("[shopify webhook] order_items insert failed:", itemErr.message);
      }
    }

    // Pre-order intake: flagged products stay in Web Orders / Processing first.
    // The operator confirms them into the pre-order pipeline from the ERP.
    let preorder = false;
    const productIds = Array.from(new Set(itemRows.map((r) => r.product_id).filter(Boolean)));
    if (productIds.length) {
      const { data: preProducts } = await supabaseAdmin
        .from("products")
        .select("id, is_preorder, preorder_expected_date")
        .in("id", productIds)
        .eq("is_preorder", true);
      const flagged = preProducts ?? [];
      if (flagged.length) {
        preorder = true;
        const expected =
          flagged
            .map((p) => p.preorder_expected_date)
            .filter(Boolean)
            .sort()
            .pop() ?? null;
        await supabaseAdmin
          .from("orders")
          .update({
            status: "new",
            web_status: "processing",
            is_preorder: true,
            preorder_expected_date: expected,
          } as any)
          .eq("id", inserted.id);
      }
    }

    return Response.json({ ok: true, order_id: inserted.id, items_inserted: itemRows.length, unmapped_skus: unmapped, preorder });
  } catch (e: any) {
    console.error("[shopify webhook] error:", e?.message ?? e);
    return new Response("Webhook processing failed", { status: 500 });
  }
}