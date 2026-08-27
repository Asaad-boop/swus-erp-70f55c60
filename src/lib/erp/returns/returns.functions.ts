import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* ============================================================
   Returns & Exchanges — server functions
   ============================================================ */

const Uuid = z.string().uuid();

/* ----------------- Journal helpers (fail-soft) ----------------- */

async function findOrCreateAccount(
  sb: any,
  brandId: string,
  userId: string,
  opts: { namePatterns: string[]; type: "asset" | "liability" | "expense" | "income" | "equity"; normal: "debit" | "credit"; fallbackName: string; fallbackCode: string },
): Promise<string | null> {
  for (const pat of opts.namePatterns) {
    const { data } = await sb.from("erp_chart_accounts")
      .select("id").eq("brand_id", brandId).eq("account_type", opts.type)
      .eq("is_archived", false).ilike("name", pat).limit(1);
    if (data && data.length) return data[0].id;
  }
  const { data: created } = await sb.from("erp_chart_accounts").insert({
    brand_id: brandId, code: opts.fallbackCode, name: opts.fallbackName,
    account_type: opts.type, normal_balance: opts.normal,
    is_active: true, is_archived: false, created_by: userId,
  }).select("id").maybeSingle();
  return created?.id ?? null;
}

async function postRefundJournal(sb: any, userId: string, caseId: string, brandId: string, amount: number) {
  if (!(amount > 0) || !brandId) return;
  try {
    const { data: existing } = await sb.from("erp_journal_entries")
      .select("id").eq("source_type", "return_case").eq("source_id", caseId)
      .is("deleted_at", null).maybeSingle();
    if (existing) return;
    const salesReturnsId = await findOrCreateAccount(sb, brandId, userId, {
      namePatterns: ["%sales returns%", "%returns and allowances%"],
      type: "expense", normal: "debit",
      fallbackName: "Sales Returns & Allowances", fallbackCode: "4100",
    });
    const refundsPayableId = await findOrCreateAccount(sb, brandId, userId, {
      namePatterns: ["%refunds payable%", "%refund payable%"],
      type: "liability", normal: "credit",
      fallbackName: "Refunds Payable", fallbackCode: "2500",
    });
    if (!salesReturnsId || !refundsPayableId) return;
    await sb.rpc("create_journal_entry", {
      _brand_id: brandId,
      _entry_date: new Date().toISOString().slice(0, 10),
      _description: `Return refund — case ${caseId.slice(0, 8)}`,
      _lines: [
        { account_id: salesReturnsId, debit: amount, credit: 0, description: "Sales returns" },
        { account_id: refundsPayableId, debit: 0, credit: amount, description: "Refund payable to customer" },
      ],
      _source_type: "return_case",
      _source_id: caseId,
      _status: "posted",
    });
  } catch { /* fail-soft */ }
}

async function postExchangeChargeJournal(sb: any, userId: string, caseId: string, brandId: string, amount: number) {
  if (!(amount > 0) || !brandId) return;
  try {
    const { data: existing } = await sb.from("erp_journal_entries")
      .select("id").eq("source_type", "exchange_case").eq("source_id", caseId)
      .is("deleted_at", null).maybeSingle();
    if (existing) return;
    const cashId = await findOrCreateAccount(sb, brandId, userId, {
      namePatterns: ["%cash in hand%", "%bkash%", "%cash%"],
      type: "asset", normal: "debit",
      fallbackName: "Cash in Hand", fallbackCode: "1100",
    });
    const exchangeRevenueId = await findOrCreateAccount(sb, brandId, userId, {
      namePatterns: ["%exchange revenue%", "%exchange income%"],
      type: "income", normal: "credit",
      fallbackName: "Exchange Revenue", fallbackCode: "4200",
    });
    if (!cashId || !exchangeRevenueId) return;
    await sb.rpc("create_journal_entry", {
      _brand_id: brandId,
      _entry_date: new Date().toISOString().slice(0, 10),
      _description: `Exchange charge — case ${caseId.slice(0, 8)}`,
      _lines: [
        { account_id: cashId, debit: amount, credit: 0, description: "Exchange charge collected" },
        { account_id: exchangeRevenueId, debit: 0, credit: amount, description: "Exchange revenue" },
      ],
      _source_type: "exchange_case",
      _source_id: caseId,
      _status: "posted",
    });
  } catch { /* fail-soft */ }
}

