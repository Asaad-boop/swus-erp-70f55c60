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

/** Activity log — PO timeline er jonno (non-fatal) */
async function logPoEvent(
  supabase: any,
  userId: string,
  poId: string,
  action: string,
  details: Record<string, any>,
) {
  try {
    await supabase.from("activity_log").insert({
      entity_type: "imp_po",
      entity_id: poId,
      action,
      performed_by: userId,
      details: details as any,
    });
  } catch { /* non-fatal */ }
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
   Switch receive mode (carton <-> quantity) for an existing PO
   ============================================================ */

export const setPoReceiveMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { poId: string; mode: "carton" | "quantity" }) =>
    z.object({
      poId: z.string().uuid(),
      mode: z.enum(["carton", "quantity"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.supabase, context.userId, ["admin", "operations", "warehouse_staff"]);

    if (data.mode === "quantity") {
      const { data: cartons, error: cErr } = await context.supabase
        .from("imp_cartons")
        .select("id, status")
        .eq("po_id", data.poId);
      if (cErr) throw cErr;
      if ((cartons ?? []).some((c: any) => ["released", "in_stock"].includes(c.status))) {
        throw new Error("Kichu carton already stock e dhukeche — quantity mode e switch kora jabe na.");
      }
    } else {
      const { data: rel, error: rErr } = await context.supabase
        .from("imp_po_releases")
        .select("id")
        .eq("po_id", data.poId)
        .limit(1);
      if (rErr) throw rErr;
      if ((rel ?? []).length > 0) {
        throw new Error("Already quantity release kora hoyeche — carton mode e fera jabe na.");
      }
    }

    const { error } = await context.supabase
      .from("imp_purchase_orders")
      .update({ receive_mode: data.mode })
      .eq("id", data.poId);
    if (error) throw error;
    return { ok: true, mode: data.mode };
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
        agent:cargo_agent_id ( id, name ),
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
        local_delivery_total_bdt,
        agent_commission_cny, agent_commission_per_unit_bdt, agent_commission_total_bdt,
        supplier:supplier_id ( id, name, phone, source_link, address, currency )
      `).eq("id", data.poId).maybeSingle(),
      context.supabase.from("imp_po_items").select(`
        id, product_id, variant_id, sku_snapshot, name_snapshot, image_snapshot,
        quantity, unit_cost_foreign, unit_cost_bdt, subtotal_bdt,
        unit_cost_cny, landed_cost_bdt,
        product:product_id ( id, title, image, sku ),
        variant:variant_id ( id, sku, color_name, color_hex, image )
      `).eq("po_id", data.poId).order("created_at"),
      context.supabase.from("imp_cartons").select(`
        id, carton_number, barcode, expected_quantity,
        supplier_cost_bdt, shipping_charge_bdt, local_courier_bdt, total_landed_bdt, paid_bdt,
        weight_kg, cost_share_bdt, status, warehouse_id, received_at, released_at, qc_at, posted_at, notes,
        shipping_rate_per_kg, shipping_freight_bdt, shipping_billed_at, shipping_note,
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
        local_delivery_bdt, delivery_note,
        local_courier_bdt, local_courier_wallet_id, local_courier_payment_id,
        qc_local_courier_note, local_courier_source,
        shipping_weight_kg, shipping_rate_per_kg, shipping_charge_bdt, shipping_note, shipping_payment_id,
        qc_status, qc_at, qc_notes,
        items:imp_po_release_items ( id, po_item_id, product_id, variant_id, sku_snapshot,
          quantity, damaged_qty, missing_qty, unit_landed_cost_bdt, final_unit_cost_bdt, reserved_qty,
          qc_good_qty, qc_damaged_qty, qc_extra_qty,
          product:product_id ( id, title, image, sku ),
          variant:variant_id ( id, sku, color_name, color_hex, image ) )
      `).eq("po_id", data.poId).order("release_number"),
    ]);
    if (poRes.error) throw poRes.error;
    if (itemsRes.error) throw itemsRes.error;
    if (cartonsRes.error) throw cartonsRes.error;
    if (paymentsRes.error) throw paymentsRes.error;
    // Releases silently empty hoye gele "0 released" dekhato — tai error throw kori
    if (releasesRes.error) throw releasesRes.error;
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
      new_stage: z.enum(["ordered", "at_china_warehouse", "in_transit", "arrived_bd", "cancelled"]),
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
    await logPoEvent(context.supabase, context.userId, data.po_id, "po_received_bd", {
      group: "shipment",
      title: "BD te arrived mark kora hoyeche",
      detail: `${data.total_weight_kg} kg × ${data.rate_per_kg_bdt}৳/kg`,
      amount: +(data.total_weight_kg * data.rate_per_kg_bdt).toFixed(2),
    });
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

export const reverseImportPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      payment_id: z.string().uuid(),
      reason: z.string().max(300).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.supabase, context.userId, ["admin", "accountant"]);
    const { data: out, error } = await context.supabase.rpc("imp_reverse_payment", {
      _payment_id: data.payment_id,
      _reason: data.reason ?? undefined,
    });
    if (error) throw error;
    try {
      const { data: p } = await context.supabase
        .from("imp_payments").select("po_id, amount_bdt, payment_type").eq("id", data.payment_id).maybeSingle();
      if (p?.po_id) {
        await logPoEvent(context.supabase, context.userId, p.po_id, "po_payment_reversed", {
          group: "money",
          title: "Payment withdraw / reverse",
          detail: [p.payment_type, data.reason].filter(Boolean).join(" · ") || null,
          amount: Number(p.amount_bdt || 0),
        });
      }
    } catch { /* non-fatal */ }
    return out;
  });

/** Edit an existing payment = reverse the old one, then record a corrected one. */
export const editImportPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      payment_id: z.string().uuid(),
      brand_id: z.string().uuid(),
      po_id: z.string().uuid(),
      carton_id: z.string().uuid().nullable().optional(),
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
    // --- Balance guard: reverse korar age nishchit kori notun deduct er jonno taka ache ---
    const [{ data: oldPay }, { data: wal }] = await Promise.all([
      context.supabase.from("imp_payments").select("amount_bdt, wallet_id").eq("id", data.payment_id).maybeSingle(),
      context.supabase.from("erp_accounts").select("id, name, current_balance, is_active").eq("id", data.wallet_id).maybeSingle(),
    ]);
    if (!wal) throw new Error("Nirbachito wallet/account paoa jayni.");
    if (wal.is_active === false) throw new Error(`${wal.name} account ti inactive — onno account beche nin.`);
    const origAmt = Number(oldPay?.amount_bdt ?? 0);
    const sameWallet = oldPay?.wallet_id === data.wallet_id;
    const available = Number(wal.current_balance ?? 0) + (sameWallet ? origAmt : 0);
    if (data.amount_bdt > available + 0.005) {
      throw new Error(
        `${wal.name} e joththesto balance nei. Available ${available.toFixed(2)}৳, dorkar ${data.amount_bdt.toFixed(2)}৳ (short ${(data.amount_bdt - available).toFixed(2)}৳). Amount komiye din ba onno account beche nin.`,
      );
    }
    const { error: rErr } = await context.supabase.rpc("imp_reverse_payment", {
      _payment_id: data.payment_id,
      _reason: "edited",
    });
    if (rErr) throw rErr;
    const { data: out, error } = await context.supabase.rpc("imp_record_payment_rpc", {
      _payload: {
        brand_id: data.brand_id,
        po_id: data.po_id,
        carton_id: data.carton_id ?? undefined,
        payment_type: data.payment_type,
        amount_bdt: data.amount_bdt,
        wallet_id: data.wallet_id,
        payment_date: data.payment_date,
        reference: data.reference,
        notes: data.notes,
        idempotency_key: data.idempotency_key,
      },
    });
    if (error) {
      throw new Error(
        `Purono payment reverse hoye taka wallet e ferot geche, kintu notun payment boshate parini: ${error.message}. Notun kore payment record korun.`,
      );
    }
    return { reversed: data.payment_id, created: out };
  });

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
    .select("id, weight_kg, shipping_freight_bdt")
    .eq("po_id", po_id);
  if (cErr) throw cErr;
  const list = cartons ?? [];
  if (list.length === 0) return { updated: 0, shipping_total: shippingTotal };

  // Cartons with their own actual freight bill (carton-wise / lot-wise shipping)
  // keep that exact amount. Only the remaining planned PO shipping is spread
  // across the cartons that have not been billed yet.
  const isBilled = (c: any) => c.shipping_freight_bdt !== null && c.shipping_freight_bdt !== undefined;
  const billed = list.filter(isBilled);
  const unbilled = list.filter((c: any) => !isBilled(c));
  const billedTotal = billed.reduce((s: number, c: any) => s + Number(c.shipping_freight_bdt || 0), 0);
  const remaining = Math.max(0, shippingTotal - billedTotal);

  const unbilledWeight = unbilled.reduce((s: number, c: any) => s + Number(c.weight_kg || 0), 0);
  const useWeight = unbilledWeight > 0;

  for (const c of list) {
    const share = isBilled(c)
      ? Number(c.shipping_freight_bdt || 0)
      : unbilled.length === 0
        ? 0
        : useWeight
          ? (Number(c.weight_kg || 0) / unbilledWeight) * remaining
          : remaining / unbilled.length;
    const val = +share.toFixed(4);
    const { error: uErr } = await supabase
      .from("imp_cartons")
      .update({ cost_share_bdt: val, shipping_charge_bdt: val })
      .eq("id", c.id);
    if (uErr) throw uErr;
  }
  return {
    updated: list.length,
    shipping_total: shippingTotal,
    billed_total: +billedTotal.toFixed(2),
    unbilled_total: +remaining.toFixed(2),
    billed_cartons: billed.length,
  };
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
    await logPoEvent(context.supabase, context.userId, data.po_id, "po_shipping_saved", {
      group: "shipment",
      title: "Shipping bill (PO level) save",
      detail: `${data.shipping_weight_kg} kg × ${data.shipping_rate_per_kg}৳/kg${data.other_charges_bdt ? ` + other ${data.other_charges_bdt}৳` : ""}`,
      amount: shipping_cost_bdt,
    });
    return { ok: true, shipping_cost_bdt, ...recompute };
  });

/**
 * Carton-wise (lot-wise) shipping bill.
 * Ekta shipment e jei carton gulo eshechhe shudhu shei carton gulor upor
 * Weight x Rate/kg freight boshbe. Baki carton pore ashle tokhon alada bill.
 * clear = true dile oi carton abar PO-level planned shipping share e fire jabe.
 */
export const saveCartonFreight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      po_id: z.string().uuid(),
      clear: z.boolean().default(false),
      note: z.string().max(300).optional(),
      cartons: z.array(z.object({
        carton_id: z.string().uuid(),
        weight_kg: z.number().nonnegative().default(0),
        rate_per_kg: z.number().nonnegative().default(0),
        freight_bdt: z.number().nonnegative().optional(),
      })).min(1),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.supabase, context.userId, ["admin", "operations", "accountant", "warehouse_staff"]);

    let total = 0;
    for (const c of data.cartons) {
      const patch: any = data.clear
        ? {
            shipping_freight_bdt: null,
            shipping_billed_at: null,
            shipping_rate_per_kg: 0,
            shipping_note: null,
            weight_kg: c.weight_kg,
          }
        : {
            weight_kg: c.weight_kg,
            shipping_rate_per_kg: c.rate_per_kg,
            shipping_freight_bdt: +(
              c.freight_bdt !== undefined && c.freight_bdt !== null
                ? c.freight_bdt
                : c.weight_kg * c.rate_per_kg
            ).toFixed(4),
            shipping_billed_at: new Date().toISOString(),
            shipping_note: data.note ?? null,
          };
      if (!data.clear) total += Number(patch.shipping_freight_bdt || 0);

      const { error } = await context.supabase
        .from("imp_cartons")
        .update(patch)
        .eq("id", c.carton_id)
        .eq("po_id", data.po_id);
      if (error) throw error;
    }

    const recompute = await recomputeCartonCostSharesInternal(context.supabase, data.po_id);
    await logPoEvent(
      context.supabase, context.userId, data.po_id,
      data.clear ? "po_carton_freight_cleared" : "po_carton_freight_saved",
      {
        group: "shipment",
        title: data.clear
          ? `${data.cartons.length} carton er freight bill remove`
          : `${data.cartons.length} carton er shipping bill add`,
        detail: data.note ?? null,
        amount: data.clear ? null : +total.toFixed(2),
      },
    );
    return { ok: true, cartons: data.cartons.length, freight_total: +total.toFixed(2), ...recompute };
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
        .select("id, name, phone, contact_person, is_active, brand_id")
        // Agents with no brand are shared across every brand.
        .or(`brand_id.is.null,brand_id.in.(${ids.join(",")})`)
        .order("name"),
      context.supabase
        .from("imp_purchase_orders")
        .select("id, po_number, order_date, status, cargo_agent_id, product_subtotal_bdt, shipping_total_bdt, shipping_cost_bdt, shipping_weight_kg, shipping_rate_per_kg, total_weight_kg, local_delivery_total_bdt, paid_bdt, grand_total_bdt, due_bdt")
        .in("brand_id", ids)
        .not("cargo_agent_id", "is", null)
        .neq("status", "cancelled"),
    ]);
    if (agentsRes.error) throw agentsRes.error;
    if (posRes.error) throw posRes.error;
    const agents = (agentsRes.data ?? []) as any[];
    const pos = (posRes.data ?? []) as any[];
    const poIds = pos.map((p) => p.id as string);

    // Per-PO pcs (from items) and carton weight/count for accurate display.
    const [itemsRes, cartonsRes] = await Promise.all([
      poIds.length
        ? context.supabase.from("imp_po_items").select("po_id, quantity").in("po_id", poIds)
        : Promise.resolve({ data: [], error: null }),
      poIds.length
        ? context.supabase.from("imp_cartons").select("po_id, weight_kg, status").in("po_id", poIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (itemsRes.error) throw itemsRes.error;
    if (cartonsRes.error) throw cartonsRes.error;
    const pcsByPo: Record<string, number> = {};
    for (const it of (itemsRes.data ?? []) as any[]) {
      pcsByPo[it.po_id] = (pcsByPo[it.po_id] ?? 0) + Number(it.quantity ?? 0);
    }
    const cartonsByPo: Record<string, { count: number; weight: number; received: number }> = {};
    for (const c of (cartonsRes.data ?? []) as any[]) {
      const e = (cartonsByPo[c.po_id] ||= { count: 0, weight: 0, received: 0 });
      e.count += 1;
      e.weight += Number(c.weight_kg ?? 0);
      if (c.status === "in_stock" || c.status === "released" || c.status === "arrived_bd") e.received += 1;
    }

    const enrich = (p: any) => {
      const shipping = Number(p.shipping_total_bdt ?? p.shipping_cost_bdt ?? 0);
      const buying = Number(p.product_subtotal_bdt ?? 0);
      const c = cartonsByPo[p.id] ?? { count: 0, weight: 0, received: 0 };
      const weight = Number(p.shipping_weight_kg ?? 0) || Number(p.total_weight_kg ?? 0) || +c.weight.toFixed(2);
      const pcs = pcsByPo[p.id] ?? 0;
      // Accurate bill = buying + shipping (local delivery is ours, not the agent's).
      const bill = +(buying + shipping).toFixed(2);
      const paid = Number(p.paid_bdt ?? 0);
      const due = +(bill - paid).toFixed(2);
      return {
        ...p,
        buying_bdt: +buying.toFixed(2),
        shipping_bdt: +shipping.toFixed(2),
        bill_bdt: bill,
        due_bdt: due < 0 ? 0 : due,
        pcs,
        weight_kg: +weight.toFixed(2),
        carton_count: c.count,
        carton_received: c.received,
      };
    };

    const byAgent: Record<string, any[]> = {};
    for (const p of pos) {
      const k = p.cargo_agent_id as string;
      (byAgent[k] ||= []).push(p);
    }
    return agents.map((a: any) => {
      const list = (byAgent[a.id] ?? []).map(enrich);
      const shipping = list.reduce((s, p) => s + p.shipping_bdt, 0);
      const buying = list.reduce((s, p) => s + p.buying_bdt, 0);
      const bill = list.reduce((s, p) => s + p.bill_bdt, 0);
      const paid = list.reduce((s, p) => s + Number(p.paid_bdt ?? 0), 0);
      const due = +(bill - paid).toFixed(2);
      const weight = list.reduce((s, p) => s + p.weight_kg, 0);
      const pcs = list.reduce((s, p) => s + p.pcs, 0);
      return {
        agent: a,
        po_count: list.length,
        pcs_total: pcs,
        weight_total: +weight.toFixed(2),
        buying_total: +buying.toFixed(2),
        shipping_total: +shipping.toFixed(2),
        bill_total: +bill.toFixed(2),
        paid_total: +paid.toFixed(2),
        grand_total: +bill.toFixed(2),
        due_total: due < 0 ? 0 : due,
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
        missing_qty: z.number().int().nonnegative().default(0),
      })).min(1),
      // Ei shipment-er nijer freight (CN→BD) — shudhu ei release-er pcs-e bhag hobe
      shipping: z.object({
        weight_kg: z.number().nonnegative().default(0),
        rate_per_kg: z.number().nonnegative().default(0),
        amount_bdt: z.number().nonnegative(),
        note: z.string().optional(),
      }).optional(),
      // Local delivery (BD warehouse theke amader kache ana) charge
      local_delivery: z.object({
        amount_bdt: z.number().nonnegative(),
        note: z.string().optional(),
        wallet_id: z.string().uuid().optional(),
        payment_date: z.string().optional(),
        reference: z.string().optional(),
        idempotency_key: z.string().min(8).optional(),
      }).optional(),
      // Ei release-er pcs onushare purchase + shipping due ekhoni pay kora (optional)
      payment: z.object({
        wallet_id: z.string().uuid(),
        goods_amount_bdt: z.number().nonnegative().default(0),
        shipping_amount_bdt: z.number().nonnegative().default(0),
        payment_date: z.string().optional(),
        reference: z.string().optional(),
        idempotency_key: z.string().min(8),
      }).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.supabase, context.userId, ["admin", "operations", "warehouse_staff"]);

    const { data: po, error: pErr } = await context.supabase
      .from("imp_purchase_orders")
      .select("id, brand_id, status, receive_mode, fx_rate, fx_rate_cny_bdt, shipping_cost_bdt, shipping_total_bdt, local_courier_total_bdt, local_delivery_total_bdt, freight_cost_bdt, customs_duty_bdt, other_charges_bdt, agent_commission_per_unit_bdt")
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
      .select("po_item_id, quantity, damaged_qty, missing_qty, release:release_id!inner ( po_id )")
      .eq("release.po_id", data.po_id);
    if (rErr) throw rErr;
    const releasedMap = new Map<string, number>();
    for (const r of prevReleases ?? []) {
      const k = (r as any).po_item_id as string;
      releasedMap.set(
        k,
        (releasedMap.get(k) ?? 0) +
          Number((r as any).quantity ?? 0) +
          Number((r as any).damaged_qty ?? 0) +
          Number((r as any).missing_qty ?? 0),
      );
    }

    const lines = data.items.filter((l) => l.quantity > 0 || l.damaged_qty > 0 || l.missing_qty > 0);
    if (lines.length === 0) throw new Error("Nothing to release");

    for (const l of lines) {
      const pi = itemMap.get(l.po_item_id);
      if (!pi) throw new Error("Item not part of this PO");
      const remaining = Number(pi.quantity ?? 0) - (releasedMap.get(l.po_item_id) ?? 0);
      if (l.quantity + l.damaged_qty + l.missing_qty > remaining) {
        throw new Error(`${pi.name_snapshot ?? "Item"}: only ${remaining} pcs remaining`);
      }
    }

    // Local delivery charge — ei shipment-er sathe jog hoy
    const localDelivery = Math.max(0, Number(data.local_delivery?.amount_bdt ?? 0));
    if (localDelivery > 0) {
      const { error: ldErr } = await context.supabase
        .from("imp_purchase_orders")
        .update({
          local_delivery_total_bdt: +(
            Number((po as any).local_delivery_total_bdt ?? 0) + localDelivery
          ).toFixed(4),
        } as any)
        .eq("id", data.po_id);
      if (ldErr) throw ldErr;
    }

    // Ei shipment-er freight
    const shipWeight = Math.max(0, Number(data.shipping?.weight_kg ?? 0));
    const shipRate = Math.max(0, Number(data.shipping?.rate_per_kg ?? 0));
    const releaseFreight = +Math.max(
      0,
      Number(data.shipping?.amount_bdt ?? shipWeight * shipRate),
    ).toFixed(4);

    // Age-r kono release-e shipment-wise freight deya hoyeche kina
    const { data: priorShip } = await context.supabase
      .from("imp_po_releases")
      .select("shipping_charge_bdt")
      .eq("po_id", data.po_id);
    const priorFreight = (priorShip ?? []).reduce(
      (s: number, r: any) => s + Number(r.shipping_charge_bdt ?? 0),
      0,
    );
    const shipmentWiseMode = releaseFreight > 0 || priorFreight > 0;

    // Landed cost per unit
    const fx = Number((po as any).fx_rate_cny_bdt ?? (po as any).fx_rate ?? 0);
    const commissionPerUnit = Number((po as any).agent_commission_per_unit_bdt ?? 0);
    const totalOrdered = (poItems ?? []).reduce((s: number, r: any) => s + Number(r.quantity ?? 0), 0);

    // PO-level overhead (customs, duty, other) — shob ordered pcs-e bhag
    const poOverhead =
      Number((po as any).local_courier_total_bdt ?? 0) +
      Number((po as any).customs_duty_bdt ?? 0) +
      Number((po as any).other_charges_bdt ?? 0) +
      // Shipment-wise mode chalu hole PO-level planned freight/shipping bad — actual release freight-i dhora hoy
      (shipmentWiseMode
        ? 0
        : Number((po as any).freight_cost_bdt ?? 0) +
          Number((po as any).shipping_total_bdt ?? (po as any).shipping_cost_bdt ?? 0) +
          Number((po as any).local_delivery_total_bdt ?? 0));

    const poOverheadPerUnit = totalOrdered > 0 ? poOverhead / totalOrdered : 0;

    // Ei release-er nijer khoroch — shudhu ei shipment-er pcs-e bhag
    const releaseUnits = lines.reduce(
      (s, l) => s + Number(l.quantity ?? 0) + Number(l.damaged_qty ?? 0),
      0,
    );
    const releaseOverhead = releaseFreight + (shipmentWiseMode ? localDelivery : 0);
    const releasePerUnit = releaseUnits > 0 ? releaseOverhead / releaseUnits : 0;

    const overheadPerUnit = poOverheadPerUnit + releasePerUnit;

    // Next release number
    const { data: lastRel } = await context.supabase
      .from("imp_po_releases")
      .select("release_number")
      .eq("po_id", data.po_id)
      .order("release_number", { ascending: false })
      .limit(1);
    const nextNumber = Number((lastRel?.[0] as any)?.release_number ?? 0) + 1;

    // --- Optional: ei release-er pro-rata due ekhoni pay ---
    const paymentsDone: Array<{ type: string; amount: number }> = [];
    let shippingPaymentId: string | null = null;
    if (data.payment) {
      const payDate = data.payment.payment_date ?? new Date().toISOString().slice(0, 10);
      const parts: Array<{ type: "supplier_payment" | "shipping"; amount: number; suffix: string }> = [
        { type: "supplier_payment", amount: +Number(data.payment.goods_amount_bdt ?? 0).toFixed(2), suffix: "goods" },
        { type: "shipping", amount: +Number(data.payment.shipping_amount_bdt ?? 0).toFixed(2), suffix: "ship" },
      ];
      for (const p of parts) {
        if (p.amount <= 0) continue;
        const { data: payOut, error: payErr } = await context.supabase.rpc("imp_record_payment_rpc", {
          _payload: {
            brand_id: (po as any).brand_id,
            po_id: data.po_id,
            payment_type: p.type,
            amount_bdt: p.amount,
            wallet_id: data.payment.wallet_id,
            payment_date: payDate,
            reference: data.payment.reference ?? undefined,
            notes: `Release #${nextNumber} — ${p.suffix} due for released pcs`,
            idempotency_key: `${data.payment.idempotency_key}:${p.suffix}`,
          },
        });
        if (payErr) throw payErr;
        if (p.suffix === "ship") {
          shippingPaymentId = (payOut as any)?.payment_id ?? (typeof payOut === "string" ? payOut : null);
        }
        paymentsDone.push({ type: p.type, amount: p.amount });
      }
    }

    // Local delivery charge wallet theke pay (optional)
    let localDeliveryPaymentId: string | null = null;
    if (localDelivery > 0 && data.local_delivery?.wallet_id) {
      const { data: ldPay, error: ldPayErr } = await context.supabase.rpc("imp_record_payment_rpc", {
        _payload: {
          brand_id: (po as any).brand_id,
          po_id: data.po_id,
          payment_type: "local_courier",
          amount_bdt: +localDelivery.toFixed(2),
          wallet_id: data.local_delivery.wallet_id,
          payment_date: data.local_delivery.payment_date ?? new Date().toISOString().slice(0, 10),
          reference: data.local_delivery.reference ?? undefined,
          notes: `Release #${nextNumber} — local delivery charge`,
          idempotency_key:
            data.local_delivery.idempotency_key ?? `qtyrel_ld:${data.po_id}:${nextNumber}:${Date.now()}`,
        },
      });
      if (ldPayErr) throw ldPayErr;
      localDeliveryPaymentId = (ldPay as any)?.payment_id ?? (typeof ldPay === "string" ? ldPay : null);
      paymentsDone.push({ type: "local_courier", amount: +localDelivery.toFixed(2) });
    }

    const { data: release, error: relErr } = await context.supabase
      .from("imp_po_releases")
      .insert({
        po_id: data.po_id,
        brand_id: (po as any).brand_id,
        release_number: nextNumber,
        warehouse_id: data.warehouse_id ?? null,
        notes: data.notes ?? null,
        local_delivery_bdt: localDelivery,
        delivery_note: data.local_delivery?.note ?? null,
        delivery_payment_id: localDeliveryPaymentId,
        shipping_weight_kg: shipWeight,
        shipping_rate_per_kg: shipRate,
        shipping_charge_bdt: releaseFreight,
        shipping_payment_id: shippingPaymentId,
        shipping_note: data.shipping?.note ?? null,
        // Purono flow: local delivery release-er shomoy neya hoyeche → 'release'
        // Notun flow: local courier charge QC-r shomoy nebo → 'qc'
        local_courier_source: localDelivery > 0 ? "release" : "qc",
        created_by: context.userId,
      } as any)
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
          quantity: Math.max(0, l.quantity ?? 0),
          damaged_qty: l.damaged_qty ?? 0,
          missing_qty: l.missing_qty ?? 0,
          unit_landed_cost_bdt: landed,
          // QC na howa porjonto ei pcs reserved — sellable na
          reserved_qty: Math.max(0, l.quantity ?? 0),
        } as any)
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

        // QC na howa porjonto ei pcs reserved thakbe (available stock e jabe na)
        const { error: resErr } = await context.supabase.rpc("imp_adjust_reserved" as any, {
          _product_id: pi.product_id as string,
          _variant_id: (pi.variant_id ?? null) as any,
          _delta: l.quantity,
        });
        if (resErr) throw resErr;


        // Per-pcs landed cost ta product-er cost e boshe jak — inventory value / profit
        // report shob jaygay ei cost dekhabe.
        const { error: costErr } = await context.supabase.rpc("imp_sync_product_cost" as any, {
          _product_id: pi.product_id as string,
          _landed: landed,
        });
        if (costErr) throw costErr;

        movements.push({ po_item_id: l.po_item_id, qty: l.quantity, unit_cost: landed, movement_id: movId });
      }
      releasedMap.set(
        l.po_item_id,
        (releasedMap.get(l.po_item_id) ?? 0) + l.quantity + (l.damaged_qty ?? 0) + (l.missing_qty ?? 0),
      );
    }

    // Update PO status — DB theke fresh kore shob release count kori (stale in-memory hishab nয়)
    const { data: allRelItems } = await context.supabase
      .from("imp_po_release_items")
      .select("quantity, damaged_qty, missing_qty, release:release_id!inner ( po_id )")
      .eq("release.po_id", data.po_id);
    const totalReleased = (allRelItems ?? []).reduce(
      (s: number, r: any) =>
        s + Number(r.quantity ?? 0) + Number(r.damaged_qty ?? 0) + Number(r.missing_qty ?? 0),
      0,
    );
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
      payments: paymentsDone,
      local_delivery_bdt: localDelivery,
      landed_per_unit_overhead: +overheadPerUnit.toFixed(4),
      shipping_charge_bdt: releaseFreight,
      release_units: releaseUnits,
      status: nextStatus,
      total_released: totalReleased,
      total_ordered: totalOrdered,
    };
  });

