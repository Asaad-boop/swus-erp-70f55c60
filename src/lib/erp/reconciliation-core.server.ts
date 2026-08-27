/**
 * Shared reconciliation core.
 * Extracted from reconciliation.functions.ts so both the authenticated
 * server functions AND the auto-sync cron (admin client) run identical logic.
 */

type Sb = any;

export type ReconRowInput = {
  consignment_id?: string | null;
  merchant_order_id?: string | null;
  recipient_name?: string | null;
  recipient_phone?: string | null;
  invoice_date?: string | null;
  collected: number;
  delivery_fee: number;
  cod_fee: number;
  other_fee: number;
  discount: number;
  total_fee: number;
  payout: number;
  store_name?: string | null;
  raw?: unknown;
  row_type?: "paid" | "return" | "partial";
  return_fee?: number;
  partial_amount?: number;
};

export type CreateRunInput = {
  brandId?: string | null;
  filename?: string | null;
  rows: ReconRowInput[];
  tolerance: number;
};

export type ApplyRunInput = {
  runId: string;
  walletAccountId?: string | null;
  feeCategoryId?: string | null;
  includeMismatch: boolean;
  brandWallets?: Record<string, string>;
  brandFeeCategories?: Record<string, string>;
  limit: number;
  afterId?: string | null;
};

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

