import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* ============================================================
   Helpers
   ============================================================ */

async function assertAnyRole(
  supabase: any,
  userId: string,
  roles: Array<"admin" | "accountant" | "operations" | "warehouse_staff">,
) {
  const results = await Promise.all(
    roles.map((r) => supabase.rpc("has_role", { _user_id: userId, _role: r })),
  );
  if (!results.some((r: any) => r.data === true)) {
    throw new Error("Not authorized");
  }
}

/* ============================================================
   DELETE Import PO (admin only — reverses payments + stock)
   ============================================================ */
export const deleteImportPo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { poId: string; confirm: string }) =>
    z.object({
      poId: z.string().uuid(),
      confirm: z.literal("DELETE"),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("imp_delete_po", { _po_id: data.poId });
    if (error) throw error;
    return { ok: true };
  });

/* ============================================================
   READ-side server functions
   ============================================================ */

export const listPurchaseOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId?: string; brandIds?: string[]; status?: string; q?: string; from?: string; to?: string }) =>
    z.object({
      brandId: z.string().uuid().optional(),
      brandIds: z.array(z.string().uuid()).optional(),
      status: z.string().optional(),
      q: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("imp_purchase_orders")
      .select(`
        id, po_number, brand_id, supplier_id, order_date,
        currency, fx_rate,
        product_subtotal_bdt, shipping_total_bdt, local_courier_total_bdt,
        grand_total_bdt, paid_bdt, due_bdt, status, notes, created_at,
        supplier:supplier_id ( id, name ),
        brand:brand_id ( id, name, slug ),
        items:imp_po_items ( id, name_snapshot, image_snapshot, quantity, product:product_id ( title, image ) )
      `)
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.brandIds && data.brandIds.length > 0) q = q.in("brand_id", data.brandIds);
    else if (data.brandId) q = q.eq("brand_id", data.brandId);
    if (data.status && data.status !== "all") q = q.eq("status", data.status as any);
    if (data.from) q = q.gte("order_date", data.from);
    if (data.to) q = q.lte("order_date", data.to);
    if (data.q) q = q.or(`po_number.ilike.%${data.q}%`);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const getPurchaseOrderDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { poId: string }) =>
    z.object({ poId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const [poRes, itemsRes, cartonsRes, paymentsRes, historyRes, releasesRes] = await Promise.all([
      context.supabase.from("imp_purchase_orders").select(`
        id, po_number, brand_id, supplier_id, order_date,
        currency, fx_rate, receive_mode,
        product_subtotal_bdt, shipping_total_bdt, local_courier_total_bdt,
        grand_total_bdt, paid_bdt, due_bdt, status, notes, created_at,
        fx_rate_cny_bdt, fx_rate_locked_at, fx_rate_source,
        freight_cost_bdt, customs_duty_bdt, other_charges_bdt,
        total_units, landed_cost_per_unit_bdt,
        shipping_weight_kg, shipping_rate_per_kg, shipping_cost_bdt,
        agent_commission_cny, agent_commission_per_unit_bdt, agent_commission_total_bdt,
        supplier:supplier_id ( id, name, phone, source_link, address, currency )
      `).eq("id", data.poId).maybeSingle(),
      context.supabase.from("imp_po_items").select(`
        id, product_id, variant_id, sku_snapshot, name_snapshot, image_snapshot,
        quantity, unit_cost_foreign, unit_cost_bdt, subtotal_bdt,
        unit_cost_cny, landed_cost_bdt,
        product:product_id ( id, title, image, sku )
      `).eq("po_id", data.poId).order("created_at"),
      context.supabase.from("imp_cartons").select(`
        id, carton_number, barcode, expected_quantity,
        supplier_cost_bdt, shipping_charge_bdt, local_courier_bdt, total_landed_bdt, paid_bdt,
        weight_kg, cost_share_bdt, status, warehouse_id, received_at, released_at, qc_at, posted_at, notes,
        items:imp_carton_items ( id, po_item_id, product_id, variant_id, sku_snapshot,
          quantity_expected, quantity_ok, quantity_damaged, quantity_missing,
          received_qty, damaged_qty, usable_qty,
          product:product_id ( id, title, image, sku ),
          variant:variant_id ( id, sku, color_name, color_hex, image ) )
      `).eq("po_id", data.poId).order("carton_number"),
      context.supabase.from("imp_payments").select(`
        id, carton_id, payment_type, amount_bdt, wallet_id, payment_date, reference,
        notes, journal_entry_id, is_reversed, created_at,
        wallet:wallet_id ( id, name )
      `).eq("po_id", data.poId).order("payment_date", { ascending: false }),
      context.supabase.from("imp_status_history").select(`
        id, entity_type, entity_id, previous_status, new_status, action, notes, created_at, changed_by
      `).or(`and(entity_type.eq.po,entity_id.eq.${data.poId})`)
        .order("created_at", { ascending: false })
        .limit(100),
      context.supabase.from("imp_po_releases").select(`
        id, release_number, warehouse_id, released_at, notes, created_at,
        items:imp_po_release_items ( id, po_item_id, product_id, variant_id, sku_snapshot,
          quantity, damaged_qty, unit_landed_cost_bdt )
      `).eq("po_id", data.poId).order("release_number"),
    ]);
    if (poRes.error) throw poRes.error;
    if (itemsRes.error) throw itemsRes.error;
    if (cartonsRes.error) throw cartonsRes.error;
    if (paymentsRes.error) throw paymentsRes.error;
    return {
      po: poRes.data,
      items: itemsRes.data ?? [],
      cartons: cartonsRes.data ?? [],
      payments: paymentsRes.data ?? [],
      history: historyRes.data ?? [],
      releases: releasesRes.data ?? [],
    };
  });