/* ----------------- LIST ----------------- */

export const listReturnCases = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandIds?: string[]; status?: string; from?: string; to?: string; q?: string }) =>
    z.object({
      brandIds: z.array(Uuid).optional(),
      status: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      q: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    let q = (context.supabase as any).from("erp_return_cases")
      .select(`id, case_number, brand_id, order_id, order_item_id, product_id, variant_id, sku, return_type, item_condition, qty,
               refund_amount, return_status, qc_condition, stock_updated, courier_tracking_id, courier_name,
               created_at, created_by,
               order:order_id ( id, invoice_no, shipping_name, shipping_phone ),
               item:order_item_id ( id, name, variant_label, quantity, unit_price, line_total, image ),
               product:product_id ( id, title, sku, image )`)
      .order("created_at", { ascending: false }).limit(500);
    if (data.brandIds?.length) q = q.in("brand_id", data.brandIds);
    if (data.status && data.status !== "all") q = q.eq("return_status", data.status);
    if (data.from) q = q.gte("created_at", dayStart(data.from));
    if (data.to) q = q.lte("created_at", dayEnd(data.to));
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const listExchangeCases = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandIds?: string[]; status?: string; from?: string; to?: string }) =>
    z.object({
      brandIds: z.array(Uuid).optional(),
      status: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    let q = (context.supabase as any).from("erp_exchange_cases")
      .select(`id, case_number, brand_id, original_order_id, original_order_item_id, original_product_id, exchange_type,
               exchange_type_detail, exchange_status, replacement_product_id, replacement_qty,
               new_order_id, refund_amount, exchange_charge_collected, created_at, created_by,
               order:original_order_id ( id, invoice_no, shipping_name, shipping_phone ),
               item:original_order_item_id ( id, name, variant_label, quantity, unit_price, line_total, image ),
               product:original_product_id ( id, title, sku, image ),
               replacement:replacement_product_id ( id, title, sku )`)
      .order("created_at", { ascending: false }).limit(500);
    if (data.brandIds?.length) q = q.in("brand_id", data.brandIds);
    if (data.status && data.status !== "all") q = q.eq("exchange_status", data.status);
    if (data.from) q = q.gte("created_at", dayStart(data.from));
    if (data.to) q = q.lte("created_at", dayEnd(data.to));
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

/* ----------------- DETAIL ----------------- */

export const getCaseDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { caseId: string }) => z.object({ caseId: Uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    // Try return first
    const { data: ret } = await sb.from("erp_return_cases")
      .select(`*, order:order_id ( id, shipping_name, shipping_phone, shipping_address, total ),
               product:product_id ( id, title, sku, image, weighted_avg_cost ),
               item:order_item_id ( id, quantity, unit_price, line_total, unit_cost_snapshot, variant_id )`)
      .eq("id", data.caseId).maybeSingle();
    if (ret) {
      const { data: tl } = await sb.from("erp_return_timeline")
        .select("*").eq("case_id", data.caseId).eq("case_type", "return")
        .order("created_at", { ascending: true });
      return { type: "return" as const, case: ret, timeline: tl ?? [] };
    }
    const { data: exc } = await sb.from("erp_exchange_cases")
      .select(`*, order:original_order_id ( id, shipping_name, shipping_phone, shipping_address ),
               product:original_product_id ( id, title, sku, image ),
               replacement:replacement_product_id ( id, title, sku, price ),
               new_order:new_order_id ( id, status )`)
      .eq("id", data.caseId).maybeSingle();
    if (!exc) throw new Error("Case not found");
    const { data: tl } = await sb.from("erp_return_timeline")
      .select("*").eq("case_id", data.caseId).eq("case_type", "exchange")
      .order("created_at", { ascending: true });
    return { type: "exchange" as const, case: exc, timeline: tl ?? [] };
  });

/* ----------------- UPDATE STATUS ----------------- */

export const updateReturnStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { caseId: string; status: string; note?: string; isExchange?: boolean }) =>
    z.object({ caseId: Uuid, status: z.string(), note: z.string().optional(), isExchange: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const table = data.isExchange ? "erp_exchange_cases" : "erp_return_cases";
    const statusCol = data.isExchange ? "exchange_status" : "return_status";
    const patch: any = { [statusCol]: data.status };
    if (data.status === "closed" || data.status === "completed") patch.resolved_at = new Date().toISOString();
    const { error } = await sb.from(table).update(patch).eq("id", data.caseId);
    if (error) throw error;
    if (data.note) {
      await sb.from("erp_return_timeline").insert({
        case_id: data.caseId, case_type: data.isExchange ? "exchange" : "return",
        status: data.status, note: data.note, created_by: context.userId,
      });
    }
    return { ok: true };
  });

