/**
 * Pathao invoice auto-sync.
 * Runs on a cron (or via the "Sync now" button) with the service-role client:
 * lists merchant payout invoices, skips ones already reconciled, then creates
 * + applies a reconciliation run for each new invoice.
 */
import { parsePathaoCsv } from "./pathao-csv";
import { loadPathaoCreds } from "./pathao.server";
import { listPathaoInvoices, fetchOnePathaoInvoiceCsv } from "./pathao-invoices.server";
import { createReconRunCore, applyReconRunCore } from "./reconciliation-core.server";

export const AUTOSYNC_KEY = "pathao_invoice_autosync";

export type AutoSyncConfig = {
  enabled: boolean;
  lookbackDays: number;
  autoApply: boolean;
  lastRunAt: string | null;
  lastStatus: "idle" | "ok" | "error" | "running";
  lastMessage: string | null;
  lastInvoices: number;
  lastApplied: number;
};

export const DEFAULT_AUTOSYNC: AutoSyncConfig = {
  enabled: true,
  lookbackDays: 7,
  autoApply: true,
  lastRunAt: null,
  lastStatus: "idle",
  lastMessage: null,
  lastInvoices: 0,
  lastApplied: 0,
};

export async function readAutoSyncConfig(sb: any): Promise<AutoSyncConfig> {
  const { data } = await sb.from("app_settings").select("value").eq("key", AUTOSYNC_KEY).maybeSingle();
  if (!data?.value) return { ...DEFAULT_AUTOSYNC };
  try {
    return { ...DEFAULT_AUTOSYNC, ...JSON.parse(data.value as string) };
  } catch {
    return { ...DEFAULT_AUTOSYNC };
  }
}

export async function writeAutoSyncConfig(sb: any, patch: Partial<AutoSyncConfig>): Promise<AutoSyncConfig> {
  const cur = await readAutoSyncConfig(sb);
  const next = { ...cur, ...patch };
  await sb
    .from("app_settings")
    .upsert({ key: AUTOSYNC_KEY, value: JSON.stringify(next) }, { onConflict: "key" });
  return next;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Invoice IDs already ingested (from run.source_filename `pathao-inv_<id>_...`). */
async function loadDoneInvoiceIds(sb: any): Promise<Set<string>> {
  const { data } = await sb
    .from("erp_reconciliation_runs")
    .select("source_filename, status")
    .neq("status", "reverted")
    .order("created_at", { ascending: false })
    .limit(2000);
  const set = new Set<string>();
  for (const r of (data ?? []) as Array<{ source_filename: string | null }>) {
    const m = String(r.source_filename ?? "").match(/pathao-inv_([^_]+)/);
    if (m?.[1]) set.add(m[1]);
  }
  return set;
}

export type AutoSyncResult = {
  ok: boolean;
  skipped?: string;
  scanned: number;
  newInvoices: number;
  runs: Array<{ invoiceId: string; runId: string; rows: number; applied: number; failed: number }>;
  errors: string[];
};

export async function runPathaoAutoSync(
  sb: any,
  opts: { force?: boolean; lookbackDays?: number; userId?: string | null } = {},
): Promise<AutoSyncResult> {
  const cfg = await readAutoSyncConfig(sb);
  if (!cfg.enabled && !opts.force) {
    return { ok: true, skipped: "disabled", scanned: 0, newInvoices: 0, runs: [], errors: [] };
  }

  const days = Math.max(1, Math.min(60, opts.lookbackDays ?? cfg.lookbackDays));
  const to = ymd(new Date());
  const from = ymd(new Date(Date.now() - days * 86400_000));

  const result: AutoSyncResult = { ok: true, scanned: 0, newInvoices: 0, runs: [], errors: [] };

  try {
    const creds = await loadPathaoCreds(sb, null);
    const { invoices } = await listPathaoInvoices(
      { username: creds.username, password: creds.password, store_id: creds.store_id },
      from,
      to,
    );
    result.scanned = invoices.length;

    const done = await loadDoneInvoiceIds(sb);
    const pending = invoices.filter((i) => !done.has(String(i.id)));
    result.newInvoices = pending.length;

    for (const inv of pending.slice(0, 25)) {
      try {
        const { csv } = await fetchOnePathaoInvoiceCsv(
          { username: creds.username, password: creds.password, store_id: creds.store_id },
          String(inv.id),
        );
        if (!csv) {
          result.errors.push(`Invoice ${inv.id}: CSV unavailable`);
          continue;
        }
        const rows = parsePathaoCsv(csv);
        if (!rows.length) continue;

        const { runId } = await createReconRunCore(sb, opts.userId ?? null, {
          brandId: null,
          filename: `pathao-inv_${inv.id}_${inv.date ?? to}.csv`,
          rows: rows as never,
          tolerance: 1,
        });

        let applied = 0;
        let failed = 0;
        if (cfg.autoApply) {
          let cursor: string | null = null;
          for (let guard = 0; guard < 40; guard++) {
            const r: { applied: number; failed: number; done: boolean; nextCursor: string | null } =
              await applyReconRunCore(sb, opts.userId ?? null, {
                runId,
                includeMismatch: false,
                limit: 200,
                afterId: cursor,
              });
            applied += r.applied;
            failed += r.failed;
            if (r.done) break;
            cursor = r.nextCursor;
          }
        }
        result.runs.push({ invoiceId: String(inv.id), runId, rows: rows.length, applied, failed });
      } catch (e) {
        result.errors.push(`Invoice ${inv.id}: ${(e as Error).message}`);
      }
    }
  } catch (e) {
    result.ok = false;
    result.errors.push((e as Error).message);
  }

  // Repair InstaPay webhook runs that landed with 0 payout (CSV wasn't ready yet)
  // and settle their invoice totals to the default COD wallet.
  try {
    const { resyncZeroPayoutInstapay } = await import("./instapay-resync.server");
    const rz = await resyncZeroPayoutInstapay(sb, { userId: opts.userId ?? null });
    if (rz.errors.length) result.errors.push(...rz.errors.slice(0, 3));
    if (rz.fixed || rz.settled || rz.merged) {
      result.runs.push(
        ...rz.items
          .filter((i) => i.runId)
          .map((i) => ({ invoiceId: i.invoiceId, runId: i.runId as string, rows: 0, applied: 0, failed: 0 })),
      );
    }
  } catch (e) {
    result.errors.push(`instapay resync: ${(e as Error).message}`);
  }

  const totalApplied = result.runs.reduce((s, r) => s + r.applied, 0);
  await writeAutoSyncConfig(sb, {
    lastRunAt: new Date().toISOString(),
    lastStatus: result.ok && !result.errors.length ? "ok" : result.ok ? "ok" : "error",
    lastMessage: result.errors.length ? result.errors.slice(0, 3).join(" | ") : `${result.runs.length} invoice sync`,
    lastInvoices: result.runs.length,
    lastApplied: totalApplied,
  });

  return result;
}
