import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Boxes, Loader2, PackageCheck, Warehouse, Wallet, Truck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listWarehouses, releasePoQuantity } from "@/lib/erp/imports/imports.functions";
import { fmtBdt, netDue } from "@/lib/erp/imports/types";
import { useAccounts } from "@/hooks/erp/use-finance-query";
import { AccountCombobox } from "@/components/erp/finance/account-combobox";

type Release = {
  id: string;
  release_number: number;
  released_at: string;
  notes: string | null;
  items: Array<{
    id: string; po_item_id: string; quantity: number; damaged_qty: number; missing_qty?: number;
    unit_landed_cost_bdt: number; sku_snapshot: string | null;
  }>;
  local_delivery_bdt?: number | null;
  delivery_note?: string | null;
};

export function QuantityReleaseCard({
  poId, brandId, po, items, releases, onPayDue,
}: {
  poId: string;
  brandId: string | null;
  po?: any;
  items: any[];
  releases: Release[];
  onPayDue?: () => void;
}) {
  const qc = useQueryClient();
  const whFn = useServerFn(listWarehouses);
  const releaseFn = useServerFn(releasePoQuantity);

  const { data: warehouses = [] } = useQuery({
    queryKey: ["imp-warehouses", brandId],
    enabled: !!brandId,
    queryFn: () => whFn({ data: { brandId: brandId! } }),
  });

  const releasedByItem = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of releases) {
      for (const it of r.items ?? []) {
        m.set(
          it.po_item_id,
          (m.get(it.po_item_id) ?? 0) +
            Number(it.quantity ?? 0) +
            Number(it.damaged_qty ?? 0) +
            Number(it.missing_qty ?? 0),
        );
      }
    }
    return m;
  }, [releases]);

  const [warehouseId, setWarehouseId] = useState("");
  const [notes, setNotes] = useState("");
  const [draft, setDraft] = useState<Record<string, { qty: number; damaged: number; missing: number }>>({});
  const [ldAmount, setLdAmount] = useState("");
  const [ldNote, setLdNote] = useState("");
  const [ldWallet, setLdWallet] = useState("");
  const [payNow, setPayNow] = useState(true);
  const [payWallet, setPayWallet] = useState("");
  const [payOverride, setPayOverride] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { data: wallets = [] } = useAccounts(brandId ? [brandId] : []);


  // Ekta matro warehouse thakle (ba default thakle) auto select — protibar select korte hobe na
  useEffect(() => {
    if (warehouseId) return;
    const list = warehouses as any[];
    if (!list.length) return;
    const def = list.find((w) => w.is_default) ?? (list.length === 1 ? list[0] : null);
    if (def) setWarehouseId(def.id);
  }, [warehouses, warehouseId]);

  const getDraft = (id: string) => draft[id] ?? { qty: 0, damaged: 0, missing: 0 };
  const setDraftFor = (id: string, patch: Partial<{ qty: number; damaged: number; missing: number }>) => {
    // Draft bodlale purono manual pay-amount ta stale hoye jay — reset kore din
    setPayOverride(null);
    setDraft((d) => ({ ...d, [id]: { ...getDraft(id), ...patch } }));
  };
  /** qty + damaged + missing kokhono remaining ke charie jete parbe na */
  const clampField = (
    it: any,
    field: "qty" | "damaged" | "missing",
    raw: number,
  ) => {
    const ordered = Number(it.quantity ?? 0);
    const remaining = Math.max(0, ordered - (releasedByItem.get(it.id) ?? 0));
    const d = getDraft(it.id);
    const others = (["qty", "damaged", "missing"] as const)
      .filter((k) => k !== field)
      .reduce((s, k) => s + Number(d[k] ?? 0), 0);
    return Math.min(Math.max(0, remaining - others), Math.max(0, raw));
  };

  const localDelivery = Math.max(0, Number(ldAmount) || 0);

  const totalOrdered = items.reduce((s, i) => s + Number(i.quantity ?? 0), 0);
  const totalReleased = Array.from(releasedByItem.values()).reduce((s, n) => s + n, 0);
  const pct = totalOrdered > 0 ? Math.round((totalReleased / totalOrdered) * 100) : 0;
  const lineTotal = (i: any) => getDraft(i.id).qty + getDraft(i.id).damaged + getDraft(i.id).missing;
  const draftTotal = items.reduce((s, i) => s + lineTotal(i), 0);
  const remainingFor = (i: any) => Math.max(0, Number(i.quantity ?? 0) - (releasedByItem.get(i.id) ?? 0));
  const hasOverRelease = items.some((i) => lineTotal(i) > remainingFor(i));

  // Landed cost preview — mirrors the server formula in releasePoQuantity()
  const fx = Number(po?.fx_rate_cny_bdt ?? po?.fx_rate ?? 0);
  const commissionPerUnit = Number(po?.agent_commission_per_unit_bdt ?? 0);
  const overheadTotal =
    Number(po?.shipping_total_bdt ?? po?.shipping_cost_bdt ?? 0) +
    Number(po?.local_courier_total_bdt ?? 0) +
    Number(po?.local_delivery_total_bdt ?? 0) +
    localDelivery +
    Number(po?.freight_cost_bdt ?? 0) +
    Number(po?.customs_duty_bdt ?? 0) +
    Number(po?.other_charges_bdt ?? 0);
  const overheadPerUnit = totalOrdered > 0 ? overheadTotal / totalOrdered : 0;

  // Paid ta age goods (purchase) er against dhora hoy, tarpor shipping/overhead
  const paidSoFar = Number(po?.paid_bdt ?? 0);
  const goodsTotalAll = items.reduce(
    (s, i) => s + Number(i.unit_cost_cny ?? i.unit_cost_foreign ?? 0) * fx * Number(i.quantity ?? 0),
    0,
  );
  const shipTotalAll = overheadTotal + commissionPerUnit * totalOrdered;
  const paidToGoods = Math.min(paidSoFar, goodsTotalAll);
  const paidToShip = Math.max(0, paidSoFar - goodsTotalAll);
  // Line-wise: paid ta protita line-e tar nijer goods value onushare pro-rata bosbe,
  // tai jei line-er unit cost beshi, tar due/pc o beshi.
  const goodsPaidRatio = goodsTotalAll > 0 ? Math.min(1, paidToGoods / goodsTotalAll) : 0;
  const goodsDuePerUnitFor = (i: any) =>
    Math.max(0, Number(i.unit_cost_cny ?? i.unit_cost_foreign ?? 0) * fx * (1 - goodsPaidRatio));
  // avg (fallback / display only)
  const goodsDuePerUnit = totalOrdered > 0 ? Math.max(0, goodsTotalAll - paidToGoods) / totalOrdered : 0;
  const shipDuePerUnit = totalOrdered > 0 ? Math.max(0, shipTotalAll - paidToShip) / totalOrdered : 0;

  const previewLines = items
    .map((i) => {
      const d = getDraft(i.id);
      const unitCny = Number(i.unit_cost_cny ?? i.unit_cost_foreign ?? 0);
      const goodsUnit = unitCny * fx;
      const landed = +(goodsUnit + overheadPerUnit + commissionPerUnit).toFixed(4);
      const pcs = d.qty + d.damaged + d.missing;
      return {
        id: i.id,
        title: i.product?.title ?? i.name_snapshot ?? "Item",
        sku: i.product?.sku ?? i.sku_snapshot ?? "—",
        qty: d.qty,
        damaged: d.damaged,
        missing: d.missing,
        landed,
        value: landed * d.qty,
        damagedValue: landed * d.damaged,
        goodsDuePerUnit: goodsDuePerUnitFor(i),
        shipDuePerUnit,
        goodsDue: goodsDuePerUnitFor(i) * pcs,
        shipDue: shipDuePerUnit * pcs,
      };
    })
    .filter((l) => l.qty > 0 || l.damaged > 0 || l.missing > 0);

  const previewQty = previewLines.reduce((s, l) => s + l.qty, 0);
  const previewDamaged = previewLines.reduce((s, l) => s + l.damaged, 0);
  const previewMissing = previewLines.reduce((s, l) => s + l.missing, 0);
  const previewValue = previewLines.reduce((s, l) => s + l.value, 0);
  const previewDamagedValue = previewLines.reduce((s, l) => s + l.damagedValue, 0);
  const previewGoodsDue = previewLines.reduce((s, l) => s + l.goodsDue, 0);
  const previewShipDue = previewLines.reduce((s, l) => s + l.shipDue, 0);
  const previewTotalDue = previewGoodsDue + previewShipDue;
  const previewPcs = previewLines.reduce((s, l) => s + l.qty + l.damaged + l.missing, 0);
  // Weighted (line-wise) effective rate for ei release
  const effGoodsDuePerUnit = previewPcs > 0 ? previewGoodsDue / previewPcs : goodsDuePerUnit;

  const grandTotal = Number(po?.grand_total_bdt ?? 0);
  const paid = Number(po?.paid_bdt ?? 0);
  const due = netDue(po?.due_bdt);
  const paidPct = grandTotal > 0 ? Math.round((paid / grandTotal) * 100) : 0;

  // Pro-rata due: joto pcs release hoyeche (+ ekhon hobe) toto tar baki purchase + shipping
  const draftPcs = previewQty + previewDamaged + previewMissing;
  // Line-wise released share: already-released pcs + ei draft, protita line-er nijer rate diye
  const releasedShare = items.reduce((s, i) => {
    const pcs = (releasedByItem.get(i.id) ?? 0) + lineTotal(i);
    return s + pcs * (goodsDuePerUnitFor(i) + shipDuePerUnit);
  }, 0);
  const dueForReleased = Math.max(0, Math.min(due || releasedShare, releasedShare));

  // ---- Payment for ei release ----
  const payAmount = payNow
    ? Math.min(previewTotalDue, Math.max(0, Number(payOverride ?? previewTotalDue.toFixed(2)) || 0))
    : 0;
  const selectedWallet = (wallets as any[]).find((w) => w.id === payWallet);
  const walletBalance = Number(selectedWallet?.current_balance ?? 0);
  const insufficient = !!selectedWallet && payAmount > walletBalance;
  const payBlocked = payNow && previewTotalDue > 0 && !payWallet;

  const mut = useMutation({
    mutationFn: () => {
      const amt = payAmount;
      const ratio = previewTotalDue > 0 ? Math.min(1, amt / previewTotalDue) : 0;

      return releaseFn({
        data: {
          po_id: poId,
          warehouse_id: warehouseId || undefined,
          notes: notes || undefined,
          items: items
            .map((i) => ({
              po_item_id: i.id,
              quantity: getDraft(i.id).qty,
              damaged_qty: getDraft(i.id).damaged,
              missing_qty: getDraft(i.id).missing,
            }))
            .filter((l) => l.quantity > 0 || l.damaged_qty > 0 || l.missing_qty > 0),
          local_delivery: localDelivery > 0
            ? {
                amount_bdt: +localDelivery.toFixed(2),
                note: ldNote || undefined,
                wallet_id: ldWallet || undefined,
                payment_date: new Date().toISOString().slice(0, 10),
                idempotency_key: `qtyrelld:${poId}:${Date.now()}`,
              }
            : undefined,
          payment: payNow && payWallet && amt > 0
            ? {
                wallet_id: payWallet,
                goods_amount_bdt: +(previewGoodsDue * ratio).toFixed(2),
                shipping_amount_bdt: +(previewShipDue * ratio).toFixed(2),
                payment_date: new Date().toISOString().slice(0, 10),
                idempotency_key: `qtyrel:${poId}:${Date.now()}`,
              }
            : undefined,
        },
      });
    },
    onSuccess: (res: any) => {
      const paid = (res.payments ?? []).reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0);
      toast.success(
        `Release #${res.release_number} stock e gelo${paid > 0 ? ` — ${fmtBdt(paid)} paid` : ""}`,
      );
      setDraft({});
      setNotes("");
      setLdAmount("");
      setLdNote("");
      setPayOverride(null);
      setConfirmOpen(false);
      qc.invalidateQueries({ queryKey: ["imp-po", poId] });

    },
    onError: (e: any) => toast.error(e?.message ?? "Release failed"),
  });

  const fillRemaining = () => {
    const next: Record<string, { qty: number; damaged: number; missing: number }> = {};
    for (const i of items) {
      const rem = Number(i.quantity ?? 0) - (releasedByItem.get(i.id) ?? 0);
      if (rem > 0) next[i.id] = { qty: rem, damaged: 0, missing: 0 };
    }
    setDraft(next);
    setPayOverride(null);
  };

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h3 className="font-semibold inline-flex items-center gap-2"><Boxes className="h-4 w-4" />Quantity release</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Carton lagbe na — joto piece stock e nite chan toto din, baki gulo pore release kora jabe.
            </p>
          </div>
          <div className="text-right text-xs">
            <div className="font-semibold tabular-nums">{totalReleased} / {totalOrdered} pcs released</div>
            <div className="text-muted-foreground">{pct}%</div>
          </div>
        </div>
        <div className="px-4 pt-3">
          <Progress value={pct} className="h-2 [&>div]:bg-emerald-500" />
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Ordered</TableHead>
              <TableHead className="text-right">Released</TableHead>
              <TableHead className="text-right">Remaining</TableHead>
              <TableHead className="text-right w-[110px]">Release now</TableHead>
              <TableHead className="text-right w-[110px]">Damaged</TableHead>
              <TableHead className="text-right w-[110px]">Missing</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((it: any) => {
              const ordered = Number(it.quantity ?? 0);
              const rel = releasedByItem.get(it.id) ?? 0;
              const remaining = Math.max(0, ordered - rel);
              const d = getDraft(it.id);
              const over = d.qty + d.damaged + d.missing > remaining;
              return (
                <TableRow key={it.id}>
                  <TableCell>
                    <div className="flex items-center gap-2 min-w-0">
                      {it.product?.image ?? it.image_snapshot ? (
                        <img src={it.variant?.image ?? it.product?.image ?? it.image_snapshot} alt="" className="h-9 w-9 rounded object-cover border border-border" />
                      ) : (
                        <div className="h-9 w-9 rounded bg-muted border border-dashed border-border" />
                      )}
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{it.product?.title ?? it.name_snapshot}</div>
                        <div className="flex items-center gap-1.5 min-w-0">
                          {it.variant?.color_name && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                              {it.variant?.color_hex && (
                                <span className="h-2.5 w-2.5 rounded-full border border-border" style={{ backgroundColor: it.variant.color_hex }} />
                              )}
                              {it.variant.color_name}
                            </span>
                          )}
                          <span className="text-[10px] font-mono text-muted-foreground truncate">
                            {it.variant?.sku ?? it.sku_snapshot ?? it.product?.sku ?? "—"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{ordered}</TableCell>
                  <TableCell className="text-right tabular-nums">{rel}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{remaining}</TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number" min={0} max={remaining}
                      className={`h-8 text-right tabular-nums ${over ? "border-red-400 text-red-600" : ""}`}
                      value={d.qty || ""}
                      placeholder="0"
                      disabled={remaining === 0}
                      onChange={(e) => setDraftFor(it.id, { qty: clampField(it, "qty", Number(e.target.value) || 0) })}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number" min={0}
                      className="h-8 text-right tabular-nums"
                      value={d.damaged || ""}
                      placeholder="0"
                      disabled={remaining === 0}
                      onChange={(e) => setDraftFor(it.id, { damaged: clampField(it, "damaged", Number(e.target.value) || 0) })}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number" min={0}
                      className="h-8 text-right tabular-nums"
                      value={d.missing || ""}
                      placeholder="0"
                      disabled={remaining === 0}
                      onChange={(e) => setDraftFor(it.id, { missing: clampField(it, "missing", Number(e.target.value) || 0) })}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        <div className="p-4 border-t border-border grid md:grid-cols-3 gap-3 items-end">
          <div>
            <Label className="text-xs inline-flex items-center gap-1"><Warehouse className="h-3.5 w-3.5" />Warehouse</Label>
            <Select value={warehouseId} onValueChange={setWarehouseId}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select warehouse" /></SelectTrigger>
              <SelectContent>
                {(warehouses as any[]).map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Note (optional)</Label>
            <Textarea rows={1} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. 1st lot released" />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={fillRemaining} disabled={totalReleased >= totalOrdered}>
              Fill remaining
            </Button>
            <Button
              size="sm"
              disabled={draftTotal <= 0 || hasOverRelease || mut.isPending || (payNow && previewTotalDue > 0 && !payWallet)}
              onClick={() => setConfirmOpen(true)}
            >
              {mut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PackageCheck className="h-4 w-4 mr-2" />}
              Release {draftTotal > 0 ? `${draftTotal} pcs` : ""}
            </Button>

          </div>
        </div>

        <div className="p-4 border-t border-border bg-sky-500/5 space-y-3">
          <div className="text-sm font-medium inline-flex items-center gap-2">
            <Truck className="h-4 w-4 text-sky-600" />
            Local delivery charge (BD warehouse → amader kache)
          </div>
          <div className="grid md:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Charge (BDT)</Label>
              <Input
                type="number" min={0} className="h-9 tabular-nums"
                value={ldAmount}
                placeholder="0"
                onChange={(e) => setLdAmount(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Pay from wallet (optional)</Label>
              <AccountCombobox
                accounts={(wallets as any[]).filter((w) => w.is_active)}
                value={ldWallet}
                onChange={setLdWallet}
                requiredAmount={localDelivery}
                placeholder="Record only (pay later)"
              />

            </div>
            <div>
              <Label className="text-xs">Delivery note</Label>
              <Input
                className="h-9"
                value={ldNote}
                placeholder="e.g. Sundarban courier, 3 bosta"
                onChange={(e) => setLdNote(e.target.value)}
              />
            </div>
          </div>
          {localDelivery > 0 && (
            <p className="text-[11px] text-muted-foreground">
              {fmtBdt(localDelivery)} PO-r total cost e jog hobe, tai per-piece landed cost o beshi dekhabe
              {ldWallet ? " — ei wallet theke taka kete jabe." : " — ekhon wallet theke katbe na, due hishebe thakbe."}
            </p>
          )}
        </div>

        {draftTotal > 0 && (
          <div className="p-4 border-t border-border bg-orange-500/5 space-y-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="text-sm font-medium inline-flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-orange-600" />
                  Ei {draftTotal} pcs-er payment
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Purchase {fmtBdt(previewGoodsDue)} + shipping {fmtBdt(previewShipDue)} ={" "}
                  <span className="text-orange-600 font-semibold tabular-nums">{fmtBdt(previewTotalDue)}</span>
                  {localDelivery > 0 && <> · local delivery {fmtBdt(localDelivery)} alada</>}
                </p>
              </div>
              <div className="inline-flex rounded-md border border-border overflow-hidden">
                <button
                  type="button"
                  onClick={() => setPayNow(true)}
                  className={`px-3 py-1.5 text-xs font-medium ${payNow ? "bg-emerald-600 text-white" : "bg-background text-muted-foreground"}`}
                >
                  Ekhon pay
                </button>
                <button
                  type="button"
                  onClick={() => setPayNow(false)}
                  className={`px-3 py-1.5 text-xs font-medium ${!payNow ? "bg-orange-600 text-white" : "bg-background text-muted-foreground"}`}
                >
                  Pay later
                </button>
              </div>
            </div>

            {previewTotalDue <= 0 ? (
              <p className="text-xs text-emerald-700 dark:text-emerald-400">
                Ei pcs-er purchase + shipping age thekei paid — kono payment lagbe na.
              </p>
            ) : payNow ? (
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Wallet / account</Label>
                  <AccountCombobox
                    accounts={(wallets as any[]).filter((w) => w.is_active)}
                    value={payWallet}
                    onChange={setPayWallet}
                    requiredAmount={payAmount}
                    placeholder="Kon wallet theke taka jabe?"
                  />
                  {selectedWallet && (
                    <p className={`text-[11px] mt-1 tabular-nums ${insufficient ? "text-red-600" : "text-muted-foreground"}`}>
                      Balance {fmtBdt(walletBalance)} → payment er por {fmtBdt(walletBalance - payAmount)}
                      {insufficient && " — balance kom!"}
                    </p>
                  )}
                </div>
                <div>
                  <Label className="text-xs">Pay amount (BDT)</Label>
                  <Input
                    type="number" min={0} className="h-9 tabular-nums"
                    value={payOverride ?? previewTotalDue.toFixed(2)}
                    onChange={(e) => setPayOverride(e.target.value)}
                  />
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {[
                      { k: "Full", v: previewTotalDue },
                      { k: "Purchase only", v: previewGoodsDue },
                      { k: "Shipping only", v: previewShipDue },
                      { k: "Half", v: previewTotalDue / 2 },
                    ].filter((c) => c.v > 0).map((c) => (
                      <button
                        key={c.k}
                        type="button"
                        onClick={() => setPayOverride(c.v.toFixed(2))}
                        className="px-2 py-0.5 rounded border border-border text-[11px] hover:bg-muted"
                      >
                        {c.k} · {fmtBdt(c.v)}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1 tabular-nums">
                    {payAmount >= previewTotalDue - 0.5
                      ? "Ei release-er due purapuri clear hobe ✓"
                      : `Baki ${fmtBdt(Math.max(0, previewTotalDue - payAmount))} due thakbe — purchase/shipping pro-rata adjust hobe.`}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-orange-700 dark:text-orange-300">
                Ekhon taka katbe na — {fmtBdt(previewTotalDue)} PO-r due hishebe thakbe, pore "Supplier payment" theke dite parben.
              </p>
            )}
          </div>
        )}

      </Card>

      {grandTotal > 0 && due > 0 && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 className="font-semibold inline-flex items-center gap-2"><Wallet className="h-4 w-4" />Supplier payment</h3>
            <div className="text-sm">
              <span className="text-emerald-600 font-semibold tabular-nums">{fmtBdt(paid)}</span>
              <span className="text-muted-foreground"> / {fmtBdt(grandTotal)}</span>
              <span className="ml-2 text-xs text-muted-foreground">({paidPct}%)</span>
            </div>
          </div>
          <Progress value={paidPct} className="h-2 [&>div]:bg-emerald-500" />
          <div className="grid sm:grid-cols-3 gap-3 text-sm rounded-md border border-border p-3">
            <div>
              <div className="text-xs text-muted-foreground">Released pcs (+ ekhon)</div>
              <div className="font-semibold tabular-nums">{totalReleased + draftPcs} / {totalOrdered}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Oi pcs-er baki (purchase+shipping)</div>
              <div className="font-semibold tabular-nums">{fmtBdt(releasedShare)}</div>
            </div>
            <div className="sm:text-right">
              <div className="text-xs text-muted-foreground">Ekhon due (pro-rata)</div>
              <div className="font-semibold tabular-nums text-orange-600">{fmtBdt(dueForReleased)}</div>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {due > 0 ? (
              <div className="flex-1 min-w-0 text-xs text-orange-800 dark:text-orange-200 inline-flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-orange-600 shrink-0" />
                <span>
                  <span className="font-semibold">Total due:</span> <span className="font-mono tabular-nums">{fmtBdt(due)}</span>
                  {" — "}joto pcs release dicchen toto pcs-er purchase + shipping due{" "}
                  <span className="font-mono tabular-nums font-semibold">{fmtBdt(dueForReleased)}</span>.
                </span>
              </div>
            ) : (
              <div className="flex-1 min-w-0 text-xs text-emerald-700 dark:text-emerald-400">Full paid ✓</div>
            )}
            <Button
              size="sm"
              className={due > 0 ? "bg-orange-600 hover:bg-orange-700 text-white" : ""}
              variant={due > 0 ? "default" : "outline"}
              onClick={() => onPayDue?.()}
            >
              <Wallet className="h-3.5 w-3.5 mr-1" />
              {dueForReleased > 0 ? `Pay ${fmtBdt(dueForReleased)}` : due > 0 ? `Pay due ${fmtBdt(due)}` : "Record payment"}
            </Button>
          </div>
        </Card>
      )}

      {previewLines.length > 0 && (
        <Card className="overflow-hidden border-emerald-500/40">
          <div className="p-4 border-b border-border flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h3 className="font-semibold inline-flex items-center gap-2">
                <PackageCheck className="h-4 w-4 text-emerald-600" />Release preview
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Process korar age dekhe nin — per-piece landed cost o stock e ki jabe.
              </p>
            </div>
            <Badge variant="outline" className="text-[11px]">
              {previewQty} pcs{previewDamaged > 0 ? ` + ${previewDamaged} damaged` : ""}
              {previewMissing > 0 ? ` + ${previewMissing} missing` : ""}
            </Badge>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Pcs to stock</TableHead>
                <TableHead className="text-right">Damaged</TableHead>
                <TableHead className="text-right">Missing</TableHead>
                <TableHead className="text-right">Landed / pc</TableHead>
                <TableHead className="text-right">Line value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {previewLines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>
                    <div className="text-sm font-medium truncate">{l.title}</div>
                    <div className="text-[10px] font-mono text-muted-foreground">{l.sku}</div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{l.qty}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {l.damaged > 0 ? <span className="text-orange-600">{l.damaged}</span> : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {l.missing > 0 ? <span className="text-red-600">{l.missing}</span> : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmtBdt(l.landed)}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{fmtBdt(l.value)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="p-4 border-t border-border grid sm:grid-cols-4 gap-3 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Stock in</div>
              <div className="font-semibold tabular-nums">{previewQty} pcs</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Damaged (stock e jabe na)</div>
              <div className="font-semibold tabular-nums">
                {previewDamaged} pcs {previewDamaged > 0 && <span className="text-xs text-muted-foreground">({fmtBdt(previewDamagedValue)})</span>}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Missing (kom paoa)</div>
              <div className="font-semibold tabular-nums text-red-600">{previewMissing} pcs</div>
            </div>
            <div className="sm:text-right">
              <div className="text-xs text-muted-foreground">Inventory value add</div>
              <div className="font-semibold tabular-nums text-emerald-600">{fmtBdt(previewValue)}</div>
            </div>
          </div>
          <div className="p-4 border-t border-border grid sm:grid-cols-3 gap-3 text-sm bg-muted/30">
            <div>
              <div className="text-xs text-muted-foreground">Purchase due (ei pcs)</div>
              <div className="font-semibold tabular-nums">{fmtBdt(previewGoodsDue)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Shipping / overhead (ei pcs)</div>
              <div className="font-semibold tabular-nums">{fmtBdt(previewShipDue)}</div>
            </div>
            <div className="sm:text-right">
              <div className="text-xs text-muted-foreground">Total (ei release)</div>
              <div className="font-semibold tabular-nums text-orange-600">{fmtBdt(previewTotalDue)}</div>
            </div>
          </div>
          <div className="p-4 border-t border-border">
            <div className="text-xs text-muted-foreground mb-2">
              Rate breakdown — per pcs, per 1,000 pcs, ar ei release ({previewQty + previewDamaged} pcs)
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Component</TableHead>
                  <TableHead className="text-right">Per pcs</TableHead>
                  <TableHead className="text-right">Per 1,000 pcs</TableHead>
                  <TableHead className="text-right">Ei release</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  { k: "Goods (purchase) due", pu: effGoodsDuePerUnit, tot: previewGoodsDue },
                  { k: "Shipping / overhead due", pu: shipDuePerUnit, tot: previewShipDue },
                ].map((r) => (
                  <TableRow key={r.k}>
                    <TableCell className="text-sm">{r.k}</TableCell>
                    <TableCell className="text-right tabular-nums">৳{r.pu.toFixed(4)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtBdt(r.pu * 1000)}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{fmtBdt(r.tot)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/40">
                  <TableCell className="text-sm font-semibold">Total due</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    ৳{(effGoodsDuePerUnit + shipDuePerUnit).toFixed(4)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {fmtBdt((effGoodsDuePerUnit + shipDuePerUnit) * 1000)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold text-orange-600">
                    {fmtBdt(previewTotalDue)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {releases.length > 0 && (
        <Card className="overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h3 className="font-semibold">Release history</h3>
            <Badge variant="outline" className="text-[11px]">{releases.length}</Badge>
          </div>
          <div className="divide-y divide-border">
            {releases.map((r) => {
              const qty = (r.items ?? []).reduce((s, i) => s + Number(i.quantity ?? 0), 0);
              const dmg = (r.items ?? []).reduce((s, i) => s + Number(i.damaged_qty ?? 0), 0);
              const miss = (r.items ?? []).reduce((s, i) => s + Number(i.missing_qty ?? 0), 0);
              const ld = Number(r.local_delivery_bdt ?? 0);
              const value = (r.items ?? []).reduce((s, i) => s + Number(i.quantity ?? 0) * Number(i.unit_landed_cost_bdt ?? 0), 0);
              return (
                <div key={r.id} className="p-3 flex items-center gap-3 flex-wrap text-sm">
                  <Badge variant="secondary" className="font-mono">#{r.release_number}</Badge>
                  <span className="text-muted-foreground text-xs">{new Date(r.released_at).toLocaleString()}</span>
                  <span className="tabular-nums font-medium">{qty} pcs</span>
                  {dmg > 0 && <span className="text-xs text-orange-600 tabular-nums">{dmg} damaged</span>}
                  {miss > 0 && <span className="text-xs text-red-600 tabular-nums">{miss} missing</span>}
                  {ld > 0 && (
                    <span className="text-xs text-sky-600 tabular-nums inline-flex items-center gap-1">
                      <Truck className="h-3 w-3" />{fmtBdt(ld)}
                    </span>
                  )}
                  <span className="ml-auto tabular-nums font-semibold">{fmtBdt(value)}</span>
                  {(r.notes || r.delivery_note) && (
                    <div className="w-full text-xs text-muted-foreground">
                      {[r.notes, r.delivery_note].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Dialog open={confirmOpen} onOpenChange={(v) => !mut.isPending && setConfirmOpen(v)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="inline-flex items-center gap-2">
              <PackageCheck className="h-5 w-5 text-emerald-600" />
              Confirm release — {draftTotal} pcs
            </DialogTitle>
            <DialogDescription>
              Confirm korle ei pcs gulo stock e dhukbe ar oi pcs-er due adjust hobe. Baki pcs pore release kora jabe.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <div className="rounded-md border border-border divide-y divide-border">
              {previewLines.map((l) => (
                <div key={l.id} className="p-2.5 flex items-center gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{l.title}</div>
                    <div className="text-[10px] font-mono text-muted-foreground">{l.sku}</div>
                  </div>
                  <div className="ml-auto text-right tabular-nums">
                    <div className="font-semibold">{l.qty} pcs → stock</div>
                    {(l.damaged > 0 || l.missing > 0) && (
                      <div className="text-[11px] text-muted-foreground">
                        {l.damaged > 0 && <span className="text-orange-600">{l.damaged} damaged </span>}
                        {l.missing > 0 && <span className="text-red-600">{l.missing} missing</span>}
                      </div>
                    )}
                    <div className="text-[11px] text-muted-foreground">Landed {fmtBdt(l.landed)}/pc</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-md border border-border p-3 space-y-1.5">
              <RowLine label="Warehouse" value={(warehouses as any[]).find((w) => w.id === warehouseId)?.name ?? "—"} />
              <RowLine label="Purchase due (ei pcs)" value={fmtBdt(previewGoodsDue)} />
              <RowLine label="Shipping / overhead (ei pcs)" value={fmtBdt(previewShipDue)} />
              {localDelivery > 0 && <RowLine label="Local delivery" value={fmtBdt(localDelivery)} />}
              <div className="flex justify-between pt-1.5 border-t border-border">
                <span className="text-muted-foreground">Total due for ei release</span>
                <span className="font-semibold tabular-nums text-orange-600">{fmtBdt(previewTotalDue)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Ekhon pay hocche</span>
                <span className="font-semibold tabular-nums text-emerald-600">
                  {payNow && payWallet
                    ? `${fmtBdt(payAmount)} — ${selectedWallet?.name ?? ""}`
                    : "Pay later (due thakbe)"}
                </span>
              </div>
              {payNow && payWallet && (
                <>
                  <RowLine label="Wallet balance (por)" value={fmtBdt(walletBalance - payAmount)} />
                  <RowLine
                    label="Ei release-er baki due"
                    value={fmtBdt(Math.max(0, previewTotalDue - payAmount))}
                  />
                </>
              )}
            </div>

            {insufficient && (
              <div className="text-xs text-red-600 inline-flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" /> Wallet balance er cheye payment beshi — tobuo continue kora jabe.
              </div>
            )}
            {payBlocked && (
              <div className="text-xs text-orange-600 inline-flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" /> Wallet select korun, na hole "Pay later" e switch korun.
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={mut.isPending}>Cancel</Button>
            <Button
              onClick={() => mut.mutate()}
              disabled={mut.isPending || draftTotal <= 0 || hasOverRelease || payBlocked}
            >

              {mut.isPending
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processing…</>
                : <><PackageCheck className="h-4 w-4 mr-2" />Confirm & add to stock</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RowLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums font-medium">{value}</span>
    </div>
  );
}