/* ----------------- QC ----------------- */

export const completeQC = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { caseId: string; condition: "sellable" | "damaged" | "missing"; notes?: string }) =>
    z.object({ caseId: Uuid, condition: z.enum(["sellable", "damaged", "missing"]), notes: z.string().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: c, error: cErr } = await sb.from("erp_return_cases")
      .select("id, brand_id, product_id, variant_id, qty, stock_updated, stock_restored, return_status, product:product_id(weighted_avg_cost)")
      .eq("id", data.caseId).maybeSingle();
    if (cErr) throw cErr;
    if (!c) throw new Error("Return case not found");

    const now = new Date().toISOString();
    const nextStatus = data.condition === "sellable" ? "restocked" : "loss_recorded";

    if (data.condition === "sellable") {
      if (c.stock_updated || c.stock_restored) {
        throw new Error("Already restocked");
      }
      const wac = Number(c.product?.weighted_avg_cost ?? 0);
      const { error: rpcErr } = await sb.rpc("adjust_stock_v2", {
        _product_id: c.product_id,
        _variant_id: c.variant_id,
        _delta: Number(c.qty),
        _reason: "return_restock",
        _source: "return",
        _unit_cost: wac,
        _reference_type: "erp_return_case",
        _reference_id: c.id,
        _idempotency_key: `return_restock_${c.id}`,
        _note: "Restocked from return QC",
      });
      if (rpcErr) throw rpcErr;
    }

    const { error: uErr } = await sb.from("erp_return_cases").update({
      qc_condition: data.condition,
      qc_notes: data.notes ?? null,
      qc_done_by: context.userId,
      qc_done_at: now,
      stock_updated: data.condition === "sellable" ? true : c.stock_updated,
      stock_restored: data.condition === "sellable" ? true : c.stock_restored,
      stock_restored_at: data.condition === "sellable" ? now : undefined,
      return_status: nextStatus,
    }).eq("id", data.caseId);
    if (uErr) throw uErr;

    await sb.from("erp_return_timeline").insert({
      case_id: c.id, case_type: "return", status: nextStatus,
      note: `QC: ${data.condition}${data.notes ? " — " + data.notes : ""}`,
      created_by: context.userId,
    });

    // Activity log for loss scenarios
    if (data.condition !== "sellable") {
      try {
        await sb.from("activity_log").insert({
          action: data.condition === "damaged" ? "return_damaged" : "return_missing",
          entity_type: "erp_return_case",
          entity_id: c.id,
          details: { product_id: c.product_id, qty: c.qty, notes: data.notes ?? null }, performed_by: context.userId,
        });
      } catch { /* non-fatal */ }
    }

    return { ok: true, restocked: data.condition === "sellable" };
  });

/* ----------------- EXCHANGE ORDER ----------------- */