export const listImportSuppliers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId?: string; brandIds?: string[] }) =>
    z.object({
      brandId: z.string().uuid().optional(),
      brandIds: z.array(z.string().uuid()).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("erp_suppliers")
      .select(`
        id, brand_id, name, phone, address, source_link, country, currency,
        payment_terms_days, credit_limit_bdt, supplier_type, is_active,
        current_due, opening_balance, notes,
        brand:brand_id ( id, name, slug )
      `)
      .in("supplier_type", ["import", "both"])
      .order("name");
    if (data.brandIds && data.brandIds.length > 0) q = q.in("brand_id", data.brandIds);
    else if (data.brandId) q = q.eq("brand_id", data.brandId);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const listWarehouses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId: string }) =>
    z.object({ brandId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("warehouses")
      .select("id, name, code, is_default, is_active")
      .eq("brand_id", data.brandId)
      .order("is_default", { ascending: false })
      .order("name");
    if (error) throw error;
    return rows ?? [];
  });

export const getImportsDashboardStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId?: string; brandIds?: string[]; from?: string; to?: string }) =>
    z.object({
      brandId: z.string().uuid().optional(),
      brandIds: z.array(z.string().uuid()).optional(),
      from: z.string().optional(),
      to: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("imp_purchase_orders")
      .select(`id, brand_id, status, grand_total_bdt, paid_bdt, due_bdt,
               product_subtotal_bdt, shipping_total_bdt, local_courier_total_bdt,
               supplier:supplier_id ( id, name ),
               brand:brand_id ( id, name, slug )`);
    if (data.brandIds && data.brandIds.length > 0) q = q.in("brand_id", data.brandIds);
    else if (data.brandId) q = q.eq("brand_id", data.brandId);
    if (data.from) q = q.gte("order_date", data.from);
    if (data.to) q = q.lte("order_date", data.to);
    const { data: pos, error } = await q;
    if (error) throw error;

    const poIds = (pos ?? []).map((p: any) => p.id);
    let cartons: any[] = [];
    if (poIds.length > 0) {
      const { data: cRows, error: cErr } = await context.supabase
        .from("imp_cartons")
        .select("id, po_id, status, expected_quantity")
        .in("po_id", poIds);
      if (cErr) throw cErr;
      cartons = cRows ?? [];
    }
    return { pos: pos ?? [], cartons };
  });

/* ============================================================
   WRITE-side server functions (call RPCs)
   ============================================================ */

/* --- Suppliers (import) --- */

export const upsertImportSupplier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id?: string;
    brandId: string;
    name: string;
    phone?: string;
    address?: string;
    source_link?: string;
    country?: string;
    currency?: string;
    payment_terms_days?: number;
    credit_limit_bdt?: number;
    supplier_type?: "import" | "local" | "both";
    is_active?: boolean;
    notes?: string;
  }) =>
    z.object({
      id: z.string().uuid().optional(),
      brandId: z.string().uuid(),
      name: z.string().min(1).max(120),
      phone: z.string().optional(),
      address: z.string().optional(),
      source_link: z.string().optional(),
      country: z.string().max(8).optional(),
      currency: z.string().max(8).optional(),
      payment_terms_days: z.number().int().nonnegative().optional(),
      credit_limit_bdt: z.number().nonnegative().optional(),
      supplier_type: z.enum(["import", "local", "both"]).optional(),
      is_active: z.boolean().optional(),
      notes: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.supabase, context.userId, ["admin", "operations", "accountant"]);
    const payload: any = {
      brand_id: data.brandId,
      name: data.name,
      phone: data.phone ?? null,
      address: data.address ?? null,
      source_link: data.source_link ?? null,
      country: data.country ?? "CN",
      currency: data.currency ?? "CNY",
      payment_terms_days: data.payment_terms_days ?? 0,
      credit_limit_bdt: data.credit_limit_bdt ?? 0,
      supplier_type: data.supplier_type ?? "import",
      is_active: data.is_active ?? true,
      notes: data.notes ?? null,
    };
    if (data.id) {
      const { error } = await context.supabase.from("erp_suppliers").update(payload).eq("id", data.id);
      if (error) throw error;
      return { id: data.id };
    } else {
      const { data: row, error } = await context.supabase.from("erp_suppliers").insert(payload).select("id").single();
      if (error) throw error;
      return { id: row.id };
    }
  });

/* --- PO create --- */

const poItemSchema = z.object({
  product_id: z.string().uuid().optional(),
  variant_id: z.string().uuid().optional(),
  sku_snapshot: z.string().optional(),
  name_snapshot: z.string().min(1),
  image_snapshot: z.string().optional(),
  quantity: z.number().int().positive(),
  unit_cost_foreign: z.number().nonnegative(),
});

const cartonAllocSchema = z.object({
  item_index: z.number().int().nonnegative(),
  quantity: z.number().int().nonnegative(),
});

const cartonSchema = z.object({
  carton_number: z.number().int().positive(),
  weight_kg: z.number().nonnegative().optional(),
  allocations: z.array(cartonAllocSchema),
});

const initialPaymentSchema = z.object({
  amount_bdt: z.number().positive(),
  wallet_id: z.string().uuid(),
  payment_date: z.string(),
  reference: z.string().optional(),
  notes: z.string().optional(),
  idempotency_key: z.string().min(8),
  payment_type: z.enum(["supplier_advance", "supplier_payment"]).optional(),
});

const supplierInlineSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().optional(),
  source_link: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
  country: z.string().optional(),
  currency: z.string().optional(),
  payment_terms_days: z.number().int().nonnegative().optional(),
  credit_limit_bdt: z.number().nonnegative().optional(),
  supplier_type: z.enum(["import", "local", "both"]).optional(),
});