/* ============================================================
   Warehouse QC — release warehouse e pouchale good/damaged/extra confirm
   ============================================================ */

export const qcPoRelease = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      release_id: z.string().uuid(),
      notes: z.string().optional(),
      items: z.array(z.object({
        release_item_id: z.string().uuid(),
        good_qty: z.number().int().nonnegative(),
        damaged_qty: z.number().int().nonnegative().default(0),
        extra_qty: z.number().int().nonnegative().default(0),
      })).min(1),
      // Notun flow — local courier charge QC-r shomoy
      local_courier: z.object({
        amount_bdt: z.number().nonnegative(),
        wallet_id: z.string().uuid().optional(),
        payment_date: z.string().optional(),
        reference: z.string().optional(),
        note: z.string().optional(),
      }).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.supabase, context.userId, ["admin", "operations", "warehouse_staff"]);

    const { data: rel, error: rErr } = await context.supabase
      .from("imp_po_releases")
      .select("id, po_id, brand_id, release_number, qc_status, local_courier_source, local_courier_bdt, local_courier_payment_id")
      .eq("id", data.release_id)
      .maybeSingle();
    if (rErr) throw rErr;
    if (!rel) throw new Error("Release not found");

    const qcMode = ((rel as any).local_courier_source ?? "release") === "qc";

    const { data: relItems, error: iErr } = await context.supabase
      .from("imp_po_release_items")
      .select("id, product_id, variant_id, quantity, damaged_qty, missing_qty, unit_landed_cost_bdt, qc_good_qty, qc_extra_qty, reserved_qty")
      .eq("release_id", data.release_id);
    if (iErr) throw iErr;
    const map = new Map<string, any>((relItems ?? []).map((r: any) => [r.id, r]));

    /* ---- Local courier charge (shudhu notun 'qc' flow-e) ---- */
    let courierAmount = Number((rel as any).local_courier_bdt ?? 0);
    let courierPaymentId: string | null = (rel as any).local_courier_payment_id ?? null;
    if (qcMode && data.local_courier) {
      courierAmount = +Math.max(0, Number(data.local_courier.amount_bdt ?? 0)).toFixed(2);
      // Idempotent: ekbar-i payment post hobe. Amount bodlale purono payment reverse
      // kore notun kore dite hobe — silently double post korbo na.
      if (courierAmount > 0 && data.local_courier.wallet_id && !courierPaymentId) {
        const { data: lcPay, error: lcErr } = await context.supabase.rpc("imp_record_payment_rpc", {
          _payload: {
            brand_id: (rel as any).brand_id,
            po_id: (rel as any).po_id,
            payment_type: "local_courier",
            amount_bdt: courierAmount,
            wallet_id: data.local_courier.wallet_id,
            payment_date: data.local_courier.payment_date ?? new Date().toISOString().slice(0, 10),
            reference: data.local_courier.reference ?? undefined,
            notes: `Release #${(rel as any).release_number} — local courier (QC)`,
            idempotency_key: `imp_qc_lc:${data.release_id}`,
          },
        });
        if (lcErr) throw lcErr;
        courierPaymentId = (lcPay as any)?.payment_id ?? (typeof lcPay === "string" ? lcPay : null);
      }
    }

    /* ---- Final per-pc COGS: (goods + freight share + local courier) ÷ good pcs ---- */
    const goodByItem = new Map<string, number>();
    for (const l of data.items) goodByItem.set(l.release_item_id, l.good_qty);
    const totalGood = data.items.reduce((s, l) => s + l.good_qty, 0);

    const applied: any[] = [];
    for (const l of data.items) {
      const ri = map.get(l.release_item_id);
      if (!ri) throw new Error("Line not part of this release");
      // Ekhon stock e ache koto — age QC hoye thakle sei number, na hole release quantity
      const currentStocked =
        ri.qc_good_qty === null || ri.qc_good_qty === undefined
          ? Number(ri.quantity ?? 0)
          : Number(ri.qc_good_qty ?? 0) + Number(ri.qc_extra_qty ?? 0);
      const nextStocked = l.good_qty + l.extra_qty;
      const delta = nextStocked - currentStocked;

      // Ei line-er final cost: release cost (goods + freight share) + courier share ÷ good pcs
      const baseUnit = Number(ri.unit_landed_cost_bdt ?? 0);
      const releasedUnits = Number(ri.quantity ?? 0) + Number(ri.damaged_qty ?? 0);
      const lineCost = baseUnit * releasedUnits;
      const courierShare = totalGood > 0 ? (courierAmount * l.good_qty) / totalGood : 0;
      const finalUnit = l.good_qty > 0 ? +((lineCost + courierShare) / l.good_qty).toFixed(4) : baseUnit;

      if (delta !== 0 && ri.product_id) {
        const { error: aErr } = await context.supabase.rpc("adjust_stock_v2", {
          _product_id: ri.product_id as string,
          _variant_id: (ri.variant_id ?? null) as any,
          _delta: delta,
          _reason: delta > 0 ? "import_receive" : "damage",
          _source: "import",
          _unit_cost: finalUnit,
          _reference_type: "imp_po_release_qc",
          _reference_id: data.release_id,
          // Key must be unique per applied correction, not per resulting total —
          // otherwise editing back to a previously saved number no-ops the stock fix.
          _idempotency_key: `imp_qc:${l.release_item_id}:${currentStocked}->${nextStocked}:${crypto.randomUUID()}`,
          _note: `Release #${(rel as any).release_number} QC — good ${l.good_qty}, damaged ${l.damaged_qty}, extra ${l.extra_qty}`,
        });
        if (aErr) throw aErr;
      }

      // Reservation chere dao — ei pcs ekhon sellable
      const outstandingReserved = Number(ri.reserved_qty ?? 0);
      if (outstandingReserved > 0 && ri.product_id) {
        const { error: resErr } = await context.supabase.rpc("imp_adjust_reserved" as any, {
          _product_id: ri.product_id as string,
          _variant_id: (ri.variant_id ?? null) as any,
          _delta: -outstandingReserved,
        });
        if (resErr) throw resErr;
      }

      const { error: uErr } = await context.supabase
        .from("imp_po_release_items")
        .update({
          qc_good_qty: l.good_qty,
          qc_damaged_qty: l.damaged_qty,
          qc_extra_qty: l.extra_qty,
          final_unit_cost_bdt: finalUnit,
          reserved_qty: 0,
        } as any)
        .eq("id", l.release_item_id);
      if (uErr) throw uErr;

      // QC-final cost e release movement revalue + WAC recompute (P5)
      // Age shudhu delta movement-e final cost jeto — delta 0 hole WAC kokhono
      // asol QC cost peto na. Ekhon original release movement-i revalue hoy.
      if (ri.product_id && l.good_qty > 0) {
        const { error: qcCostErr } = await context.supabase.rpc("imp_qc_finalize_cost" as any, {
          _release_item_id: l.release_item_id,
          _final_unit_cost: finalUnit,
        });
        if (qcCostErr) throw qcCostErr;
      }

      applied.push({
        release_item_id: l.release_item_id,
        delta,
        stocked: nextStocked,
        final_unit_cost_bdt: finalUnit,
      });
    }

    if (qcMode) {
      const { error: lcuErr } = await context.supabase
        .from("imp_po_releases")
        .update({
          local_courier_bdt: courierAmount,
          local_courier_wallet_id: data.local_courier?.wallet_id ?? null,
          local_courier_payment_id: courierPaymentId,
          qc_local_courier_note: data.local_courier?.note ?? null,
        } as any)
        .eq("id", data.release_id);
      if (lcuErr) throw lcuErr;
    }


    const { error: relUErr } = await context.supabase
      .from("imp_po_releases")
      .update({
        qc_status: "done",
        qc_at: new Date().toISOString(),
        qc_by: context.userId,
        qc_notes: data.notes ?? null,
      } as any)
      .eq("id", data.release_id);
    if (relUErr) throw relUErr;

    return { ok: true, applied };
  });

