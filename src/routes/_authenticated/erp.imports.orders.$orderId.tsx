import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  ArrowLeft, Truck, CheckCircle2, AlertTriangle, Wallet, Loader2,
  PackageCheck, Receipt, Trash2, Pencil, MoreHorizontal, Boxes, Repeat, ClipboardList, History,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";

import {
  getPurchaseOrderDetail, updateCartonStage, deleteImportPo, setPoReceiveMode,
} from "@/lib/erp/imports/imports.functions";
import {
  PO_STATUS_LABEL, fmtBdt, newIdemKey, netDue,
  type ImpPoStatus, type ImpCartonStatus,
} from "@/lib/erp/imports/types";
import { LandedCostCard } from "@/components/erp/imports/landed-cost-card";
import { CARTON_STATUS_LABEL as _CS } from "@/lib/erp/imports/types";
import { KpiTile, Mini, SummaryBox } from "@/components/erp/imports/po-detail/atoms";
import { PIPELINE_STAGES, PipelineStrip } from "@/components/erp/imports/po-detail/pipeline-strip";
import { CartonRow } from "@/components/erp/imports/po-detail/carton-row";
import { CartonsHeader } from "@/components/erp/imports/po-detail/cartons-header";

import { ArrivedDialog, PaymentDialog, BulkReleaseDialog, QtyArrivedDialog, EditPaymentDialog } from "@/components/erp/imports/po-detail/dialogs";
import { QuantityReleaseCard } from "@/components/erp/imports/po-detail/quantity-release-card";
import { ReleaseWizard } from "@/components/erp/imports/po-detail/release-wizard";
import { EditPoDialog } from "@/components/erp/imports/po-detail/edit-po-dialog";
import { CartonPlanDialog } from "@/components/erp/imports/po-detail/carton-plan-dialog";
import { ActivityTimeline } from "@/components/erp/imports/po-detail/activity-timeline";
import { NextActionBar } from "@/components/erp/imports/po-detail/next-action-bar";
import { computePoMath } from "@/components/erp/imports/po-detail/po-math";

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
  const [qtyArrivedOpen, setQtyArrivedOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [editPayment, setEditPayment] = useState<any | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [cartonPlanOpen, setCartonPlanOpen] = useState(false);
  const [tab, setTab] = useState("overview");


  const stageMut = useMutation({
    mutationFn: (vars: { carton_id: string; new_stage: ImpCartonStatus }) =>
      stageFn({ data: { ...vars, idempotency_key: newIdemKey("stage") } as any }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["imp-po", orderId] }); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const [selectedCartons, setSelectedCartons] = useState<Set<string>>(new Set());
  const [bulkReleaseOpen, setBulkReleaseOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
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

  const poMath = computePoMath({ po, items, cartons, releases, payments, isQtyMode });


  const totalCartons = cartons.length;
  const totalPieces = cartons.reduce((s, c) => s + Number(c.expected_quantity || 0), 0);
  const deliveredCartons = cartons.filter((c) => c.status === "in_stock").length;
  const deliveredPieces = cartons.filter((c) => c.status === "in_stock").reduce((s, c) => s + Number(c.expected_quantity || 0), 0);
  const deliveredPct = totalPieces > 0 ? Math.round((deliveredPieces / totalPieces) * 100) : 0;
  const paidPct = Number(po.grand_total_bdt) > 0 ? Math.round((Number(po.paid_bdt) / Number(po.grand_total_bdt)) * 100) : 0;
  // FX/pro-rata rounding-e ৳0.01 residue thake — seta due hishebe dekhabo na
  const dueAmt = netDue(po.due_bdt);

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
    <div className="pb-14">
      {/* ── Sticky command header ─────────────────────────────── */}
      <div className="sticky top-0 z-30 -mx-4 md:-mx-6 px-4 md:px-6 py-3 border-b border-border/70 bg-background/85 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70">
        <div className="max-w-[1400px] mx-auto flex items-center gap-3 flex-wrap">
          <Link to="/erp/imports/orders">
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-bold font-mono tracking-tight truncate">{po.po_number}</h1>
              <Badge variant="secondary" className={PO_STATUS_LABEL[po.status as ImpPoStatus]?.tone}>
                {PO_STATUS_LABEL[po.status as ImpPoStatus]?.label ?? po.status}
              </Badge>
              <Badge variant="outline" className="text-[10px] font-medium">
                {isQtyMode ? "Quantity wise" : "Carton wise"}
              </Badge>
            </div>
            <div className="mt-0.5 flex items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground flex-wrap">
              <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-primary" />{po.supplier?.name ?? "—"}</span>
              <span>{po.order_date}</span>
              <span className="font-mono">FX {Number(po.fx_rate)} · {po.currency}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={dueAmt > 0 ? "default" : "outline"}
              className={dueAmt > 0 ? "bg-orange-600 hover:bg-orange-700 text-white" : ""}
              onClick={() => setPaymentOpen(true)}
            >
              <Wallet className="h-4 w-4 mr-1" />
              {dueAmt > 0 ? `Pay ${fmtBdt(dueAmt)}` : "Record payment"}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="outline" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={() => setEditOpen(true)}>
                  <Pencil className="h-4 w-4 mr-2" />Edit PO
                </DropdownMenuItem>
                {!isQtyMode && (
                  <DropdownMenuItem onClick={() => setCartonPlanOpen(true)}>
                    <Boxes className="h-4 w-4 mr-2" />Carton plan
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => modeMut.mutate(isQtyMode ? "carton" : "quantity")} disabled={modeMut.isPending}>
                  <Repeat className="h-4 w-4 mr-2" />
                  Switch to {isQtyMode ? "carton wise" : "quantity wise"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteOpen(true)}>
                  <Trash2 className="h-4 w-4 mr-2" />Delete PO
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-4 md:px-6 pt-5 space-y-5">
        {/* ── KPI strip ───────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiTile icon="$" label="Grand Total" value={fmtBdt(po.grand_total_bdt)} />
          <KpiTile icon={<PackageCheck className="h-4 w-4 text-emerald-600" />} label="Paid" value={fmtBdt(po.paid_bdt)} valueClass="text-emerald-600" hint={`${paidPct}% settled`} />
          <KpiTile icon={<AlertTriangle className="h-4 w-4 text-orange-600" />} label="Due" value={fmtBdt(dueAmt)} valueClass={dueAmt > 0 ? "text-orange-600" : "text-emerald-600"} />
          <KpiTile
            icon={<CheckCircle2 className="h-4 w-4 text-blue-600" />}
            label={isQtyMode ? "Released" : "Delivered"}
            value={isQtyMode ? `${qtyReleased} / ${qtyOrdered}` : `${deliveredCartons} / ${totalCartons}`}
            hint={isQtyMode
              ? `${qtyOrdered > 0 ? Math.round((qtyReleased / qtyOrdered) * 100) : 0}% released`
              : `${deliveredPieces} / ${totalPieces} pcs · ${deliveredPct}%`}
          />
        </div>

        {/* ── Next action ─────────────────────────────────────── */}
        <NextActionBar
          po={po}
          cartons={cartons}
          math={poMath}
          isQtyMode={isQtyMode}
          onCartonPlan={() => setCartonPlanOpen(true)}
          onBulkStage={async (stage, ids) => {
            try {
              await Promise.all(ids.map((id) => stageFn({ data: { carton_id: id, new_stage: stage, idempotency_key: newIdemKey("stage") } as any })));
              toast.success(`${ids.length} carton moved`);
              qc.invalidateQueries({ queryKey: ["imp-po", orderId] });
            } catch (e: any) { toast.error(e?.message ?? "Failed"); }
          }}
          onReceiveBd={() => (isQtyMode ? setQtyArrivedOpen(true) : setArrivedOpen(true))}
          onPayDue={() => setPaymentOpen(true)}
        />

        {poMath.totalsMismatch && (
          <Card className="p-3 border-amber-300 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-900/50 text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              PO grand total ar line total + charges er moddhe <span className="font-mono font-semibold">{fmtBdt(Math.abs(poMath.mismatchAmount))}</span> difference —
              Edit PO theke charges/quantity milie nin.
            </span>
          </Card>
        )}

        {/* ── Tabs ────────────────────────────────────────────── */}
        <Tabs value={tab} onValueChange={setTab} className="space-y-5">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="overview" className="gap-1.5"><ClipboardList className="h-3.5 w-3.5" />Overview</TabsTrigger>
            <TabsTrigger value="shipment" className="gap-1.5">
              <Truck className="h-3.5 w-3.5" />{isQtyMode ? "Receive & release" : "Shipment"}
            </TabsTrigger>
            <TabsTrigger value="money" className="gap-1.5">
              <Wallet className="h-3.5 w-3.5" />Money
              {dueAmt > 0 && <span className="ml-1 h-1.5 w-1.5 rounded-full bg-orange-500" />}
            </TabsTrigger>
            <TabsTrigger value="activity" className="gap-1.5">
              <History className="h-3.5 w-3.5" />Activity
            </TabsTrigger>
          </TabsList>

          {/* ============ OVERVIEW ============ */}
          <TabsContent value="overview" className="space-y-5 m-0">
            {!isQtyMode && (
              <Card className="p-5">
                <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
                  <div>
                    <h3 className="font-semibold">Order pipeline</h3>
                    <p className="text-xs text-muted-foreground">China theke tomar warehouse porjonto ei PO-r journey.</p>
                  </div>
                  <div className="text-right text-xs">
                    <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Delivered</span>{" "}
                    <span className="font-medium">{deliveredCartons}/{totalCartons} cartons · {deliveredPieces}/{totalPieces} pcs</span>
                  </div>
                </div>
                <PipelineStrip stages={stageCounts} activeStatus={po.status as ImpPoStatus} />
                {!showLandedCost && (
                  <div className="mt-4 rounded-md border border-dashed border-orange-300/70 dark:border-orange-900/50 bg-orange-50/40 dark:bg-orange-950/20 px-3 py-2 text-[12px] text-orange-800 dark:text-orange-200 flex items-center gap-2">
                    <Truck className="h-3.5 w-3.5 shrink-0" />
                    <span><span className="font-semibold">Arrived BD</span> stage e pouchhalei FX + freight + customs boshate parben — tarpor inventory te post hobe.</span>
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

            <Card className="overflow-hidden">
              <div className="p-4 border-b border-border flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">Products</h3>
                  <p className="text-[11px] text-muted-foreground">{qtyOrdered} pcs ordered · subtotal {fmtBdt(po.product_subtotal_bdt)}</p>
                </div>
                <Badge variant="outline" className="text-[11px]">{items.length} items</Badge>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[64px]"></TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="hidden md:table-cell">SKU</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right hidden sm:table-cell">Unit {po.currency}</TableHead>
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
                          <div className="md:hidden text-[10px] font-mono text-muted-foreground">{liveSku ?? "—"}</div>
                          {it.product_id && (
                            <div className="text-[10px] text-emerald-700 dark:text-emerald-400 mt-0.5">Inventory linked</div>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground hidden md:table-cell">{liveSku ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{it.quantity}</TableCell>
                        <TableCell className="text-right tabular-nums hidden sm:table-cell">{Number(it.unit_cost_foreign).toFixed(2)}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{fmtBdt(it.subtotal_bdt)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>

            {brandId && items.length > 0 && showLandedCost && (
              <LandedCostCard
                brandId={brandId}
                poId={po.id}
                items={items.map((it: any) => ({
                  id: it.id,
                  name: it.product?.title ?? it.name_snapshot ?? "—",
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
            )}
          </TabsContent>

          {/* ============ SHIPMENT ============ */}
          <TabsContent value="shipment" className="space-y-5 m-0">
            {isQtyMode && brandId && ["arrived_bd", "partially_received", "completed"].includes(po.status) && (
              <Card className="p-3 flex items-center gap-3 flex-wrap">
                <Truck className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1 min-w-0 text-xs text-muted-foreground">
                  Received in BD · freight {fmtBdt(po.freight_cost_bdt)} · landed {fmtBdt(poMath.landedPerUnit)}/pc
                </div>
                <Button size="sm" variant="outline" onClick={() => setQtyArrivedOpen(true)}>Edit receiving bill</Button>
              </Card>
            )}

            {isQtyMode && (
              <div id="release-section" className="scroll-mt-24">
                <QuantityReleaseCard poId={po.id} brandId={brandId} po={po as any} items={items} releases={releases as any} payments={payments} onPayDue={() => setPaymentOpen(true)} />
              </div>
            )}


            {!isQtyMode && (
              <Card id="cartons-section" className="overflow-hidden scroll-mt-24">
                <CartonsHeader
                  cartons={cartons}
                  selected={selectedCartons}
                  setSelected={setSelectedCartons}
                  onBulkStage={(s) => bulkMarkSelected(s, cartons)}
                  onBulkRelease={() => setBulkReleaseOpen(true)}
                  onOpenWizard={() => setWizardOpen(true)}
                  poPaid={poPaidForRelease}
                  poSupplierTotal={poSupplierTotal}
                  onEditPlan={() => setCartonPlanOpen(true)}
                />
                {cartons.length === 0 ? (
                  <div className="p-10 text-center space-y-3">
                    <div className="mx-auto h-11 w-11 rounded-full bg-muted flex items-center justify-center">
                      <Boxes className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                      Ei PO te ekhono kono carton nei. Carton plan baniye nin — kon carton e kon item koto piece ache.
                    </p>
                    <Button onClick={() => setCartonPlanOpen(true)}>
                      <Pencil className="h-4 w-4 mr-1" /> Carton plan banao
                    </Button>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {cartons.map((c) => (
                      <CartonRow
                        key={c.id}
                        carton={c}
                        poId={po.id}
                        poNumber={po.po_number}
                        poItems={items}
                        brandId={brandId}
                        poDue={dueAmt}
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
                )}
              </Card>
            )}
          </TabsContent>

          {/* ============ MONEY ============ */}
          <TabsContent value="money" className="space-y-5 m-0">
            <Card className="p-5">
              <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                <h3 className="font-semibold inline-flex items-center gap-2"><Wallet className="h-4 w-4" />Payment progress</h3>
                <div className="text-sm">
                  <span className="text-emerald-600 font-semibold tabular-nums">{fmtBdt(po.paid_bdt)}</span>
                  <span className="text-muted-foreground"> / {fmtBdt(po.grand_total_bdt)}</span>
                  <span className="ml-2 text-xs text-muted-foreground">({paidPct}%)</span>
                </div>
              </div>
              <Progress value={paidPct} className="h-2 [&>div]:bg-emerald-500" />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 text-xs">
                <Mini label="SUBTOTAL" value={fmtBdt(po.product_subtotal_bdt)} />
                {Number(po.shipping_total_bdt) > 0 && <Mini label="SHIPPING CN→BD" value={fmtBdt(po.shipping_total_bdt)} />}
                {Number(po.local_courier_total_bdt) > 0 && <Mini label="LOCAL COURIER" value={fmtBdt(po.local_courier_total_bdt)} />}
                {dueAmt > 0
                  ? <Mini label="OUTSTANDING DUE" value={fmtBdt(dueAmt)} valueClass="text-orange-600" />
                  : <Mini label="OUTSTANDING DUE" value="Full paid ✓" valueClass="text-emerald-600" />}
              </div>
              {dueAmt > 0 && (
                <div className="mt-4 rounded-md border border-orange-300/70 dark:border-orange-900/50 bg-orange-50/60 dark:bg-orange-950/20 px-3 py-2.5 flex items-center gap-3 flex-wrap">
                  <AlertTriangle className="h-4 w-4 text-orange-600 shrink-0" />
                  <div className="flex-1 min-w-0 text-xs text-orange-800 dark:text-orange-200">
                    <span className="font-semibold">Outstanding due:</span> <span className="tabular-nums font-mono">{fmtBdt(dueAmt)}</span>
                    {" — "}supplier / freight payment baki ache.
                  </div>
                  <Button size="sm" className="bg-orange-600 hover:bg-orange-700 text-white" onClick={() => setPaymentOpen(true)}>
                    <Wallet className="h-3.5 w-3.5 mr-1" />Pay now
                  </Button>
                </div>
              )}
            </Card>

            <Card className="overflow-hidden">
              <div className="p-4 border-b border-border flex items-center justify-between">
                <h3 className="font-semibold inline-flex items-center gap-2"><Receipt className="h-4 w-4" />Payments</h3>
                <Badge variant="outline" className="text-[11px]">{payments.length}</Badge>
              </div>
              {payments.length === 0 ? (
                <div className="p-8 text-center space-y-3">
                  <p className="text-sm text-muted-foreground">Ekhono kono payment record hoy nai.</p>
                  <Button size="sm" variant="outline" onClick={() => setPaymentOpen(true)}>
                    <Wallet className="h-4 w-4 mr-1" />Record payment
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="hidden sm:table-cell">Wallet</TableHead>
                      <TableHead className="hidden md:table-cell">Reference</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((p) => (
                      <TableRow key={p.id} className={p.is_reversed ? "opacity-50 line-through" : ""}>
                        <TableCell className="text-sm whitespace-nowrap">{p.payment_date}</TableCell>
                        <TableCell><Badge variant="secondary" className="text-[10px] capitalize">{p.payment_type.replace(/_/g, " ")}</Badge></TableCell>
                        <TableCell className="text-sm hidden sm:table-cell">{p.wallet?.name ?? "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground hidden md:table-cell">{p.reference ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums font-semibold text-emerald-600">{fmtBdt(p.amount_bdt)}</TableCell>
                        <TableCell className="text-right">
                          {!p.is_reversed && (
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditPayment(p)}>
                              Edit
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          </TabsContent>

          {/* ============ ACTIVITY ============ */}
          <TabsContent value="activity" className="space-y-5 m-0">
            <ActivityTimeline poId={po.id} poNumber={po.po_number} />
          </TabsContent>
        </Tabs>

        <CartonPlanDialog
          open={cartonPlanOpen}
          onOpenChange={setCartonPlanOpen}
          poId={po.id}
          poNumber={po.po_number}
          items={items}
          cartons={cartons}
        />


      {/* Dialogs */}
      <EditPoDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        po={po}
        items={items}
        cartons={cartons}
        releases={releases}
      />
      {arrivedOpen && brandId && (
        <ArrivedDialog poId={po.id} onClose={() => setArrivedOpen(false)} brandId={brandId} />
      )}
      {qtyArrivedOpen && brandId && (
        <QtyArrivedDialog
          poId={po.id}
          brandId={brandId}
          onClose={() => setQtyArrivedOpen(false)}
          initialWeight={Number(po.shipping_weight_kg) || 0}
          initialRate={Number(po.shipping_rate_per_kg) || 0}
          initialCustoms={Number(po.customs_duty_bdt) || 0}
          initialOther={Number(po.other_charges_bdt) || 0}
          initialShippingTotal={Number(po.shipping_total_bdt ?? po.shipping_cost_bdt) || 0}
        />
      )}
      {paymentOpen && brandId && (
        <PaymentDialog
          poId={po.id}
          brandId={brandId}
          grandTotal={Number(po.grand_total_bdt) || 0}
          dueAmount={dueAmt}
          onClose={() => setPaymentOpen(false)}
        />
      )}
      {editPayment && brandId && (
        <EditPaymentDialog
          payment={editPayment}
          brandId={brandId}
          poId={po.id}
          onClose={() => setEditPayment(null)}
        />
      )}
      {wizardOpen && brandId && (
        <ReleaseWizard
          open
          onClose={() => { setWizardOpen(false); setSelectedCartons(new Set()); }}
          poId={po.id}
          poNumber={po.po_number}
          brandId={brandId}
          cartons={cartons}
          poItems={items}
          poPaid={poPaidForRelease}
          poSupplierTotal={poSupplierTotal}
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
    </div>

  );
}