export const createImportPo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      brand_id: z.string().uuid(),
      order_date: z.string(),
      currency: z.string().default("CNY"),
      fx_rate: z.number().positive(),
      notes: z.string().optional(),
      supplier: supplierInlineSchema.optional(),
      items: z.array(poItemSchema).min(1),
      cartons: z.array(cartonSchema).default([]),
      receive_mode: z.enum(["carton", "quantity"]).default("carton"),
      initial_payment: initialPaymentSchema.optional(),
      idempotency_key: z.string().min(8),
    }).refine((v) => v.receive_mode === "quantity" || v.cartons.length > 0, {
      message: "cartons required in carton mode",
      path: ["cartons"],
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.supabase, context.userId, ["admin", "operations", "accountant"]);
    const { data: out, error } = await context.supabase.rpc("imp_create_po", { _payload: data });
    if (error) throw error;
    return out;
  });

/* ============================================================
   Landed cost calculator (additive)
   ============================================================ */

export const getLatestFxRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId: string; from?: string; to?: string }) =>
    z.object({
      brandId: z.string().uuid(),
      from: z.string().default("CNY"),
      to: z.string().default("BDT"),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("erp_fx_rates")
      .select("rate, rate_date")
      .eq("brand_id", data.brandId)
      .eq("from_ccy", data.from)
      .eq("to_ccy", data.to)
      .order("rate_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    return row ?? null;
  });

const landedItemSchema = z.object({
  id: z.string().uuid(),
  unit_cost_cny: z.number().nonnegative(),
});

export const updatePoLandedCost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      po_id: z.string().uuid(),
      fx_rate_cny_bdt: z.number().positive(),
      fx_rate_source: z.enum(["manual", "auto"]).default("manual"),
      freight_cost_bdt: z.number().nonnegative().default(0),
      customs_duty_bdt: z.number().nonnegative().default(0),
      other_charges_bdt: z.number().nonnegative().default(0),
      agent_commission_cny: z.number().nonnegative().default(0),
      items: z.array(landedItemSchema).default([]),
      lock_rate: z.boolean().default(true),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.supabase, context.userId, ["admin", "operations", "accountant"]);

    // Load existing items to combine quantity for allocation math
    const { data: existingItems, error: ie } = await context.supabase
      .from("imp_po_items")
      .select("id, quantity")
      .eq("po_id", data.po_id);
    if (ie) throw ie;
    const qtyMap = new Map<string, number>((existingItems ?? []).map((r: any) => [r.id, Number(r.quantity) || 0]));

    // Compute per-item BDT and line values
    const fx = data.fx_rate_cny_bdt;
    const lines = data.items.map((it) => {
      const qty = qtyMap.get(it.id) ?? 0;
      const unit_cost_bdt = +(it.unit_cost_cny * fx).toFixed(4);
      const line_value = +(unit_cost_bdt * qty).toFixed(4);
      return { ...it, qty, unit_cost_bdt, line_value };
    });
    const total_value = lines.reduce((s, l) => s + l.line_value, 0);
    const total_units = lines.reduce((s, l) => s + l.qty, 0);
    const extras_total = data.freight_cost_bdt + data.customs_duty_bdt + data.other_charges_bdt;
    const commission_per_unit_bdt = +(data.agent_commission_cny * fx).toFixed(4);
    const commission_total_bdt = +(commission_per_unit_bdt * total_units).toFixed(4);

    // Update each item
    for (const l of lines) {
      const extras_share = total_value > 0 ? (l.line_value / total_value) * extras_total : (total_units > 0 ? (l.qty / total_units) * extras_total : 0);
      const landed_unit = l.qty > 0
        ? +(l.unit_cost_bdt + extras_share / l.qty + commission_per_unit_bdt).toFixed(4)
        : +(l.unit_cost_bdt + commission_per_unit_bdt).toFixed(4);
      const subtotal_bdt = +(l.line_value).toFixed(4);
      const { error: ue } = await context.supabase
        .from("imp_po_items")
        .update({
          unit_cost_cny: l.unit_cost_cny,
          unit_cost_bdt: l.unit_cost_bdt,
          subtotal_bdt,
          landed_cost_bdt: landed_unit,
        })
        .eq("id", l.id);
      if (ue) throw ue;
    }

    const landed_cost_per_unit_bdt = total_units > 0
      ? +(((total_value + extras_total) / total_units) + commission_per_unit_bdt).toFixed(4)
      : 0;

    const { error: pe } = await context.supabase
      .from("imp_purchase_orders")
      .update({
        fx_rate_cny_bdt: fx,
        fx_rate_source: data.fx_rate_source,
        fx_rate_locked_at: data.lock_rate ? new Date().toISOString() : null,
        freight_cost_bdt: data.freight_cost_bdt,
        customs_duty_bdt: data.customs_duty_bdt,
        other_charges_bdt: data.other_charges_bdt,
        agent_commission_cny: data.agent_commission_cny,
        agent_commission_per_unit_bdt: commission_per_unit_bdt,
        agent_commission_total_bdt: commission_total_bdt,
        total_units,
        landed_cost_per_unit_bdt,
      })
      .eq("id", data.po_id);
    if (pe) throw pe;

    return {
      ok: true,
      total_units,
      total_value,
      extras_total,
      commission_per_unit_bdt,
      commission_total_bdt,
      landed_cost_per_unit_bdt,
    };
  });

/* --- Cost Analysis Report --- */