/* ============================================================
   EDIT Import PO (header + product lines)
   ============================================================ */


const editPoItemSchema = z.object({
  id: z.string().uuid().optional(),
  product_id: z.string().uuid().nullable().optional(),
  variant_id: z.string().uuid().nullable().optional(),
  sku_snapshot: z.string().nullable().optional(),
  name_snapshot: z.string().min(1),
  image_snapshot: z.string().nullable().optional(),
  quantity: z.number().int().positive(),
  unit_cost_foreign: z.number().nonnegative(),
});

export const updateImportPo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      poId: z.string().uuid(),
      order_date: z.string().optional(),
      supplier_id: z.string().uuid().optional(),
      currency: z.string().optional(),
      fx_rate: z.number().positive().optional(),
      notes: z.string().nullable().optional(),
      po_number: z.string().min(1).optional(),
      cargo_agent_id: z.string().uuid().nullable().optional(),
      shipped_at: z.string().nullable().optional(),
      freight_cost_bdt: z.number().nonnegative().optional(),
      customs_duty_bdt: z.number().nonnegative().optional(),
      other_charges_bdt: z.number().nonnegative().optional(),
      agent_commission_cny: z.number().nonnegative().optional(),
      total_weight_kg: z.number().nonnegative().optional(),
      items: z.array(editPoItemSchema).min(1).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.supabase, context.userId, ["admin", "operations", "accountant"]);
    const { poId, ...payload } = data;
    const { data: out, error } = await context.supabase.rpc("imp_update_po", {
      _po_id: poId,
      _payload: payload,
    });
    if (error) throw error;
    await logPoEvent(context.supabase, context.userId, poId, "po_updated", {
      group: "plan",
      title: "PO edit kora hoyeche",
      detail: Object.keys(payload).filter((k) => (payload as any)[k] !== undefined).join(", ") || null,
    });
    return out as { ok: boolean; items_updated: boolean; locked: boolean };
  });

