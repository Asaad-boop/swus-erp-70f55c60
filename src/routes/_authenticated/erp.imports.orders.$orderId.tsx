import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  ArrowLeft, Truck, CheckCircle2, AlertTriangle, Wallet, Loader2,
  PackageCheck, Receipt, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import {
  getPurchaseOrderDetail, updateCartonStage, deleteImportPo, setPoReceiveMode,
} from "@/lib/erp/imports/imports.functions";
import {
  PO_STATUS_LABEL, fmtBdt, newIdemKey,
  type ImpPoStatus, type ImpCartonStatus,
} from "@/lib/erp/imports/types";
import { LandedCostCard } from "@/components/erp/imports/landed-cost-card";
import { CARTON_STATUS_LABEL as _CS } from "@/lib/erp/imports/types";
import { KpiTile, Mini, SummaryBox } from "@/components/erp/imports/po-detail/atoms";
import { PIPELINE_STAGES, PipelineStrip } from "@/components/erp/imports/po-detail/pipeline-strip";
import { CartonRow } from "@/components/erp/imports/po-detail/carton-row";
import { CartonsHeader } from "@/components/erp/imports/po-detail/cartons-header";
import { ArrivedDialog, PaymentDialog, BulkReleaseDialog } from "@/components/erp/imports/po-detail/dialogs";
import { QuantityReleaseCard } from "@/components/erp/imports/po-detail/quantity-release-card";

export const Route = createFileRoute("/_authenticated/erp/imports/orders/$orderId")({
  head: () => ({ meta: [{ title: "Purchase Order — Imports" }] }),
  component: PoDetailPage,
});