export const getImportCostAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId: string; dateFrom?: string; dateTo?: string }) =>
    z.object({
      brandId: z.string().uuid(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("imp_purchase_orders")
      .select(`
        id, po_number, order_date,
        fx_rate_cny_bdt, freight_cost_bdt, customs_duty_bdt, other_charges_bdt,
        total_units, landed_cost_per_unit_bdt, grand_total_bdt,
        supplier:supplier_id ( id, name ),
        items:imp_po_items (
          id, product_id, quantity, unit_cost_cny, unit_cost_bdt, landed_cost_bdt,
          product:product_id ( id, name, price )
        )
      `)
      .eq("brand_id", data.brandId)
      .order("order_date", { ascending: true })
      .limit(500);
    if (data.dateFrom) q = q.gte("order_date", data.dateFrom);
    if (data.dateTo) q = q.lte("order_date", data.dateTo);
    const { data: rows, error } = await q;
    if (error) throw error;

    return (rows ?? []).map((po: any) => {
      const items = po.items ?? [];
      const total_units = items.reduce((s: number, it: any) => s + Number(it.quantity || 0), 0)
        || Number(po.total_units || 0);
      const product_cost_cny = items.reduce((s: number, it: any) =>
        s + Number(it.unit_cost_cny || 0) * Number(it.quantity || 0), 0);
      const fx = Number(po.fx_rate_cny_bdt || 0);
      const product_cost_bdt = items.reduce((s: number, it: any) =>
        s + Number(it.unit_cost_bdt || 0) * Number(it.quantity || 0), 0)
        || product_cost_cny * fx;
      const freight = Number(po.freight_cost_bdt || 0);
      const customs = Number(po.customs_duty_bdt || 0);
      const other = Number(po.other_charges_bdt || 0);
      const total_landed = product_cost_bdt + freight + customs + other;
      const landed_per_unit = Number(po.landed_cost_per_unit_bdt || 0)
        || (total_units > 0 ? total_landed / total_units : 0);

      // weighted avg sell price across items
      let weightedPrice = 0, weight = 0;
      const productNames: string[] = [];
      items.forEach((it: any) => {
        const qty = Number(it.quantity || 0);
        const price = Number(it.product?.price || 0);
        if (price > 0 && qty > 0) { weightedPrice += price * qty; weight += qty; }
        if (it.product?.name) productNames.push(it.product.name);
      });
      const avg_sell_price = weight > 0 ? weightedPrice / weight : 0;
      const margin_pct = avg_sell_price > 0
        ? ((avg_sell_price - landed_per_unit) / avg_sell_price) * 100
        : 0;

      return {
        po_id: po.id,
        po_number: po.po_number,
        order_date: po.order_date,
        supplier_name: po.supplier?.name ?? "—",
        total_units,
        product_cost_cny: +product_cost_cny.toFixed(2),
        fx_rate_cny_bdt: fx,
        product_cost_bdt: +product_cost_bdt.toFixed(2),
        freight_cost_bdt: freight,
        customs_duty_bdt: customs,
        other_charges_bdt: other,
        total_landed_cost_bdt: +total_landed.toFixed(2),
        landed_cost_per_unit_bdt: +landed_per_unit.toFixed(2),
        avg_sell_price: +avg_sell_price.toFixed(2),
        margin_pct: +margin_pct.toFixed(2),
        product_names: productNames,
      };
    });
  });

/* --- Product picker + quick create (for New PO page) --- */

export const listProductsForPicker = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId: string; search?: string }) =>
    z.object({
      brandId: z.string().uuid(),
      search: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("products")
      .select("id,title,slug,image,sku,stock,cost_price")
      .eq("brand_id", data.brandId)
      .order("updated_at", { ascending: false })
      .limit(50);
    if (data.search && data.search.trim()) {
      const s = data.search.trim();
      q = q.or(`title.ilike.%${s}%,sku.ilike.%${s}%,slug.ilike.%${s}%`);
    }
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const quickCreateProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId: string; title: string; sku?: string; image?: string }) =>
    z.object({
      brandId: z.string().uuid(),
      title: z.string().min(1).max(160),
      sku: z.string().max(64).optional(),
      image: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.supabase, context.userId, ["admin", "operations", "accountant"]);
    const { data: out, error } = await context.supabase.rpc("imp_quick_create_product", {
      _brand: data.brandId,
      _title: data.title,
      _sku: data.sku ?? undefined,
      _image: data.image ?? undefined,
    });
    if (error) throw error;
    return out as { id: string; title: string; slug: string };
  });

/* --- carton stage update --- */

export const updateCartonStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { carton_id: string; new_stage: string; notes?: string }) =>
    z.object({
      carton_id: z.string().uuid(),
      new_stage: z.enum(["ordered", "at_china_warehouse", "in_transit", "cancelled"]),
      notes: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.supabase, context.userId, ["admin", "operations", "warehouse_staff"]);
    const { error } = await context.supabase.rpc("imp_update_carton_stage", {
      _carton: data.carton_id,
      _new_stage: data.new_stage,
      _notes: data.notes ?? undefined,
    });
    if (error) throw error;
    return { ok: true };
  });

/* --- mark arrived in BD --- */

export const markArrivedInBd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      po_id: z.string().uuid(),
      total_weight_kg: z.number().positive(),
      rate_per_kg_bdt: z.number().positive(),
      shipping_payment: z.object({
        amount: z.number().positive(),
        wallet_id: z.string().uuid(),
        payment_date: z.string(),
        reference: z.string().optional(),
        notes: z.string().optional(),
        idempotency_key: z.string().min(8),
      }).optional(),
      idempotency_key: z.string().min(8),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.supabase, context.userId, ["admin", "operations", "accountant"]);
    const { data: out, error } = await context.supabase.rpc("imp_mark_arrived", { _payload: data });
    if (error) throw error;
    return out;
  });

/* --- release carton --- */

export const releaseCarton = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      carton_id: z.string().uuid(),
      release_without_payment: z.boolean().optional(),
      payment: z.object({
        amount: z.number().positive(),
        wallet_id: z.string().uuid(),
        payment_date: z.string(),
        reference: z.string().optional(),
        notes: z.string().optional(),
        idempotency_key: z.string().min(8),
      }).optional(),
      notes: z.string().optional(),
      idempotency_key: z.string().min(8),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.supabase, context.userId, ["admin", "operations", "accountant", "warehouse_staff"]);
    const { data: out, error } = await context.supabase.rpc("imp_release_carton", { _payload: data });
    if (error) throw error;
    return out;
  });

/* --- post to inventory (QC) --- */

