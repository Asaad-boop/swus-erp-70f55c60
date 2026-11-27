/**
 * Transaction safety net, shared by every "money in/out" dialog.
 *
 *  1. Before saving, look for likely mistakes: the same amount already entered
 *     on this account within a couple of days (double entry), a much bigger
 *     amount than this account normally sees (extra zero), and a future or
 *     very old date. If anything looks off, a confirm dialog lists it.
 *  2. After saving, the toast offers "Undo" for 30 seconds (deletes the row;
 *     the balance trigger reverses it).
 */
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { dhakaToday, fmtBdt } from "@/lib/erp/finance";

export type TxnDraft = {
  txnType: "income" | "expense" | "transfer" | "adjustment";
  amount: number; // absolute
  accountId: string | null;
  toAccountId?: string | null;
  date: string; // yyyy-mm-dd
  /** One line shown in the confirm dialog, e.g. "৳5,000 · bKash → Bank". */
  summary: string;
};

type Risk = { kind: "duplicate" | "large" | "future" | "old"; text: string; details?: string[] };

function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function findRisks(t: TxnDraft): Promise<Risk[]> {
  const risks: Risk[] = [];
  const today = dhakaToday();
  if (t.date > today) risks.push({ kind: "future", text: `তারিখটা ভবিষ্যতের (${t.date})। আজ ${today}।` });
  else if (t.date < addDays(today, -30)) risks.push({ kind: "old", text: `তারিখটা ৩০ দিনের বেশি পুরনো (${t.date})।` });

  const acct = t.accountId;
  if (!acct) return risks;

  // Possible double entry: same account, same amount, ±2 days.
  const amounts = t.txnType === "adjustment" ? [t.amount, -t.amount] : [t.amount];
  const { data: dups } = await supabase
    .from("erp_transactions")
    .select("id, txn_type, amount, transaction_date, description")
    .or(`account_id.eq.${acct},to_account_id.eq.${acct}`)
    .in("amount", amounts)
    .gte("transaction_date", addDays(t.date, -2))
    .lte("transaction_date", addDays(t.date, 2))
    .order("created_at", { ascending: false })
    .limit(3);
  if (dups && dups.length > 0) {
    risks.push({
      kind: "duplicate",
      text: `এই account-এ ${fmtBdt(t.amount)}-এর এন্ট্রি আগেই আছে — দুবার দিচ্ছেন না তো?`,
      details: dups.map(
        (d) => `${d.transaction_date} · ${d.txn_type} · ${fmtBdt(Math.abs(Number(d.amount)))} · ${d.description ?? "—"}`,
      ),
    });
  }

  // Unusually large: ≥ 3× this account's biggest entry in 90 days (with history), or ≥ ৳2 lakh.
  const { data: recent } = await supabase
    .from("erp_transactions")
    .select("amount")
    .or(`account_id.eq.${acct},to_account_id.eq.${acct}`)
    .gte("transaction_date", addDays(today, -90))
    .order("amount", { ascending: false })
    .limit(50);
  const sizes = (recent ?? []).map((r) => Math.abs(Number(r.amount)));
  const biggest = sizes.length ? Math.max(...sizes) : 0;
  if ((sizes.length >= 5 && t.amount >= biggest * 3) || t.amount >= 200_000) {
    risks.push({
      kind: "large",
      text:
        sizes.length >= 5
          ? `${fmtBdt(t.amount)} এই account-এর গত ৯০ দিনের সবচেয়ে বড় এন্ট্রির (${fmtBdt(biggest)}) চেয়ে অনেক বেশি — একটা শূন্য বেশি পড়েনি তো?`
          : `${fmtBdt(t.amount)} অনেক বড় অংক — আরেকবার মিলিয়ে নিন।`,
    });
  }
  return risks;
}

/**
 * const guard = useTxnGuard();
 * guard.run(draft, () => mut.mutate());   // checks, confirms if risky, then saves
 * {guard.dialog}
 */
export function useTxnGuard() {
  const [state, setState] = useState<{ draft: TxnDraft; risks: Risk[]; proceed: () => void } | null>(null);
  const [checking, setChecking] = useState(false);

  const run = async (draft: TxnDraft, proceed: () => void) => {
    setChecking(true);
    try {
      const risks = await findRisks(draft);
      if (risks.length === 0) proceed();
      else setState({ draft, risks, proceed });
    } catch {
      proceed(); // a failed check must never block saving
    } finally {
      setChecking(false);
    }
  };

  const dialog = (
    <Dialog open={!!state} onOpenChange={(o) => !o && setState(null)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-5 w-5 text-amber-500" /> সেভ করার আগে একবার দেখুন
          </DialogTitle>
        </DialogHeader>
        {state && (
          <div className="space-y-3">
            <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm font-semibold">{state.draft.summary}</div>
            <ul className="space-y-2">
              {state.risks.map((r, i) => (
                <li key={i} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                  {r.text}
                  {r.details && (
                    <ul className="mt-1 space-y-0.5 text-[11px] text-amber-800/80 dark:text-amber-300/80">
                      {r.details.map((d, j) => (
                        <li key={j} className="truncate">• {d}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setState(null)}>
            ফিরে গিয়ে ঠিক করি
          </Button>
          <Button
            onClick={() => {
              const p = state?.proceed;
              setState(null);
              p?.();
            }}
          >
            ঠিক আছে, সেভ করুন
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { run, checking, dialog };
}

/** Success toast with a 30-second Undo that deletes the saved transaction. */
export function toastSavedWithUndo(message: string, txnId: string | null | undefined, onUndone: () => void) {
  if (!txnId) {
    toast.success(message);
    return;
  }
  toast.success(message, {
    duration: 30_000,
    action: {
      label: "Undo",
      onClick: async () => {
        const { error } = await supabase.from("erp_transactions").delete().eq("id", txnId);
        if (error) toast.error(`Undo হয়নি: ${error.message}`);
        else {
          toast.success("বাতিল করা হয়েছে — balance আগের মতো");
          onUndone();
        }
      },
    },
  });
}
