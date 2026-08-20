/**
 * Zero-payout InstaPay repair.
 *
 * Pathao's webhook carries no money fields, so a run can be created before the
 * merchant invoice CSV exists → `total_payout = 0` and no wallet settlement.
 * This module finds those runs, re-pulls the CSV amounts (backfill), settles the
 * invoice total to the brand's default COD wallet, and merges duplicate runs
 * that were created for the same invoice under different brands.
 */
import { backfillInstapayInvoice } from "./instapay.server";
import { settleInvoiceTotalCore } from "./reconciliation-core.server";

type AnyRec = Record<string, any>;

export type ResyncOne = {
  invoiceId: string;
  runId: string | null;
  payout: number;
  settled: boolean;
  reason?: string;
};

export type ResyncResult = {
  ok: boolean;
  scanned: number;
  fixed: number;
  settled: number;
  merged: number;
  items: ResyncOne[];
  errors: string[];
};

function invoiceIdOf(sourceFilename: string | null): string | null {
  const m = String(sourceFilename ?? "").match(/^instapay:(.+)$/);
  return m?.[1] ?? null;
}

/** Duplicate runs for one invoice: keep the richest, move rows over, revert the rest. */
export async function mergeDuplicateInstapayRuns(sb: AnyRec): Promise<number> {
  const { data } = await sb
    .from("erp_reconciliation_runs")
    .select("id, source_filename, total_rows, total_payout, status, created_at")
    .eq("courier", "pathao")
    .like("source_filename", "instapay:%")
    .neq("status", "reverted")
    .order("created_at", { ascending: true })
    .limit(1000);

  const groups = new Map<string, AnyRec[]>();
  for (const r of (data ?? []) as AnyRec[]) {
    const key = String(r.source_filename);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  let merged = 0;
  for (const [, list] of groups) {
    if (list.length < 2) continue;
    const sorted = [...list].sort(
      (a, b) => Number(b.total_payout ?? 0) - Number(a.total_payout ?? 0) || Number(b.total_rows ?? 0) - Number(a.total_rows ?? 0),
    );
    const keep = sorted[0]!;
    for (const dup of sorted.slice(1)) {
      await sb.from("erp_reconciliation_rows").update({ run_id: keep.id }).eq("run_id", dup.id);
      await sb
        .from("erp_transactions")
        .delete()
        .eq("reference_type", "cod_invoice")
        .eq("reference_id", dup.id);
      await sb
        .from("erp_reconciliation_runs")
        .update({ status: "reverted", notes: `Merged into ${keep.id} (duplicate invoice run)` })
        .eq("id", dup.id);
      merged += 1;
    }
    // recompute keeper totals
    const { data: rows } = await sb
      .from("erp_reconciliation_rows")
      .select("collected, total_fee, payout")
      .eq("run_id", keep.id);
    const f = (rows ?? []) as AnyRec[];
    await sb
      .from("erp_reconciliation_runs")
      .update({
        total_rows: f.length,
        total_collected: f.reduce((s, x) => s + Number(x.collected ?? 0), 0),
        total_fee: f.reduce((s, x) => s + Number(x.total_fee ?? 0), 0),
        total_payout: f.reduce((s, x) => s + Number(x.payout ?? 0), 0),
      })
      .eq("id", keep.id);
  }
  return merged;
}

/**
 * Re-sync every InstaPay run whose payout is still 0 (or an explicit list of
 * invoice IDs), then post the invoice-first wallet settlement.
 */
export async function resyncZeroPayoutInstapay(
  sb: AnyRec,
  opts: { invoiceIds?: string[]; userId?: string | null; limit?: number } = {},
): Promise<ResyncResult> {
  const out: ResyncResult = { ok: true, scanned: 0, fixed: 0, settled: 0, merged: 0, items: [], errors: [] };

  try {
    out.merged = await mergeDuplicateInstapayRuns(sb);
  } catch (e) {
    out.errors.push(`merge: ${(e as Error).message}`);
  }

  let invoiceIds = (opts.invoiceIds ?? []).filter(Boolean);
  if (!invoiceIds.length) {
    const { data } = await sb
      .from("erp_reconciliation_runs")
      .select("source_filename, total_payout, status")
      .eq("courier", "pathao")
      .like("source_filename", "instapay:%")
      .neq("status", "reverted")
      .order("created_at", { ascending: false })
      .limit(300);
    invoiceIds = [
      ...new Set(
        ((data ?? []) as AnyRec[])
          .filter((r) => Number(r.total_payout ?? 0) === 0)
          .map((r) => invoiceIdOf(r.source_filename))
          .filter((v): v is string => !!v && !/^\d{4}-\d{2}-\d{2}$/.test(v)),
      ),
    ];
  }

  invoiceIds = invoiceIds.slice(0, opts.limit ?? 25);
  out.scanned = invoiceIds.length;

  for (const invoiceId of invoiceIds) {
    try {
      const res = await backfillInstapayInvoice(sb, invoiceId);
      if (!res?.ok) {
        out.items.push({ invoiceId, runId: res?.runId ?? null, payout: 0, settled: false, reason: res?.reason ?? "backfill failed" });
        continue;
      }
      out.fixed += 1;
      let settled = false;
      let reason: string | undefined;
      try {
        const s = await settleInvoiceTotalCore(sb, opts.userId ?? null, { runId: res.runId });
        settled = s.posted;
        reason = s.reason;
        if (s.posted) out.settled += 1;
      } catch (e) {
        reason = (e as Error).message;
        out.errors.push(`${invoiceId}: ${reason}`);
      }
      out.items.push({ invoiceId, runId: res.runId, payout: Number(res.payout ?? 0), settled, reason });
    } catch (e) {
      out.errors.push(`${invoiceId}: ${(e as Error).message}`);
    }
  }

  out.ok = out.errors.length === 0;
  return out;
}