const qcRow = z.object({
  carton_item_id: z.string().uuid(),
  quantity_ok: z.number().int().nonnegative(),
  quantity_damaged: z.number().int().nonnegative(),
  quantity_missing: z.number().int().nonnegative(),
});

const optPay = z.object({
  amount: z.number().positive(),
  wallet_id: z.string().uuid(),
  payment_date: z.string(),
  reference: z.string().optional(),
  notes: z.string().optional(),
  idempotency_key: z.string().min(8),
}).optional();

export const postCartonToInventory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      carton_id: z.string().uuid(),
      warehouse_id: z.string().uuid().optional(),
      qc: z.array(qcRow).min(1),
      local_courier_payment: optPay,
      supplier_due_payment: optPay,
      due_override_reason: z.string().optional(),
      notes: z.string().optional(),
      idempotency_key: z.string().min(8),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.supabase, context.userId, ["admin", "operations", "warehouse_staff"]);
    const { data: out, error } = await context.supabase.rpc("imp_post_to_inventory", { _payload: data });
    if (error) throw error;
    return out;
  });

/* --- standalone payment --- */

export const recordImportPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      brand_id: z.string().uuid(),
      po_id: z.string().uuid(),
      carton_id: z.string().uuid().optional(),
      payment_type: z.enum([
        "supplier_advance", "supplier_payment", "shipping",
        "carton_release", "supplier_balance", "local_courier", "adjustment",
      ]),
      amount_bdt: z.number().positive(),
      wallet_id: z.string().uuid(),
      payment_date: z.string(),
      reference: z.string().optional(),
      notes: z.string().optional(),
      idempotency_key: z.string().min(8),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.supabase, context.userId, ["admin", "accountant"]);
    const { data: out, error } = await context.supabase.rpc("imp_record_payment_rpc", { _payload: data });
    if (error) throw error;
    return out;
  });

/* --- pay carton-level due later (after release-without-payment) --- */

export const payCartonDue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      carton_id: z.string().uuid(),
      amount: z.number().positive(),
      wallet_id: z.string().uuid(),
      payment_date: z.string(),
      reference: z.string().optional(),
      notes: z.string().optional(),
      idempotency_key: z.string().min(8),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.supabase, context.userId, ["admin", "operations", "accountant"]);
    const { data: out, error } = await context.supabase.rpc("imp_pay_carton_due", { _payload: data });
    if (error) throw error;
    return out;
  });

/* ============================================================
   SIMPLIFIED LANDED COST WORKFLOW (additive)
   ============================================================ */

async function recomputeCartonCostSharesInternal(supabase: any, po_id: string) {
  const { data: po, error: pErr } = await supabase
    .from("imp_purchase_orders")
    .select("shipping_cost_bdt")
    .eq("id", po_id)
    .maybeSingle();
  if (pErr) throw pErr;
  const shippingTotal = Number(po?.shipping_cost_bdt ?? 0);

  const { data: cartons, error: cErr } = await supabase
    .from("imp_cartons")
    .select("id, weight_kg")
    .eq("po_id", po_id);
  if (cErr) throw cErr;
  const list = cartons ?? [];
  if (list.length === 0) return { updated: 0, shipping_total: shippingTotal };

  const totalWeight = list.reduce((s: number, c: any) => s + Number(c.weight_kg || 0), 0);
  const useWeight = totalWeight > 0;

  for (const c of list) {
    const share = useWeight
      ? (Number(c.weight_kg || 0) / totalWeight) * shippingTotal
      : shippingTotal / list.length;
    const { error: uErr } = await supabase
      .from("imp_cartons")
      .update({ cost_share_bdt: +share.toFixed(4) })
      .eq("id", c.id);
    if (uErr) throw uErr;
  }
  return { updated: list.length, shipping_total: shippingTotal };
}

export const saveShippingCost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      po_id: z.string().uuid(),
      shipping_weight_kg: z.number().nonnegative(),
      shipping_rate_per_kg: z.number().nonnegative(),
      other_charges_bdt: z.number().nonnegative().default(0),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.supabase, context.userId, ["admin", "operations", "accountant"]);
    const shipping_cost_bdt = +(data.shipping_weight_kg * data.shipping_rate_per_kg).toFixed(4);
    const { error } = await context.supabase
      .from("imp_purchase_orders")
      .update({
        shipping_weight_kg: data.shipping_weight_kg,
        shipping_rate_per_kg: data.shipping_rate_per_kg,
        shipping_cost_bdt,
        other_charges_bdt: data.other_charges_bdt,
      })
      .eq("id", data.po_id);
    if (error) throw error;
    const recompute = await recomputeCartonCostSharesInternal(context.supabase, data.po_id);
    return { ok: true, shipping_cost_bdt, ...recompute };
  });

export const saveCartonWeight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      carton_id: z.string().uuid(),
      po_id: z.string().uuid(),
      weight_kg: z.number().nonnegative(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.supabase, context.userId, ["admin", "operations", "warehouse_staff"]);
    const { error } = await context.supabase
      .from("imp_cartons")
      .update({ weight_kg: data.weight_kg })
      .eq("id", data.carton_id);
    if (error) throw error;
    const recompute = await recomputeCartonCostSharesInternal(context.supabase, data.po_id);
    return { ok: true, ...recompute };
  });

export const saveCartonReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      carton_id: z.string().uuid(),
      items: z.array(z.object({
        carton_item_id: z.string().uuid(),
        received_qty: z.number().int().nonnegative(),
        damaged_qty: z.number().int().nonnegative().default(0),
      })).min(1),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.supabase, context.userId, ["admin", "operations", "warehouse_staff"]);
    for (const it of data.items) {
      const { error } = await context.supabase
        .from("imp_carton_items")
        .update({ received_qty: it.received_qty, damaged_qty: it.damaged_qty })
        .eq("id", it.carton_item_id)
        .eq("carton_id", data.carton_id);
      if (error) throw error;
    }
    return { ok: true, updated: data.items.length };
  });

