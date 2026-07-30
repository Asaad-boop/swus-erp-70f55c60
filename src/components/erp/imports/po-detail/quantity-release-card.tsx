import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Boxes, Loader2, PackageCheck, Warehouse, Wallet } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listWarehouses, releasePoQuantity } from "@/lib/erp/imports/imports.functions";
import { fmtBdt } from "@/lib/erp/imports/types";

type Release = {
  id: string;
  release_number: number;
  released_at: string;
  notes: string | null;
  items: Array<{
    id: string; po_item_id: string; quantity: number; damaged_qty: number;
    unit_landed_cost_bdt: number; sku_snapshot: string | null;
  }>;
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
        m.set(it.po_item_id, (m.get(it.po_item_id) ?? 0) + Number(it.quantity ?? 0) + Number(it.damaged_qty ?? 0));
      }
    }
    return m;
  }, [releases]);

  const [warehouseId, setWarehouseId] = useState("");
  const [notes, setNotes] = useState("");
  const [draft, setDraft] = useState<Record<string, { qty: number; damaged: number }>>({});

  const getDraft = (id: string) => draft[id] ?? { qty: 0, damaged: 0 };
  const setDraftFor = (id: string, patch: Partial<{ qty: number; damaged: number }>) =>
    setDraft((d) => ({ ...d, [id]: { ...getDraft(id), ...patch } }));

  const totalOrdered = items.reduce((s, i) => s + Number(i.quantity ?? 0), 0);
  const totalReleased = Array.from(releasedByItem.values()).reduce((s, n) => s + n, 0);
  const pct = totalOrdered > 0 ? Math.round((totalReleased / totalOrdered) * 100) : 0;
  const draftTotal = items.reduce((s, i) => s + getDraft(i.id).qty + getDraft(i.id).damaged, 0);

  // Landed cost preview — mirrors the server formula in releasePoQuantity()
  const fx = Number(po?.fx_rate_cny_bdt ?? po?.fx_rate ?? 0);
  const commissionPerUnit = Number(po?.agent_commission_per_unit_bdt ?? 0);
  const overheadTotal =
    Number(po?.shipping_total_bdt ?? po?.shipping_cost_bdt ?? 0) +
    Number(po?.local_courier_total_bdt ?? 0) +
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
  const goodsDuePerUnit = totalOrdered > 0 ? Math.max(0, goodsTotalAll - paidToGoods) / totalOrdered : 0;
  const shipDuePerUnit = totalOrdered > 0 ? Math.max(0, shipTotalAll - paidToShip) / totalOrdered : 0;

  const previewLines = items
    .map((i) => {
      const d = getDraft(i.id);
      const unitCny = Number(i.unit_cost_cny ?? i.unit_cost_foreign ?? 0);
      const goodsUnit = unitCny * fx;
      const landed = +(goodsUnit + overheadPerUnit + commissionPerUnit).toFixed(4);
      const pcs = d.qty + d.damaged;
      return {
        id: i.id,
        title: i.product?.title ?? i.name_snapshot ?? "Item",
        sku: i.product?.sku ?? i.sku_snapshot ?? "—",
        qty: d.qty,
        damaged: d.damaged,
        landed,
        value: landed * d.qty,
        damagedValue: landed * d.damaged,
        goodsDue: goodsDuePerUnit * pcs,
        shipDue: shipDuePerUnit * pcs,
      };
    })
    .filter((l) => l.qty > 0 || l.damaged > 0);

  const previewQty = previewLines.reduce((s, l) => s + l.qty, 0);
  const previewDamaged = previewLines.reduce((s, l) => s + l.damaged, 0);
  const previewValue = previewLines.reduce((s, l) => s + l.value, 0);
  const previewDamagedValue = previewLines.reduce((s, l) => s + l.damagedValue, 0);
  const previewGoodsDue = previewLines.reduce((s, l) => s + l.goodsDue, 0);
  const previewShipDue = previewLines.reduce((s, l) => s + l.shipDue, 0);
  const previewTotalDue = previewGoodsDue + previewShipDue;

  const grandTotal = Number(po?.grand_total_bdt ?? 0);
  const paid = Number(po?.paid_bdt ?? 0);
  const due = Number(po?.due_bdt ?? 0);
  const paidPct = grandTotal > 0 ? Math.round((paid / grandTotal) * 100) : 0;

  // Pro-rata due: joto pcs release hoyeche (+ ekhon hobe) toto tar baki purchase + shipping
  const draftPcs = previewQty + previewDamaged;
  const releasedShare = (goodsDuePerUnit + shipDuePerUnit) * (totalReleased + draftPcs);
  const dueForReleased = Math.max(0, Math.min(due || releasedShare, releasedShare));

  const mut = useMutation({
    mutationFn: () =>
      releaseFn({
        data: {
          po_id: poId,
          warehouse_id: warehouseId || undefined,
          notes: notes || undefined,
          items: items
            .map((i) => ({ po_item_id: i.id, quantity: getDraft(i.id).qty, damaged_qty: getDraft(i.id).damaged }))
            .filter((l) => l.quantity > 0 || l.damaged_qty > 0),
        },
      }),
    onSuccess: (res: any) => {
      toast.success(`Release #${res.release_number} posted to inventory`);
      setDraft({});
      setNotes("");
      qc.invalidateQueries({ queryKey: ["imp-po", poId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Release failed"),
  });

  const fillRemaining = () => {
    const next: Record<string, { qty: number; damaged: number }> = {};
    for (const i of items) {
      const rem = Number(i.quantity ?? 0) - (releasedByItem.get(i.id) ?? 0);
      if (rem > 0) next[i.id] = { qty: rem, damaged: 0 };
    }
    setDraft(next);
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((it: any) => {
              const ordered = Number(it.quantity ?? 0);
              const rel = releasedByItem.get(it.id) ?? 0;
              const remaining = Math.max(0, ordered - rel);
              const d = getDraft(it.id);
              const over = d.qty + d.damaged > remaining;
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
                      onChange={(e) => setDraftFor(it.id, { qty: Math.max(0, Number(e.target.value) || 0) })}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number" min={0}
                      className="h-8 text-right tabular-nums"
                      value={d.damaged || ""}
                      placeholder="0"
                      disabled={remaining === 0}
                      onChange={(e) => setDraftFor(it.id, { damaged: Math.max(0, Number(e.target.value) || 0) })}
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
            <Button size="sm" disabled={draftTotal <= 0 || mut.isPending} onClick={() => mut.mutate()}>
              {mut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PackageCheck className="h-4 w-4 mr-2" />}
              Release {draftTotal > 0 ? `${draftTotal} pcs` : ""}
            </Button>
          </div>
        </div>
      </Card>

      {grandTotal > 0 && (
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
            </Badge>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Pcs to stock</TableHead>
                <TableHead className="text-right">Damaged</TableHead>
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
                  <TableCell className="text-right tabular-nums">{fmtBdt(l.landed)}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{fmtBdt(l.value)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="p-4 border-t border-border grid sm:grid-cols-3 gap-3 text-sm">
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
              const value = (r.items ?? []).reduce((s, i) => s + Number(i.quantity ?? 0) * Number(i.unit_landed_cost_bdt ?? 0), 0);
              return (
                <div key={r.id} className="p-3 flex items-center gap-3 flex-wrap text-sm">
                  <Badge variant="secondary" className="font-mono">#{r.release_number}</Badge>
                  <span className="text-muted-foreground text-xs">{new Date(r.released_at).toLocaleString()}</span>
                  <span className="tabular-nums font-medium">{qty} pcs</span>
                  {dmg > 0 && <span className="text-xs text-orange-600 tabular-nums">{dmg} damaged</span>}
                  <span className="ml-auto tabular-nums font-semibold">{fmtBdt(value)}</span>
                  {r.notes && <div className="w-full text-xs text-muted-foreground">{r.notes}</div>}
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}