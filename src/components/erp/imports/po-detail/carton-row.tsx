import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, ChevronDown, ClipboardCheck, Loader2, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useAccounts } from "@/hooks/erp/use-finance-query";
import { listWarehouses, payCartonDue, postCartonToInventory, releaseCarton } from "@/lib/erp/imports/imports.functions";
import { CARTON_STATUS_LABEL, fmtBdt, newIdemKey, type ImpCartonStatus } from "@/lib/erp/imports/types";
import { Mini, Row } from "./atoms";

const PRE_ARRIVAL: string[] = ["ordered", "at_china_warehouse", "in_transit"];
const LADDER: { key: ImpCartonStatus; label: string }[] = [
  { key: "ordered", label: "Ordered" },
  { key: "at_china_warehouse", label: "At China WH" },
  { key: "in_transit", label: "In Transit" },
  { key: "arrived_bd", label: "Arrived BD" },
  { key: "released", label: "Released" },
  { key: "in_stock", label: "In Stock" },
];

/** Kon step e achi ar next step ki — protita carton row te dekha jabe. */
function StageLadder({ status, onStage }: { status: ImpCartonStatus; onStage: (s: ImpCartonStatus) => void }) {
  const idx = LADDER.findIndex((l) => l.key === status);
  if (idx < 0) return null;
  const next = PRE_ARRIVAL.includes(status) ? LADDER[idx + 1] : null;
  const arrivedNext = next?.key === "arrived_bd";
  return (
    <div className="flex items-center gap-2 flex-wrap py-3">
      {LADDER.map((l, i) => (
        <div key={l.key} className="flex items-center gap-2">
          <span
            className={cn(
              "text-[11px] px-2 py-1 rounded-full border",
              i < idx && "border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900",
              i === idx && "border-primary bg-primary/10 text-primary font-semibold",
              i > idx && "border-dashed border-border text-muted-foreground",
            )}
          >
            {l.label}
          </span>
          {i < LADDER.length - 1 && <span className="text-muted-foreground/40 text-xs">›</span>}
        </div>
      ))}
      {next && (
        <Button
          size="sm"
          variant={arrivedNext ? "default" : "outline"}
          className="ml-auto"
          onClick={() => onStage(next.key)}
        >
          Next: {next.label}
        </Button>
      )}
    </div>
  );
}