export const postCartonReceiptToInventory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      carton_id: z.string().uuid(),
      warehouse_id: z.string().uuid(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.supabase, context.userId, ["admin", "operations", "warehouse_staff"]);

    // Load carton + items
    const { data: carton, error: cErr } = await context.supabase
      .from("imp_cartons")
      .select("id, po_id, cost_share_bdt, status, brand_id:po_id")
      .eq("id", data.carton_id)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!carton) throw new Error("Carton not found");

    const { data: items, error: iErr } = await context.supabase
      .from("imp_carton_items")
      .select("id, po_item_id, product_id, variant_id, sku_snapshot, received_qty, damaged_qty, usable_qty")
      .eq("carton_id", data.carton_id);
    if (iErr) throw iErr;
    const list = items ?? [];
    if (list.length === 0) throw new Error("No carton items");

    // Load PO for fx + other_charges + brand
    const { data: po, error: pErr } = await context.supabase
      .from("imp_purchase_orders")
      .select("id, brand_id, fx_rate_cny_bdt, fx_rate, other_charges_bdt, agent_commission_per_unit_bdt")
      .eq("id", (carton as any).po_id)
      .maybeSingle();
    if (pErr) throw pErr;
    if (!po) throw new Error("PO not found");
    const fx = Number((po as any).fx_rate_cny_bdt ?? (po as any).fx_rate ?? 0);
    const commissionPerUnit = Number((po as any).agent_commission_per_unit_bdt ?? 0);

    // Load po_items for unit_cost_cny
    const poItemIds = list.map((r: any) => r.po_item_id).filter(Boolean);
    const { data: poItems, error: piErr } = await context.supabase
      .from("imp_po_items")
      .select("id, unit_cost_cny, unit_cost_foreign")
      .in("id", poItemIds);
    if (piErr) throw piErr;
    const piMap = new Map<string, any>((poItems ?? []).map((r: any) => [r.id, r]));

    // Totals for share allocation
    const totalUsableInCarton = list.reduce((s: number, r: any) => s + Number(r.usable_qty ?? 0), 0);
    const cartonShipShare = Number((carton as any).cost_share_bdt ?? 0);
    const shipPerUnit = totalUsableInCarton > 0 ? cartonShipShare / totalUsableInCarton : 0;

    // For "other_share" we need total usable across PO
    const { data: allCartonItems, error: acErr } = await context.supabase
      .from("imp_carton_items")
      .select("usable_qty, carton:carton_id!inner ( po_id )")
      .eq("carton.po_id", (carton as any).po_id);
    if (acErr) throw acErr;
    const totalUsableInPo = (allCartonItems ?? []).reduce((s: number, r: any) => s + Number(r.usable_qty ?? 0), 0);
    const otherCharges = Number((po as any).other_charges_bdt ?? 0);
    const otherPerUnit = totalUsableInPo > 0 ? otherCharges / totalUsableInPo : 0;

    const movements: any[] = [];
    const damagedLogs: any[] = [];

    for (const it of list) {
      const usable = Number(it.usable_qty ?? 0);
      const damaged = Number(it.damaged_qty ?? 0);
      const pi = piMap.get(it.po_item_id);
      const unitCny = Number(pi?.unit_cost_cny ?? pi?.unit_cost_foreign ?? 0);
      const productCost = unitCny * fx;
      const landed = +(productCost + shipPerUnit + otherPerUnit + commissionPerUnit).toFixed(4);

      if (usable > 0) {
        const { data: movId, error: aErr } = await context.supabase.rpc("adjust_stock_v2", {
          _product_id: it.product_id as string,
          _variant_id: it.variant_id as string,
          _delta: usable,
          _reason: "import_receive",
          _source: "import",
          _unit_cost: landed,
          _reference_type: "imp_carton",
          _reference_id: data.carton_id,
          _idempotency_key: `imp_recv:${data.carton_id}:${it.id}`,
          _note: `Carton receipt — landed ৳${landed.toFixed(2)}/pc`,
        });
        if (aErr) throw aErr;
        movements.push({ carton_item_id: it.id, qty: usable, unit_cost: landed, movement_id: movId });
      }

      if (damaged > 0) {
        // Per plan — damaged logged to activity_log only, no stock movement
        damagedLogs.push({
          carton_item_id: it.id,
          product_id: it.product_id,
          variant_id: it.variant_id,
          damaged_qty: damaged,
        });
      }
    }

    if (damagedLogs.length > 0) {
      try {
        await context.supabase.from("activity_log").insert({
          entity_type: "imp_carton",
          entity_id: data.carton_id,
          action: "import_carton_damaged",
          performed_by: context.userId,
          details: { damaged: damagedLogs, brand_id: (po as any).brand_id } as any,
        });
      } catch { /* non-fatal */ }
    }

    // Mark carton posted + in_stock
    const { error: upErr } = await context.supabase
      .from("imp_cartons")
      .update({ posted_at: new Date().toISOString(), status: "in_stock", warehouse_id: data.warehouse_id })
      .eq("id", data.carton_id);
    if (upErr) throw upErr;

    return {
      ok: true,
      movements,
      damaged: damagedLogs,
      totals: {
        usable_units: totalUsableInCarton,
        ship_per_unit: +shipPerUnit.toFixed(4),
        other_per_unit: +otherPerUnit.toFixed(4),
        commission_per_unit: +commissionPerUnit.toFixed(4),
      },
    };
  });
/* ============================================================
   Cargo Agents (additive)
   ============================================================ */

