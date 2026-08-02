import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtBdt, type Account } from "@/lib/erp/finance";
import type { Brand } from "@/contexts/brand-context";

type Props = {
  open: boolean;
  onClose: () => void;
  brandId: string | null;
  accounts: Account[];
  defaultFromId?: string | null;
  // When brandId is null and brands.length > 1, the dialog renders a brand picker.
  brands?: Brand[];
};

export function TransferDialog({ open, onClose, brandId, accounts, defaultFromId, brands = [] }: Props) {
  const qc = useQueryClient();
  const [fromId, setFromId] = useState<string>(defaultFromId ?? "");
  const [toId, setToId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState<string>("");
  const [pickedBrandId, setPickedBrandId] = useState<string>("");

  const showBrandPicker = !brandId && brands.length > 1;
  const SHARED = "__shared__";
  const effectiveBrandId = brandId ?? (pickedBrandId === SHARED ? null : pickedBrandId) ?? null;
  const isShared = !brandId && pickedBrandId === SHARED;

  useEffect(() => {
    if (open) {
      setPickedBrandId(brandId ?? (brands.length === 1 ? brands[0].id : ""));
    }
  }, [open, brandId, brands]);

  const scopedAccounts = useMemo(
    () => {
      if (isShared) return accounts; // All brands: show every account
      if (effectiveBrandId) return accounts.filter((a) => a.brand_id === effectiveBrandId || a.brand_id === null);
      return [];
    },
    [accounts, effectiveBrandId, isShared],
  );

  useEffect(() => {
    setFromId(defaultFromId ?? ""); setToId("");
  }, [effectiveBrandId, defaultFromId]);

  const from = scopedAccounts.find((a) => a.id === fromId);
  const to = scopedAccounts.find((a) => a.id === toId);
  const canPick = Boolean(effectiveBrandId) || isShared;
  const amt = Number(amount || 0);
  const insufficient = from && amt > Number(from.current_balance);

  const mut = useMutation({
    mutationFn: async () => {
      if (!effectiveBrandId && !isShared) throw new Error("Select a brand");
      if (!fromId || !toId) throw new Error("Select both accounts");
      if (fromId === toId) throw new Error("From and To must be different");
      if (!amt || amt <= 0) throw new Error("Amount must be > 0");
      if (from && amt > Number(from.current_balance)) {
        throw new Error(`Insufficient balance in ${from.name}. Available ${fmtBdt(from.current_balance)}`);
      }
      // For shared/all-brands transfer, attribute txn to source account's brand (fallback to dest)
      const txnBrandId =
        effectiveBrandId ?? from?.brand_id ?? to?.brand_id ?? brands[0]?.id ?? null;
      if (!txnBrandId) throw new Error("Selected accounts have no brand. Pick a brand.");
      const { error } = await supabase.from("erp_transactions").insert({
        brand_id: txnBrandId,
        txn_type: "transfer",
        account_id: fromId,
        to_account_id: toId,
        amount: amt,
        transaction_date: date,
        description: note || `Transfer: ${from?.name} → ${to?.name}`,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Transfer recorded");
      qc.invalidateQueries({ queryKey: ["erp_accounts"] });
      qc.invalidateQueries({ queryKey: ["wallets"] });
      qc.invalidateQueries({ queryKey: ["wallet_statement"] });
      qc.invalidateQueries({ queryKey: ["erp_transactions"] });
      setAmount(""); setNote("");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Balance Transfer</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {showBrandPicker && (
            <div>
              <Label>Brand *</Label>
              <Select value={pickedBrandId} onValueChange={setPickedBrandId}>
                <SelectTrigger><SelectValue placeholder="Choose brand" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SHARED}>🌐 All brands (shared accounts)</SelectItem>
                  {brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>From account</Label>
            <Select value={fromId} onValueChange={setFromId} disabled={!canPick}>
              <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
              <SelectContent>
                {scopedAccounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name} · {fmtBdt(a.current_balance)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-center text-muted-foreground"><ArrowRight className="h-4 w-4" /></div>
          <div>
            <Label>To account</Label>
            <Select value={toId} onValueChange={setToId} disabled={!canPick}>
              <SelectTrigger><SelectValue placeholder="Select destination" /></SelectTrigger>
              <SelectContent>
                {scopedAccounts.filter((a) => a.id !== fromId).map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name} · {fmtBdt(a.current_balance)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Amount (৳)</Label>
              <Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Note (optional)</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Top-up bKash from Cash" />
          </div>
          {insufficient && (
            <p className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-700 dark:text-rose-400">
              ⚠ Insufficient balance in <span className="font-semibold">{from?.name}</span>. Available {fmtBdt(from?.current_balance ?? 0)} · Short by {fmtBdt(amt - Number(from?.current_balance ?? 0))}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => {
              if (insufficient && from) {
                toast.error("Insufficient balance", {
                  description: `${from.name} e ache ${fmtBdt(from.current_balance)} · short by ${fmtBdt(amt - Number(from.current_balance))}`,
                });
                return;
              }
              mut.mutate();
            }}
            disabled={mut.isPending || !fromId || !toId || !amt || !!insufficient}
          >
            {mut.isPending ? "Saving…" : "Transfer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}