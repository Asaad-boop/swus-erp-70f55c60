import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type WalletAccountRow = {
  id: string;
  name: string;
  brandId: string | null;
  currentBalance: number;
  ledgerBalance: number;
  drift: number;
  instapayPosted: number;
};

export type RunSettlementRow = {
  runId: string;
  invoiceId: string | null;
  brandId: string | null;
  status: string;
  createdAt: string;
  appliedAt: string | null;
  totalRows: number;
  payout: number;
  posted: number;
  gap: number;
  state: "settled" | "missing" | "partial" | "over" | "zero_payout" | "reverted";
};

export type WalletReconciliation = {
  accounts: WalletAccountRow[];
  runs: RunSettlementRow[];
  totals: {
    walletBalance: number;
    ledgerBalance: number;
    expectedPayout: number;
    postedPayout: number;
    gap: number;
    missingCount: number;
    partialCount: number;
    zeroPayoutCount: number;
    settledCount: number;
  };
};

const num = (v: unknown) => Number(v ?? 0) || 0;

export const getWalletReconciliation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ limit: z.number().int().min(20).max(500).optional() }).parse(d ?? {}))
  .handler(async ({ data, context }): Promise<WalletReconciliation> => {
    const { supabase } = context;
    const limit = data.limit ?? 200;

    // 1) InstaPay / Pathao COD wallets
    const { data: accts, error: accErr } = await supabase
      .from("erp_accounts")
      .select("id,name,brand_id,current_balance,opening_balance")
      .or("name.ilike.%instapay%,name.ilike.%pathao%");
    if (accErr) throw new Error(accErr.message);
    const accounts = (accts ?? []) as Array<Record<string, any>>;
    const accountIds = accounts.map((a) => String(a.id));

    // 2) Ledger movements for those accounts
    const ledger = new Map<string, number>();
    const instapayByAccount = new Map<string, number>();
    if (accountIds.length) {
      const { data: txns, error: txErr } = await supabase
        .from("erp_transactions")
        .select("account_id,to_account_id,txn_type,amount,reference_type,reference_id")
        .or(`account_id.in.(${accountIds.join(",")}),to_account_id.in.(${accountIds.join(",")})`)
        .limit(20000);
      if (txErr) throw new Error(txErr.message);
      for (const t of (txns ?? []) as Array<Record<string, any>>) {
        const amt = num(t.amount);
        const from = t.account_id ? String(t.account_id) : null;
        const to = t.to_account_id ? String(t.to_account_id) : null;
        if (t.txn_type === "transfer") {
          if (from) ledger.set(from, (ledger.get(from) ?? 0) - amt);
          if (to) ledger.set(to, (ledger.get(to) ?? 0) + amt);
        } else if (from) {
          const sign = t.txn_type === "expense" ? -1 : 1;
          ledger.set(from, (ledger.get(from) ?? 0) + sign * amt);
        }
        if (from && t.reference_type === "cod_invoice") {
          instapayByAccount.set(from, (instapayByAccount.get(from) ?? 0) + (t.txn_type === "expense" ? -amt : amt));
        }
      }
    }

    const accountRows: WalletAccountRow[] = accounts
      .map((a) => {
        const opening = num(a.opening_balance);
        const ledgerBalance = opening + (ledger.get(String(a.id)) ?? 0);
        const currentBalance = num(a.current_balance);
        return {
          id: String(a.id),
          name: String(a.name),
          brandId: a.brand_id ? String(a.brand_id) : null,
          currentBalance,
          ledgerBalance,
          drift: currentBalance - ledgerBalance,
          instapayPosted: instapayByAccount.get(String(a.id)) ?? 0,
        };
      })
      .sort((x, y) => y.currentBalance - x.currentBalance);

    // 3) InstaPay runs + their wallet postings
    const { data: runs, error: runErr } = await supabase
      .from("erp_reconciliation_runs")
      .select("id,brand_id,source_filename,status,total_rows,total_payout,created_at,applied_at")
      .eq("courier", "pathao")
      .like("source_filename", "instapay:%")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (runErr) throw new Error(runErr.message);
    const runList = (runs ?? []) as Array<Record<string, any>>;
    const runIds = runList.map((r) => String(r.id));

    const postedByRun = new Map<string, number>();
    if (runIds.length) {
      const { data: settle, error: sErr } = await supabase
        .from("erp_transactions")
        .select("reference_id,amount,txn_type")
        .eq("reference_type", "cod_invoice")
        .in("reference_id", runIds);
      if (sErr) throw new Error(sErr.message);
      for (const t of (settle ?? []) as Array<Record<string, any>>) {
        const key = String(t.reference_id);
        const amt = t.txn_type === "expense" ? -num(t.amount) : num(t.amount);
        postedByRun.set(key, (postedByRun.get(key) ?? 0) + amt);
      }
    }

    const runRows: RunSettlementRow[] = runList.map((r) => {
      const payout = num(r.total_payout);
      const posted = postedByRun.get(String(r.id)) ?? 0;
      const gap = Math.round((payout - posted) * 100) / 100;
      let state: RunSettlementRow["state"];
      if (r.status === "reverted") state = "reverted";
      else if (payout === 0) state = "zero_payout";
      else if (Math.abs(gap) < 0.5) state = "settled";
      else if (posted === 0) state = "missing";
      else if (gap > 0) state = "partial";
      else state = "over";
      return {
        runId: String(r.id),
        invoiceId: String(r.source_filename ?? "").replace(/^instapay:/, "") || null,
        brandId: r.brand_id ? String(r.brand_id) : null,
        status: String(r.status ?? ""),
        createdAt: String(r.created_at),
        appliedAt: r.applied_at ? String(r.applied_at) : null,
        totalRows: Number(r.total_rows ?? 0),
        payout,
        posted,
        gap,
        state,
      };
    });

    const live = runRows.filter((r) => r.state !== "reverted");
    const totals = {
      walletBalance: accountRows.reduce((s, a) => s + a.currentBalance, 0),
      ledgerBalance: accountRows.reduce((s, a) => s + a.ledgerBalance, 0),
      expectedPayout: live.reduce((s, r) => s + r.payout, 0),
      postedPayout: live.reduce((s, r) => s + r.posted, 0),
      gap: 0,
      missingCount: live.filter((r) => r.state === "missing").length,
      partialCount: live.filter((r) => r.state === "partial" || r.state === "over").length,
      zeroPayoutCount: live.filter((r) => r.state === "zero_payout").length,
      settledCount: live.filter((r) => r.state === "settled").length,
    };
    totals.gap = Math.round((totals.expectedPayout - totals.postedPayout) * 100) / 100;

    return { accounts: accountRows, runs: runRows, totals };
  });