export const listCargoAgents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId?: string; brandIds?: string[]; activeOnly?: boolean }) =>
    z.object({
      brandId: z.string().uuid().optional(),
      brandIds: z.array(z.string().uuid()).optional(),
      activeOnly: z.boolean().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("imp_cargo_agents")
      .select("id, brand_id, name, contact_person, phone, address, notes, is_active, created_at, brand:brand_id ( id, name, slug )")
      .order("is_active", { ascending: false })
      .order("name");
    if (data.brandIds && data.brandIds.length > 0) {
      const inList = data.brandIds.map((id) => `brand_id.eq.${id}`).join(",");
      q = q.or(`${inList},brand_id.is.null`);
    } else if (data.brandId) {
      q = q.or(`brand_id.eq.${data.brandId},brand_id.is.null`);
    }
    if (data.activeOnly) q = q.eq("is_active", true);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const upsertCargoAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id?: string;
    brandId: string | null;
    name: string;
    contact_person?: string;
    phone?: string;
    address?: string;
    notes?: string;
    is_active?: boolean;
  }) =>
    z.object({
      id: z.string().uuid().optional(),
      brandId: z.string().uuid().nullable(),
      name: z.string().min(1).max(160),
      contact_person: z.string().optional(),
      phone: z.string().optional(),
      address: z.string().optional(),
      notes: z.string().optional(),
      is_active: z.boolean().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.supabase, context.userId, ["admin", "operations"]);
    const payload: any = {
      brand_id: data.brandId,
      name: data.name,
      contact_person: data.contact_person ?? null,
      phone: data.phone ?? null,
      address: data.address ?? null,
      notes: data.notes ?? null,
      is_active: data.is_active ?? true,
    };
    if (data.id) {
      const { error } = await context.supabase.from("imp_cargo_agents").update(payload).eq("id", data.id);
      if (error) throw error;
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("imp_cargo_agents").insert(payload).select("id").single();
    if (error) throw error;
    return { id: row.id };
  });

export const setPoCargoAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { po_id: string; cargo_agent_id: string | null }) =>
    z.object({
      po_id: z.string().uuid(),
      cargo_agent_id: z.string().uuid().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.supabase, context.userId, ["admin", "operations", "accountant"]);
    const { error } = await context.supabase
      .from("imp_purchase_orders")
      .update({ cargo_agent_id: data.cargo_agent_id })
      .eq("id", data.po_id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteCargoAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; force?: boolean }) =>
    z.object({ id: z.string().uuid(), force: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.supabase, context.userId, ["admin", "operations"]);
    const { count, error: cErr } = await context.supabase
      .from("imp_purchase_orders")
      .select("id", { count: "exact", head: true })
      .eq("cargo_agent_id", data.id);
    if (cErr) throw cErr;
    if ((count ?? 0) > 0) {
      if (!data.force) {
        throw new Error(`Cannot delete: ${count} purchase order(s) use this agent. Use force delete to detach and remove.`);
      }
      const { error: upErr } = await context.supabase
        .from("imp_purchase_orders")
        .update({ cargo_agent_id: null })
        .eq("cargo_agent_id", data.id);
      if (upErr) throw upErr;
    }
    const { error } = await context.supabase.from("imp_cargo_agents").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const getCargoAgentDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId?: string | null; brandIds?: string[] }) =>
    z.object({
      brandId: z.string().uuid().nullable().optional(),
      brandIds: z.array(z.string().uuid()).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const ids = (data.brandIds && data.brandIds.length > 0)
      ? data.brandIds
      : (data.brandId ? [data.brandId] : []);
    if (ids.length === 0) return [];
    const [agentsRes, posRes] = await Promise.all([
      context.supabase
        .from("imp_cargo_agents")
        .select("id, name, phone, contact_person, is_active")
        .in("brand_id", ids)
        .order("name"),
      context.supabase
        .from("imp_purchase_orders")
        .select("id, po_number, order_date, status, cargo_agent_id, shipping_total_bdt, shipping_cost_bdt, paid_bdt, grand_total_bdt, due_bdt")
        .in("brand_id", ids)
        .not("cargo_agent_id", "is", null),
    ]);
    if (agentsRes.error) throw agentsRes.error;
    if (posRes.error) throw posRes.error;
    const agents = (agentsRes.data ?? []) as any[];
    const pos = (posRes.data ?? []) as any[];
    const byAgent: Record<string, any[]> = {};
    for (const p of pos) {
      const k = p.cargo_agent_id as string;
      (byAgent[k] ||= []).push(p);
    }
    return agents.map((a: any) => {
      const list = byAgent[a.id] ?? [];
      const shipping = list.reduce((s, p) => s + Number(p.shipping_total_bdt ?? p.shipping_cost_bdt ?? 0), 0);
      const paid = list.reduce((s, p) => s + Number(p.paid_bdt ?? 0), 0);
      const grand = list.reduce((s, p) => s + Number(p.grand_total_bdt ?? 0), 0);
      const due = list.reduce((s, p) => s + Number(p.due_bdt ?? 0), 0);
      return {
        agent: a,
        po_count: list.length,
        shipping_total: +shipping.toFixed(2),
        paid_total: +paid.toFixed(2),
        grand_total: +grand.toFixed(2),
        due_total: +due.toFixed(2),
        pos: list,
      };
    });
  });

/* ============================================================
   Quantity-mode releases (no cartons) — partial release to stock
   ============================================================ */