export async function createReconRunCore(
  supabase: Sb,
  userId: string | null,
  data: CreateRunInput,
): Promise<{ runId: string }> {
    const brandFilter = data.brandId ?? null;

    // 1. Create draft run
    const totals = data.rows.reduce(
      (acc, r) => ({
        collected: acc.collected + r.collected,
        fee: acc.fee + r.total_fee,
        payout: acc.payout + r.payout,
      }),
      { collected: 0, fee: 0, payout: 0 },
    );

    const { data: run, error: runErr } = await supabase
      .from("erp_reconciliation_runs")
      .insert({
        brand_id: brandFilter,
        courier: "pathao",
        source_filename: data.filename ?? null,
        uploaded_by: userId,
        total_rows: data.rows.length,
        total_collected: totals.collected,
        total_fee: totals.fee,
        total_payout: totals.payout,
        status: "draft",
      })
      .select("id")
      .single();
    if (runErr) throw new Error(runErr.message);
    const runId = (run as { id: string }).id;

    // 2. Match each row
    // Pre-fetch helpers: consignment + merchant_order_id maps from shipments for this brand
    const consignmentIds = [...new Set(data.rows.map((r) => r.consignment_id).filter(Boolean) as string[])];
    const merchantIds = [...new Set(data.rows.map((r) => r.merchant_order_id).filter(Boolean) as string[])];

    // Cross-run duplicate: same consignment_id already exists in another
    // non-reverted run for this brand. Catches multi-day invoice overlaps
    // even before apply.
    const seenConsignments = new Set<string>();
    if (consignmentIds.length) {
      const prior = await fetchInChunks<any>(consignmentIds, (chunk) =>
        supabase
          .from("erp_reconciliation_rows")
          .select("consignment_id, run:run_id(id, brand_id, status)")
          .in("consignment_id", chunk),
      );
      prior.forEach((p: any) => {
        const st = p.run?.status;
        if (p.consignment_id && st !== "reverted" && (!brandFilter || p.run?.brand_id === brandFilter)) {
          seenConsignments.add(p.consignment_id);
        }
      });
    }

    const shipmentByConsignment = new Map<string, { order_id: string; brand_id: string | null }>();
    const shipmentByMerchant = new Map<string, { order_id: string; brand_id: string | null }>();

    if (consignmentIds.length) {
      const ships = await fetchInChunks<{ order_id: string; consignment_id: string | null; brand_id: string | null }>(
        consignmentIds,
        (chunk) => {
          let q = supabase
            .from("courier_shipments")
            .select("order_id, consignment_id, brand_id")
            .in("consignment_id", chunk);
          if (brandFilter) q = q.eq("brand_id", brandFilter);
          return q;
        },
      );
      ships.forEach((s) => {
        if (s.consignment_id) shipmentByConsignment.set(s.consignment_id, { order_id: s.order_id, brand_id: (s as { brand_id: string | null }).brand_id ?? null });
      });
    }
    if (merchantIds.length) {
      const ships = await fetchInChunks<{ order_id: string; merchant_order_id: string | null; brand_id: string | null }>(
        merchantIds,
        (chunk) => {
          let q = supabase
            .from("courier_shipments")
            .select("order_id, merchant_order_id, brand_id")
            .in("merchant_order_id", chunk);
          if (brandFilter) q = q.eq("brand_id", brandFilter);
          return q;
        },
      );
      ships.forEach((s) => {
        if (s.merchant_order_id) shipmentByMerchant.set(s.merchant_order_id, { order_id: s.order_id, brand_id: (s as { brand_id: string | null }).brand_id ?? null });
      });
    }

    // Build row inserts
    type RowInsert = {
      run_id: string;
      brand_id: string | null;
      consignment_id: string | null;
      merchant_order_id: string | null;
      recipient_name: string | null;
      recipient_phone: string | null;
      invoice_date: string | null;
      collected: number;
      delivery_fee: number;
      cod_fee: number;
      other_fee: number;
      discount: number;
      total_fee: number;
      payout: number;
      store_name: string | null;
      raw: unknown;
      match_status: string;
      matched_order_id: string | null;
      matched_via: string | null;
      amount_diff: number | null;
      match_type: string;
      return_fee: number;
      partial_amount: number;
    };

    const rowInserts: RowInsert[] = [];

    // Pass 1: id-based matching (in-memory), collect phone fallbacks
    type Pre = { r: (typeof data.rows)[number]; matchedOrderId: string | null; matchedVia: string | null; rowBrandId: string | null };
    const pre: Pre[] = data.rows.map((r) => {
      let matchedOrderId: string | null = null;
      let matchedVia: string | null = null;
      let rowBrandId: string | null = brandFilter;
      if (r.consignment_id && shipmentByConsignment.has(r.consignment_id)) {
        const hit = shipmentByConsignment.get(r.consignment_id)!;
        matchedOrderId = hit.order_id;
        rowBrandId = hit.brand_id ?? rowBrandId;
        matchedVia = "consignment";
      } else if (r.merchant_order_id && shipmentByMerchant.has(r.merchant_order_id)) {
        const hit = shipmentByMerchant.get(r.merchant_order_id)!;
        matchedOrderId = hit.order_id;
        rowBrandId = hit.brand_id ?? rowBrandId;
        matchedVia = "merchant_order_id";
      }
      return { r, matchedOrderId, matchedVia, rowBrandId };
    });

    // Pass 2: phone fallback, parallel pool
    const needPhone = pre.filter((p) => !p.matchedOrderId && normalizePhone(p.r.recipient_phone));
    const POOL = 12;
    for (let i = 0; i < needPhone.length; i += POOL) {
      await Promise.all(
        needPhone.slice(i, i + POOL).map(async (p) => {
          const phone = normalizePhone(p.r.recipient_phone)!;
          let q = supabase
            .from("orders")
            .select("id, total, shipping_phone, created_at, brand_id")
            .ilike("shipping_phone", `%${phone}`)
            .order("created_at", { ascending: false })
            .limit(5);
          if (brandFilter) q = q.eq("brand_id", brandFilter);
          const { data: ords } = await q;
          const best = (ords ?? []).find((o: any) => Math.abs(Number(o.total) - p.r.collected) <= 50);
          if (best) {
            p.matchedOrderId = best.id;
            p.rowBrandId = (best as { brand_id: string | null }).brand_id ?? p.rowBrandId;
            p.matchedVia = "phone+amount";
          }
        }),
      );
    }

    // Pass 3: bulk fetch matched orders + already-applied duplicates
    const matchedIds = [...new Set(pre.map((p) => p.matchedOrderId).filter(Boolean) as string[])];
    const orderById = new Map<string, { total: number; brand_id: string | null; advance: number }>();
    const appliedOrderIds = new Set<string>();
    if (matchedIds.length) {
      const ords = await fetchInChunks<{ id: string; total: number; brand_id: string | null; advance_amount: number | null }>(
        matchedIds,
        (chunk) => supabase.from("orders").select("id, total, brand_id, advance_amount").in("id", chunk),
      );
      ords.forEach((o) =>
        orderById.set(o.id, {
          total: Number(o.total),
          brand_id: o.brand_id ?? null,
          advance: Number(o.advance_amount ?? 0),
        }),
      );

       const applied = await fetchInChunks<{ matched_order_id: string }>(matchedIds, (chunk) =>
        supabase
          .from("erp_reconciliation_rows")
          .select("matched_order_id")
          .in("matched_order_id", chunk)
           .or("applied_income_txn_id.not.is.null,applied_expense_txn_id.not.is.null"),
      );
      applied.forEach((a) => a.matched_order_id && appliedOrderIds.add(a.matched_order_id));
    }

    for (const p of pre) {
      const r = p.r;
      const matchedOrderId = p.matchedOrderId;
      const matchedVia = p.matchedVia;
      let rowBrandId = p.rowBrandId;
      let amountDiff: number | null = null;
      let status = "unmatched";
      if (matchedOrderId) {
        const ord = orderById.get(matchedOrderId);
        if (ord) {
          // Return/partial rows should NOT be compared against order.total.
          // For `return` (incl. paid_return) collected = return-delivery fee
          // paid by customer, not the goods amount. For `partial` collected
          // is the partial COD, which is expected to be less than order.total.
          const rt = r.row_type ?? "paid";
          if (rt === "return" || rt === "partial") {
            amountDiff = null;
            status = "matched";
          } else {
            // Prepaid (bKash/advance) orders: the customer already paid us, so
            // the courier collects only the remaining COD (often 0) and simply
            // deducts its delivery/COD fees from the invoice. Compare against
            // the expected COD, not the full order total.
            const expectedCod = Math.max(0, Number(ord.total) - Number(ord.advance ?? 0));
            amountDiff = r.collected - expectedCod;
            status =
              Math.abs(amountDiff) <= data.tolerance ? "matched" : "amount_mismatch";
          }
          rowBrandId = ord.brand_id ?? rowBrandId;
        } else {
          status = "matched"; // already linked though we couldn't re-read
        }

        // Duplicate check: same order already applied in another run
        if (appliedOrderIds.has(matchedOrderId)) status = "duplicate";
      }

      // Cross-run consignment-level duplicate (independent of match)
      if (r.consignment_id && seenConsignments.has(r.consignment_id)) {
        status = "duplicate";
      }

      rowInserts.push({
        run_id: runId,
        brand_id: rowBrandId,
        consignment_id: r.consignment_id ?? null,
        merchant_order_id: r.merchant_order_id ?? null,
        recipient_name: r.recipient_name ?? null,
        recipient_phone: r.recipient_phone ?? null,
        invoice_date: r.invoice_date ?? null,
        collected: r.collected,
        delivery_fee: r.delivery_fee,
        cod_fee: r.cod_fee,
        other_fee: r.other_fee,
        discount: r.discount,
        total_fee: r.total_fee,
        payout: r.payout,
        store_name: r.store_name ?? null,
        raw: r.raw ?? null,
        match_status: status,
        matched_order_id: matchedOrderId,
        matched_via: matchedVia,
        amount_diff: amountDiff,
        match_type: r.row_type ?? "paid",
        return_fee: r.return_fee ?? 0,
        partial_amount: r.partial_amount ?? 0,
      });
    }

    // Dedupe within the file itself — the DB has a unique index on
    // (brand_id, consignment/merchant id, invoice_date, payout).
    const dedupKey = (r: (typeof rowInserts)[number]) =>
      [
        r.brand_id ?? "",
        (r.consignment_id || r.merchant_order_id || "__missing__").trim(),
        r.invoice_date ?? "",
        r.payout,
      ].join("|");
    const seenKeys = new Set<string>();
    const uniqueInserts = rowInserts.filter((r) => {
      const k = dedupKey(r);
      if (seenKeys.has(k)) return false;
      seenKeys.add(k);
      return true;
    });

    // Chunked insert — a single 1700-row insert can exceed request limits and
    // leave the run with zero rows. Rows already ingested (e.g. via the
    // InstaPay webhook) hit the unique index; skip those instead of failing
    // the whole upload.
    const INSERT_CHUNK = 250;
    const isDup = (msg: string) =>
      msg.includes("duplicate key value") || msg.includes("23505");
    for (let i = 0; i < uniqueInserts.length; i += INSERT_CHUNK) {
      const chunk = uniqueInserts.slice(i, i + INSERT_CHUNK);
      const { error: rowErr } = await supabase
        .from("erp_reconciliation_rows")
        .insert(chunk as never);
      if (!rowErr) continue;
      if (!isDup(rowErr.message)) throw new Error(rowErr.message);
      // Retry row-by-row, skipping only the already-ingested ones.
      for (const row of chunk) {
        const { error: oneErr } = await supabase
          .from("erp_reconciliation_rows")
          .insert(row as never);
        if (oneErr && !isDup(oneErr.message)) throw new Error(oneErr.message);
      }
    }

    // Update counts on run
    const matched = rowInserts.filter((r) => r.match_status === "matched").length;
    const mismatched = rowInserts.filter((r) => r.match_status === "amount_mismatch").length;
    const unmatched = rowInserts.filter(
      (r) => r.match_status === "unmatched" || r.match_status === "duplicate",
    ).length;

    await supabase
      .from("erp_reconciliation_runs")
      .update({
        matched_count: matched,
        mismatched_count: mismatched,
        unmatched_count: unmatched,
      })
      .eq("id", runId);

    return { runId };
}

