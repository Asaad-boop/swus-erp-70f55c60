import { dhakaToday } from "@/lib/erp/finance";
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { fmtBdt, type Account } from "@/lib/erp/finance";

type Mode = "deposit" | "withdraw";

type Props = {
  open: boolean;
  onClose: () => void;
  mode: Mode;
  account: Account | null;
  brandId: string | null;
};

/**
 * Pure balance movement — posts an `adjustment` txn (signed amount).
 * Does NOT hit P&L (not income / expense). Used for owner cash-in,
 * cash-out, ATM withdrawal, bank deposit, reconciling balance, etc.
 */
export function DepositWithdrawDialog({ open, onClose, mode, account, brandId }: Props) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => dhakaToday());
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) { setAmount(""); setNote(""); setDate(dhakaToday()); }
  }, [open]);

  const amt = Number(amount) || 0;
  const balance = Number(account?.current_balance ?? 0);
  const insufficient = mode === "withdraw" && amt > 0 && amt > balance;

  const isDeposit = mode === "deposit";
  const Icon = isDeposit ? ArrowDownToLine : ArrowUpFromLine;
  const tone = isDeposit
    ? { bar: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30", btn: "bg-emerald-600 hover:bg-emerald-700 text-white" }
    : { bar: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30", btn: "bg-rose-600 hover:bg-rose-700 text-white" };

  const mut = useMutation({
    mutationFn: async () => {
      if (!account) throw new Error("No account selected");
      const useBrand = account.brand_id ?? brandId;
      if (!useBrand) throw new Error("Select a brand for this wallet");
      if (!amt || amt <= 0) throw new Error("Amount must be greater than 0");
      if (insufficient) throw new Error(`Insufficient balance · available ${fmtBdt(balance)}`);
      const signed = isDeposit ? amt : -amt;
      const desc = (note?.trim() || (isDeposit ? "Deposit" : "Withdraw")) +
        ` · ${isDeposit ? "deposit" : "withdraw"} (balance only, not P&L)`;
      const { error } = await supabase.from("erp_transactions").insert({
        brand_id: useBrand,
        txn_type: "adjustment",
        amount: signed,
        account_id: account.id,
        to_account_id: null,
        category_id: null,
        transaction_date: date,
        description: desc,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(isDeposit ? "Deposit recorded" : "Withdrawal recorded");
      qc.invalidateQueries({ queryKey: ["wallets"] });
      qc.invalidateQueries({ queryKey: ["wallets_today"] });
      qc.invalidateQueries({ queryKey: ["erp_accounts"] });
      qc.invalidateQueries({ queryKey: ["erp_transactions"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5" />
            {isDeposit ? "Deposit" : "Withdraw"} · {account?.name ?? ""}
          </DialogTitle>
        </DialogHeader>

        <div className={cn("rounded-md border px-3 py-2 text-xs", tone.bar)}>
          {isDeposit
            ? "Balance e taka jog hobe. Eta income noy — P&L te add hobe na (e.g. owner cash-in, ATM theke cash, bank theke withdrawn cash deposit korlam)."
            : "Balance theke taka komabe. Eta expense noy — P&L te kichu hobe na (e.g. bank theke cash uthano, mistake correction)."}
        </div>

        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Current balance</span>
            <span className={cn("font-semibold tabular-nums", balance < 0 && "text-red-600")}>{fmtBdt(balance)}</span>
          </div>

          <div>
            <Label className="text-xs">Amount (BDT)</Label>
            <Input
              type="number" inputMode="decimal" step="0.01" autoFocus
              value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className={cn("text-lg font-semibold tabular-nums", insufficient && "border-rose-500")}
            />
            {insufficient && <p className="text-xs text-rose-600 mt-1">Short by {fmtBdt(amt - balance)}</p>}
          </div>

          <div>
            <Label className="text-xs">Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div>
            <Label className="text-xs">Note (optional)</Label>
            <Textarea
              rows={2} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder={isDeposit ? "e.g. Owner capital injection / cash deposit at bank" : "e.g. Cash withdrawn from ATM for office use"}
            />
          </div>

          {amt > 0 && (
            <div className="rounded-md bg-muted/50 px-3 py-2 text-xs flex items-center justify-between">
              <span className="text-muted-foreground">New balance</span>
              <span className="font-semibold tabular-nums">
                {fmtBdt(balance + (isDeposit ? amt : -amt))}
              </span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            className={tone.btn}
            disabled={mut.isPending || amt <= 0 || insufficient}
            onClick={() => mut.mutate()}
          >
            {mut.isPending ? "Saving…" : isDeposit ? "Deposit" : "Withdraw"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}