export const releasePoQuantity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      po_id: z.string().uuid(),
      warehouse_id: z.string().uuid().optional(),
      notes: z.string().optional(),
      items: z.array(z.object({
        po_item_id: z.string().uuid(),
        quantity: z.number().int().nonnegative(),
        damaged_qty: z.number().int().nonnegative().default(0),
      })).min(1),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.supabase, context.userId, ["admin", "operations", "warehouse_staff"]);

    const { data: po, error: pErr } = await context.supabase
      .from("imp_purchase_orders")
      .select("id, brand_id, status, receive_mode, fx_rate, fx_rate_cny_bdt, shipping_cost_bdt, freight_cost_bdt, customs_duty_bdt, other_charges_bdt, agent_commission_per_unit_bdt")
      .eq("id", data.po_id)
      .maybeSingle();
    if (pErr) throw pErr;
    if (!po) throw new Error("PO not found");

    const { data: poItems, error: iErr } = await context.supabase
      .from("imp_po_items")
      .select("id, product_id, variant_id, sku_snapshot, name_snapshot, quantity, unit_cost_cny, unit_cost_foreign")
      .eq("po_id", data.po_id);
    if (iErr) throw iErr;
    const itemMap = new Map<string, any>((poItems ?? []).map((r: any) => [r.id, r]));

    // Already released quantities
    const { data: prevReleases, error: rErr } = await context.supabase
      .from("imp_po_release_items")
      .select("po_item_id, quantity, damaged_qty, release:release_id!inner ( po_id )")
      .eq("release.po_id", data.po_id);
    if (rErr) throw rErr;
    const releasedMap = new Map<string, number>();
    for (const r of prevReleases ?? []) {
      const k = (r as any).po_item_id as string;
      releasedMap.set(k, (releasedMap.get(k) ?? 0) + Number((r as any).quantity ?? 0) + Number((r as any).damaged_qty ?? 0));
    }

    const lines = data.items.filter((l) => l.quantity > 0 || l.damaged_qty > 0);
    if (lines.length === 0) throw new Error("Nothing to release");

    for (const l of lines) {
      const pi = itemMap.get(l.po_item_id);
      if (!pi) throw new Error("Item not part of this PO");
      const remaining = Number(pi.quantity ?? 0) - (releasedMap.get(l.po_item_id) ?? 0);
      if (l.quantity + l.damaged_qty > remaining) {
        throw new Error(`${pi.name_snapshot ?? "Item"}: only ${remaining} pcs remaining`);
      }
    }

    // Landed cost per unit
    const fx = Number((po as any).fx_rate_cny_bdt ?? (po as any).fx_rate ?? 0);
    const commissionPerUnit = Number((po as any).agent_commission_per_unit_bdt ?? 0);
    const overheadTotal =
      Number((po as any).shipping_cost_bdt ?? 0) +
      Number((po as any).freight_cost_bdt ?? 0) +
      Number((po as any).customs_duty_bdt ?? 0) +
      Number((po as any).other_charges_bdt ?? 0);
    const totalOrdered = (poItems ?? []).reduce((s: number, r: any) => s + Number(r.quantity ?? 0), 0);
    const overheadPerUnit = totalOrdered > 0 ? overheadTotal / totalOrdered : 0;

    // Next release number
    const { data: lastRel } = await context.supabase
      .from("imp_po_releases")
      .select("release_number")
      .eq("po_id", data.po_id)
      .order("release_number", { ascending: false })
      .limit(1);
    const nextNumber = Number((lastRel?.[0] as any)?.release_number ?? 0) + 1;

    const { data: release, error: relErr } = await context.supabase
      .from("imp_po_releases")
      .insert({
        po_id: data.po_id,
        brand_id: (po as any).brand_id,
        release_number: nextNumber,
        warehouse_id: data.warehouse_id ?? null,
        notes: data.notes ?? null,
        created_by: context.userId,
      })
      .select("id, release_number")
      .single();
    if (relErr) throw relErr;

    const movements: any[] = [];
    for (const l of lines) {
      const pi = itemMap.get(l.po_item_id);
      const unitCny = Number(pi?.unit_cost_cny ?? pi?.unit_cost_foreign ?? 0);
      const landed = +(unitCny * fx + overheadPerUnit + commissionPerUnit).toFixed(4);

      const { data: relItem, error: riErr } = await context.supabase
        .from("imp_po_release_items")
        .insert({
          release_id: (release as any).id,
          po_item_id: l.po_item_id,
          product_id: pi?.product_id ?? null,
          variant_id: pi?.variant_id ?? null,
          sku_snapshot: pi?.sku_snapshot ?? null,
          quantity: Math.max(1, l.quantity || 1),
          damaged_qty: l.damaged_qty ?? 0,
          unit_landed_cost_bdt: landed,
        })
        .select("id")
        .single();
      if (riErr) throw riErr;

      if (l.quantity > 0 && pi?.product_id) {
        const { data: movId, error: aErr } = await context.supabase.rpc("adjust_stock_v2", {
          _product_id: pi.product_id as string,
          _variant_id: (pi.variant_id ?? null) as any,
          _delta: l.quantity,
          _reason: "import_receive",
          _source: "import",
          _unit_cost: landed,
          _reference_type: "imp_po_release",
          _reference_id: (release as any).id,
          _idempotency_key: `imp_rel:${(release as any).id}:${(relItem as any).id}`,
          _note: `PO release #${nextNumber} — landed ${landed.toFixed(2)} BDT/pc`,
        });
        if (aErr) throw aErr;
        await context.supabase
          .from("imp_po_release_items")
          .update({ stock_movement_id: movId as any })
          .eq("id", (relItem as any).id);
        movements.push({ po_item_id: l.po_item_id, qty: l.quantity, unit_cost: landed, movement_id: movId });
      }
      releasedMap.set(l.po_item_id, (releasedMap.get(l.po_item_id) ?? 0) + l.quantity + (l.damaged_qty ?? 0));
    }

    // Update PO status based on total released
    const totalReleased = Array.from(releasedMap.values()).reduce((s, n) => s + n, 0);
    const nextStatus = totalReleased >= totalOrdered && totalOrdered > 0 ? "completed" : "partially_received";
    await context.supabase
      .from("imp_purchase_orders")
      .update({ status: nextStatus as any })
      .eq("id", data.po_id);

    return {
      ok: true,
      release_id: (release as any).id,
      release_number: nextNumber,
      movements,
      landed_per_unit_overhead: +overheadPerUnit.toFixed(4),
      status: nextStatus,
      total_released: totalReleased,
      total_ordered: totalOrdered,
    };
  });
