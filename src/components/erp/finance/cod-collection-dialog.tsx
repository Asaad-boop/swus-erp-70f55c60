import { dhakaToday } from "@/lib/erp/finance";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Banknote } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtBdt } from "@/lib/erp/finance";
import { applyBrandScope } from "@/lib/erp/apply-brand-scope";
import { useCodWorkflowMode } from "@/hooks/erp/use-cod-workflow-mode";
import { AlertTriangle } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  brandId: string | null;
  brandIds: string[];
  /** Optional pre-filled order (when launched from an order detail). */
  orderId?: string | null;
  defaultAmount?: number;
};

type WalletOpt = { id: string; name: string; account_subtype: string | null; account_type: string | null; brand_id: string; current_balance: number };

export function CodCollectionDialog({ open, onClose, brandId, brandIds, orderId, defaultAmount }: Props) {
  const qc = useQueryClient();
  const [pickedBrand, setPickedBrand] = useState<string>(brandId ?? "");
  const [walletId, setWalletId] = useState<string>("");
  const [amount, setAmount] = useState<string>(defaultAmount ? String(defaultAmount) : "");
  const [orderQuery, setOrderQuery] = useState<string>(orderId ?? "");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(orderId ?? null);
  const [date, setDate] = useState<string>(() => dhakaToday());
  const [note, setNote] = useState<string>("");

  useEffect(() => {
    if (open) {
      setPickedBrand(brandId ?? (brandIds.length === 1 ? brandIds[0] : ""));
      setOrderQuery(orderId ?? "");
      setSelectedOrderId(orderId ?? null);
      setAmount(defaultAmount ? String(defaultAmount) : "");
      setNote("");
    }
  }, [open, brandId, brandIds, orderId, defaultAmount]);

  const effectiveBrand = brandId ?? pickedBrand;
  const { mode: workflowMode } = useCodWorkflowMode(effectiveBrand || null);
  const blocked = workflowMode === "courier";

  const walletsQ = useQuery({
    queryKey: ["cod_wallets", effectiveBrand],
    enabled: open && !!effectiveBrand,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("erp_accounts")
        .select("id,name,account_subtype,account_type,brand_id,current_balance")
        .eq("brand_id", effectiveBrand)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as WalletOpt[];
    },
  });

  // Auto-prefer bKash/Nagad/Cash as default destination
  useEffect(() => {
    if (!walletId && walletsQ.data?.length) {
      const preferred =
        walletsQ.data.find((w) => (w.account_subtype ?? w.account_type) === "bkash") ??
        walletsQ.data.find((w) => (w.account_subtype ?? w.account_type) === "cash") ??
        walletsQ.data.find((w) => (w.account_subtype ?? w.account_type) === "nagad") ??
        walletsQ.data[0];
      if (preferred) setWalletId(preferred.id);
    }
  }, [walletsQ.data, walletId]);

  // Recent delivered COD orders for picker
  const ordersQ = useQuery({
    queryKey: ["cod_pending_orders", brandIds.join(","), orderQuery],
    enabled: open && brandIds.length > 0 && !orderId,
    queryFn: async () => {
      let q = supabase
        .from("orders")
        .select("id,order_number,total,payment_method,status,shipping_name,created_at")
        .ilike("payment_method", "%cod%")
        .order("created_at", { ascending: false })
        .limit(30);
      if (orderQuery && orderQuery.length >= 2) {
        q = q.or(`order_number.ilike.%${orderQuery}%,shipping_name.ilike.%${orderQuery}%,shipping_phone.ilike.%${orderQuery}%`);
      }
      const { data, error } = await applyBrandScope(q as any, brandIds);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; order_number: string | null; total: number; payment_method: string | null; status: string; shipping_name: string | null; created_at: string }>;
    },
  });

  const wallets = walletsQ.data ?? [];
  const wallet = wallets.find((w) => w.id === walletId);

  const mut = useMutation({
    mutationFn: async () => {
      const amt = Number(amount || 0);
      if (!effectiveBrand) throw new Error("Brand required");
      if (blocked) throw new Error("Brand courier-remittance mode-e ache. Per-order COD collection off. Finance → Settings-e mode change korun.");
      if (!walletId) throw new Error("Select destination wallet");
      if (!amt || amt <= 0) throw new Error("Amount must be > 0");
      const ref = selectedOrderId;
      const desc = note || (ref ? `COD collection (order ${ref.slice(0, 8)})` : "COD collection");
      const { error } = await supabase.from("erp_transactions").insert({
        brand_id: effectiveBrand,
        txn_type: "income",
        account_id: walletId,
        amount: amt,
        transaction_date: date,
        description: desc,
        reference_type: "cod_collection",
        reference_id: ref,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("COD collection recorded");
      qc.invalidateQueries({ queryKey: ["wallets"] });
      qc.invalidateQueries({ queryKey: ["erp_accounts"] });
      qc.invalidateQueries({ queryKey: ["bd_wallets_widget"] });
      qc.invalidateQueries({ queryKey: ["cod_remittances"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const showBrandPicker = !brandId && brandIds.length > 1;

  const orderOptions = useMemo(() => ordersQ.data ?? [], [ordersQ.data]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="h-4 w-4 text-emerald-600" /> Record COD Collection
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {blocked && (
            <div className="flex items-start gap-2 rounded border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                This brand is in <strong>Courier remittance</strong> mode. Per-order COD collection is disabled to prevent double-posting. Use <strong>Mark Received</strong> on the courier remittance instead.
              </div>
            </div>
          )}
          {showBrandPicker && (
            <div>
              <Label>Brand *</Label>
              <Select value={pickedBrand} onValueChange={setPickedBrand}>
                <SelectTrigger><SelectValue placeholder="Choose brand" /></SelectTrigger>
                <SelectContent>
                  {brandIds.map((b) => <SelectItem key={b} value={b}>{b.slice(0, 8)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {!orderId && (
            <div>
              <Label>Order (optional)</Label>
              <Input
                placeholder="Search by order # / name / phone"
                value={orderQuery}
                onChange={(e) => setOrderQuery(e.target.value)}
              />
              {orderOptions.length > 0 && (
                <div className="mt-1 max-h-32 overflow-auto rounded border bg-popover text-sm">
                  {orderOptions.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      className={`block w-full text-left px-2 py-1 hover:bg-accent ${selectedOrderId === o.id ? "bg-accent" : ""}`}
                      onClick={() => {
                        setSelectedOrderId(o.id);
                        setAmount(String(o.total ?? 0));
                        setOrderQuery(o.order_number ?? "");
                      }}
                    >
                      <span className="font-mono">{o.order_number ?? o.id.slice(0, 8)}</span>
                      <span className="text-muted-foreground"> · {o.shipping_name ?? "—"} · </span>
                      <span className="font-medium">{fmtBdt(o.total)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Amount (৳)</Label>
              <Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div>
            <Label>Received to</Label>
            <Select value={walletId} onValueChange={setWalletId} disabled={!effectiveBrand}>
              <SelectTrigger><SelectValue placeholder="bKash / Nagad / Cash" /></SelectTrigger>
              <SelectContent>
                {wallets.map((w) => {
                  const sub = w.account_subtype ?? w.account_type ?? "";
                  const icon = sub === "bkash" ? "📱" : sub === "nagad" ? "💳" : sub === "cash" ? "💵" : sub === "bank" ? "🏦" : "•";
                  return <SelectItem key={w.id} value={w.id}>{icon} {w.name} · {fmtBdt(w.current_balance)}</SelectItem>;
                })}
              </SelectContent>
            </Select>
            {wallet && (
              <p className="text-[11px] text-muted-foreground mt-1">
                Will be added to <span className="font-medium">{wallet.name}</span> ({fmtBdt(wallet.current_balance)} → {fmtBdt(Number(wallet.current_balance) + Number(amount || 0))}).
              </p>
            )}
          </div>

          <div>
            <Label>Note</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || !walletId || !amount || blocked}>
            {mut.isPending ? "Saving…" : "Record Collection"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}