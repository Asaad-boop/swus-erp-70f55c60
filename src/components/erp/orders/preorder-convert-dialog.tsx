import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock, Loader2, Wallet } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ADVANCE_SOURCES, DUE_COLLECT_METHODS, PAYMENT_METHODS, moveOrderToPreorder, promiseDateFromDays } from "@/lib/erp/preorders";
import { supabase } from "@/integrations/supabase/client";

const DAY_PRESETS = [7, 10, 15, 20, 30, 45];

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orderIds: string[];
  brandId?: string | null;
  onDone?: () => void;
};

export function PreorderConvertDialog({ open, onOpenChange, orderIds, brandId, onDone }: Props) {
  const qc = useQueryClient();
  const single = orderIds.length === 1;
  const [days, setDays] = useState<number>(15);
  const [withAdvance, setWithAdvance] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string>("bKash");
  const [source, setSource] = useState<string>("bKash");
  const [txnId, setTxnId] = useState("");
  const [dueMethod, setDueMethod] = useState<string>("COD");
  const [notes, setNotes] = useState("");
  const singleOrderId = single ? orderIds[0] : null;

  const { data: existingOrder } = useQuery({
    queryKey: ["preorder-convert-order", singleOrderId],
    enabled: open && !!singleOrderId,
    staleTime: 15_000,
    queryFn: async () => {
      if (!singleOrderId) return null;
      const { data, error } = await supabase
        .from("orders")
        .select("advance_amount,advance_source,advance_txn_id,payment_method")
        .eq("id", singleOrderId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!open) return;
    setDays(15); setWithAdvance(false); setAmount(""); setMethod("bKash");
    setSource("bKash"); setTxnId(""); setDueMethod("COD"); setNotes("");
  }, [open]);

  useEffect(() => {
    if (!open || !existingOrder) return;
    const advance = Number(existingOrder.advance_amount ?? 0);
    if (advance > 0) {
      setWithAdvance(true);
      setAmount(String(advance));
      const method = existingOrder.payment_method || "bKash";
      setMethod(method);
      setSource(existingOrder.advance_source || method);
      setTxnId(existingOrder.advance_txn_id || "");
    }
  }, [existingOrder, open]);

  const run = useMutation({
    mutationFn: async (confirmNow: boolean = false) => {
      if (withAdvance && single && !(Number(amount) > 0)) throw new Error("Advance amount din");
      if (confirmNow && single && !(Number(amount) > 0)) throw new Error("Pay korte hole advance amount din");
      for (const id of orderIds) {
        await moveOrderToPreorder({
          orderId: id,
          brandId: brandId ?? null,
          promiseDays: days,
          promiseDate: promiseDateFromDays(days),
          advanceAmount: (withAdvance || confirmNow) && single ? Number(amount || 0) : 0,
          advanceMethod: (withAdvance || confirmNow) && single ? method : null,
          advanceSource: (withAdvance || confirmNow) && single ? source : null,
          advanceTxnId: (withAdvance || confirmNow) && single && txnId ? txnId : null,
          dueCollectMethod: dueMethod,
          dueNote: null,
          notes: notes || null,
          confirmNow,
        });
      }
      return confirmNow;
    },
    onSuccess: (confirmNow) => {
      toast.success(
        confirmNow
          ? `${orderIds.length} order confirm hoye pre-order list-e gelo`
          : `${orderIds.length} order pre-order-e move holo`,
      );
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["orders-status-counts"] });
      qc.invalidateQueries({ queryKey: ["web-orders"] });
      qc.invalidateQueries({ queryKey: ["web-orders-page"] });
      qc.invalidateQueries({ queryKey: ["preorders"] });
      onOpenChange(false);
      onDone?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const promiseDate = promiseDateFromDays(days);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-indigo-600" />
            Convert to Pre-order
          </DialogTitle>
          <DialogDescription>
            {orderIds.length} order pre-order pipeline-e যাবে। Stock এলে call দিয়ে confirm করলেই packaging queue-তে চলে যাবে।
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Promise time — কত দিনের কথা দেওয়া</Label>
            <div className="flex flex-wrap gap-1.5">
              {DAY_PRESETS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDays(d)}
                  className={cn(
                    "h-8 rounded-lg border px-3 text-xs font-semibold transition-colors",
                    days === d ? "border-indigo-600 bg-indigo-600 text-white" : "hover:bg-muted",
                  )}
                >
                  {d} days
                </button>
              ))}
              <Input
                type="number"
                min={1}
                value={days}
                onChange={(e) => setDays(Math.max(1, Number(e.target.value || 0)))}
                className="h-8 w-20 text-xs"
              />
            </div>
            <div className="text-[11px] text-muted-foreground">
              Promise date: <span className="font-semibold text-foreground">{promiseDate ?? "—"}</span>
            </div>
          </div>

          {single && (
            <div className="rounded-xl border p-3">
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" checked={withAdvance} onChange={(e) => setWithAdvance(e.target.checked)} className="h-4 w-4" />
                <Wallet className="h-4 w-4 text-emerald-600" /> Advance নেওয়া হয়েছে
              </label>
              {withAdvance && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-[11px]">Advance amount</Label>
                    <Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Payment method</Label>
                    <Select value={method} onValueChange={setMethod}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Source / wallet</Label>
                    <Select value={source} onValueChange={setSource}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{ADVANCE_SOURCES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Txn ID (optional)</Label>
                    <Input value={txnId} onChange={(e) => setTxnId(e.target.value)} placeholder="9F7A2BX1Q" />
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-[11px]">বাকি টাকা কীভাবে নেবে (Due collect method)</Label>
            <Select value={dueMethod} onValueChange={setDueMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{DUE_COLLECT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px]">Note (optional)</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Customer কী বলেছে…" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="secondary"
            onClick={() => run.mutate(false)}
            disabled={run.isPending || orderIds.length === 0}
          >
            {run.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Move to Pre-order
          </Button>
          {single && (
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => { setWithAdvance(true); run.mutate(true); }}
              disabled={run.isPending || orderIds.length === 0}
            >
              {run.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Move to Pre-order &amp; Pay
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}