export async function applyReconRunCore(
  supabase: Sb,
  userId: string | null,
  data: ApplyRunInput,
): Promise<{ applied: number; failed: number; done: boolean; nextCursor: string | null; errors: string[] }> {

    const { data: run, error: runErr } = await supabase
      .from("erp_reconciliation_runs")
      .select("*")
      .eq("id", data.runId)
      .maybeSingle();
    if (runErr) throw new Error(runErr.message);
    if (!run) throw new Error("Run not found");
    if (run.status === "applied" && !data.afterId) throw new Error("Already applied");
    // NOTE: run.brand_id can now be null (cross-brand upload). Each row carries its own brand_id.
    const runBrandId: string | null = run.brand_id;

    const allowedStatuses = data.includeMismatch
      ? ["matched", "amount_mismatch"]
      : ["matched"];

    let rowQuery = supabase
      .from("erp_reconciliation_rows")
      .select("*")
      .eq("run_id", data.runId)
      .in("match_status", allowedStatuses)
      .not("matched_order_id", "is", null)
      .order("id", { ascending: true })
      .limit(data.limit);
    if (data.afterId) rowQuery = rowQuery.gt("id", data.afterId);
    const { data: rows, error: rowErr } = await rowQuery;
    if (rowErr) throw new Error(rowErr.message);
    const fetchedCount = (rows ?? []).length;
    const lastId = fetchedCount ? ((rows ?? [])[fetchedCount - 1] as { id: string }).id : null;

    // Resolve per-brand default wallets from erp_settings (auto-pick strategy)
    const brandsInRun = [
      ...new Set(
        (rows ?? [])
          .map((r: any) => (r as { brand_id?: string | null }).brand_id ?? runBrandId)
          .filter(Boolean) as string[],
      ),
    ];
    const brandWalletMap = new Map<string, string>();
    const brandFeeCatMap = new Map<string, string>();
    if (brandsInRun.length) {
      const { data: settings } = await supabase
        .from("erp_settings")
        .select("brand_id, default_cod_wallet_id, default_cod_fee_category_id")
        .in("brand_id", brandsInRun);
      (settings ?? []).forEach((s: { brand_id: string; default_cod_wallet_id: string | null; default_cod_fee_category_id: string | null }) => {
        if (s.default_cod_wallet_id) brandWalletMap.set(s.brand_id, s.default_cod_wallet_id);
        if (s.default_cod_fee_category_id) brandFeeCatMap.set(s.brand_id, s.default_cod_fee_category_id);
      });
    }
    // Caller-provided per-brand overrides (from apply dialog)
    if (data.brandWallets) {
      for (const [b, w] of Object.entries(data.brandWallets)) brandWalletMap.set(b, w);
    }
    if (data.brandFeeCategories) {
      for (const [b, c] of Object.entries(data.brandFeeCategories)) brandFeeCatMap.set(b, c);
    }

    // Check missing wallets before starting
    const missingBrands = brandsInRun.filter((b) => !brandWalletMap.has(b) && !data.walletAccountId);
    if (missingBrands.length) {
      // Load brand names for a friendly error
      const { data: bs } = await supabase.from("brands").select("id,name").in("id", missingBrands);
      const names = (bs ?? []).map((b: any) => b.name).join(", ");
      throw new Error(`Default COD wallet missing for: ${names}. Set in Finance → Settings → Default COD Wallet (per brand), or pass a wallet in the apply dialog.`);
    }

    let applied = 0;
    let failed = 0;
    const errors: string[] = [];

    const rowList = (rows ?? []).filter(
      (r: any) => r.matched_order_id && !r.applied_income_txn_id && !r.applied_expense_txn_id,
    );

    const processRow = async (r: (typeof rowList)[number]) => {
      const orderId = r.matched_order_id as string | null;
      if (!orderId) return;
      const rowBrand = (r as { brand_id?: string | null }).brand_id ?? runBrandId;
      if (!rowBrand) {
        failed++;
        errors.push(`Row ${r.consignment_id ?? r.id}: no brand resolved`);
        return;
      }
      const walletId = brandWalletMap.get(rowBrand) ?? data.walletAccountId ?? null;
      if (!walletId) {
        failed++;
        errors.push(`Row ${r.consignment_id ?? r.id}: no wallet for brand ${rowBrand}`);
        return;
      }
      const feeCategoryId = brandFeeCatMap.get(rowBrand) ?? data.feeCategoryId ?? null;
      try {
        const txnDate = r.invoice_date ?? new Date().toISOString().slice(0, 10);
        const description = `Pathao reconciliation · ${r.consignment_id ?? r.merchant_order_id ?? ""}`;

        const matchType = (r as { match_type?: string }).match_type ?? "paid";
        const returnFee = Number((r as { return_fee?: number }).return_fee ?? 0);
        const partialAmount = Number((r as { partial_amount?: number }).partial_amount ?? 0);
        const payoutNum = Number(r.payout);

        // Replace-on-reconciliation: the invoice is the ground truth, so drop any
        // delivery-time postings for this order (posted by fn_post_order_delivery_to_finance
        // or older backfills) before writing the reconciliation rows. Prevents the
        // duplicate courier-expense / income bug seen in the invoice-upload flow.
        await supabase
          .from("erp_transactions")
          .delete()
          .eq("reference_id", orderId)
          .in("reference_type", ["order_courier", "order_delivery", "order_return_charge"]);

        // INVOICE-FIRST MODEL: rows no longer move cash. The whole invoice payout
        // is posted once as a single wallet transaction (see settleInvoiceTotalCore),
        // so the wallet always equals the courier statement even when some rows
        // stay unmatched. Here we only clear legacy per-row postings.
        await supabase
          .from("erp_transactions")
          .delete()
          .eq("reference_id", orderId)
          .eq("reference_type", "order")
          .ilike("description", "Pathao reconciliation%");

        void returnFee; // kept in schema for history, no longer used on apply
        void partialAmount; // status/amount handled below via orderUpdate
        void feeCategoryId;
        void description;
        const incomeId: string | null = null;
        const expenseId: string | null = null;
        // For downstream displays: courier_fee = the invoice total_fee (what
        // the courier charged for this shipment — visibility only, not a
        // wallet debit). net_collected = payout (allocation of the invoice).
        const displayFee = Number(r.total_fee);


        // Courier API truth-check: Pathao lists prepaid / zero-COD parcels
        // under "return"-shaped invoice lines even when the parcel was actually
        // delivered. Never downgrade a parcel the courier API reports as
        // delivered just because the invoice line looks like a return.
        let effectiveMatchType = matchType;
        if (matchType === "return") {
          const { data: ship } = await supabase
            .from("courier_shipments")
            .select("status, response_payload")
            .eq("order_id", orderId)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          // `status` is the normalized column kept fresh by the webhook/sync;
          // response_payload can be a stale snapshot from booking time, so
          // consider both and let the strongest signal win.
          const payloadStatus = String(
            (ship?.response_payload as { order_status?: string } | null)?.order_status ?? "",
          ).toLowerCase();
          const colStatus = String(ship?.status ?? "").toLowerCase();
          const signals = [colStatus, payloadStatus].filter(Boolean);
          const isReturned = signals.some((s) => s.includes("return"));
          const isPartial = signals.some((s) => s.includes("partial"));
          const isDelivered = signals.some((s) => s.includes("deliver") && !s.includes("partial"));
          if (!isReturned) {
            if (isPartial) effectiveMatchType = "partial";
            else if (isDelivered) effectiveMatchType = "paid";
            // Courier still moving the parcel → money side only, keep status.
            else effectiveMatchType = "unknown";
          }
        }


        // Update order — branch by match_type
        const orderUpdate: Record<string, unknown> = {
          reconciliation_status: "reconciled",
          courier_fee: displayFee,
          net_collected: payoutNum,
        };
        if (effectiveMatchType === "return") {
          orderUpdate.status = "returned";
        } else if (effectiveMatchType === "partial") {
          orderUpdate.status = "partial_delivered";
          orderUpdate.payment_status = "partial";
          orderUpdate.partial_amount = partialAmount > 0 ? partialAmount : Number(r.collected ?? 0);
          orderUpdate.delivered_at = new Date(txnDate).toISOString();
        } else if (effectiveMatchType !== "unknown") {
          orderUpdate.status = "paid";
          orderUpdate.payment_status = "paid";
          orderUpdate.delivered_at = new Date(txnDate).toISOString();
        }


        const { error: oErr } = await supabase
          .from("orders")
          .update(orderUpdate as never)
          .eq("id", orderId);
        if (oErr) throw oErr;

        // Allocate courier fee proportionally across order_items for per-SKU
        // P&L. Uses invoice total_fee (actual reconciled courier cost per
        // shipment) so mkt_delivered_line_costs reflects reality, not the
        // delivery-time estimate. Independent of the cash txns above.
        if (displayFee > 0) {
          const { data: lines } = await supabase
            .from("order_items")
            .select("id, line_total")
            .eq("order_id", orderId);
          const totalLine = (lines ?? []).reduce((s: number, l: any) => s + (Number(l.line_total) || 0), 0);
          if (totalLine > 0 && lines?.length) {
            await Promise.all(
              lines.map((l: any) => {
                const share = ((Number(l.line_total) || 0) / totalLine) * displayFee;
                return supabase
                  .from("order_items")
                  .update({ courier_cost_allocated: +share.toFixed(2) } as never)
                  .eq("id", l.id);
              }),
            );
          }
        }

        // Update shipment delivery fee if linked. Only stamp a status the
        // invoice actually proves (effective type), never the raw guess.
        if (r.consignment_id) {
          const shipStatus =
            effectiveMatchType === "return"
              ? "Returned"
              : effectiveMatchType === "partial"
                ? "Partial Delivered"
                : effectiveMatchType === "unknown"
                  ? null
                  : "Delivered";
          let sq = supabase
            .from("courier_shipments")
            .update(shipStatus ? { delivery_fee: r.total_fee, status: shipStatus } : { delivery_fee: r.total_fee })
            .eq("consignment_id", r.consignment_id);
          if (rowBrand) sq = sq.eq("brand_id", rowBrand);
          await sq;
        }


        // Mark row applied
        await supabase
          .from("erp_reconciliation_rows")
          .update({
            applied_income_txn_id: incomeId,
            applied_expense_txn_id: expenseId,
          } as never)
          .eq("id", r.id);

        applied++;
      } catch (e) {
        failed++;
        errors.push(`Row ${r.consignment_id ?? r.id}: ${(e as Error).message}`);
      }
    };

    // Parallel pool — big invoices (1000+ rows) used to time out ("Failed to fetch")
    // because every row was processed strictly one after another.
    const POOL = 8;
    let cursor = 0;
    await Promise.all(
      Array.from({ length: Math.min(POOL, rowList.length) }, async () => {
        while (cursor < rowList.length) {
          const idx = cursor++;
          await processRow(rowList[idx]!);
        }
      }),
    );

    // Keyset pagination: fewer rows than the page size means we reached the end.
    const done = fetchedCount < data.limit;

    if (done) {
      // Invoice-first settlement: post the full invoice payout to the default
      // COD wallet exactly once (idempotent), regardless of row match results.
      let settleNote: string | null = null;
      try {
        const s = await settleInvoiceTotalCore(supabase, userId, {
          runId: data.runId,
          walletAccountId: data.walletAccountId ?? null,
        });
        settleNote = s.posted
          ? `Invoice settled: ${s.amount} → wallet`
          : (s.reason ?? null);
      } catch (e) {
        settleNote = `Wallet settlement failed: ${(e as Error).message}`;
        errors.push(settleNote);
      }
      await supabase
        .from("erp_reconciliation_runs")
        .update({
          status: failed === 0 ? "applied" : "partial",
          applied_at: new Date().toISOString(),
          notes: errors.length ? errors.slice(0, 10).join("\n") : settleNote,
        })
        .eq("id", data.runId);
    }


    return { applied, failed, done, nextCursor: lastId, errors: errors.slice(0, 10) };
}

