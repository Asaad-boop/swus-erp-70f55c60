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

/**
 * Pathao's `order.paid` / payment-invoice webhook only carries identifiers —
 * no money fields. We therefore pull the invoice CSV once per invoice_id and
 * look up the real amounts for the consignment.
 */
type InvoiceAmounts = {
  collected: number;
  delivery_fee: number;
  cod_fee: number;
  other_fee: number;
  discount: number;
  total_fee: number;
  payout: number;
  invoice_date: string | null;
  row_type: "paid" | "return" | "partial";
};

const invoiceCsvCache = new Map<string, { at: number; rows: Map<string, InvoiceAmounts> }>();
const INVOICE_CACHE_MS = 10 * 60_000;

async function loadInvoiceAmounts(
  supabase: AnyRec,
  invoiceId: string,
  brandId: string | null,
  force = false,
): Promise<Map<string, InvoiceAmounts>> {
  const hit = invoiceCsvCache.get(invoiceId);
  if (!force && hit && Date.now() - hit.at < INVOICE_CACHE_MS) return hit.rows;

  const map = new Map<string, InvoiceAmounts>();
  try {
    const [{ loadPathaoCreds }, { fetchOnePathaoInvoiceCsv }, { parsePathaoCsv }] = await Promise.all([
      import("./pathao.server"),
      import("./pathao-invoices.server"),
      import("./pathao-csv"),
    ]);
    const creds = await loadPathaoCreds(supabase, brandId);
    const { csv } = await fetchOnePathaoInvoiceCsv(
      { username: creds.username, password: creds.password, store_id: creds.store_id },
      invoiceId,
    );
    if (csv) {
      for (const r of parsePathaoCsv(csv)) {
        const amounts: InvoiceAmounts = {
          collected: r.collected,
          delivery_fee: r.delivery_fee,
          cod_fee: r.cod_fee,
          other_fee: r.other_fee,
          discount: r.discount,
          total_fee: r.total_fee,
          payout: r.payout,
          invoice_date: r.invoice_date,
          row_type: r.row_type,
        };
        if (r.consignment_id) map.set(`c:${String(r.consignment_id).trim().toUpperCase()}`, amounts);
        if (r.merchant_order_id) map.set(`m:${String(r.merchant_order_id).trim().toUpperCase()}`, amounts);
      }
    }
  } catch {
    // credentials missing / portal down → keep zeros, row stays visible
  }
  invoiceCsvCache.set(invoiceId, { at: Date.now(), rows: map });
  return map;
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

  let collected = num(d.collected_amount ?? d.amount_to_collect ?? d.collected ?? 0);
  let deliveryFee = num(d.delivery_fee);
  let codFee = num(d.cod_fee);
  let discount = num(d.discount);
  let otherFee = num(d.additional_charge) + num(d.insta_fee) + num(d.instapay_fee);
  let totalFee = d.total_fee != null ? num(d.total_fee) : deliveryFee + codFee + otherFee - discount;
  let payout = d.payout != null ? num(d.payout) : collected - totalFee;
  let invoiceDate: string = String(d.invoice_date ?? d.payment_date ?? d.updated_at ?? new Date().toISOString()).slice(0, 10);
  let csvRowType: "paid" | "return" | "partial" | null = null;

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

  // ---- amount enrichment ----
  // Pathao's webhook payload has no money fields, so payout/fee would land as
  // 0. Pull the real numbers from the invoice CSV (cached per invoice_id).
  if (collected === 0 && totalFee === 0 && payout === 0 && invoiceId) {
    const amounts = await loadInvoiceAmounts(supabase, String(invoiceId), brandId);
    const hit =
      (consignmentId ? amounts.get(`c:${consignmentId.trim().toUpperCase()}`) : undefined) ??
      (merchantOrderId ? amounts.get(`m:${merchantOrderId.trim().toUpperCase()}`) : undefined);
    if (hit) {
      collected = hit.collected;
      deliveryFee = hit.delivery_fee;
      codFee = hit.cod_fee;
      otherFee = hit.other_fee;
      discount = hit.discount;
      totalFee = hit.total_fee;
      payout = hit.payout;
      csvRowType = hit.row_type;
      if (hit.invoice_date) invoiceDate = hit.invoice_date.slice(0, 10);
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

  const matchType = csvRowType ?? rowTypeFor(event, collected, orderTotal);

  // ---- run (one per invoice + brand) ----
  const sourceName = `instapay:${invoiceId ?? invoiceDate}`;
  let runId: string | null = null;
  {
    // One run per invoice. Earlier versions keyed on (invoice, brand), which
    // created duplicate runs when the first webhook row had no brand match.
    const { data: candidates } = await supabase
      .from("erp_reconciliation_runs")
      .select("id, brand_id, total_rows, total_collected, total_fee, total_payout, status")
      .eq("courier", "pathao")
      .eq("source_filename", sourceName)
      .neq("status", "reverted")
      .order("created_at", { ascending: true })
      .limit(5);
    const pool = (candidates ?? []) as AnyRec[];
    const existing = pool.find((r) => brandId && r.brand_id === brandId) ?? pool[0] ?? null;
    if (existing?.id && brandId && !existing.brand_id) {
      await supabase.from("erp_reconciliation_runs").update({ brand_id: brandId }).eq("id", existing.id);
    }
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
  return recountRun(supabase, runId);
}

async function recountRun(supabase: AnyRec, runId: string) {
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
  // INVOICE-FIRST: no per-order cash posting. The invoice net payout is posted
  // once to the brand's default COD wallet by settleInvoiceTotalCore, so rows
  // only drive allocation/status — never the wallet balance.

  // Replace-on-reconciliation: invoice is ground truth.
  await supabase
    .from("erp_transactions")
    .delete()
    .eq("reference_id", p.orderId)
    .in("reference_type", ["order_courier", "order_delivery", "order_return_charge"]);

  // Clear any legacy per-order payout/deduction posted by the old row-wise flow.
  const legacyWalletId = await findInstapayWallet(supabase, p.brandId);
  if (legacyWalletId) {
    await supabase
      .from("erp_transactions")
      .delete()
      .eq("reference_id", p.orderId)
      .eq("reference_type", "order")
      .eq("account_id", legacyWalletId);
  }

  const incomeId: string | null = null;
  const expenseId: string | null = null;


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
/**
 * Re-apply an InstaPay invoice: pull the merchant CSV for `invoiceId`, write the
 * real collected/fee/payout onto the rows that were ingested with zeros, post
 * the wallet payout, and recompute the run totals. Idempotent.
 */
export async function backfillInstapayInvoice(
  supabase: AnyRec,
  invoiceId: string,
  opts: { onlyZeroRows?: boolean } = {},
): Promise<AnyRec> {
  const onlyZero = opts.onlyZeroRows !== false;
  const sourceName = `instapay:${invoiceId}`;

  const { data: run } = await supabase
    .from("erp_reconciliation_runs")
    .select("id, brand_id, status")
    .eq("courier", "pathao")
    .eq("source_filename", sourceName)
    .neq("status", "reverted")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!run?.id) return { ok: false, invoiceId, reason: "run not found" };

  const { data: rows } = await supabase
    .from("erp_reconciliation_rows")
    .select("id, consignment_id, merchant_order_id, matched_order_id, brand_id, payout, invoice_date")
    .eq("run_id", run.id);
  const list = (rows ?? []) as AnyRec[];
  if (!list.length) return { ok: false, invoiceId, reason: "no rows" };

  const amounts = await loadInvoiceAmounts(supabase, invoiceId, run.brand_id ?? null, true);
  if (!amounts.size) return { ok: false, invoiceId, reason: "invoice csv unavailable" };

  let updated = 0;
  let applied = 0;
  let payoutSum = 0;
  const errors: string[] = [];

  for (const r of list) {
    if (onlyZero && num(r.payout) !== 0) {
      payoutSum += num(r.payout);
      continue;
    }
    const hit =
      (r.consignment_id ? amounts.get(`c:${String(r.consignment_id).trim().toUpperCase()}`) : undefined) ??
      (r.merchant_order_id ? amounts.get(`m:${String(r.merchant_order_id).trim().toUpperCase()}`) : undefined);
    if (!hit) continue;

    const brandId: string | null = r.brand_id ?? run.brand_id ?? null;
    let orderTotal: number | null = null;
    if (r.matched_order_id) {
      const { data: o } = await supabase.from("orders").select("total").eq("id", r.matched_order_id).maybeSingle();
      if (o) orderTotal = num(o.total);
    }
    const matchType = hit.row_type ?? rowTypeFor("", hit.collected, orderTotal);
    const invoiceDate = (hit.invoice_date ?? r.invoice_date ?? new Date().toISOString()).slice(0, 10);

    const { error: upErr } = await supabase
      .from("erp_reconciliation_rows")
      .update({
        collected: hit.collected,
        delivery_fee: hit.delivery_fee,
        cod_fee: hit.cod_fee,
        other_fee: hit.other_fee,
        discount: hit.discount,
        total_fee: hit.total_fee,
        payout: hit.payout,
        invoice_date: invoiceDate,
        match_type: matchType,
        return_fee: matchType === "return" ? hit.total_fee : 0,
        partial_amount: matchType === "partial" ? hit.collected : 0,
        amount_diff: matchType === "paid" && orderTotal != null ? hit.collected - orderTotal : null,
      })
      .eq("id", r.id);
    if (upErr && /event_uidx|duplicate key/i.test(upErr.message ?? "")) {
      // A still-draft CSV run holds the same consignment/date/payout. The
      // applied InstaPay row is the ground truth — drop the unapplied twin.
      if (r.consignment_id) {
        const { data: twins } = await supabase
          .from("erp_reconciliation_rows")
          .select("id, run_id, applied_income_txn_id, applied_expense_txn_id, run:run_id(status)")
          .eq("consignment_id", r.consignment_id)
          .neq("run_id", run.id);
        for (const t of (twins ?? []) as AnyRec[]) {
          if (t.run?.status === "draft" && !t.applied_income_txn_id && !t.applied_expense_txn_id) {
            await supabase.from("erp_reconciliation_rows").delete().eq("id", t.id);
            await recountRun(supabase, t.run_id);
          }
        }
      }
      const { error: retryErr } = await supabase
        .from("erp_reconciliation_rows")
        .update({
          collected: hit.collected,
          delivery_fee: hit.delivery_fee,
          cod_fee: hit.cod_fee,
          other_fee: hit.other_fee,
          discount: hit.discount,
          total_fee: hit.total_fee,
          payout: hit.payout,
          invoice_date: invoiceDate,
          match_type: matchType,
        })
        .eq("id", r.id);
      if (retryErr) errors.push(`${r.consignment_id ?? r.id}: ${retryErr.message}`);
    } else if (upErr) {
      errors.push(`${r.consignment_id ?? r.id}: ${upErr.message}`);
    }
    updated += 1;
    payoutSum += hit.payout;

    if (r.matched_order_id && brandId) {
      await applyInstapayRow(supabase, {
        rowId: r.id,
        orderId: r.matched_order_id,
        brandId,
        consignmentId: r.consignment_id ?? null,
        matchType,
        collected: hit.collected,
        totalFee: hit.total_fee,
        payout: hit.payout,
        txnDate: invoiceDate,
        label: `Pathao InstaPay · ${invoiceId}`,
      });
      applied += 1;
    }
  }

  // recompute run money totals from its rows
  const { data: fresh } = await supabase
    .from("erp_reconciliation_rows")
    .select("collected, total_fee, payout")
    .eq("run_id", run.id);
  const f = (fresh ?? []) as AnyRec[];
  await supabase
    .from("erp_reconciliation_runs")
    .update({
      total_rows: f.length,
      total_collected: f.reduce((s, x) => s + num(x.collected), 0),
      total_fee: f.reduce((s, x) => s + num(x.total_fee), 0),
      total_payout: f.reduce((s, x) => s + num(x.payout), 0),
      status: "applied",
      applied_at: new Date().toISOString(),
    })
    .eq("id", run.id);
  await recountRun(supabase, run.id);

  return { ok: true, invoiceId, runId: run.id, rows: list.length, updated, applied, payout: +payoutSum.toFixed(2), errors };
}