export const createExchangeOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { caseId: string }) => z.object({ caseId: Uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: exc, error: eErr } = await sb.from("erp_exchange_cases")
      .select(`id, brand_id, original_order_id, replacement_product_id, replacement_variant_id,
               replacement_qty, exchange_charge_collected, new_order_id,
               order:original_order_id ( shipping_name, shipping_phone, shipping_address ),
               replacement:replacement_product_id ( id, title, price, sku )`)
      .eq("id", data.caseId).maybeSingle();
    if (eErr) throw eErr;
    if (!exc) throw new Error("Exchange case not found");
    if (exc.new_order_id) throw new Error("Exchange order already created");
    if (!exc.replacement_product_id) throw new Error("No replacement product on case");

    const charge = Number(exc.exchange_charge_collected ?? 0);
    const qty = Number(exc.replacement_qty ?? 1);
    const price = Number(exc.replacement?.price ?? 0);

    const { data: order, error: oErr } = await sb.from("orders").insert({
      brand_id: exc.brand_id,
      shipping_name: exc.order?.shipping_name ?? null,
      shipping_phone: exc.order?.shipping_phone ?? null,
      shipping_address: exc.order?.shipping_address ?? null,
      subtotal: price * qty,
      total: charge,
      shipping_fee: 0,
      payment_method: "cod",
      source: "manual",
      status: "new",
      notes: `Exchange for order ${exc.original_order_id}`,
    }).select("id").single();
    if (oErr) throw oErr;

    await sb.from("order_items").insert({
      order_id: order.id,
      product_id: exc.replacement_product_id,
      variant_id: exc.replacement_variant_id ?? null,
      quantity: qty,
      unit_price: price,
      line_total: price * qty,
    });

    await sb.from("erp_exchange_cases").update({
      new_order_id: order.id,
      exchange_status: "new_order_created",
    }).eq("id", exc.id);

    await sb.from("erp_return_timeline").insert({
      case_id: exc.id, case_type: "exchange", status: "new_order_created",
      note: `Exchange order #${String(order.id).slice(0, 8)} created`,
      created_by: context.userId,
    });

    return { ok: true, orderId: order.id, orderNumber: String(order.id).slice(0, 8) };
  });

/* ----------------- ORDER -> CASES (for order detail mini list) ----------------- */

export const listCasesForOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orderId: string }) => z.object({ orderId: Uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const [{ data: rets }, { data: excs }] = await Promise.all([
      sb.from("erp_return_cases")
        .select("id, case_number, return_status, refund_amount, qty, created_at")
        .eq("order_id", data.orderId).order("created_at", { ascending: false }),
      sb.from("erp_exchange_cases")
        .select("id, case_number, exchange_status, exchange_charge_collected, replacement_qty, created_at")
        .eq("original_order_id", data.orderId).order("created_at", { ascending: false }),
    ]);
    return {
      returns: rets ?? [],
      exchanges: excs ?? [],
    };
  });

/* ----------------- HELPERS for New Case dialogs ----------------- */

export const searchOrdersForCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandIds?: string[]; q?: string }) =>
    z.object({ brandIds: z.array(Uuid).optional(), q: z.string().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    let q = sb.from("orders")
      .select("id, invoice_no, shipping_name, shipping_phone, shipping_address, total, status, created_at, brand_id")
      .order("created_at", { ascending: false })
      .limit(25);
    if (data.brandIds?.length) q = q.in("brand_id", data.brandIds);
    const needle = (data.q ?? "").trim();
    if (needle) {
      const like = `%${needle}%`;
      q = q.or(`invoice_no.ilike.${like},shipping_name.ilike.${like},shipping_phone.ilike.${like}`);
    }
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const listItemsForOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orderId: string }) => z.object({ orderId: Uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: items, error } = await sb.from("order_items")
      .select("id, product_id, variant_id, name, variant_label, quantity, unit_price, line_total, unit_cost_snapshot, image, product:product_id(id, title, sku, image, brand_id)")
      .eq("order_id", data.orderId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return items ?? [];
  });

