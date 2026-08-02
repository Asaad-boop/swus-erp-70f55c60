/**
 * Pathao InstaPay — payment-invoice ingestion.
 *
 * Pathao's merchant webhook fires `order.payment-invoice` (and paid /
 * paid-return variants) whenever a payout invoice is generated. This module
 * turns each of those events into a reconciliation row (grouped per invoice)
 * and — when auto mode is on — immediately applies it: order settled, payout
 * credited to the brand's "INSTAPAY PATHAO" wallet.
 *
 * Manual CSV upload keeps working exactly as before; duplicates are guarded by
 * consignment_id so the same shipment is never booked twice.
 */

const INSTAPAY_WALLET_NAME = "INSTAPAY PATHAO";

type AnyRec = Record<string, any>;

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function isPaymentInvoiceEvent(payload: AnyRec): boolean {
  const ev = String(payload?.event ?? payload?.data?.event ?? "").toLowerCase();
  if (!ev) return false;
  return (
    ev.includes("payment-invoice") ||
    ev.includes("payment_invoice") ||
    ev === "order.paid" ||
    ev === "order.paid-return" ||
    ev === "order.paid_return"
  );
}

function rowTypeFor(event: string, collected: number, orderTotal: number | null): "paid" | "return" | "partial" {
  const ev = event.toLowerCase();
  if (ev.includes("return")) return "return";
  if (collected <= 0) return "return";
  if (orderTotal != null && orderTotal > 0 && collected < orderTotal - 1) return "partial";
  return "paid";
}