export function CartonRow({ carton, poId, poNumber, poItems, brandId, poDue, poPaid, poSupplierTotal, onStage, selected, onToggleSelect }: {
  carton: any; poId: string; poNumber: string; poItems: any[]; brandId: string | null; poDue: number; poPaid: number; poSupplierTotal: number;
  onStage: (s: ImpCartonStatus) => void;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const status = carton.status as ImpCartonStatus;
  const meta = CARTON_STATUS_LABEL[status];

  const supplierCost = Number(carton.supplier_cost_bdt ?? 0);
  const shippingCost = Number(carton.shipping_charge_bdt ?? 0);
  // carton.paid_bdt sums ONLY carton-scoped payments (carton_release,
  // supplier_balance, local_courier). PO-level supplier_advance /
  // supplier_payment / shipping are not attached to a carton, so they
  // must be pro-rated into each carton's advance share — otherwise a
  // released & fully-paid carton still shows a phantom "Due" chip equal
  // to the advance-covered amount. Local-courier (agent CN→BD) is
  // settled separately via the agent ledger, so exclude it here.
  const advanceShare = poSupplierTotal > 0
    ? (poPaid * supplierCost) / poSupplierTotal
    : 0;
  const supplierDueAfterAdvance = Math.max(0, supplierCost - advanceShare);
  const cartonBillable = +(supplierDueAfterAdvance + shippingCost).toFixed(2);
  const cartonPaid = Number(carton.paid_bdt ?? 0);
  const cartonDue = Math.max(0, +(cartonBillable - cartonPaid).toFixed(2));
  const hasDue = cartonDue > 0.009 && (status === "released" || status === "in_stock");

  const needsAction = status === "arrived_bd" || status === "released" || hasDue;
  const selectable = ["ordered", "at_china_warehouse", "in_transit", "arrived_bd"].includes(status);

  return (
    <div className={cn("transition-colors", needsAction && "bg-orange-50/30 dark:bg-orange-950/10", selected && "bg-primary/5")}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-accent/40 text-left cursor-pointer"
      >
        {selectable && onToggleSelect && (
          <span
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            className="inline-flex"
          >
            <Checkbox
              checked={!!selected}
              onCheckedChange={(checked) => {
                if (checked !== selected) onToggleSelect();
              }}
              aria-label="Select carton"
            />
          </span>
        )}
        <Badge variant="secondary" className={cn("font-medium", meta?.tone)}>{meta?.label}</Badge>
        {/* Product thumbnails — collapsed row e ki product ache ek nojore */}
        {(() => {
          const imgs = (carton.items ?? [])
            .map((it: any) => ({ src: it.variant?.image || it.product?.image, label: it.variant?.color_name || it.product?.title }))
            .filter((x: any) => x.src);
          if (imgs.length === 0) return null;
          return (
            <div className="flex items-center">
              {imgs.slice(0, 3).map((im: any, i: number) => (
                <img
                  key={i}
                  src={im.src}
                  alt={im.label ?? ""}
                  title={im.label ?? ""}
                  className={cn("h-9 w-9 rounded-md object-cover border-2 border-background shadow-sm", i > 0 && "-ml-2.5")}
                />
              ))}
              {imgs.length > 3 && (
                <span className="-ml-2.5 h-9 w-9 rounded-md border-2 border-background bg-muted text-[10px] font-medium flex items-center justify-center">
                  +{imgs.length - 3}
                </span>
              )}
            </div>
          );
        })()}
        <div className="flex-1 min-w-0">
          <div className="font-mono text-sm font-semibold">{poNumber}-C{carton.carton_number}</div>
          <div className="text-[11px] text-muted-foreground truncate">
            {carton.expected_quantity} pcs · landed {fmtBdt(carton.total_landed_bdt)}
            {(carton.items ?? []).length > 0 && (
              <span className="hidden sm:inline">
                {" · "}
                {(carton.items ?? []).map((it: any) => it.variant?.color_name || it.product?.title).filter(Boolean).slice(0, 2).join(", ")}
              </span>
            )}
          </div>
        </div>
        {hasDue && (
          <Badge variant="secondary" className="bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-950/40 dark:text-orange-300">
            Due {fmtBdt(cartonDue)}
          </Badge>
        )}
        <div className="hidden md:block text-right text-xs">
          <div>Product: <span className="tabular-nums font-medium">{fmtBdt(carton.supplier_cost_bdt)}</span></div>
          <div className="text-muted-foreground">Ship: <span className="tabular-nums font-medium">{fmtBdt(carton.shipping_charge_bdt)}</span></div>
        </div>
        {["ordered", "at_china_warehouse", "in_transit"].includes(status) && (
          <div onClick={(e) => e.stopPropagation()}>
            <Select value={status} onValueChange={(v) => onStage(v as ImpCartonStatus)}>
              <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ordered">Ordered</SelectItem>
                <SelectItem value="at_china_warehouse">At China WH</SelectItem>
                <SelectItem value="in_transit">In Transit</SelectItem>
                <SelectItem value="arrived_bd">Arrived BD</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </div>
      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-border/50 bg-background/50">
          <StageLadder status={status} onStage={onStage} />
          {status === "arrived_bd" && brandId && (
            <InlineReleaseForm carton={carton} brandId={brandId} poId={poId} poPaid={poPaid} poSupplierTotal={poSupplierTotal} />
          )}
          {status === "released" && brandId && (
            <InlineQcForm carton={carton} brandId={brandId} poItems={poItems} poId={poId} poDue={poDue} />
          )}
          {hasDue && brandId && (
            <InlinePayDueForm carton={carton} brandId={brandId} poId={poId} cartonDue={cartonDue} />
          )}
          {PRE_ARRIVAL.includes(status) && (
            <div className="py-3 space-y-2">
              {status === "in_transit" ? (
                <>
                  <Button size="sm" className="w-full sm:w-auto" onClick={() => onStage("arrived_bd")}>
                    <Send className="h-4 w-4 mr-1" />Mark Arrived BD (tarpor release)
                  </Button>
                  <p className="text-[11px] text-muted-foreground">
                    {shippingCost > 0
                      ? `Freight bill ${fmtBdt(shippingCost)} already boshano ache — arrived mark korlei release form khulbe.`
                      : "Ei carton e ekhono freight bill boshano nai — Arrived mark korte paren, kintu shipping bill Shipment tab theke boshale landed cost thik hobe."}
                  </p>
                </>
              ) : (
                <>
                  <Button size="sm" disabled className="w-full sm:w-auto">
                    <Send className="h-4 w-4 mr-1" />Release carton
                  </Button>
                  <p className="text-[11px] text-muted-foreground">
                    Release korte age carton ta <span className="font-medium">Arrived BD</span> hote hobe — upore stage ladder
                    theke next step e nin (Ordered → China WH → In Transit → Arrived BD).
                  </p>
                </>
              )}
            </div>
          )}
          {status === "in_stock" && (
            <div className="text-xs text-muted-foreground py-2">
              {carton.posted_at ? `Posted to inventory on ${carton.posted_at}` : "Stock e post hoye geche ✓"}
            </div>
          )}
        </div>
      )}

    </div>
  );
}

function InlinePayDueForm({ carton, brandId, poId, cartonDue }: { carton: any; brandId: string; poId: string; cartonDue: number }) {
  const fn = useServerFn(payCartonDue);
  const qc = useQueryClient();
  const { data: wallets = [] } = useAccounts([brandId]);
  const [amount, setAmount] = useState<number>(cartonDue);
  const [walletId, setWalletId] = useState("");
  const [ref, setRef] = useState("");

  const mut = useMutation({
    mutationFn: async () => {
      if (amount <= 0) throw new Error("Amount required");
      if (!walletId) throw new Error("Pick a wallet");
      return await fn({ data: {
        carton_id: carton.id,
        amount,
        wallet_id: walletId,
        payment_date: new Date().toISOString().slice(0, 10),
        reference: ref || undefined,
        idempotency_key: newIdemKey("cdue"),
      } });
    },
    onSuccess: () => { toast.success("Carton due paid"); qc.invalidateQueries({ queryKey: ["imp-po", poId] }); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <div className="space-y-3 py-3">
      <div className="text-[11px] tracking-wider font-semibold text-orange-600">PAY CARTON DUE</div>
      <div className="text-xs text-muted-foreground">
        Outstanding on this carton: <span className="tabular-nums font-semibold text-orange-600">{fmtBdt(cartonDue)}</span>
      </div>
      <div className="grid md:grid-cols-3 gap-3">
        <div><Label className="text-xs">Amount</Label><Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></div>
        <div>
          <Label className="text-xs">Wallet</Label>
          <Select value={walletId} onValueChange={setWalletId}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>{wallets.filter((w) => w.is_active).map((w) => <SelectItem key={w.id} value={w.id}>{w.name} ({fmtBdt(w.current_balance)})</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">Reference</Label><Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Optional" /></div>
      </div>
      <Button onClick={() => mut.mutate()} disabled={mut.isPending} className="bg-orange-600 hover:bg-orange-700 text-white">
        {mut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}<Send className="h-4 w-4 mr-1" />Pay {fmtBdt(amount)}
      </Button>
    </div>
  );
}

function InlineReleaseForm({ carton, brandId, poId, poPaid, poSupplierTotal }: { carton: any; brandId: string; poId: string; poPaid: number; poSupplierTotal: number }) {
  const fn = useServerFn(releaseCarton);
  const qc = useQueryClient();
  const { data: wallets = [] } = useAccounts([brandId]);
  const supplierCost = Number(carton.supplier_cost_bdt ?? 0);
  const shippingCost = Number(carton.shipping_charge_bdt ?? 0);
  const advanceShare = poSupplierTotal > 0 ? (poPaid * supplierCost) / poSupplierTotal : 0;
  const supplierDueShare = Math.max(0, supplierCost - advanceShare);
  const defaultPay = Math.round((supplierDueShare + shippingCost) * 100) / 100;
  const [amount, setAmount] = useState<number>(defaultPay);
  const [walletId, setWalletId] = useState("");
  const [ref, setRef] = useState("");
  const [withoutPay, setWithoutPay] = useState(false);

  const mut = useMutation({
    mutationFn: async () => {
      const payload: any = { carton_id: carton.id, idempotency_key: newIdemKey("rel") };
      if (withoutPay) payload.release_without_payment = true;
      else {
        if (amount <= 0) throw new Error("Pay amount required");
        if (!walletId) throw new Error("Pick a wallet");
        payload.payment = { amount, wallet_id: walletId, payment_date: new Date().toISOString().slice(0, 10), reference: ref || undefined, idempotency_key: newIdemKey("pay") };
      }
      return await fn({ data: payload });
    },
    onSuccess: () => { toast.success("Carton released"); qc.invalidateQueries({ queryKey: ["imp-po", poId] }); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <div className="space-y-3 py-3">
      <div className="text-[11px] tracking-wider font-semibold text-muted-foreground">STEP 1 — RELEASE (PAY &amp; CONFIRM)</div>
      <div className="text-xs text-muted-foreground">
        Supplier: <span className="tabular-nums">{fmtBdt(supplierCost)}</span>
        {advanceShare > 0 && <> − Advance share: <span className="tabular-nums text-green-600">{fmtBdt(advanceShare)}</span> = Due: <span className="tabular-nums font-medium">{fmtBdt(supplierDueShare)}</span></>}
        {" · "}Shipping: <span className="tabular-nums">{fmtBdt(shippingCost)}</span>
        {" · "}<span className="font-semibold">To pay: <span className="tabular-nums">{fmtBdt(defaultPay)}</span></span>
      </div>
      <div className="grid md:grid-cols-3 gap-3">
        <div><Label className="text-xs">Pay amount</Label><Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(Number(e.target.value))} disabled={withoutPay} /></div>
        <div>
          <Label className="text-xs">Wallet</Label>
          <Select value={walletId} onValueChange={setWalletId} disabled={withoutPay}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>{wallets.filter((w) => w.is_active).map((w) => <SelectItem key={w.id} value={w.id}>{w.name} ({fmtBdt(w.current_balance)})</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">Reference</Label><Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Optional" disabled={withoutPay} /></div>
      </div>
      <label className="inline-flex items-center gap-2 text-xs">
        <Checkbox checked={withoutPay} onCheckedChange={(v) => setWithoutPay(!!v)} />
        Release without payment (carry as PO due)
      </label>
      <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
        {mut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}<Send className="h-4 w-4 mr-1" />Release carton
      </Button>
    </div>
  );
}

function InlineQcForm({ carton, brandId, poItems: _poItems, poId, poDue: _poDue }: { carton: any; brandId: string; poItems: any[]; poId: string; poDue: number }) {
  const fn = useServerFn(postCartonToInventory);
  const whFn = useServerFn(listWarehouses);
  const qc = useQueryClient();
  const { data: warehouses = [] } = useQuery({ queryKey: ["imp-wh", brandId], queryFn: () => whFn({ data: { brandId } }) });
  const { data: wallets = [] } = useAccounts([brandId]);
  const piMap = useMemo(() => new Map((_poItems ?? []).map((p: any) => [p.id, p])), [_poItems]);

  const [rows, setRows] = useState<Record<string, { ok: number; damaged: number; missing: number }>>(() => {
    const init: any = {};
    (carton?.items ?? []).forEach((it: any) => {
      init[it.id] = { ok: it.quantity_expected, damaged: 0, missing: 0 };
    });
    return init;
  });
  const [warehouseId, setWarehouseId] = useState("");
  const [courierBdt, setCourierBdt] = useState<number>(0);
  const [courierWalletId, setCourierWalletId] = useState("");
  const [qcNotes, setQcNotes] = useState("");

  const totalExpected = (carton.items ?? []).reduce((s: number, it: any) => s + Number(it.quantity_expected || 0), 0);
  const totalDamaged = Object.values(rows).reduce((s, r) => s + Number(r.damaged || 0), 0);
  const totalMissing = Object.values(rows).reduce((s, r) => s + Number(r.missing || 0), 0);
  const totalOk = Object.values(rows).reduce((s, r) => s + Number(r.ok || 0), 0);

  const productCost = Number(carton.supplier_cost_bdt || 0);
  const shipCost = Number(carton.shipping_charge_bdt || 0);
  const courierCost = Number(courierBdt || 0);
  const actualUnitsForCost = (carton.items ?? []).reduce((s: number, it: any) => {
    const r = rows[it.id] ?? { ok: 0, damaged: 0, missing: 0 };
    const counted = Number(r.ok || 0) + Number(r.damaged || 0) + Number(r.missing || 0);
    return s + Math.max(counted, Number(it.quantity_expected || 0));
  }, 0);
  const poAllocatedExtras = (carton.items ?? []).reduce((s: number, it: any) => {
    const pi: any = piMap.get(it.po_item_id);
    const landed = Number(pi?.landed_cost_bdt ?? 0);
    const base = Number(pi?.unit_cost_bdt ?? 0);
    if (landed <= base) return s;
    const r = rows[it.id] ?? { ok: 0, damaged: 0, missing: 0 };
    const counted = Number(r.ok || 0) + Number(r.damaged || 0) + Number(r.missing || 0);
    return s + (landed - base) * Math.max(counted, Number(it.quantity_expected || 0));
  }, 0);
  const totalLanded = productCost + shipCost + courierCost + poAllocatedExtras;
  const perPieceTotal = actualUnitsForCost > 0 ? totalLanded / actualUnitsForCost : 0;
  const lossCount = totalDamaged + totalMissing;
  const finalInventoryCost = totalLanded;
  const perOkPiece = totalOk > 0 ? finalInventoryCost / totalOk : 0;
  const lossValue = lossCount * perPieceTotal;

  // Per-item landed unit cost (uses each product's own unit cost, then adds carton shipping/courier)
  const shipCourierPerPiece = actualUnitsForCost > 0 ? (shipCost + courierCost) / actualUnitsForCost : 0;
  const rawItemUnitCost = (cartonItem: any): number => {
    const pi: any = piMap.get(cartonItem.po_item_id);
    // Prefer saved PO-level landed cost when available; otherwise use this item's own product unit cost.
    const savedLanded = Number(pi?.landed_cost_bdt ?? 0);
    if (savedLanded > 0) return savedLanded + shipCourierPerPiece;
    const base = Number(pi?.unit_cost_bdt ?? 0);
    if (base > 0) return base + shipCourierPerPiece;
    // Last resort: split carton product cost proportionally by unit_cost_cny share
    const unitCny = Number(pi?.unit_cost_cny ?? pi?.unit_cost_foreign ?? 0);
    const totalCnyValue = (carton.items ?? []).reduce((s: number, x: any) => {
      const p: any = piMap.get(x.po_item_id);
      return s + Number(p?.unit_cost_cny ?? p?.unit_cost_foreign ?? 0) * Number(x.quantity_expected || 0);
    }, 0);
    const productShare = totalCnyValue > 0
      ? (unitCny * Number(cartonItem.quantity_expected || 0) / totalCnyValue) * productCost
      : 0;
    const qty = Number(cartonItem.quantity_expected || 0);
    return (qty > 0 ? productShare / qty : 0) + shipCourierPerPiece;
  };
  const preOkCost = (carton.items ?? []).reduce((s: number, it: any) => {
    const r = rows[it.id] ?? { ok: 0 };
    return s + Number(r.ok || 0) * rawItemUnitCost(it);
  }, 0);
  const costFactor = preOkCost > 0 ? finalInventoryCost / preOkCost : 1;
  const itemUnitCost = (cartonItem: any): number => rawItemUnitCost(cartonItem) * costFactor;

  const rowErrors = useMemo(() => (carton.items ?? []).flatMap((it: any) => {
    const r = rows[it.id] ?? { ok: 0, damaged: 0, missing: 0 };
    if (r.ok < 0 || r.damaged < 0 || r.missing < 0) return [`Negative quantities not allowed`];
    return [];
  }), [rows, carton]);

  const validationErrors: string[] = [];
  if (!warehouseId) validationErrors.push("Pick warehouse");
  if (courierBdt > 0 && !courierWalletId) validationErrors.push("Pick local courier wallet");

  const selectedCourierWallet = wallets.find((w) => w.id === courierWalletId);

  const mut = useMutation({
    mutationFn: async () => {
      const payload: any = {
        carton_id: carton.id,
        warehouse_id: warehouseId,
        qc: Object.entries(rows).map(([carton_item_id, v]) => ({ carton_item_id, quantity_ok: v.ok, quantity_damaged: v.damaged, quantity_missing: v.missing })),
        idempotency_key: newIdemKey("post"),
        notes: qcNotes || undefined,
      };
      if (courierBdt > 0 && courierWalletId) {
        payload.local_courier_payment = { amount: courierBdt, wallet_id: courierWalletId, payment_date: new Date().toISOString().slice(0, 10), idempotency_key: newIdemKey("crp") };
      }
      return await fn({ data: payload });
    },
    onSuccess: (res: any) => {
      const unit = Number(res?.unit_landed ?? 0);
      if (unit > 0) toast.success(`✅ Posted ${totalOk} pcs — landed cost ৳${unit.toFixed(2)}/unit`);
      else if (res?.idempotent_replay) toast.success("Already posted (idempotent replay)");
      else toast.warning(`⚠️ Posted ${totalOk} pcs without cost (no FX/extras set)`);
      qc.invalidateQueries({ queryKey: ["imp-po", poId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <div className="space-y-4 py-3">
      <div className="text-[11px] tracking-wider font-semibold text-muted-foreground">STEP 2 — QC &amp; POST TO INVENTORY</div>

      <Card className="p-3 bg-muted/30">
        <div className="text-[10px] tracking-wider text-muted-foreground font-semibold mb-2">LANDED COST BREAKDOWN</div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
          <Mini label="Product" value={fmtBdt(productCost)} />
          <Mini label="Shipping (CN→BD)" value={fmtBdt(shipCost)} />
          <Mini label="Local courier" value={fmtBdt(courierCost)} />
          <Mini label="Total landed" value={fmtBdt(totalLanded)} />
          <Mini label={`Per piece (${actualUnitsForCost || totalExpected})`} value={fmtBdt(perPieceTotal)} valueClass="text-primary" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-xs">
          <Mini label="OK pieces" value={String(totalOk)} />
          <Mini label="Per OK piece" value={fmtBdt(perOkPiece)} valueClass="text-primary" />
          <Mini label={`Loss (${lossCount} pcs)`} value={fmtBdt(lossValue)} valueClass="text-orange-600" />
          <Mini label="Final inventory cost" value={fmtBdt(finalInventoryCost)} valueClass="text-emerald-600" />
        </div>
      </Card>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Expected</TableHead>
              <TableHead className="text-right w-24">Damaged</TableHead>
              <TableHead className="text-right w-24">Missing</TableHead>
              <TableHead className="text-right w-24">OK (received)</TableHead>
              <TableHead className="text-right">OK unit ৳</TableHead>
              <TableHead className="text-right">OK value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(carton.items ?? []).map((it: any) => {
              const r = rows[it.id] ?? { ok: 0, damaged: 0, missing: 0 };
              const itemUnit = itemUnitCost(it);
              const expected = Number(it.quantity_expected || 0);
              const totalRow = Number(r.ok || 0) + Number(r.damaged || 0) + Number(r.missing || 0);
              const extra = totalRow - expected;
              const variantLabel = it.variant?.color_name ?? null;
              const variantHex = it.variant?.color_hex ?? null;
              const title = it.product?.title ?? it.sku_snapshot ?? "—";
              return (
                <TableRow key={it.id}>
                  <TableCell>
                    <div className="flex items-center gap-2 min-w-0">
                      {(it.variant?.image || it.product?.image) && (
                        <img src={it.variant?.image || it.product?.image} alt="" className="h-8 w-8 rounded object-cover border" />
                      )}
                      <div className="min-w-0">
                        <div className="text-xs font-medium truncate max-w-[220px]">{title}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {variantLabel && (
                            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border bg-muted/40">
                              {variantHex && <span className="h-2.5 w-2.5 rounded-full border" style={{ background: variantHex }} />}
                              {variantLabel}
                            </span>
                          )}
                          <span className="font-mono text-[10px] text-muted-foreground">{it.variant?.sku ?? it.sku_snapshot ?? ""}</span>
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{expected}</TableCell>
                  <TableCell><Input type="number" min={0} value={r.damaged} className="h-8 text-right" onChange={(e) => setRows((s) => ({ ...s, [it.id]: { ...r, damaged: Number(e.target.value) } }))} /></TableCell>
                  <TableCell><Input type="number" min={0} value={r.missing} className="h-8 text-right" onChange={(e) => setRows((s) => ({ ...s, [it.id]: { ...r, missing: Number(e.target.value) } }))} /></TableCell>
                  <TableCell>
                    <div className="flex flex-col items-end gap-0.5">
                      <Input type="number" min={0} value={r.ok} className="h-8 text-right w-20" onChange={(e) => setRows((s) => ({ ...s, [it.id]: { ...r, ok: Number(e.target.value) } }))} />
                      {extra !== 0 && (
                        <span className={`text-[10px] font-medium ${extra > 0 ? "text-emerald-600" : "text-orange-600"}`}>
                          {extra > 0 ? `+${extra} extra` : `${extra} short`}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-xs">{fmtBdt(itemUnit)}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold text-emerald-600">{fmtBdt(r.ok * itemUnit)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {rowErrors.length > 0 && (
        <div className="text-xs text-orange-600 flex items-start gap-2 p-2 rounded-md bg-orange-50 dark:bg-orange-950/30">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <div>{rowErrors.join(" · ")}</div>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-3">
        <div>
          <Label className="text-xs">Warehouse *</Label>
          <Select value={warehouseId} onValueChange={setWarehouseId}>
            <SelectTrigger><SelectValue placeholder="Pick" /></SelectTrigger>
            <SelectContent>{(warehouses as any[]).map((w) => <SelectItem key={w.id} value={w.id}>{w.name}{w.is_default ? " (default)" : ""}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">Local courier ৳ (optional)</Label><Input type="number" step="0.01" value={courierBdt} onChange={(e) => setCourierBdt(Number(e.target.value))} /></div>
        <div>
          <Label className="text-xs">Local courier wallet</Label>
          <Select value={courierWalletId} onValueChange={setCourierWalletId} disabled={courierBdt <= 0}>
            <SelectTrigger><SelectValue placeholder="Wallet" /></SelectTrigger>
            <SelectContent>{wallets.filter((w) => w.is_active).map((w) => <SelectItem key={w.id} value={w.id}>{w.name} ({fmtBdt(w.current_balance)})</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label className="text-xs">QC notes</Label>
        <Textarea value={qcNotes} onChange={(e) => setQcNotes(e.target.value)} placeholder="Optional" className="min-h-[60px]" />
      </div>

      <Card className="p-3 bg-muted/30">
        <div className="text-[10px] tracking-wider text-muted-foreground font-semibold mb-2">ACCOUNTING PREVIEW</div>
        <div className="space-y-1.5 text-xs">
          <Row left={`Inventory in (${totalOk} OK pcs @ ${fmtBdt(perOkPiece)})`} right={`+${fmtBdt(finalInventoryCost - lossValue)}`} rightClass="text-emerald-600 font-semibold" />
          {lossCount > 0 && (
            <Row left={`Loss expense (${lossCount} pcs damaged/missing)`} right={`${fmtBdt(lossValue)} absorbed in OK unit cost`} rightClass="text-orange-600" />
          )}
          {courierCost > 0 && selectedCourierWallet && (
            <Row left={`Local courier paid from ${selectedCourierWallet.name}`} right={`-${fmtBdt(courierCost)}`} rightClass="text-red-600" />
          )}
          {courierCost > 0 && selectedCourierWallet ? (
            <div className="pt-2 border-t border-border/60 mt-2">
              <div className="text-[10px] tracking-wider text-muted-foreground font-semibold mb-1">WALLET OUTFLOW SUMMARY</div>
              {selectedCourierWallet && courierCost > 0 && (
                <Row left={selectedCourierWallet.name} right={`-${fmtBdt(courierCost)} (bal ${fmtBdt(selectedCourierWallet.current_balance)} → ${fmtBdt(Number(selectedCourierWallet.current_balance) - courierCost)})`} rightClass="text-xs" />
              )}
            </div>
          ) : null}
        </div>
      </Card>

      <Button
        size="lg"
        disabled={mut.isPending || rowErrors.length > 0 || validationErrors.length > 0}
        onClick={() => mut.mutate()}
      >
        {mut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        <ClipboardCheck className="h-4 w-4 mr-1" />Approve &amp; post {totalOk} pcs to inventory
      </Button>
      {validationErrors.length > 0 && <div className="text-[11px] text-orange-600">{validationErrors.join(" · ")}</div>}
    </div>
  );
}

/* auto-update OK = expected - damaged - missing (kept for future use) */
export function RowsAutoCompute({ rows, setRows, carton }: { rows: any; setRows: any; carton: any }) {
  useEffect(() => {
    let changed = false;
    const next = { ...rows };
    (carton.items ?? []).forEach((it: any) => {
      const r = rows[it.id] ?? { ok: 0, damaged: 0, missing: 0 };
      const newOk = Math.max(0, Number(it.quantity_expected) - Number(r.damaged || 0) - Number(r.missing || 0));
      if (r.ok !== newOk) { next[it.id] = { ...r, ok: newOk }; changed = true; }
    });
    if (changed) setRows(next);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(Object.fromEntries(Object.entries(rows).map(([k, v]: any) => [k, { d: v.damaged, m: v.missing }])))]);
  return null;
}