/* --- carton mode: create / edit / delete carton plan after PO creation --- */

export const saveCartonPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      po_id: z.string().uuid(),
      cartons: z.array(z.object({
        carton_number: z.number().int().positive(),
        weight_kg: z.number().nonnegative().nullable().optional(),
        notes: z.string().optional(),
        allocations: z.array(z.object({
          po_item_id: z.string().uuid(),
          quantity: z.number().int().nonnegative(),
        })).default([]),
      })).min(1),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.supabase, context.userId, ["admin", "operations", "accountant"]);
    const { data: out, error } = await context.supabase.rpc("imp_save_cartons", { _payload: data });
    if (error) throw error;
    await logPoEvent(context.supabase, context.userId, data.po_id, "po_carton_plan_saved", {
      group: "plan",
      title: `Carton plan save — ${data.cartons.length} carton`,
    });
    return out as { ok: boolean; cartons: number; total_qty: number };
  });


/* --- quantity mode: receive at BD (freight / customs / other) --- */

export const receiveQuantityBd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      po_id: z.string().uuid(),
      total_weight_kg: z.number().nonnegative().optional(),
      rate_per_kg_bdt: z.number().nonnegative().optional(),
      shipping_total_bdt: z.number().nonnegative().optional(),
      customs_duty_bdt: z.number().nonnegative().default(0),
      other_charges_bdt: z.number().nonnegative().default(0),
      mode: z.enum(["replace", "add"]).default("replace"),
      idempotency_key: z.string().min(8),
      shipping_payment: z.object({
        amount: z.number().positive(),
        wallet_id: z.string().uuid(),
        payment_date: z.string(),
        reference: z.string().optional(),
        notes: z.string().optional(),
        idempotency_key: z.string().min(8),
      }).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.supabase, context.userId, ["admin", "operations", "accountant"]);
    const { data: out, error } = await context.supabase.rpc("imp_receive_quantity_bd" as any, {
      _payload: data as any,
    });
    if (error) throw error;
    const shipTotal = data.shipping_total_bdt ?? +(Number(data.total_weight_kg || 0) * Number(data.rate_per_kg_bdt || 0)).toFixed(2);
    await logPoEvent(context.supabase, context.userId, data.po_id, "po_received_bd", {
      group: "shipment",
      title: `BD te receive — shipping bill ${data.mode === "add" ? "add" : "set"}`,
      detail: [
        data.total_weight_kg ? `${data.total_weight_kg} kg × ${data.rate_per_kg_bdt ?? 0}৳/kg` : null,
        data.customs_duty_bdt ? `customs ${data.customs_duty_bdt}৳` : null,
        data.other_charges_bdt ? `other ${data.other_charges_bdt}৳` : null,
      ].filter(Boolean).join(" · ") || null,
      amount: shipTotal,
    });
    return out as any;
  });