function PoDetailPage() {
  const { orderId } = Route.useParams();
  const qc = useQueryClient();
  const detailFn = useServerFn(getPurchaseOrderDetail);
  const stageFn = useServerFn(updateCartonStage);
  const navigate = useNavigate();
  const deleteFn = useServerFn(deleteImportPo);
  const modeFn = useServerFn(setPoReceiveMode);
  const modeMut = useMutation({
    mutationFn: (mode: "carton" | "quantity") => modeFn({ data: { poId: orderId, mode } }),
    onSuccess: (r: any) => {
      toast.success(r.mode === "quantity" ? "Quantity mode on — piece wise release korte parben" : "Carton mode on");
      qc.invalidateQueries({ queryKey: ["imp-po", orderId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const deleteMut = useMutation({
    mutationFn: () => deleteFn({ data: { poId: orderId, confirm: "DELETE" } }),
    onSuccess: () => {
      toast.success("Purchase Order deleted; transactions reversed");
      qc.invalidateQueries({ queryKey: ["imp-pos"] });
      navigate({ to: "/erp/imports/orders" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["imp-po", orderId],
    queryFn: () => detailFn({ data: { poId: orderId } }),
  });

  const [arrivedOpen, setArrivedOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);

  const stageMut = useMutation({
    mutationFn: (vars: { carton_id: string; new_stage: ImpCartonStatus }) =>
      stageFn({ data: { ...vars, idempotency_key: newIdemKey("stage") } as any }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["imp-po", orderId] }); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const [selectedCartons, setSelectedCartons] = useState<Set<string>>(new Set());
  const [bulkReleaseOpen, setBulkReleaseOpen] = useState(false);
  const bulkMarkSelected = async (stage: ImpCartonStatus, cartons: any[]) => {
    const targets = cartons.filter((c) => selectedCartons.has(c.id) && ["ordered", "at_china_warehouse", "in_transit"].includes(c.status));
    if (targets.length === 0) { toast.info("No selected cartons can move to this stage"); return; }
    try {
      await Promise.all(targets.map((c) => stageFn({ data: { carton_id: c.id, new_stage: stage, idempotency_key: newIdemKey("stage") } as any })));
      toast.success(`Marked ${targets.length} cartons as ${_CS[stage].label}`);
      setSelectedCartons(new Set());
      qc.invalidateQueries({ queryKey: ["imp-po", orderId] });
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  };

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!data?.po) return <div className="p-6 text-sm text-muted-foreground">Purchase order not found.</div>;

  const po: any = data.po;
  const brandId: string | null = po?.brand_id ?? null;
  const items: any[] = data.items;
  const cartons: any[] = data.cartons;
  const payments: any[] = data.payments;
  const releases: any[] = (data as any).releases ?? [];
  const isQtyMode = po.receive_mode === "quantity";
  const qtyOrdered = items.reduce((s: number, i: any) => s + Number(i.quantity ?? 0), 0);
  const qtyReleased = releases.reduce(
    (s: number, r: any) =>
      s + (r.items ?? []).reduce((n: number, i: any) => n + Number(i.quantity ?? 0) + Number(i.damaged_qty ?? 0), 0),
    0,
  );

  const totalCartons = cartons.length;
  const totalPieces = cartons.reduce((s, c) => s + Number(c.expected_quantity || 0), 0);
  const deliveredCartons = cartons.filter((c) => c.status === "in_stock").length;
  const deliveredPieces = cartons.filter((c) => c.status === "in_stock").reduce((s, c) => s + Number(c.expected_quantity || 0), 0);
  const deliveredPct = totalPieces > 0 ? Math.round((deliveredPieces / totalPieces) * 100) : 0;
  const paidPct = Number(po.grand_total_bdt) > 0 ? Math.round((Number(po.paid_bdt) / Number(po.grand_total_bdt)) * 100) : 0;

  const stageCounts = PIPELINE_STAGES.map((s) => {
    const list = cartons.filter((c) => c.status === s.key);
    return { ...s, count: list.length, pieces: list.reduce((sum, c) => sum + Number(c.expected_quantity || 0), 0) };
  });

  const deliveredBox = { c: deliveredCartons, p: deliveredPieces };
  const arrivedReleasedBox = cartons.filter((c) => ["arrived_bd", "released"].includes(c.status));
  const inTransitBox = cartons.filter((c) => ["at_china_warehouse", "in_transit"].includes(c.status));
  const remainingBox = cartons.filter((c) => c.status !== "in_stock" && c.status !== "cancelled");

  const LANDED_PO_STATUSES = new Set(["arrived_bd", "partially_received", "completed"]);
  const LANDED_CARTON_STATUSES = new Set(["arrived_bd", "released", "in_stock"]);
  const showLandedCost =
    isQtyMode ||
    LANDED_PO_STATUSES.has(po.status) ||
    cartons.some((c) => LANDED_CARTON_STATUSES.has(c.status));

  const poPaidForRelease = payments
    .filter((p: any) => !p.is_reversed && ["supplier_advance", "supplier_payment", "supplier_balance"].includes(p.payment_type))
    .reduce((s: number, p: any) => s + Number(p.amount_bdt || 0), 0);
  const poSupplierTotal = Number(po.product_subtotal_bdt ?? 0);

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Header */}
      <Card className="p-5 bg-gradient-to-br from-primary/5 via-card to-card border-primary/10">
        <div className="flex items-start gap-3 flex-wrap">
          <Link to="/erp/imports/orders"><Button variant="ghost" size="sm" className="-ml-2"><ArrowLeft className="h-4 w-4 mr-1" />Purchase Orders</Button></Link>
        </div>
        <div className="mt-2 flex items-start gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-medium tracking-wider text-muted-foreground">IMPORTS / ORDER</div>
            <div className="flex items-center gap-3 flex-wrap mt-1">
              <h1 className="text-2xl font-bold font-mono">{po.po_number}</h1>
              <Badge variant="secondary" className={PO_STATUS_LABEL[po.status as ImpPoStatus]?.tone}>
                {PO_STATUS_LABEL[po.status as ImpPoStatus]?.label ?? po.status}
              </Badge>
            </div>
            <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
              <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-primary" />{po.supplier?.name ?? "—"}</span>
              <span>📅 {po.order_date}</span>
              <span>$ FX {Number(po.fx_rate)} · {po.currency}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant={Number(po.due_bdt) > 0 ? "default" : "outline"}
              className={Number(po.due_bdt) > 0 ? "bg-orange-600 hover:bg-orange-700 text-white" : ""}
              onClick={() => setPaymentOpen(true)}
            >
              <Wallet className="h-4 w-4 mr-1" />
              {Number(po.due_bdt) > 0 ? `Pay Due ${fmtBdt(po.due_bdt)}` : "Record Payment"}
            </Button>
            <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-4 w-4 mr-1" />Delete PO
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
          <KpiTile icon="$" label="Grand Total" value={fmtBdt(po.grand_total_bdt)} />
          <KpiTile icon={<PackageCheck className="h-4 w-4 text-emerald-600" />} label="Paid" value={fmtBdt(po.paid_bdt)} valueClass="text-emerald-600" />
          <KpiTile icon={<AlertTriangle className="h-4 w-4 text-orange-600" />} label="Due" value={fmtBdt(po.due_bdt)} valueClass="text-orange-600" />
          <KpiTile
            icon={<CheckCircle2 className="h-4 w-4 text-blue-600" />}
            label={isQtyMode ? "Released" : "Delivered"}
            value={isQtyMode ? `${qtyReleased} / ${qtyOrdered}` : `${deliveredCartons} / ${totalCartons}`}
            hint={isQtyMode
              ? `${qtyOrdered > 0 ? Math.round((qtyReleased / qtyOrdered) * 100) : 0}% released`
              : `${deliveredPieces} / ${totalPieces} pcs · ${deliveredPct}%`}
          />
        </div>
      </Card>

      {/* Order Pipeline */}
      {!isQtyMode && (
      <Card className="p-5">
        <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
          <div>
            <h3 className="font-semibold">Order Pipeline</h3>
            <p className="text-xs text-muted-foreground">Track the journey of this purchase order from China to your warehouse.</p>
          </div>
          <div className="text-right text-xs">
            <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Delivered</span>{" "}
            <span className="font-medium">{deliveredCartons}/{totalCartons} cartons · {deliveredPieces}/{totalPieces} pcs</span>
          </div>
        </div>
        <PipelineStrip stages={stageCounts} activeStatus={po.status as ImpPoStatus} />
        {!showLandedCost && (
          <div className="mt-4 rounded-md border border-dashed border-orange-300/70 dark:border-orange-900/50 bg-orange-50/40 dark:bg-orange-950/20 px-3 py-2 text-[12px] text-orange-800 dark:text-orange-200 flex items-center gap-2">
            <Truck className="h-3.5 w-3.5" />
            <span>
              <span className="font-semibold">Arrived BD</span> stage e pouchhaleI FX rate + freight + customs enter korte parben — tarpor inventory te post hobe.
            </span>
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
          <SummaryBox tone="emerald" label="DELIVERED" cartons={deliveredBox.c} pieces={deliveredBox.p} />
          <SummaryBox tone="orange" label="ARRIVED / RELEASED" cartons={arrivedReleasedBox.length} pieces={arrivedReleasedBox.reduce((s, c) => s + Number(c.expected_quantity || 0), 0)} />
          <SummaryBox tone="indigo" label="IN TRANSIT" cartons={inTransitBox.length} pieces={inTransitBox.reduce((s, c) => s + Number(c.expected_quantity || 0), 0)} />
          <SummaryBox tone="slate" label="REMAINING" cartons={remainingBox.length} pieces={remainingBox.reduce((s, c) => s + Number(c.expected_quantity || 0), 0)} />
        </div>
      </Card>
      )}

      {/* Payment Progress */}
      <Card className="p-5">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <h3 className="font-semibold inline-flex items-center gap-2"><Wallet className="h-4 w-4" />Payment Progress</h3>
          <div className="text-sm">
            <span className="text-emerald-600 font-semibold tabular-nums">{fmtBdt(po.paid_bdt)}</span>
            <span className="text-muted-foreground"> / {fmtBdt(po.grand_total_bdt)}</span>
            <span className="ml-2 text-xs text-muted-foreground">({paidPct}%)</span>
          </div>
        </div>
        <Progress value={paidPct} className="h-2 [&>div]:bg-emerald-500" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 text-xs">
          <Mini label="SUBTOTAL" value={fmtBdt(po.product_subtotal_bdt)} />
          <Mini label="SHIPPING CN→BD" value={fmtBdt(po.shipping_total_bdt)} />
          <Mini label="LOCAL COURIER" value={fmtBdt(po.local_courier_total_bdt)} />
          <Mini label="OUTSTANDING DUE" value={fmtBdt(po.due_bdt)} valueClass="text-orange-600" />
        </div>
        {Number(po.due_bdt) > 0 && (
          <div className="mt-4 rounded-md border border-orange-300/70 dark:border-orange-900/50 bg-orange-50/60 dark:bg-orange-950/20 px-3 py-2.5 flex items-center gap-3 flex-wrap">
            <AlertTriangle className="h-4 w-4 text-orange-600 shrink-0" />
            <div className="flex-1 min-w-0 text-xs text-orange-800 dark:text-orange-200">
              <span className="font-semibold">Outstanding due:</span> <span className="tabular-nums font-mono">{fmtBdt(po.due_bdt)}</span>
              {" — "}Carton "released without payment" hoyeche. Ekhon supplier ke pay korte parben.
            </div>
            <Button size="sm" className="bg-orange-600 hover:bg-orange-700 text-white" onClick={() => setPaymentOpen(true)}>
              <Wallet className="h-3.5 w-3.5 mr-1" />Pay Now
            </Button>
          </div>
        )}
      </Card>

      {/* Products */}
      <Card className="overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold">Products</h3>
          <Badge variant="outline" className="text-[11px]">{items.length} items</Badge>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[64px]"></TableHead>
              <TableHead>Product</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Unit {po.currency}</TableHead>
              <TableHead className="text-right">Subtotal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((it: any) => {
              const liveImg = it.product?.image ?? it.image_snapshot;
              const liveName = it.product?.title ?? it.name_snapshot;
              const liveSku = it.product?.sku ?? it.sku_snapshot;
              return (
                <TableRow key={it.id}>
                  <TableCell className="py-2">
                    {liveImg ? (
                      <img src={liveImg} alt={liveName ?? ""} className="h-12 w-12 rounded-md object-cover border border-border bg-muted" />
                    ) : (
                      <div className="h-12 w-12 rounded-md bg-muted border border-dashed border-border flex items-center justify-center text-muted-foreground/60 text-[10px]">
                        No img
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-medium max-w-[420px]">
                    <div className="truncate" title={liveName ?? ""}>{liveName}</div>
                    {it.product_id && (
                      <div className="text-[10px] text-emerald-700 dark:text-emerald-400 mt-0.5">Inventory linked</div>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{liveSku ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{it.quantity}</TableCell>
                  <TableCell className="text-right tabular-nums">{Number(it.unit_cost_foreign).toFixed(2)}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{fmtBdt(it.subtotal_bdt)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {brandId && items.length > 0 && showLandedCost && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <span>💡 Enter landed costs after goods arrive in Bangladesh — FX rate, freight & customs lock here before posting to inventory.</span>
          </div>
          <LandedCostCard
            brandId={brandId}
            poId={po.id}
            items={items.map((it: any) => ({
              id: it.id,
              name: it.name_snapshot ?? "—",
              quantity: Number(it.quantity) || 0,
              unit_cost_cny: Number(it.unit_cost_cny ?? it.unit_cost_foreign) || 0,
            }))}
            initialFxRate={Number(po.fx_rate_cny_bdt ?? po.fx_rate) || 14}
            initialFreight={Number(po.freight_cost_bdt) || 0}
            initialCustoms={Number(po.customs_duty_bdt) || 0}
            initialOther={Number(po.other_charges_bdt) || 0}
            initialAgentCommissionCny={Number(po.agent_commission_cny) || 0}
            fxLockedAt={po.fx_rate_locked_at}
            fxSource={po.fx_rate_source}
          />
        </div>
      )}

      {/* "Goods arrived in BD?" alert — hide once any carton has reached arrived_bd or beyond */}
      {!isQtyMode &&
        !["arrived_bd", "partially_received", "completed", "cancelled"].includes(po.status) &&
        !cartons.some((c: any) => ["arrived_bd", "released", "in_stock"].includes(c.status)) && (
        <Card className="p-4 border-orange-200 bg-orange-50/50 dark:bg-orange-950/20 dark:border-orange-900/40">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="h-10 w-10 rounded-full bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center">
              <Truck className="h-5 w-5 text-orange-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">Goods arrived in BD?</div>
              <p className="text-xs text-muted-foreground">Enter shipping bill (weight × rate) — auto-distributes to cartons</p>
            </div>
            <Button onClick={() => setArrivedOpen(true)}><Truck className="h-4 w-4 mr-1" />Receive at BD</Button>
          </div>
        </Card>
      )}

      {/* Quantity mode releases */}
      <Card className="p-3 flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold">Receive mode</div>
          <p className="text-xs text-muted-foreground">
            {isQtyMode
              ? "Quantity mode — carton chara piece wise stock e nite parben."
              : "Carton mode — carton wise receive hocche. Quantity wise korte switch korun."}
          </p>
        </div>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant={!isQtyMode ? "default" : "outline"}
            disabled={!isQtyMode || modeMut.isPending}
            onClick={() => modeMut.mutate("carton")}
          >
            Carton wise
          </Button>
          <Button
            size="sm"
            variant={isQtyMode ? "default" : "outline"}
            disabled={isQtyMode || modeMut.isPending}
            onClick={() => modeMut.mutate("quantity")}
          >
            {modeMut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
            Quantity wise
          </Button>
        </div>
      </Card>

      {isQtyMode && (
        <QuantityReleaseCard poId={po.id} brandId={brandId} po={po as any} items={items} releases={releases as any} />
      )}

      {/* Cartons */}
      {!isQtyMode && (
      <Card className="overflow-hidden">
        <CartonsHeader
          cartons={cartons}
          selected={selectedCartons}
          setSelected={setSelectedCartons}
          onBulkStage={(s) => bulkMarkSelected(s, cartons)}
          onBulkRelease={() => setBulkReleaseOpen(true)}
          poPaid={poPaidForRelease}
          poSupplierTotal={poSupplierTotal}
        />
        <div className="divide-y divide-border">
          {cartons.map((c) => (
            <CartonRow
              key={c.id}
              carton={c}
              poId={po.id}
              poNumber={po.po_number}
              poItems={items}
              brandId={brandId}
              poDue={Number(po.due_bdt)}
              poPaid={poPaidForRelease}
              poSupplierTotal={poSupplierTotal}
              onStage={(stage) => stageMut.mutate({ carton_id: c.id, new_stage: stage })}
              selected={selectedCartons.has(c.id)}
              onToggleSelect={() => {
                setSelectedCartons((s) => {
                  const n = new Set(s);
                  if (n.has(c.id)) n.delete(c.id); else n.add(c.id);
                  return n;
                });
              }}
            />
          ))}
        </div>
      </Card>
      )}

      {/* Payments history */}
      <Card className="overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold inline-flex items-center gap-2"><Receipt className="h-4 w-4" />Payments</h3>
          <Badge variant="outline" className="text-[11px]">{payments.length}</Badge>
        </div>
        {payments.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">No payments recorded.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Wallet</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((p) => (
                <TableRow key={p.id} className={p.is_reversed ? "opacity-50 line-through" : ""}>
                  <TableCell className="text-sm">{p.payment_date}</TableCell>
                  <TableCell><Badge variant="secondary" className="text-[10px] capitalize">{p.payment_type.replace(/_/g, " ")}</Badge></TableCell>
                  <TableCell className="text-sm">{p.wallet?.name ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{p.reference ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold text-emerald-600">{fmtBdt(p.amount_bdt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Dialogs */}
      {arrivedOpen && brandId && (
        <ArrivedDialog poId={po.id} onClose={() => setArrivedOpen(false)} brandId={brandId} />
      )}
      {paymentOpen && brandId && (
        <PaymentDialog
          poId={po.id}
          brandId={brandId}
          grandTotal={Number(po.grand_total_bdt) || 0}
          dueAmount={Number(po.due_bdt) || 0}
          onClose={() => setPaymentOpen(false)}
        />
      )}
      {bulkReleaseOpen && brandId && (
        <BulkReleaseDialog
          poId={po.id}
          brandId={brandId}
          cartons={cartons.filter((c) => selectedCartons.has(c.id) && c.status === "arrived_bd")}
          poPaid={poPaidForRelease}
          poSupplierTotal={poSupplierTotal}
          onClose={() => setBulkReleaseOpen(false)}
          onDone={() => { setBulkReleaseOpen(false); setSelectedCartons(new Set()); }}
        />
      )}

      <Dialog open={deleteOpen} onOpenChange={(v) => { setDeleteOpen(v); if (!v) setDeleteConfirm(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Delete this Purchase Order?</DialogTitle>
            <DialogDescription>
              This permanently deletes <b>{po.po_number}</b>, all its cartons & items,
              reverses every recorded payment (wallet balance restored, journal entries removed),
              and rolls back any stock that was posted to inventory from this PO. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Type <code className="font-mono font-bold text-foreground">DELETE</code> to confirm</Label>
            <Input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} placeholder="DELETE" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleteConfirm !== "DELETE" || deleteMut.isPending}
              onClick={() => deleteMut.mutate()}
            >
              {deleteMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Delete forever
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}