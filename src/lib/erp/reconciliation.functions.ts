import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- Schemas ----------

const RowInput = z.object({
  consignment_id: z.string().nullable().optional(),
  merchant_order_id: z.string().nullable().optional(),
  recipient_name: z.string().nullable().optional(),
  recipient_phone: z.string().nullable().optional(),
  invoice_date: z.string().nullable().optional(), // YYYY-MM-DD
  collected: z.number(),
  delivery_fee: z.number(),
  cod_fee: z.number(),
  other_fee: z.number(),
  discount: z.number(),
  total_fee: z.number(),
  payout: z.number(),
  store_name: z.string().nullable().optional(),
  raw: z.unknown().optional(),
  row_type: z.enum(["paid", "return", "partial"]).optional().default("paid"),
  return_fee: z.number().optional().default(0),
  partial_amount: z.number().optional().default(0),
});

function normalizePhone(p: string | null | undefined): string | null {
  if (!p) return null;
  const digits = String(p).replace(/\D/g, "");
  if (!digits) return null;
  return digits.slice(-11); // last 11 digits (BD mobile)
}

/**
 * PostgREST caps a single response at 1000 rows, so a plain `.in(col, ids)`
 * with a big invoice silently drops matches. Fetch in id-chunks and page
 * through each chunk so every shipment/row is returned.
 */
async function fetchInChunks<T>(
  ids: string[],
  build: (chunk: string[]) => any,
): Promise<T[]> {
  const out: T[] = [];
  const CHUNK = 150;
  const PAGE = 1000;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    let offset = 0;
    for (;;) {
      const { data, error } = await build(chunk).range(offset, offset + PAGE - 1);
      if (error) throw new Error(error.message);
      const list = (data ?? []) as T[];
      out.push(...list);
      if (list.length < PAGE) break;
      offset += PAGE;
    }
  }
  return out;
}

// ---------- Create run (parse + match preview) ----------

export const createPathaoReconciliationRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        brandId: z.string().uuid().nullable().optional(),
        filename: z.string().nullable().optional(),
        rows: z.array(RowInput).min(1),
        tolerance: z.number().min(0).default(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { createReconRunCore } = await import("./reconciliation-core.server");
    return await createReconRunCore(supabase, userId, data);
  });

// ---------- Get run with rows ----------

export const getPathaoReconciliationRun = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ runId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: run, error: runErr } = await supabase
      .from("erp_reconciliation_runs")
      .select("*")
      .eq("id", data.runId)
      .maybeSingle();
    if (runErr) throw new Error(runErr.message);
    if (!run) throw new Error("Run not found");

    const PAGE = 1000;
    const fetchPage = async (from: number) => {
      const { data: page, error: rowErr } = await supabase
        .from("erp_reconciliation_rows")
        .select("*, orders:matched_order_id(id, status, total, shipping_name, shipping_phone, payment_status)")
        .eq("run_id", data.runId)
        .order("created_at", { ascending: true })
        .range(from, from + PAGE - 1);
      if (rowErr) throw new Error(rowErr.message);
      return page ?? [];
    };
    let allRows = await fetchPage(0);
    for (let from = PAGE; allRows.length === from; from += PAGE) {
      const page = await fetchPage(from);
      allRows = allRows.concat(page);
      if (page.length < PAGE) break;
    }

    return { run, rows: allRows };
  });

// ---------- List runs ----------

export const listPathaoReconciliationRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ brandId: z.string().uuid().nullable().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("erp_reconciliation_runs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (data.brandId) q = q.eq("brand_id", data.brandId);
    const { data: runs, error } = await q;
    if (error) throw new Error(error.message);
    return runs ?? [];
  });

// ---------- Apply run ----------

export const applyPathaoReconciliationRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        runId: z.string().uuid(),
        walletAccountId: z.string().uuid().nullable().optional(),
        feeCategoryId: z.string().uuid().nullable().optional(),
        includeMismatch: z.boolean().default(false),
        brandWallets: z.record(z.string().uuid(), z.string().uuid()).optional(),
        brandFeeCategories: z.record(z.string().uuid(), z.string().uuid()).optional(),
        // Batching — client loops until done to avoid request timeouts on big invoices
        limit: z.number().int().min(1).max(500).optional().default(120),
        afterId: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { applyReconRunCore } = await import("./reconciliation-core.server");
    return await applyReconRunCore(supabase, userId, data);
  });

