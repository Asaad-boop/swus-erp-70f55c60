import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import { AmountPercentInput } from "@/components/erp/amount-percent-input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAccounts } from "@/hooks/erp/use-finance-query";
import { editImportPayment, markArrivedInBd, receiveQuantityBd, recordImportPayment, releaseCarton, reverseImportPayment } from "@/lib/erp/imports/imports.functions";
import { fmtBdt, newIdemKey } from "@/lib/erp/imports/types";
import { BillTile } from "./atoms";

export function ArrivedDialog({ poId, onClose, brandId }: { poId: string; onClose: () => void; brandId: string }) {
  const fn = useServerFn(markArrivedInBd);
  const qc = useQueryClient();
  const { data: wallets = [] } = useAccounts([brandId]);
  const [weight, setWeight] = useState<number>(0);
  const [rate, setRate] = useState<number>(0);
  const [payNow, setPayNow] = useState(false);
  const [amount, setAmount] = useState<number>(0);
  const [walletId, setWalletId] = useState("");
  const [ref, setRef] = useState("");

  const total = weight * rate;
  useMemo(() => { if (payNow && amount === 0) setAmount(total); /* eslint-disable-next-line */ }, [total, payNow]);

  const mut = useMutation({
    mutationFn: async () => {
      const payload: any = { po_id: poId, total_weight_kg: weight, rate_per_kg_bdt: rate, idempotency_key: newIdemKey("arr") };
      if (payNow && walletId && amount > 0) {
        payload.shipping_payment = { amount, wallet_id: walletId, payment_date: new Date().toISOString().slice(0, 10), reference: ref || undefined, idempotency_key: newIdemKey("pay") };
      }
      return await fn({ data: payload });
    },
    onSuccess: () => { toast.success("Marked as arrived in BD"); qc.invalidateQueries({ queryKey: ["imp-po", poId] }); onClose(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Receive at BD Warehouse</DialogTitle>
          <DialogDescription>Enter actual shipped weight and rate. Shipping is auto-distributed across cartons by weight.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Total weight (kg) *</Label><Input type="number" step="0.1" value={weight} onChange={(e) => setWeight(Number(e.target.value))} /></div>
            <div><Label>Rate ৳/kg *</Label><Input type="number" step="0.01" value={rate} onChange={(e) => setRate(Number(e.target.value))} /></div>
          </div>
          <div className="flex items-center justify-between text-sm p-2 rounded bg-muted/40">
            <span className="text-muted-foreground">Shipping total:</span><span className="font-semibold tabular-nums">{fmtBdt(total)}</span>
          </div>
          <div className="border-t border-border pt-3">
            <div className="text-[11px] tracking-wider font-semibold text-muted-foreground mb-2">PAY SHIPPING NOW (OPTIONAL)</div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Amount</Label><Input type="number" step="0.01" value={amount} onChange={(e) => { setAmount(Number(e.target.value)); setPayNow(true); }} /></div>
              <div>
                <Label>From Wallet</Label>
                <Select value={walletId} onValueChange={(v) => { setWalletId(v); setPayNow(true); }}>
                  <SelectTrigger><SelectValue placeholder="Wallet" /></SelectTrigger>
                  <SelectContent>{wallets.filter((w) => w.is_active).map((w) => <SelectItem key={w.id} value={w.id}>{w.name} ({fmtBdt(w.current_balance)})</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-2"><Label>Reference</Label><Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Optional" /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={weight <= 0 || rate <= 0 || mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save &amp; Distribute
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PaymentDialog({ poId, brandId, grandTotal, dueAmount, onClose }: { poId: string; brandId: string; grandTotal: number; dueAmount: number; onClose: () => void }) {
  return <PaymentDialogInner poId={poId} brandId={brandId} grandTotal={grandTotal} dueAmount={dueAmount} onClose={onClose} />;
}

export function QtyArrivedDialog({
  poId, brandId, onClose,
  initialWeight = 0, initialRate = 0, initialCustoms = 0, initialOther = 0,
}: {
  poId: string; brandId: string; onClose: () => void;
  initialWeight?: number; initialRate?: number; initialCustoms?: number; initialOther?: number;
}) {
  const fn = useServerFn(receiveQuantityBd);
  const qc = useQueryClient();
  const { data: wallets = [] } = useAccounts([brandId]);
  const [weight, setWeight] = useState<number>(initialWeight);
  const [rate, setRate] = useState<number>(initialRate);
  const [flat, setFlat] = useState<number>(0);
  const [customs, setCustoms] = useState<number>(initialCustoms);
  const [other, setOther] = useState<number>(initialOther);
  const [payNow, setPayNow] = useState(false);
  const [amount, setAmount] = useState<number>(0);
  const [walletId, setWalletId] = useState("");
  const [ref, setRef] = useState("");

  const shipping = flat > 0 ? flat : +(weight * rate).toFixed(2);

  const mut = useMutation({
    mutationFn: async () => {
      const payload: any = {
        po_id: poId,
        total_weight_kg: weight || 0,
        rate_per_kg_bdt: rate || 0,
        customs_duty_bdt: customs || 0,
        other_charges_bdt: other || 0,
        mode: "replace",
        idempotency_key: newIdemKey("qarr"),
      };
      if (flat > 0) payload.shipping_total_bdt = flat;
      if (payNow && walletId && amount > 0) {
        payload.shipping_payment = {
          amount, wallet_id: walletId,
          payment_date: new Date().toISOString().slice(0, 10),
          reference: ref || undefined,
          idempotency_key: newIdemKey("pay"),
        };
      }
      return await fn({ data: payload });
    },
    onSuccess: () => { toast.success("Received in BD — landed cost update hoyeche"); qc.invalidateQueries({ queryKey: ["imp-po", poId] }); onClose(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Receive at BD (Quantity mode)</DialogTitle>
          <DialogDescription>Shipping bill din — per-piece landed cost e jabe, tarpor piece wise release + pay kora jabe.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div><Label className="text-xs">Weight (kg)</Label><Input type="number" step="0.01" value={weight} onChange={(e) => setWeight(Number(e.target.value))} /></div>
            <div><Label className="text-xs">Rate ৳/kg</Label><Input type="number" step="0.01" value={rate} onChange={(e) => setRate(Number(e.target.value))} /></div>
            <div><Label className="text-xs">Or flat ৳</Label><Input type="number" step="0.01" value={flat} onChange={(e) => setFlat(Number(e.target.value))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Customs / Duty (৳)</Label><Input type="number" step="0.01" value={customs} onChange={(e) => setCustoms(Number(e.target.value))} /></div>
            <div><Label className="text-xs">Other charges (৳)</Label><Input type="number" step="0.01" value={other} onChange={(e) => setOther(Number(e.target.value))} /></div>
          </div>
          <div className="flex items-center justify-between text-sm p-2 rounded bg-muted/40">
            <span className="text-muted-foreground">Shipping total:</span>
            <span className="font-semibold tabular-nums">{fmtBdt(shipping)}</span>
          </div>
          <div className="border-t border-border pt-3">
            <div className="text-[11px] tracking-wider font-semibold text-muted-foreground mb-2">PAY SHIPPING NOW (OPTIONAL)</div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Amount</Label><Input type="number" step="0.01" value={amount} onChange={(e) => { setAmount(Number(e.target.value)); setPayNow(true); }} /></div>
              <div>
                <Label className="text-xs">From wallet</Label>
                <Select value={walletId} onValueChange={(v) => { setWalletId(v); setPayNow(true); }}>
                  <SelectTrigger><SelectValue placeholder="Wallet" /></SelectTrigger>
                  <SelectContent>{wallets.filter((w) => w.is_active).map((w) => <SelectItem key={w.id} value={w.id}>{w.name} ({fmtBdt(w.current_balance)})</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-2"><Label className="text-xs">Reference</Label><Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Optional" /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={shipping < 0 || mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PaymentDialogInner({ poId, brandId, grandTotal, dueAmount, onClose }: { poId: string; brandId: string; grandTotal: number; dueAmount: number; onClose: () => void }) {
  const fn = useServerFn(recordImportPayment);
  const qc = useQueryClient();
  const { data: wallets = [] } = useAccounts([brandId]);
  const [amount, setAmount] = useState<number>(0);
  const [walletId, setWalletId] = useState("");
  const [type, setType] = useState("supplier_payment");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [ref, setRef] = useState("");

  const mut = useMutation({
    mutationFn: () => fn({ data: { brand_id: brandId, po_id: poId, payment_type: type as any, amount_bdt: amount, wallet_id: walletId, payment_date: date, reference: ref || undefined, idempotency_key: newIdemKey("pay") } }),
    onSuccess: () => { toast.success("Payment recorded"); qc.invalidateQueries({ queryKey: ["imp-po", poId] }); onClose(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Payment type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="supplier_advance">Supplier Advance</SelectItem>
                <SelectItem value="supplier_payment">Supplier Payment</SelectItem>
                <SelectItem value="shipping">Shipping</SelectItem>
                <SelectItem value="supplier_balance">Supplier Balance</SelectItem>
                <SelectItem value="local_courier">Local Courier</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <AmountPercentInput
            total={dueAmount > 0 ? dueAmount : grandTotal}
            amount={amount}
            onChange={setAmount}
            label={`Amount (BDT) — ${dueAmount > 0 ? `due ${fmtBdt(dueAmount)}` : `total ${fmtBdt(grandTotal)}`}`}
          />
          <div><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div>
            <Label>Wallet</Label>
            <Select value={walletId} onValueChange={setWalletId}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{wallets.filter((w) => w.is_active).map((w) => <SelectItem key={w.id} value={w.id}>{w.name} ({fmtBdt(w.current_balance)})</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Reference</Label><Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Optional" /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={amount <= 0 || !walletId || mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Record
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BulkReleaseDialog({
  poId, brandId, cartons, poPaid, poSupplierTotal, onClose, onDone,
}: {
  poId: string; brandId: string; cartons: any[];
  poPaid: number; poSupplierTotal: number;
  onClose: () => void; onDone: () => void;
}) {
  const fn = useServerFn(releaseCarton);
  const qc = useQueryClient();
  const { data: wallets = [] } = useAccounts([brandId]);

  const supplierCost = cartons.reduce((s, c) => s + Number(c.supplier_cost_bdt || 0), 0);
  const shipping = cartons.reduce((s, c) => s + Number(c.shipping_charge_bdt || 0), 0);
  const advanceShare = poSupplierTotal > 0 ? (poPaid * supplierCost) / poSupplierTotal : 0;
  const supplierDue = Math.max(0, supplierCost - advanceShare);
  const defaultTotal = Math.round((supplierDue + shipping) * 100) / 100;

  const [amount, setAmount] = useState<number>(defaultTotal);
  const [walletId, setWalletId] = useState("");
  const [ref, setRef] = useState("");
  const [withoutPay, setWithoutPay] = useState(false);

  const perCarton = cartons.map((c) => {
    const sc = Number(c.supplier_cost_bdt || 0);
    const sh = Number(c.shipping_charge_bdt || 0);
    const adv = poSupplierTotal > 0 ? (poPaid * sc) / poSupplierTotal : 0;
    const bill = Math.max(0, sc - adv) + sh;
    return { carton: c, bill };
  });
  const billSum = perCarton.reduce((s, r) => s + r.bill, 0);

  const mut = useMutation({
    mutationFn: async () => {
      if (!withoutPay) {
        if (amount <= 0) throw new Error("Pay amount required");
        if (!walletId) throw new Error("Pick a wallet");
      }
      let assigned = 0;
      for (let i = 0; i < perCarton.length; i++) {
        const { carton, bill } = perCarton[i];
        const payload: any = { carton_id: carton.id, idempotency_key: newIdemKey("brel") };
        if (withoutPay) {
          payload.release_without_payment = true;
        } else {
          const isLast = i === perCarton.length - 1;
          const share = isLast
            ? Math.max(0, Math.round((amount - assigned) * 100) / 100)
            : Math.round(((billSum > 0 ? (bill / billSum) * amount : amount / perCarton.length)) * 100) / 100;
          assigned += share;
          if (share > 0) {
            payload.payment = {
              amount: share,
              wallet_id: walletId,
              payment_date: new Date().toISOString().slice(0, 10),
              reference: ref || undefined,
              idempotency_key: newIdemKey("pay"),
            };
          } else {
            payload.release_without_payment = true;
          }
        }
        await fn({ data: payload });
      }
    },
    onSuccess: () => {
      toast.success(`Released ${cartons.length} carton${cartons.length > 1 ? "s" : ""}`);
      qc.invalidateQueries({ queryKey: ["imp-po", poId] });
      onDone();
    },
    onError: (e: any) => toast.error(e?.message ?? "Bulk release failed"),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Bulk Release — {cartons.length} carton{cartons.length > 1 ? "s" : ""}</DialogTitle>
          <DialogDescription>Pay once from a single wallet — payment auto-splits across selected cartons by their bill share.</DialogDescription>
        </DialogHeader>

        <Card className="p-3 bg-muted/30 border-0">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <BillTile label="Supplier cost" value={fmtBdt(supplierCost)} />
            <BillTile label="Advance share" value={`− ${fmtBdt(advanceShare)}`} valueClass="text-emerald-700 dark:text-emerald-400" />
            <BillTile label="Shipping (CN→BD)" value={fmtBdt(shipping)} />
            <BillTile label="Total to pay" value={fmtBdt(defaultTotal)} valueClass="text-orange-700 dark:text-orange-300 text-base" />
          </div>
        </Card>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Pay amount</Label>
              <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(Number(e.target.value))} disabled={withoutPay} />
            </div>
            <div>
              <Label className="text-xs">Wallet</Label>
              <Select value={walletId} onValueChange={setWalletId} disabled={withoutPay}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{wallets.filter((w) => w.is_active).map((w) => <SelectItem key={w.id} value={w.id}>{w.name} ({fmtBdt(w.current_balance)})</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Reference</Label>
            <Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Optional" disabled={withoutPay} />
          </div>
          <label className="inline-flex items-center gap-2 text-xs">
            <Checkbox checked={withoutPay} onCheckedChange={(v) => setWithoutPay(!!v)} />
            Release without payment (carry as PO due)
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <Send className="h-4 w-4 mr-1" />Release {cartons.length}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
/* ---------------- Edit / withdraw an existing payment ---------------- */

const PAYMENT_TYPES = [
  { v: "supplier_advance", l: "Supplier Advance" },
  { v: "supplier_payment", l: "Supplier Payment" },
  { v: "shipping", l: "Shipping" },
  { v: "carton_release", l: "Carton Release" },
  { v: "supplier_balance", l: "Supplier Balance" },
  { v: "local_courier", l: "Local Courier" },
  { v: "adjustment", l: "Adjustment" },
];

export function EditPaymentDialog({
  payment, brandId, poId, onClose,
}: { payment: any; brandId: string; poId: string; onClose: () => void }) {
  const editFn = useServerFn(editImportPayment);
  const reverseFn = useServerFn(reverseImportPayment);
  const qc = useQueryClient();
  const { data: wallets = [] } = useAccounts([brandId]);

  const [amount, setAmount] = useState<number>(Number(payment.amount_bdt) || 0);
  const [walletId, setWalletId] = useState<string>(payment.wallet_id ?? "");
  const [type, setType] = useState<string>(payment.payment_type);
  const [date, setDate] = useState<string>(payment.payment_date);
  const [ref, setRef] = useState<string>(payment.reference ?? "");
  const [reason, setReason] = useState("");

  const done = (msg: string) => {
    toast.success(msg);
    qc.invalidateQueries({ queryKey: ["imp-po", poId] });
    qc.invalidateQueries({ queryKey: ["erp-accounts"] });
    onClose();
  };

  const saveMut = useMutation({
    mutationFn: () => editFn({
      data: {
        payment_id: payment.id,
        brand_id: brandId,
        po_id: poId,
        carton_id: payment.carton_id ?? undefined,
        payment_type: type as any,
        amount_bdt: amount,
        wallet_id: walletId,
        payment_date: date,
        reference: ref || undefined,
        notes: reason || undefined,
        idempotency_key: newIdemKey("payedit"),
      },
    }),
    onSuccess: () => done("Payment update hoyeche"),
    onError: (e: any) => toast.error(e?.message ?? "Update failed"),
  });

  const revMut = useMutation({
    mutationFn: () => reverseFn({ data: { payment_id: payment.id, reason: reason || undefined } }),
    onSuccess: () => done("Payment withdraw kora hoyeche — taka wallet e fireche"),
    onError: (e: any) => toast.error(e?.message ?? "Withdraw failed"),
  });

  const busy = saveMut.isPending || revMut.isPending;

  const origAmt = Number(payment.amount_bdt) || 0;
  const sameWallet = walletId === payment.wallet_id;
  const delta = amount - origAmt;
  const oldWalletName = wallets.find((w) => w.id === payment.wallet_id)?.name ?? "purono wallet";
  const newWalletName = wallets.find((w) => w.id === walletId)?.name ?? "notun wallet";
  const newWalletBal = Number(wallets.find((w) => w.id === walletId)?.current_balance ?? 0);
  // Same wallet hole reversal refund add hoye jabe, tai effective available balance beshi.
  const availableAfterRefund = newWalletBal + (sameWallet ? origAmt : 0);
  const shortBy = amount - availableAfterRefund;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit / Withdraw Payment</DialogTitle>
          <DialogDescription>
            Edit korle purono record reverse hoye notun record boshbe. Withdraw korle taka wallet e ferot jabe.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
            Original: <span className="font-semibold text-foreground tabular-nums">{fmtBdt(payment.amount_bdt)}</span>
            {" · "}{payment.payment_date}{payment.reference ? ` · ${payment.reference}` : ""}
          </div>
          <div>
            <Label>Payment type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_TYPES.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Amount (৳)</Label><Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></div>
            <div><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          </div>
          <div>
            <Label>Wallet</Label>
            <Select value={walletId} onValueChange={setWalletId}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{wallets.filter((w) => w.is_active).map((w) => <SelectItem key={w.id} value={w.id}>{w.name} ({fmtBdt(w.current_balance)})</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Reference</Label><Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Optional" /></div>
          <div><Label>Reason / note</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="keno adjust/withdraw" /></div>

          {walletId && amount > 0 && (
            <div className="rounded-md border bg-muted/30 p-2.5 text-xs space-y-1">
              <p className="font-medium text-foreground">Wallet impact</p>
              {sameWallet ? (
                delta === 0 ? (
                  <p className="text-muted-foreground">Amount same — {newWalletName} e kono net change hobe na.</p>
                ) : delta > 0 ? (
                  <p className="text-rose-600 dark:text-rose-400">
                    {newWalletName} theke aro <span className="font-semibold tabular-nums">{fmtBdt(delta)}</span> kata jabe.
                  </p>
                ) : (
                  <p className="text-emerald-600 dark:text-emerald-400">
                    {newWalletName} e <span className="font-semibold tabular-nums">{fmtBdt(-delta)}</span> ferot jabe.
                  </p>
                )
              ) : (
                <>
                  <p className="text-emerald-600 dark:text-emerald-400">
                    {oldWalletName} e <span className="font-semibold tabular-nums">{fmtBdt(origAmt)}</span> ferot jabe.
                  </p>
                  <p className="text-rose-600 dark:text-rose-400">
                    {newWalletName} theke <span className="font-semibold tabular-nums">{fmtBdt(amount)}</span> kata jabe.
                  </p>
                </>
              )}
              {shortBy > 0 && (
                <p className="font-medium text-amber-600 dark:text-amber-400">
                  ⚠ {newWalletName} e joththesto balance nei — short by {fmtBdt(shortBy)}.
                </p>
              )}
            </div>
          )}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            variant="destructive"
            disabled={busy}
            onClick={() => { if (confirm("Ei payment withdraw kore wallet e taka ferot dite chan?")) revMut.mutate(); }}
          >
            {revMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Withdraw
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button disabled={busy || amount <= 0 || !walletId} onClick={() => saveMut.mutate()}>
              {saveMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save changes
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