export const searchProductsForCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandIds?: string[]; q?: string }) =>
    z.object({ brandIds: z.array(Uuid).optional(), q: z.string().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    let q = sb.from("products")
      .select("id, title, sku, image, price, brand_id")
      .limit(25);
    // Cross-brand: dui brand er product-i replacement hishebe select kora jabe.
    const needle = (data.q ?? "").trim();
    if (needle) {
      const like = `%${needle}%`;
      q = q.or(`title.ilike.${like},sku.ilike.${like}`);
    }
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const listVariantsForProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { productId: string }) => z.object({ productId: Uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: rows, error } = await sb.from("product_variants")
      .select("id, sku, price_override, stock, image")
      .eq("product_id", data.productId)
      .eq("is_active", true)
      .order("display_order", { ascending: true });
    if (error) throw error;
    return rows ?? [];
  });

export const createReturnCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    brandId: string;
    orderId: string;
    orderItemId?: string;
    productId?: string;
    variantId?: string;
    sku?: string;
    returnType: string;
    itemCondition: string;
    qty: number;
    refundAmount?: number;
    courierTrackingId?: string;
    courierName?: string;
    note?: string;
  }) => z.object({
    brandId: Uuid,
    orderId: Uuid,
    orderItemId: Uuid.optional(),
    productId: Uuid.optional(),
    variantId: Uuid.optional(),
    sku: z.string().optional(),
    returnType: z.string(),
    itemCondition: z.string(),
    qty: z.number().min(1),
    refundAmount: z.number().optional(),
    courierTrackingId: z.string().optional(),
    courierName: z.string().optional(),
    note: z.string().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: row, error } = await sb.from("erp_return_cases").insert({
      brand_id: data.brandId,
      order_id: data.orderId,
      order_item_id: data.orderItemId ?? null,
      product_id: data.productId ?? null,
      variant_id: data.variantId ?? null,
      sku: data.sku ?? null,
      return_type: data.returnType,
      item_condition: data.itemCondition,
      qty: data.qty,
      refund_amount: data.refundAmount ?? 0,
      courier_tracking_id: data.courierTrackingId ?? null,
      courier_name: data.courierName ?? null,
      note: data.note ?? null,
      return_status: "initiated",
      created_by: context.userId,
    }).select("id").single();
    if (error) throw error;
    await postRefundJournal(sb, context.userId, row.id, data.brandId, Number(data.refundAmount ?? 0));
    return { ok: true, id: row.id };
  });

export const createExchangeCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    brandId: string;
    orderId: string;
    orderItemId?: string;
    originalProductId?: string;
    originalVariantId?: string;
    originalSku?: string;
    exchangeType: string;
    exchangeTypeDetail?: string;
    oldItemCondition: string;
    replacementProductId?: string;
    replacementVariantId?: string;
    replacementSku?: string;
    replacementQty?: number;
    exchangeChargeCollected?: number;
    returnDeliveryCost?: number;
    note?: string;
  }) => z.object({
    brandId: Uuid,
    orderId: Uuid,
    orderItemId: Uuid.optional(),
    originalProductId: Uuid.optional(),
    originalVariantId: Uuid.optional(),
    originalSku: z.string().optional(),
    exchangeType: z.string(),
    exchangeTypeDetail: z.string().optional(),
    oldItemCondition: z.string(),
    replacementProductId: Uuid.optional(),
    replacementVariantId: Uuid.optional(),
    replacementSku: z.string().optional(),
    replacementQty: z.number().min(1).optional(),
    exchangeChargeCollected: z.number().optional(),
    returnDeliveryCost: z.number().optional(),
    note: z.string().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: row, error } = await sb.from("erp_exchange_cases").insert({
      brand_id: data.brandId,
      original_order_id: data.orderId,
      original_order_item_id: data.orderItemId ?? null,
      original_product_id: data.originalProductId ?? null,
      original_variant_id: data.originalVariantId ?? null,
      original_sku: data.originalSku ?? null,
      exchange_type: data.exchangeType,
      exchange_type_detail: data.exchangeTypeDetail ?? data.exchangeType,
      old_item_condition: data.oldItemCondition,
      replacement_product_id: data.replacementProductId ?? null,
      replacement_variant_id: data.replacementVariantId ?? null,
      replacement_sku: data.replacementSku ?? null,
      replacement_qty: data.replacementQty ?? 1,
      exchange_charge_collected: data.exchangeChargeCollected ?? 0,
      return_delivery_cost: data.returnDeliveryCost ?? 0,
      note: data.note ?? null,
      exchange_status: "initiated",
      created_by: context.userId,
    }).select("id").single();
    if (error) throw error;
    await postExchangeChargeJournal(sb, context.userId, row.id, data.brandId, Number(data.exchangeChargeCollected ?? 0));
    return { ok: true, id: row.id };
  });