// ---------- Revert run ----------

export const revertPathaoReconciliationRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ runId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: rows, error: rowErr } = await supabase
      .from("erp_reconciliation_rows")
      .select("id, matched_order_id, match_type, applied_income_txn_id, applied_expense_txn_id")
      .eq("run_id", data.runId);
    if (rowErr) throw new Error(rowErr.message);

    const txnIds = (rows ?? [])
      .flatMap((r) => [r.applied_income_txn_id, r.applied_expense_txn_id])
      .filter(Boolean) as string[];

    if (txnIds.length) {
      await supabase.from("erp_transactions").delete().in("id", txnIds);
    }

    // Invoice-first model: remove the single invoice-level wallet settlement.
    await supabase
      .from("erp_transactions")
      .delete()
      .eq("reference_type", "cod_invoice")
      .eq("reference_id", data.runId);


    // Re-post delivery-time baseline for every matched order. Since apply now
    // deletes the pre-reconciliation order_delivery/order_courier/order_return_charge
    // rows (replace-on-reconciliation), revert must restore them — otherwise the
    // orders would be left with zero finance entries. We do this by flipping
    // orders.status back to the appropriate delivered-side state; the
    // fn_post_order_delivery_to_finance trigger then re-posts the baseline rows.
    const matchedOrders = (rows ?? [])
      .filter((r) => r.matched_order_id)
      .map((r) => ({
        orderId: r.matched_order_id as string,
        matchType: (r as { match_type?: string }).match_type ?? "paid",
      }));
    for (const { orderId, matchType } of matchedOrders) {
      const restoredStatus =
        matchType === "return" ? "paid_return" : matchType === "partial" ? "partial_delivered" : "delivered";
      const restoreUpdate: Record<string, unknown> = {
        status: restoredStatus,
        reconciliation_status: "pending",
      };
      if (matchType !== "return") restoreUpdate.payment_status = "pending";
      await supabase.from("orders").update(restoreUpdate as never).eq("id", orderId);
    }

    await supabase
      .from("erp_reconciliation_rows")
      .update({ applied_income_txn_id: null, applied_expense_txn_id: null })
      .eq("run_id", data.runId);

    await supabase
      .from("erp_reconciliation_runs")
      .update({ status: "reverted", reverted_at: new Date().toISOString() })
      .eq("id", data.runId);

    return { ok: true, reverted: txnIds.length, restored: matchedOrders.length };
  });

/**
 * Manually (re)post an invoice's full payout to the brand's default COD wallet.
 * Useful after an amount re-sync, or when the default wallet was set later.
 */
export const settleInvoiceToWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        runId: z.string().uuid(),
        walletAccountId: z.string().uuid().nullable().optional(),
        brandId: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { settleInvoiceTotalCore } = await import("./reconciliation-core.server");
    return settleInvoiceTotalCore(context.supabase, context.userId, {
      runId: data.runId,
      walletAccountId: data.walletAccountId ?? null,
      brandId: data.brandId ?? null,
    });
  });


// ---------- Delete draft run ----------