/** Find (or create) the brand's INSTAPAY PATHAO wallet account. */
export async function ensureInstapayWallet(supabase: AnyRec, brandId: string): Promise<string> {
  const { data: found } = await supabase
    .from("erp_accounts")
    .select("id")
    .eq("brand_id", brandId)
    .ilike("name", INSTAPAY_WALLET_NAME)
    .maybeSingle();
  if (found?.id) return found.id as string;

  const { data: created, error } = await supabase
    .from("erp_accounts")
    .insert({
      brand_id: brandId,
      name: INSTAPAY_WALLET_NAME,
      account_type: "bkash",
      account_subtype: "bkash",
      wallet_type: "mfs",
      opening_balance: 0,
      current_balance: 0,
      is_active: true,
      notes: "Pathao InstaPay payouts (auto from webhook)",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return (created as { id: string }).id;
}

/** Is auto-apply enabled for this brand? Defaults to true. */
async function autoApplyEnabled(supabase: AnyRec, brandId: string | null): Promise<boolean> {
  if (!brandId) return true;
  const { data } = await supabase
    .from("erp_settings")
    .select("config")
    .eq("brand_id", brandId)
    .maybeSingle();
  const v = (data?.config as AnyRec | null)?.instapay_auto_apply;
  return v === undefined || v === null ? true : Boolean(v);
}

export type InstapayResult = {
  ok: boolean;
  action: "applied" | "pending" | "duplicate" | "unmatched" | "ignored";
  invoiceId?: string | null;
  runId?: string | null;
  payout?: number;
  reason?: string;
};

/**
 * Ingest one Pathao payment-invoice webhook payload.
 * Idempotent per consignment_id.
 */
export async function ingestPathaoPaymentInvoice(supabase: AnyRec, payload: AnyRec): Promise<InstapayResult> {
  const d: AnyRec = { ...(payload ?? {}), ...(payload?.data ?? {}) };
  const event = String(d.event ?? "order.payment-invoice");
  const invoiceId: string | null = d.invoice_id ?? d.invoice ?? d.payment_invoice_id ?? null;
  const consignmentId: string | null = d.consignment_id ?? null;
  const merchantOrderId: string | null = d.merchant_order_id ?? null;

  if (!consignmentId && !merchantOrderId) {
    return { ok: true, action: "ignored", reason: "no identifiers" };
  }

  const collected = num(d.collected_amount ?? d.amount_to_collect ?? d.collected ?? 0);
  const deliveryFee = num(d.delivery_fee);
  const codFee = num(d.cod_fee);
  const discount = num(d.discount);
  const otherFee = num(d.additional_charge) + num(d.insta_fee) + num(d.instapay_fee);
  const totalFee = d.total_fee != null ? num(d.total_fee) : deliveryFee + codFee + otherFee - discount;
  const payout = d.payout != null ? num(d.payout) : collected - totalFee;
  const invoiceDate: string = String(d.invoice_date ?? d.payment_date ?? d.updated_at ?? new Date().toISOString()).slice(0, 10);

  // ---- match order ----
  let orderId: string | null = null;
  let brandId: string | null = null;

  if (consignmentId) {
    const { data: ship } = await supabase
      .from("courier_shipments")
      .select("order_id, brand_id")
      .eq("consignment_id", consignmentId)
      .ilike("provider", "%pathao%")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ship) {
      orderId = ship.order_id;
      brandId = ship.brand_id ?? null;
    }
  }
  if (!orderId && merchantOrderId) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(merchantOrderId);
    const filter = isUuid ? `invoice_no.eq.${merchantOrderId},id.eq.${merchantOrderId}` : `invoice_no.eq.${merchantOrderId}`;
    const { data: o } = await supabase.from("orders").select("id, brand_id").or(filter).maybeSingle();
    if (o) {
      orderId = o.id;
      brandId = o.brand_id;
    }
  }

  let orderTotal: number | null = null;
  if (orderId) {
    const { data: o } = await supabase.from("orders").select("total, brand_id").eq("id", orderId).maybeSingle();
    if (o) {
      orderTotal = num(o.total);
      brandId = brandId ?? o.brand_id ?? null;
    }
  }

  // ---- duplicate guard (consignment already booked in a live run) ----
  if (consignmentId) {
    const { data: prior } = await supabase
      .from("erp_reconciliation_rows")
      .select("id, run:run_id(status)")
      .eq("consignment_id", consignmentId)
      .limit(5);
    const live = (prior ?? []).some((p: AnyRec) => p.run?.status !== "reverted");
    if (live) return { ok: true, action: "duplicate", invoiceId, reason: "consignment already reconciled" };
  }

  const matchType = rowTypeFor(event, collected, orderTotal);

  // ---- run (one per invoice + brand) ----
  const sourceName = `instapay:${invoiceId ?? invoiceDate}`;
  let runId: string | null = null;
  {
    let q = supabase
      .from("erp_reconciliation_runs")
      .select("id, total_rows, total_collected, total_fee, total_payout, status")
      .eq("courier", "pathao")
      .eq("source_filename", sourceName)
      .neq("status", "reverted")
      .limit(1);
    q = brandId ? q.eq("brand_id", brandId) : q.is("brand_id", null);
    const { data: existing } = await q.maybeSingle();
    if (existing?.id) {
      runId = existing.id;
      await supabase
        .from("erp_reconciliation_runs")
        .update({
          total_rows: num(existing.total_rows) + 1,
          total_collected: num(existing.total_collected) + collected,
          total_fee: num(existing.total_fee) + totalFee,
          total_payout: num(existing.total_payout) + payout,
        })
        .eq("id", runId);
    } else {
      const { data: created, error } = await supabase
        .from("erp_reconciliation_runs")
        .insert({
          brand_id: brandId,
          courier: "pathao",
          source_filename: sourceName,
          total_rows: 1,
          total_collected: collected,
          total_fee: totalFee,
          total_payout: payout,
          status: "draft",
          notes: "Pathao InstaPay webhook",
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      runId = (created as { id: string }).id;
    }
  }

  const matchStatus = orderId ? "matched" : "unmatched";

  const { data: rowIns, error: rowErr } = await supabase
    .from("erp_reconciliation_rows")
    .insert({
      run_id: runId,
      brand_id: brandId,
      consignment_id: consignmentId,
      merchant_order_id: merchantOrderId,
      recipient_name: d.recipient_name ?? null,
      recipient_phone: d.recipient_phone ?? null,
      invoice_date: invoiceDate,
      collected,
      delivery_fee: deliveryFee,
      cod_fee: codFee,
      other_fee: otherFee,
      discount,
      total_fee: totalFee,
      payout,
      store_name: d.store_name ?? null,
      raw: payload ?? null,
      match_status: matchStatus,
      matched_order_id: orderId,
      matched_via: orderId ? (consignmentId ? "consignment" : "merchant_order_id") : null,
      amount_diff: matchType === "paid" && orderTotal != null ? collected - orderTotal : null,
      match_type: matchType,
      return_fee: matchType === "return" ? totalFee : 0,
      partial_amount: matchType === "partial" ? collected : 0,
    })
    .select("id")
    .single();
  if (rowErr) throw new Error(rowErr.message);
  const rowId = (rowIns as { id: string }).id;

  await bumpRunCounts(supabase, runId!);

  if (!orderId || !brandId) {
    return { ok: true, action: "unmatched", invoiceId, runId, payout };
  }

  if (!(await autoApplyEnabled(supabase, brandId))) {
    return { ok: true, action: "pending", invoiceId, runId, payout };
  }

  await applyInstapayRow(supabase, {
    rowId,
    orderId,
    brandId,
    consignmentId,
    matchType,
    collected,
    totalFee,
    payout,
    txnDate: invoiceDate,
    label: `Pathao InstaPay · ${invoiceId ?? consignmentId ?? ""}`.trim(),
  });

  await supabase
    .from("erp_reconciliation_runs")
    .update({ status: "applied", applied_at: new Date().toISOString() })
    .eq("id", runId);

  return { ok: true, action: "applied", invoiceId, runId, payout };
}

async function bumpRunCounts(supabase: AnyRec, runId: string) {
  const { data: rows } = await supabase
    .from("erp_reconciliation_rows")
    .select("match_status")
    .eq("run_id", runId);
  const list = (rows ?? []) as Array<{ match_status: string }>;
  await supabase
    .from("erp_reconciliation_runs")
    .update({
      matched_count: list.filter((r) => r.match_status === "matched").length,
      mismatched_count: list.filter((r) => r.match_status === "amount_mismatch").length,
      unmatched_count: list.filter((r) => r.match_status === "unmatched" || r.match_status === "duplicate").length,
    })
    .eq("id", runId);
}

/**
 * Post one InstaPay row. Mirrors applyPathaoReconciliationRun's cash model:
 * only the payout hits the wallet (courier fees are already deducted by Pathao),
 * fees stay visible on the row + per-SKU allocation.
 */
async function applyInstapayRow(
  supabase: AnyRec,
  p: {
    rowId: string;
    orderId: string;
    brandId: string;
    consignmentId: string | null;
    matchType: "paid" | "return" | "partial";
    collected: number;
    totalFee: number;
    payout: number;
    txnDate: string;
    label: string;
  },
) {
  const walletId = await ensureInstapayWallet(supabase, p.brandId);

  // Replace-on-reconciliation: invoice is ground truth.
  await supabase
    .from("erp_transactions")
    .delete()
    .eq("reference_id", p.orderId)
    .in("reference_type", ["order_courier", "order_delivery", "order_return_charge"]);

  // Idempotency: remove any earlier payout/deduction posted for this order on
  // the same wallet so a re-sent invoice replaces instead of stacking.
  await supabase
    .from("erp_transactions")
    .delete()
    .eq("reference_id", p.orderId)
    .eq("reference_type", "order")
    .eq("account_id", walletId);

  let incomeId: string | null = null;
  let expenseId: string | null = null;

  if (p.payout > 0) {
    const { data: inc, error } = await supabase
      .from("erp_transactions")
      .insert({
        brand_id: p.brandId,
        txn_type: "income",
        account_id: walletId,
        amount: p.payout,
        transaction_date: p.txnDate,
        reference_type: "order",
        reference_id: p.orderId,
        description: `${p.label} · payout`,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    incomeId = (inc as { id: string }).id;
  } else if (p.payout < 0) {
    const { data: exp, error } = await supabase
      .from("erp_transactions")
      .insert({
        brand_id: p.brandId,
        txn_type: "expense",
        account_id: walletId,
        amount: -p.payout,
        transaction_date: p.txnDate,
        reference_type: "order",
        reference_id: p.orderId,
        description: `${p.label} · courier deduction`,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    expenseId = (exp as { id: string }).id;
  }

  const orderUpdate: AnyRec = {
    reconciliation_status: "reconciled",
    courier_fee: p.totalFee,
    net_collected: p.payout,
  };
  if (p.matchType === "return") {
    orderUpdate.status = "returned";
  } else if (p.matchType === "partial") {
    orderUpdate.status = "partial_delivered";
    orderUpdate.payment_status = "partial";
    orderUpdate.partial_amount = p.collected;
    orderUpdate.delivered_at = new Date(p.txnDate).toISOString();
  } else {
    orderUpdate.status = "paid";
    orderUpdate.payment_status = "paid";
    orderUpdate.delivered_at = new Date(p.txnDate).toISOString();
  }
  await supabase.from("orders").update(orderUpdate).eq("id", p.orderId);

  // Per-SKU courier cost allocation
  if (p.totalFee > 0) {
    const { data: lines } = await supabase
      .from("order_items")
      .select("id, line_total")
      .eq("order_id", p.orderId);
    const totalLine = (lines ?? []).reduce((s: number, l: AnyRec) => s + num(l.line_total), 0);
    if (totalLine > 0) {
      for (const l of lines as AnyRec[]) {
        const share = (num(l.line_total) / totalLine) * p.totalFee;
        await supabase.from("order_items").update({ courier_cost_allocated: +share.toFixed(2) }).eq("id", l.id);
      }
    }
  }

  if (p.consignmentId) {
    const shipStatus = p.matchType === "return" ? "Returned" : p.matchType === "partial" ? "Partial Delivered" : "Delivered";
    await supabase
      .from("courier_shipments")
      .update({ delivery_fee: p.totalFee, status: shipStatus })
      .eq("consignment_id", p.consignmentId);
  }

  await supabase
    .from("erp_reconciliation_rows")
    .update({ applied_income_txn_id: incomeId, applied_expense_txn_id: expenseId })
    .eq("id", p.rowId);
}