/* ============================================================
   Incoming pipeline — released kintu ekhono QC hoy nai
   ============================================================ */
export const listIncomingReleases = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandIds?: string[] }) =>
    z.object({ brandIds: z.array(z.string().uuid()).optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("imp_po_releases")
      .select(`
        id, po_id, brand_id, release_number, released_at, notes, warehouse_id,
        local_courier_bdt, local_courier_source, local_delivery_bdt,
        shipping_charge_bdt, shipping_weight_kg, shipping_rate_per_kg,
        qc_status, qc_at, qc_notes,
        po:po_id ( id, po_number, status, order_date ),
        items:imp_po_release_items ( id, po_item_id, product_id, variant_id, sku_snapshot,
          quantity, damaged_qty, missing_qty, unit_landed_cost_bdt, final_unit_cost_bdt,
          qc_good_qty, qc_damaged_qty, qc_extra_qty,
          product:product_id ( id, title, image, sku ),
          variant:variant_id ( id, sku, color_name, color_hex, image ) )
      `)
      .or("qc_status.is.null,qc_status.neq.done")
      .order("released_at", { ascending: false })
      .limit(300);
    if (data.brandIds?.length) q = q.in("brand_id", data.brandIds);
    const { data: rows, error } = await q;
    if (error) throw error;

    const releases = (rows ?? []) as any[];
    const poIds = Array.from(new Set(releases.map((r) => r.po_id)));
    if (poIds.length === 0) return { releases: [], progress: {} as Record<string, any> };

    const [itemsRes, allRelRes] = await Promise.all([
      context.supabase
        .from("imp_po_items")
        .select("id, po_id, quantity, name_snapshot, sku_snapshot")
        .in("po_id", poIds),
      context.supabase
        .from("imp_po_releases")
        .select("id, po_id, items:imp_po_release_items ( po_item_id, quantity, damaged_qty, missing_qty )")
        .in("po_id", poIds),
    ]);
    if (itemsRes.error) throw itemsRes.error;
    if (allRelRes.error) throw allRelRes.error;

    const releasedByItem: Record<string, number> = {};
    for (const r of (allRelRes.data ?? []) as any[]) {
      for (const it of r.items ?? []) {
        releasedByItem[it.po_item_id] =
          (releasedByItem[it.po_item_id] ?? 0) +
          Number(it.quantity ?? 0) + Number(it.damaged_qty ?? 0) + Number(it.missing_qty ?? 0);
      }
    }

    const progress: Record<string, { ordered: number; released: number; remaining: number; byItem: Record<string, { ordered: number; released: number }> }> = {};
    for (const it of (itemsRes.data ?? []) as any[]) {
      const p = (progress[it.po_id] ??= { ordered: 0, released: 0, remaining: 0, byItem: {} });
      const ordered = Number(it.quantity ?? 0);
      const rel = releasedByItem[it.id] ?? 0;
      p.ordered += ordered;
      p.released += rel;
      p.remaining = Math.max(0, p.ordered - p.released);
      p.byItem[it.id] = { ordered, released: rel };
    }

    return { releases, progress };
  });
