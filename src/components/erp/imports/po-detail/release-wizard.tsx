import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft, ArrowRight, Boxes, CheckCircle2, Loader2, PackageCheck, Wallet, Warehouse,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAccounts } from "@/hooks/erp/use-finance-query";
import {
  listWarehouses, postCartonToInventory, releaseCarton, updateCartonStage,
} from "@/lib/erp/imports/imports.functions";
import { fmtBdt, newIdemKey } from "@/lib/erp/imports/types";
import { BillTile } from "./atoms";

const RELEASABLE = ["arrived_bd"];
const PRE_ARRIVAL = ["ordered", "at_china_warehouse", "in_transit"];

type Step = 1 | 2 | 3;

function itemLabel(poItems: any[], cartonItem: any) {
  const pi = poItems.find((p: any) => p.id === cartonItem.po_item_id);
  return (
    pi?.product?.name ??
    pi?.product_name ??
    pi?.name ??
    pi?.product?.sku ??
    pi?.sku ??
    "Item"
  );
}

/**
 * Guided manual release: pick cartons → pay → post to stock.
 * Ek jaygay theke pura kaj — kono step miss hobe na.
 */
export function ReleaseWizard({
  open, onClose, poId, poNumber, brandId, cartons, poItems, poPaid, poSupplierTotal,
}: {
  open: boolean;
  onClose: () => void;
  poId: string;
  poNumber: string;
  brandId: string;
  cartons: any[];
  poItems: any[];
  poPaid: number;
  poSupplierTotal: number;
}) {
  const qc = useQueryClient();
  const stageFn = useServerFn(updateCartonStage);
  const releaseFn = useServerFn(releaseCarton);
  const postFn = useServerFn(postCartonToInventory);
  const whFn = useServerFn(listWarehouses);
  const { data: wallets = [] } = useAccounts([brandId]);
  const { data: warehouses = [] } = useQuery({
    queryKey: ["imp-wh", brandId],
    queryFn: () => whFn({ data: { brandId } }),
    enabled: !!brandId,
  });

  const eligible = useMemo(
    () => cartons.filter((c) => RELEASABLE.includes(c.status) || PRE_ARRIVAL.includes(c.status)),
    [cartons],
  );

  const [step, setStep] = useState<Step>(1);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [walletId, setWalletId] = useState("");
  const [amount, setAmount] = useState<number>(0);
  const [skipPay, setSkipPay] = useState(false);
  const [reference, setReference] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [postStock, setPostStock] = useState(true);
  const [allOk, setAllOk] = useState(true);
  const [shortage, setShortage] = useState<Record<string, { damaged: number; missing: number }>>({});
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null);

  const selected = useMemo(() => eligible.filter((c) => picked.has(c.id)), [eligible, picked]);
  const selPieces = selected.reduce((s, c) => s + Number(c.expected_quantity || 0), 0);
  const supplierCost = selected.reduce((s, c) => s + Number(c.supplier_cost_bdt || 0), 0);
  const shipping = selected.reduce((s, c) => s + Number(c.shipping_charge_bdt || 0), 0);
  const advanceShare = poSupplierTotal > 0 ? (poPaid * supplierCost) / poSupplierTotal : 0;
  const supplierDue = Math.max(0, supplierCost - advanceShare);
  const billTotal = Math.round((supplierDue + shipping) * 100) / 100;

  const defaultWarehouse = (warehouses as any[]).find((w) => w.is_default) ?? (warehouses as any[])[0];
  const effectiveWarehouse = warehouseId || defaultWarehouse?.id || "";

  const perCartonBill = selected.map((c) => {
    const sc = Number(c.supplier_cost_bdt || 0);
    const sh = Number(c.shipping_charge_bdt || 0);
    const adv = poSupplierTotal > 0 ? (poPaid * sc) / poSupplierTotal : 0;
    return { carton: c, bill: Math.max(0, sc - adv) + sh };
  });
  const billSum = perCartonBill.reduce((s, r) => s + r.bill, 0);

  const toggle = (id: string) => {
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const goPay = () => {
    if (picked.size === 0) return toast.error("At least ekta carton select korun");
    setAmount(billTotal);
    setStep(2);
  };

  const run = useMutation({
    mutationFn: async () => {
      const payAmount = skipPay ? 0 : amount;
      if (!skipPay) {
        if (payAmount <= 0) throw new Error("Pay amount din, othoba 'Payment porey' select korun");
        if (!walletId) throw new Error("Wallet select korun");
      }
      if (postStock && !effectiveWarehouse) throw new Error("Warehouse select korun");

      const total = selected.length * (postStock ? 2 : 1);
      let done = 0;
      const bump = (label: string) => { done += 1; setProgress({ done, total, label }); };

      let assigned = 0;
      for (let i = 0; i < perCartonBill.length; i++) {
        const { carton, bill } = perCartonBill[i];
        const tag = `C${carton.carton_number}`;

        if (PRE_ARRIVAL.includes(carton.status)) {
          await stageFn({ data: { carton_id: carton.id, new_stage: "arrived_bd" } });
        }

        if (carton.status !== "released") {
          const payload: any = { carton_id: carton.id, idempotency_key: newIdemKey("wrel") };
          if (skipPay || payAmount <= 0) {
            payload.release_without_payment = true;
          } else {
            const isLast = i === perCartonBill.length - 1;
            const share = isLast
              ? Math.max(0, Math.round((payAmount - assigned) * 100) / 100)
              : Math.round((billSum > 0 ? (bill / billSum) * payAmount : payAmount / perCartonBill.length) * 100) / 100;
            assigned += share;
            if (share > 0) {
              payload.payment = {
                amount: share,
                wallet_id: walletId,
                payment_date: new Date().toISOString().slice(0, 10),
                reference: reference || undefined,
                idempotency_key: newIdemKey("wpay"),
              };
            } else {
              payload.release_without_payment = true;
            }
          }
          await releaseFn({ data: payload });
        }
        bump(`${tag} released`);

        if (postStock) {
          const qcRows = (carton.items ?? []).map((it: any) => {
            const s = allOk ? { damaged: 0, missing: 0 } : (shortage[it.id] ?? { damaged: 0, missing: 0 });
            const expected = Number(it.quantity_expected || 0);
            const damaged = Math.min(Number(s.damaged || 0), expected);
            const missing = Math.min(Number(s.missing || 0), Math.max(0, expected - damaged));
            return {
              carton_item_id: it.id,
              quantity_ok: Math.max(0, expected - damaged - missing),
              quantity_damaged: damaged,
              quantity_missing: missing,
            };
          });
          if (qcRows.length > 0) {
            await postFn({
              data: {
                carton_id: carton.id,
                warehouse_id: effectiveWarehouse,
                qc: qcRows,
                idempotency_key: newIdemKey("wqc"),
              },
            });
          }
          bump(`${tag} stock e gelo`);
        }
      }
    },
    onSuccess: () => {
      toast.success(
        postStock
          ? `${selected.length} carton release + stock e post hoyeche`
          : `${selected.length} carton release hoyeche`,
      );
      qc.invalidateQueries({ queryKey: ["imp-po", poId] });
      setProgress(null);
      onClose();
    },
    onError: (e: any) => {
      setProgress(null);
      toast.error(e?.message ?? "Release failed");
    },
  });

  const selectedItems = selected.flatMap((c) => (c.items ?? []).map((it: any) => ({ ...it, carton: c })));

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !run.isPending) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageCheck className="h-5 w-5 text-primary" />
            Release Wizard — {poNumber}
          </DialogTitle>
          <DialogDescription>
            3 ta step — carton bacho, bill pay koro, stock e post koro. Ek clicke sob shesh.
          </DialogDescription>
        </DialogHeader>

        {/* Stepper */}
        <div className="flex items-center gap-2">
          {[
            { n: 1, label: "Carton", Icon: Boxes },
            { n: 2, label: "Payment", Icon: Wallet },
            { n: 3, label: "Stock", Icon: Warehouse },
          ].map(({ n, label, Icon }, i) => (
            <div key={n} className="flex items-center gap-2 flex-1">
              <div
                className={cn(
                  "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium w-full",
                  step === n && "border-primary bg-primary/10 text-primary",
                  step > n && "border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900",
                  step < n && "border-dashed text-muted-foreground",
                )}
              >
                {step > n ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                {label}
              </div>
              {i < 2 && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />}
            </div>
          ))}
        </div>

        {/* STEP 1 */}
        {step === 1 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={() => setPicked(new Set(eligible.map((c) => c.id)))}>
                Select all ({eligible.length})
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPicked(new Set())}>Clear</Button>
              {[3, 5, 10].map((n) => (
                <Button key={n} size="sm" variant="ghost" className="text-xs"
                  onClick={() => setPicked(new Set(eligible.slice(0, n).map((c) => c.id)))}
                  disabled={eligible.length < n}
                >First {n}</Button>
              ))}
            </div>

            <div className="rounded-lg border divide-y max-h-[42vh] overflow-y-auto">
              {eligible.length === 0 && (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  Release korar moto kono carton nei.
                </div>
              )}
              {eligible.map((c) => {
                const isPre = PRE_ARRIVAL.includes(c.status);
                const on = picked.has(c.id);
                return (
                  <button
                    type="button"
                    key={c.id}
                    onClick={() => toggle(c.id)}
                    className={cn("w-full text-left px-3 py-2.5 flex items-center gap-3 hover:bg-accent/40", on && "bg-primary/5")}
                  >
                    <Checkbox checked={on} className="pointer-events-none" />
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-sm font-semibold">{poNumber}-C{c.carton_number}</div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {(c.items ?? []).map((it: any) => `${itemLabel(poItems, it)} × ${it.quantity_expected}`).join(" · ") ||
                          `${c.expected_quantity} pcs`}
                      </div>
                    </div>
                    {isPre && <Badge variant="outline" className="text-[10px]">auto Arrived BD</Badge>}
                    <div className="text-right text-[11px] tabular-nums text-muted-foreground">
                      {c.expected_quantity} pcs<br />{fmtBdt(Number(c.supplier_cost_bdt || 0) + Number(c.shipping_charge_bdt || 0))}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="text-xs text-muted-foreground">
              Selected: <span className="font-semibold text-foreground">{picked.size} carton · {selPieces} pcs</span>
            </div>
          </div>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <div className="space-y-3">
            <Card className="p-3 bg-muted/30 border-0">
              <div className="grid grid-cols-2 gap-3">
                <BillTile label="Supplier cost" value={fmtBdt(supplierCost)} />
                <BillTile label="Advance share" value={`− ${fmtBdt(advanceShare)}`} valueClass="text-emerald-700 dark:text-emerald-400" />
                <BillTile label="Shipping (CN→BD)" value={fmtBdt(shipping)} />
                <BillTile label="Ei muhurte payable" value={fmtBdt(billTotal)} valueClass="text-orange-700 dark:text-orange-300" />
              </div>
            </Card>

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Pay amount</Label>
                <Input type="number" step="0.01" value={amount} disabled={skipPay}
                  onChange={(e) => setAmount(Number(e.target.value))} />
                <div className="flex gap-2 mt-1.5">
                  <Button size="sm" variant="ghost" className="h-7 text-[11px]" disabled={skipPay} onClick={() => setAmount(billTotal)}>Full</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-[11px]" disabled={skipPay} onClick={() => setAmount(Math.round(billTotal * 50) / 100)}>50%</Button>
                </div>
              </div>
              <div>
                <Label className="text-xs">Wallet</Label>
                <Select value={walletId} onValueChange={setWalletId} disabled={skipPay}>
                  <SelectTrigger><SelectValue placeholder="Wallet select korun" /></SelectTrigger>
                  <SelectContent>
                    {wallets.filter((w) => w.is_active).map((w) => (
                      <SelectItem key={w.id} value={w.id}>{w.name} ({fmtBdt(w.current_balance)})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs">Reference (optional)</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="bKash trx / slip no" disabled={skipPay} />
            </div>

            <label className="inline-flex items-center gap-2 text-xs">
              <Checkbox checked={skipPay} onCheckedChange={(v) => setSkipPay(!!v)} />
              Payment porey debo — ekhon PO due hishebe thakuk
            </label>
          </div>
        )}

        {/* STEP 3 */}
        {step === 3 && (
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm rounded-lg border p-3">
              <Checkbox checked={postStock} onCheckedChange={(v) => setPostStock(!!v)} />
              <span>
                Release-er sathe stock e post koro (QC)
                <span className="block text-[11px] text-muted-foreground">Off korle carton shudhu released thakbe, pore QC korte parben.</span>
              </span>
            </label>

            {postStock && (
              <>
                <div>
                  <Label className="text-xs">Warehouse</Label>
                  <Select value={effectiveWarehouse} onValueChange={setWarehouseId}>
                    <SelectTrigger><SelectValue placeholder="Warehouse" /></SelectTrigger>
                    <SelectContent>
                      {(warehouses as any[]).map((w) => (
                        <SelectItem key={w.id} value={w.id}>{w.name}{w.is_default ? " (default)" : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <label className="inline-flex items-center gap-2 text-xs">
                  <Checkbox checked={allOk} onCheckedChange={(v) => setAllOk(!!v)} />
                  Sob piece thik ache ({selPieces} pcs OK)
                </label>

                {!allOk && (
                  <div className="rounded-lg border divide-y max-h-[32vh] overflow-y-auto">
                    {selectedItems.map((it: any) => {
                      const s = shortage[it.id] ?? { damaged: 0, missing: 0 };
                      const expected = Number(it.quantity_expected || 0);
                      const ok = Math.max(0, expected - Number(s.damaged || 0) - Number(s.missing || 0));
                      return (
                        <div key={it.id} className="p-2.5 flex items-center gap-2 flex-wrap">
                          <div className="flex-1 min-w-[140px] text-xs">
                            <div className="font-medium truncate">{itemLabel(poItems, it)}</div>
                            <div className="text-[11px] text-muted-foreground">C{it.carton.carton_number} · expected {expected} · OK {ok}</div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Input className="h-8 w-20" type="number" min={0} placeholder="Damaged"
                              value={s.damaged || ""}
                              onChange={(e) => setShortage((p) => ({ ...p, [it.id]: { ...s, damaged: Number(e.target.value) } }))} />
                            <Input className="h-8 w-20" type="number" min={0} placeholder="Missing"
                              value={s.missing || ""}
                              onChange={(e) => setShortage((p) => ({ ...p, [it.id]: { ...s, missing: Number(e.target.value) } }))} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            <Card className="p-3 bg-muted/30 border-0 text-xs space-y-1">
              <div className="font-semibold text-sm mb-1">Summary</div>
              <div>Carton: <span className="font-semibold">{selected.length}</span> · Pieces: <span className="font-semibold">{selPieces}</span></div>
              <div>Payment: <span className="font-semibold">{skipPay ? "Porey (PO due)" : `${fmtBdt(amount)} — ${wallets.find((w) => w.id === walletId)?.name ?? "wallet select koren"}`}</span></div>
              <div>Stock: <span className="font-semibold">{postStock ? `${(warehouses as any[]).find((w) => w.id === effectiveWarehouse)?.name ?? "—"} e post hobe` : "Post hobe na"}</span></div>
            </Card>

            {progress && (
              <div className="space-y-1">
                <Progress value={(progress.done / progress.total) * 100} />
                <div className="text-[11px] text-muted-foreground">{progress.label} ({progress.done}/{progress.total})</div>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {step > 1 && (
            <Button variant="ghost" onClick={() => setStep((s) => (s - 1) as Step)} disabled={run.isPending}>
              <ArrowLeft className="h-4 w-4 mr-1" />Back
            </Button>
          )}
          {step === 1 && (
            <Button onClick={goPay} disabled={picked.size === 0}>
              Next: Payment <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          )}
          {step === 2 && (
            <Button onClick={() => setStep(3)}>
              Next: Stock <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          )}
          {step === 3 && (
            <Button onClick={() => run.mutate()} disabled={run.isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {run.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <PackageCheck className="h-4 w-4 mr-1" />
              {selected.length} carton confirm koro
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
