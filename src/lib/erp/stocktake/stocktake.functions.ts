import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* ============================================================
   Stocktake / Cycle Count — server functions
   ============================================================ */

/* ---------- LIST ---------- */

export const listStocktakeSessions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId: string; status?: string }) =>
    z.object({
      brandId: z.string().uuid(),
      status: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("stocktake_sessions")
      .select(`
        id, brand_id, name, status, warehouse_id,
        started_by, completed_by, started_at, completed_at,
        total_products, total_variance_value, notes, created_at,
        warehouse:warehouse_id ( id, name )
      `)
      .eq("brand_id", data.brandId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const getStocktakeDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sessionId: string }) =>
    z.object({ sessionId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const [sessRes, itemsRes] = await Promise.all([
      context.supabase
        .from("stocktake_sessions")
        .select(`
          id, brand_id, name, status, warehouse_id,
          started_by, completed_by, started_at, completed_at,
          total_products, total_variance_value, notes, created_at,
          warehouse:warehouse_id ( id, name )
        `)
        .eq("id", data.sessionId)
        .maybeSingle(),
      context.supabase
        .from("stocktake_items")
        .select(`
          id, session_id, product_id, variant_id,
          system_qty, counted_qty, variance, unit_cost, variance_value,
          notes, counted_by, counted_at,
          product:product_id ( id, title, sku, image ),
          variant:variant_id ( id, sku, title )
        `)
        .eq("session_id", data.sessionId)
        .limit(5000),
    ]);
    if (sessRes.error) throw sessRes.error;
    if (itemsRes.error) throw itemsRes.error;
    if (!sessRes.data) throw new Error("Stocktake session not found");
    return { session: sessRes.data, items: itemsRes.data ?? [] };
  });

/* ---------- CREATE ---------- */

export const createStocktakeSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      brand_id: z.string().uuid(),
      name: z.string().min(1),
      scope: z.enum(["all_products", "low_stock", "empty"]).default("all_products"),
      warehouse_id: z.string().uuid().nullable().optional(),
      include_variants: z.boolean().default(true),
      notes: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: sess, error: sErr } = await supabase
      .from("stocktake_sessions")
      .insert({
        brand_id: data.brand_id,
        name: data.name,
        status: "open",
        warehouse_id: data.warehouse_id ?? null,
        started_by: userId,
        notes: data.notes ?? null,
      })
      .select("id")
      .single();
    if (sErr) throw sErr;

    if (data.scope !== "empty") {
      let pq = supabase
        .from("products")
        .select(`
          id, stock, reorder_point, weighted_avg_cost,
          variants:product_variants ( id, stock, weighted_avg_cost )
        `)
        .eq("brand_id", data.brand_id)
        .eq("is_active", true)
        .limit(5000);
      const { data: products, error: pErr } = await pq;
      if (pErr) throw pErr;

      const rows: any[] = [];
      for (const p of products ?? []) {
        const variants = (p as any).variants ?? [];
        const hasVariants = data.include_variants && variants.length > 0;
        if (hasVariants) {
          for (const v of variants) {
            if (data.scope === "low_stock" && (v.stock ?? 0) > (p.reorder_point ?? 0)) continue;
            rows.push({
              session_id: sess.id,
              product_id: p.id,
              variant_id: v.id,
              system_qty: v.stock ?? 0,
              unit_cost: Number(v.weighted_avg_cost ?? p.weighted_avg_cost ?? 0),
            });
          }
        } else {
          if (data.scope === "low_stock" && (p.stock ?? 0) > (p.reorder_point ?? 0)) continue;
          rows.push({
            session_id: sess.id,
            product_id: p.id,
            variant_id: null,
            system_qty: p.stock ?? 0,
            unit_cost: Number(p.weighted_avg_cost ?? 0),
          });
        }
      }

      if (rows.length) {
        // chunked insert (avoid huge payload)
        const chunkSize = 500;
        for (let i = 0; i < rows.length; i += chunkSize) {
          const { error: itErr } = await supabase
            .from("stocktake_items")
            .insert(rows.slice(i, i + chunkSize));
          if (itErr) throw itErr;
        }
      }

      await supabase
        .from("stocktake_sessions")
        .update({ total_products: rows.length })
        .eq("id", sess.id);
    }

    return { session_id: sess.id };
  });

/* ---------- ADD ITEM (manual / ad-hoc) ---------- */