/* ----------------- EXCHANGE: mark replacement sent (with tracking) ----------------- */

export const markExchangeReplacementSent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { caseId: string; trackingId: string; courierName?: string }) =>
    z.object({ caseId: Uuid, trackingId: z.string().min(1), courierName: z.string().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { error } = await sb.from("erp_exchange_cases").update({
      exchange_status: "replacement_sent",
      replacement_tracking_id: data.trackingId,
      replacement_courier: data.courierName ?? null,
    }).eq("id", data.caseId);
    if (error) throw error;
    await sb.from("erp_return_timeline").insert({
      case_id: data.caseId, case_type: "exchange", status: "replacement_sent",
      note: `Replacement sent — ${data.courierName ?? "courier"} #${data.trackingId}`,
      created_by: context.userId,
    });
    return { ok: true };
  });

/* ----------------- EXCHANGE: complete with old-item condition ----------------- */

export const completeExchange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { caseId: string; oldCondition: "sellable" | "damaged" | "missing"; notes?: string }) =>
    z.object({ caseId: Uuid, oldCondition: z.enum(["sellable", "damaged", "missing"]), notes: z.string().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: exc, error: eErr } = await sb.from("erp_exchange_cases")
      .select("id, brand_id, original_product_id, original_variant_id, replacement_qty, original_item_restocked, original_product:original_product_id(weighted_avg_cost)")
      .eq("id", data.caseId).maybeSingle();
    if (eErr) throw eErr;
    if (!exc) throw new Error("Exchange case not found");

    const qty = Number(exc.replacement_qty ?? 1);
    if (data.oldCondition === "sellable" && exc.original_product_id && !exc.original_item_restocked) {
      const wac = Number(exc.original_product?.weighted_avg_cost ?? 0);
      const { error: rpcErr } = await sb.rpc("adjust_stock_v2", {
        _product_id: exc.original_product_id,
        _variant_id: exc.original_variant_id,
        _delta: qty,
        _reason: "exchange_restock",
        _source: "exchange",
        _unit_cost: wac,
        _reference_type: "erp_exchange_case",
        _reference_id: exc.id,
        _idempotency_key: `exchange_restock_${exc.id}`,
        _note: "Restocked from exchange completion",
      });
      if (rpcErr) throw rpcErr;
    } else if (data.oldCondition !== "sellable") {
      try {
        await sb.from("activity_log").insert({
          action: data.oldCondition === "damaged" ? "exchange_damaged" : "exchange_missing",
          entity_type: "erp_exchange_case",
          entity_id: exc.id,
          details: { product_id: exc.original_product_id, qty, notes: data.notes ?? null }, performed_by: context.userId,
        });
      } catch { /* non-fatal */ }
    }

    const { error: uErr } = await sb.from("erp_exchange_cases").update({
      exchange_status: "completed",
      original_item_restocked: data.oldCondition === "sellable" ? true : exc.original_item_restocked,
      old_item_condition: data.oldCondition,
      resolved_at: new Date().toISOString(),
    }).eq("id", exc.id);
    if (uErr) throw uErr;

    await sb.from("erp_return_timeline").insert({
      case_id: exc.id, case_type: "exchange", status: "completed",
      note: `Old item: ${data.oldCondition}${data.notes ? " — " + data.notes : ""}`,
      created_by: context.userId,
    });
    return { ok: true, restocked: data.oldCondition === "sellable" };
  });