export const deletePathaoReconciliationRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ runId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: run } = await supabase
      .from("erp_reconciliation_runs")
      .select("status")
      .eq("id", data.runId)
      .maybeSingle();
    if (run && run.status === "applied") throw new Error("Cannot delete an applied run. Revert first.");
    const { error } = await supabase.from("erp_reconciliation_runs").delete().eq("id", data.runId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Manual match a row ----------

export const manualMatchReconciliationRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        rowId: z.string().uuid(),
        orderId: z.string().uuid().nullable(),
        acceptDiff: z.boolean().optional().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row } = await supabase
      .from("erp_reconciliation_rows")
      .select("collected, run_id")
      .eq("id", data.rowId)
      .maybeSingle();
    if (!row) throw new Error("Row not found");

    let status = "unmatched";
    let amountDiff: number | null = null;
    if (data.orderId) {
      const { data: ord } = await supabase
        .from("orders")
        .select("total")
        .eq("id", data.orderId)
        .maybeSingle();
      if (ord) {
        amountDiff = Number(row.collected) - Number(ord.total);
        status =
          data.acceptDiff || Math.abs(amountDiff) <= 1 ? "matched" : "amount_mismatch";
      }
    }

    const { error } = await supabase
      .from("erp_reconciliation_rows")
      .update({
        matched_order_id: data.orderId,
        matched_via: data.orderId ? (data.acceptDiff ? "manual_accepted" : "manual") : null,
        match_status: status,
        amount_diff: amountDiff,
      })
      .eq("id", data.rowId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Accept amount diff (single row / whole run) ----------

export const acceptReconciliationDiff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        rowId: z.string().uuid().optional(),
        runId: z.string().uuid().optional(),
        maxAbsDiff: z.number().nonnegative().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    if (!data.rowId && !data.runId) throw new Error("rowId or runId required");

    let q = supabase
      .from("erp_reconciliation_rows")
      .select("id, amount_diff, applied_income_txn_id")
      .eq("match_status", "amount_mismatch");
    if (data.rowId) q = q.eq("id", data.rowId);
    if (data.runId) q = q.eq("run_id", data.runId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const targets = (rows ?? []).filter(
      (r) =>
        !r.applied_income_txn_id &&
        (data.maxAbsDiff === undefined ||
          Math.abs(Number(r.amount_diff ?? 0)) <= data.maxAbsDiff),
    );
    if (targets.length === 0) return { ok: true, accepted: 0 };

    for (let i = 0; i < targets.length; i += 200) {
      const chunk = targets.slice(i, i + 200).map((r) => r.id);
      const { error: uErr } = await supabase
        .from("erp_reconciliation_rows")
        .update({ match_status: "matched", matched_via: "manual_accepted" })
        .in("id", chunk);
      if (uErr) throw new Error(uErr.message);
    }
    return { ok: true, accepted: targets.length };
  });

// ---------- Search orders for manual matching ----------

export const searchOrdersForMatch = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ brandId: z.string().uuid().nullable().optional(), q: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const term = data.q.trim();

    // Consignment / merchant-order lookup → order ids
    const shipIds: string[] = [];
    {
      const { data: ships } = await supabase
        .from("courier_shipments")
        .select("order_id")
        .or(`consignment_id.ilike.%${term}%,tracking_code.ilike.%${term}%`)
        .limit(20);
      for (const s of (ships ?? []) as { order_id: string | null }[]) {
        if (s.order_id) shipIds.push(s.order_id);
      }
    }

    const orMatch = [
      `shipping_phone.ilike.%${term}%`,
      `shipping_name.ilike.%${term}%`,
      `invoice_no.ilike.%${term}%`,
      ...(shipIds.length ? [`id.in.(${shipIds.join(",")})`] : []),
    ].join(",");

    let q = supabase
      .from("orders")
      .select("id, status, total, shipping_name, shipping_phone, invoice_no, created_at, brand_id")
      .or(orMatch)
      .order("created_at", { ascending: false })
      .limit(20);
    if (data.brandId) q = q.eq("brand_id", data.brandId);
    const { data: orders, error } = await q;
    if (error) throw new Error(error.message);
    return orders ?? [];
  });

// ---------- Preview (dry-run match + duplicate detection) ----------

const PreviewRow = z.object({
  idx: z.number().int(),
  consignment_id: z.string().nullable().optional(),
  merchant_order_id: z.string().nullable().optional(),
  recipient_phone: z.string().nullable().optional(),
  collected: z.number(),
  row_type: z.enum(["paid", "return", "partial"]).optional().default("paid"),
});

export type PreviewMatchResult = {
  idx: number;
  status: "matched" | "amount_mismatch" | "unmatched" | "duplicate";
  matched_order_id: string | null;
  matched_via: string | null;
  amount_diff: number | null;
  order_total: number | null;
  order_status: string | null;
  order_name: string | null;
  confidence: number; // 0..1
  match_reason: string | null;
};