export const addStocktakeItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      session_id: z.string().uuid(),
      product_id: z.string().uuid(),
      variant_id: z.string().uuid().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let system_qty = 0;
    let unit_cost = 0;
    if (data.variant_id) {
      const { data: v } = await supabase
        .from("product_variants")
        .select("stock, weighted_avg_cost")
        .eq("id", data.variant_id)
        .maybeSingle();
      system_qty = v?.stock ?? 0;
      unit_cost = Number(v?.weighted_avg_cost ?? 0);
    } else {
      const { data: p } = await supabase
        .from("products")
        .select("stock, weighted_avg_cost")
        .eq("id", data.product_id)
        .maybeSingle();
      system_qty = p?.stock ?? 0;
      unit_cost = Number(p?.weighted_avg_cost ?? 0);
    }
    const { data: row, error } = await supabase
      .from("stocktake_items")
      .insert({
        session_id: data.session_id,
        product_id: data.product_id,
        variant_id: data.variant_id ?? null,
        system_qty,
        unit_cost,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { item_id: row.id };
  });

/* ---------- UPDATE COUNT ---------- */

export const updateStocktakeCount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      item_id: z.string().uuid(),
      counted_qty: z.number().int().nullable(),
      notes: z.string().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("stocktake_items")
      .update({
        counted_qty: data.counted_qty,
        notes: data.notes ?? null,
        counted_by: context.userId,
        counted_at: data.counted_qty != null ? new Date().toISOString() : null,
      })
      .eq("id", data.item_id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteStocktakeItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { item_id: string }) =>
    z.object({ item_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("stocktake_items")
      .delete()
      .eq("id", data.item_id);
    if (error) throw error;
    return { ok: true };
  });

/* ---------- FINALIZE ---------- */

export const finalizeStocktake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { session_id: string }) =>
    z.object({ session_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: sess, error: sErr } = await supabase
      .from("stocktake_sessions")
      .select("id, status")
      .eq("id", data.session_id)
      .maybeSingle();
    if (sErr) throw sErr;
    if (!sess) throw new Error("Session not found");
    if (sess.status !== "open") throw new Error("Session is not open");

    const { data: items, error: iErr } = await supabase
      .from("stocktake_items")
      .select("id, product_id, variant_id, system_qty, counted_qty, unit_cost, variance, variance_value")
      .eq("session_id", data.session_id);
    if (iErr) throw iErr;

    let appliedCount = 0;
    let totalVarianceValue = 0;
    let skipped: string[] = [];

    for (const it of items ?? []) {
      if (it.counted_qty == null) continue;
      const variance = (it.counted_qty as number) - (it.system_qty as number);
      totalVarianceValue += variance * Number(it.unit_cost || 0);
      if (variance === 0) continue;
      if (!it.product_id) continue;

      const { error: adjErr } = await supabase.rpc("adjust_stock_v2", ({
        _product_id: it.product_id,
        _variant_id: it.variant_id ?? null,
        _delta: variance,
        _reason: "stocktake",
        _note: `Stocktake adjustment`,
        _unit_cost: variance > 0 && Number(it.unit_cost) > 0 ? Number(it.unit_cost) : undefined,
        _source: "stocktake",
        _reference_type: "stocktake_session",
        _reference_id: data.session_id,
        _idempotency_key: `stocktake:${it.id}`,
      } as any));
      if (adjErr) {
        // fail-soft: log skipped, continue
        skipped.push(`${it.id}: ${adjErr.message}`);
        continue;
      }
      appliedCount += 1;
    }

    const { error: upErr } = await supabase
      .from("stocktake_sessions")
      .update({
        status: "completed",
        completed_by: userId,
        completed_at: new Date().toISOString(),
        total_products: items?.length ?? 0,
        total_variance_value: totalVarianceValue,
      })
      .eq("id", data.session_id);
    if (upErr) throw upErr;

    return { applied: appliedCount, total: items?.length ?? 0, variance_value: totalVarianceValue, skipped };
  });

/* ---------- CANCEL ---------- */

export const cancelStocktake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { session_id: string }) =>
    z.object({ session_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("stocktake_sessions")
      .update({ status: "cancelled", completed_at: new Date().toISOString() })
      .eq("id", data.session_id)
      .eq("status", "open");
    if (error) throw error;
    return { ok: true };
  });