/**
 * INVOICE-FIRST SETTLEMENT
 * ------------------------
 * The courier statement is the ground truth for cash. Whatever the invoice's
 * net payout is, that exact amount lands in the brand's default COD wallet —
 * even if some rows stayed unmatched or mismatched. Row matching only decides
 * *allocation* (which order got what), never the wallet balance.
 *
 * Idempotent: keyed on reference_type='cod_invoice' + reference_id=<runId>.
 * Re-applying or re-syncing the same invoice replaces, never stacks.
 */
export async function settleInvoiceTotalCore(
  supabase: Sb,
  userId: string | null,
  data: { runId: string; walletAccountId?: string | null; brandId?: string | null },
): Promise<{ posted: boolean; amount: number; walletId: string | null; brandId: string | null; reason?: string }> {
  const { data: run, error: runErr } = await supabase
    .from("erp_reconciliation_runs")
    .select("id, brand_id, total_payout, source_filename, created_at")
    .eq("id", data.runId)
    .maybeSingle();
  if (runErr) throw new Error(runErr.message);
  if (!run) throw new Error("Run not found");

  const amount = Number(run.total_payout ?? 0);

  // Zero-amount guard: webhook-origin runs sometimes arrive before the CSV
  // exists. Never post a 0 Tk settlement — wait for the amount re-sync.
  if (!amount) {
    await supabase
      .from("erp_transactions")
      .delete()
      .eq("reference_type", "cod_invoice")
      .eq("reference_id", data.runId);
    return { posted: false, amount: 0, walletId: null, brandId: null, reason: "Invoice amount is 0 — awaiting amount sync" };
  }

  // Primary brand: explicit → run brand → most common brand across the rows.
  let brandId: string | null = data.brandId ?? run.brand_id ?? null;
  if (!brandId) {
    const { data: rows } = await supabase
      .from("erp_reconciliation_rows")
      .select("brand_id")
      .eq("run_id", data.runId)
      .not("brand_id", "is", null)
      .limit(2000);
    const tally = new Map<string, number>();
    for (const r of (rows ?? []) as Array<{ brand_id: string }>) {
      tally.set(r.brand_id, (tally.get(r.brand_id) ?? 0) + 1);
    }
    brandId = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }
  if (!brandId) {
    return { posted: false, amount, walletId: null, brandId: null, reason: "No brand could be resolved for this invoice" };
  }

  // Default COD wallet for the primary brand (override wins).
  let walletId = data.walletAccountId ?? null;
  if (!walletId) {
    const { data: st } = await supabase
      .from("erp_settings")
      .select("default_cod_wallet_id")
      .eq("brand_id", brandId)
      .maybeSingle();
    walletId = (st?.default_cod_wallet_id as string | null) ?? null;
  }
  if (!walletId) {
    throw new Error("Default COD wallet is not set for this brand. Finance → Settings → Default COD Wallet.");
  }

  // Replace any previous settlement for this invoice (idempotent).
  await supabase
    .from("erp_transactions")
    .delete()
    .eq("reference_type", "cod_invoice")
    .eq("reference_id", data.runId);

  const txnDate = String(run.created_at ?? new Date().toISOString()).slice(0, 10);
  const label = run.source_filename ? ` · ${run.source_filename}` : "";
  const { error: insErr } = await supabase.from("erp_transactions").insert({
    brand_id: brandId,
    txn_type: amount > 0 ? "income" : "expense",
    account_id: walletId,
    amount: Math.abs(amount),
    transaction_date: txnDate,
    reference_type: "cod_invoice",
    reference_id: data.runId,
    description: `Courier invoice settlement${label}`,
    created_by: userId,
  });
  if (insErr) throw new Error(insErr.message);

  return { posted: true, amount, walletId, brandId };
}