export const previewPathaoReconciliation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        brandId: z.string().uuid().nullable().optional(),
        rows: z.array(PreviewRow).min(1),
        tolerance: z.number().min(0).default(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<PreviewMatchResult[]> => {
    const { supabase } = context;
    const brandFilter = data.brandId ?? null;
    const consignmentIds = [
      ...new Set(data.rows.map((r) => r.consignment_id).filter(Boolean) as string[]),
    ];
    const merchantIds = [
      ...new Set(data.rows.map((r) => r.merchant_order_id).filter(Boolean) as string[]),
    ];

    // Cross-run duplicate consignment ids
    const seen = new Set<string>();
    if (consignmentIds.length) {
      const prior = await fetchInChunks<any>(consignmentIds, (chunk) =>
        supabase
          .from("erp_reconciliation_rows")
          .select("consignment_id, run:run_id(brand_id, status)")
          .in("consignment_id", chunk),
      );
      prior.forEach((p: any) => {
        const st = p.run?.status;
        if (p.consignment_id && st !== "reverted" && st !== "draft" && (!brandFilter || p.run?.brand_id === brandFilter)) {
          seen.add(p.consignment_id);
        }
      });
    }

    const byConsignment = new Map<string, string>();
    const byMerchant = new Map<string, string>();
    if (consignmentIds.length) {
      const ships = await fetchInChunks<{ order_id: string; consignment_id: string | null }>(
        consignmentIds,
        (chunk) => {
          let q = supabase
            .from("courier_shipments")
            .select("order_id, consignment_id")
            .in("consignment_id", chunk);
          if (brandFilter) q = q.eq("brand_id", brandFilter);
          return q;
        },
      );
      ships.forEach((s) => {
        if (s.consignment_id) byConsignment.set(s.consignment_id, s.order_id);
      });
    }
    if (merchantIds.length) {
      const ships = await fetchInChunks<{ order_id: string; merchant_order_id: string | null }>(
        merchantIds,
        (chunk) => {
          let q = supabase
            .from("courier_shipments")
            .select("order_id, merchant_order_id")
            .in("merchant_order_id", chunk);
          if (brandFilter) q = q.eq("brand_id", brandFilter);
          return q;
        },
      );
      ships.forEach((s) => {
        if (s.merchant_order_id) byMerchant.set(s.merchant_order_id, s.order_id);
      });
    }

    const out: PreviewMatchResult[] = [];
    type Resolved = {
      orderId: string | null;
      via: string | null;
      confidence: number;
      reason: string | null;
    };
    const resolved = new Map<number, Resolved>();
    const phoneRows: typeof data.rows = [];

    // Pass 1 — cheap in-memory resolution via consignment / merchant maps.
    for (const r of data.rows) {
      if (r.consignment_id && byConsignment.has(r.consignment_id)) {
        resolved.set(r.idx, {
          orderId: byConsignment.get(r.consignment_id)!,
          via: "consignment",
          confidence: 1.0,
          reason: "Consignment ID exact match in courier_shipments",
        });
      } else if (r.merchant_order_id && byMerchant.has(r.merchant_order_id)) {
        resolved.set(r.idx, {
          orderId: byMerchant.get(r.merchant_order_id)!,
          via: "merchant_order_id",
          confidence: 0.95,
          reason: "Merchant order ID exact match",
        });
      } else if (normalizePhone(r.recipient_phone)) {
        phoneRows.push(r);
      }
    }

    // Pass 2 — phone fallback, resolved with bounded concurrency (was sequential).
    const resolveByPhone = async (r: (typeof data.rows)[number]): Promise<void> => {
      const phone = normalizePhone(r.recipient_phone)!;
      {
        {
          // Smarter fallback: pull recent orders by phone AND check if any
          // already has a courier_shipments row for this brand. A linked
          // shipment dramatically increases confidence even when Pathao
          // didn't echo merchant_order_id back.
          let oq = supabase
            .from("orders")
            .select("id, total, shipping_phone, created_at")
            .ilike("shipping_phone", `%${phone}`)
            .order("created_at", { ascending: false })
            .limit(10);
          if (brandFilter) oq = oq.eq("brand_id", brandFilter);
          const { data: ords } = await oq;

          // Bulk lookup: which of those orders already has a shipment row for this brand?
          const candidateOrderIds = (ords ?? []).map((o) => o.id);
          const shipmentOrderIds = new Set<string>();
          if (candidateOrderIds.length) {
            let sq = supabase
              .from("courier_shipments")
              .select("order_id")
              .in("order_id", candidateOrderIds);
            if (brandFilter) sq = sq.eq("brand_id", brandFilter);
            const { data: ships } = await sq;
            (ships ?? []).forEach((s) => shipmentOrderIds.add(s.order_id));
          }

          type Cand = {
            id: string;
            total: number;
            diff: number;
            hasShipment: boolean;
            score: number;
            label: string;
          };
          const cands: Cand[] = (ords ?? []).map((o) => {
            const total = Number(o.total);
            const diff = Math.abs(total - r.collected);
            const hasShipment = shipmentOrderIds.has(o.id);
            // Score: amount closeness (up to 0.6) + shipment-link bonus (0.3) + phone-only base (0.2)
            let score = 0.2;
            if (diff <= data.tolerance) score += 0.6;
            else if (diff <= 50) score += 0.45;
            else if (diff <= 150) score += 0.25;
            if (hasShipment) score += 0.3;
            const parts: string[] = [`phone last-${phone.length}`];
            if (diff <= data.tolerance) parts.push("amount exact");
            else if (diff <= 50) parts.push(`amount ±${diff.toFixed(0)}`);
            else if (diff <= 150) parts.push(`amount diff ${diff.toFixed(0)}`);
            if (hasShipment) parts.push("has shipment");
            return { id: o.id, total, diff, hasShipment, score: Math.min(score, 0.95), label: parts.join(" + ") };
          });
          cands.sort((a, b) => b.score - a.score);
          const best = cands[0];
          // Require minimum signal: either amount within 50, OR shipment-linked
          if (best && (best.diff <= 50 || best.hasShipment)) {
            resolved.set(r.idx, {
              orderId: best.id,
              via: best.hasShipment ? "shipment+phone" : "phone+amount",
              confidence: best.score,
              reason: best.label,
            });
          } else if (best && cands.length === 1 && best.diff <= 300) {
            // Single phone hit, lenient: keep but low confidence
            resolved.set(r.idx, {
              orderId: best.id,
              via: "phone-only",
              confidence: best.score,
              reason: `single phone hit (diff ${best.diff.toFixed(0)})`,
            });
          }
        }
      }
    };
    const POOL = 12;
    for (let i = 0; i < phoneRows.length; i += POOL) {
      await Promise.all(phoneRows.slice(i, i + POOL).map(resolveByPhone));
    }

    // Pass 3 — one bulk fetch of every matched order (was 1 query per row).
    const orderIds = [
      ...new Set([...resolved.values()].map((v) => v.orderId).filter(Boolean) as string[]),
    ];
    const orderById = new Map<string, { total: number; status: string; shipping_name: string | null }>();
    if (orderIds.length) {
      const ords = await fetchInChunks<any>(orderIds, (chunk) =>
        supabase.from("orders").select("id, total, status, shipping_name").in("id", chunk),
      );
      ords.forEach((o: any) =>
        orderById.set(o.id, {
          total: Number(o.total),
          status: o.status,
          shipping_name: o.shipping_name ?? null,
        }),
      );
    }

    for (const r of data.rows) {
      const res = resolved.get(r.idx);
      const orderId = res?.orderId ?? null;
      const via = res?.via ?? null;
      const confidence = res?.confidence ?? 0;
      const reason = res?.reason ?? null;

      let amountDiff: number | null = null;
      let orderTotal: number | null = null;
      let orderStatus: string | null = null;
      let orderName: string | null = null;
      let status: PreviewMatchResult["status"] = "unmatched";
      if (orderId) {
        const ord = orderById.get(orderId);
        if (ord) {
          orderTotal = Number(ord.total);
          orderStatus = ord.status;
          orderName = ord.shipping_name ?? null;
          const rt = r.row_type ?? "paid";
          if (rt === "return" || rt === "partial") {
            // Return/partial rows are expected to have collected != order.total.
            amountDiff = null;
            status = "matched";
          } else {
            amountDiff = r.collected - orderTotal;
            status = Math.abs(amountDiff) <= data.tolerance ? "matched" : "amount_mismatch";
          }
        } else {
          status = "matched";
        }
      }
      if (r.consignment_id && seen.has(r.consignment_id)) status = "duplicate";

      out.push({
        idx: r.idx,
        status,
        matched_order_id: orderId,
        matched_via: via,
        amount_diff: amountDiff,
        order_total: orderTotal,
        order_status: orderStatus,
        order_name: orderName,
        confidence,
        match_reason: reason,
      });
    }
    return out;
  });