import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle, ChevronDown, ChevronRight, ClipboardCheck, Loader2, PackageCheck, Printer, Truck,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AccountCombobox } from "@/components/erp/finance/account-combobox";
import { useAccounts } from "@/hooks/erp/use-finance-query";
import { qcPoRelease } from "@/lib/erp/imports/imports.functions";
import { fmtBdt } from "@/lib/erp/imports/types";
import { printReleaseSlip, printQcReport } from "@/lib/erp/imports/print";

export type ReleaseItem = {
  id: string;
  po_item_id: string;
  quantity: number;
  damaged_qty: number;
  missing_qty?: number;
  unit_landed_cost_bdt: number;
  final_unit_cost_bdt?: number | null;
  reserved_qty?: number | null;
  sku_snapshot: string | null;
  qc_good_qty?: number | null;
  qc_damaged_qty?: number | null;
  qc_extra_qty?: number | null;
  variant?: { id: string; sku: string | null; color_name: string | null; color_hex: string | null; image: string | null } | null;
  product?: { id: string; title: string | null; image: string | null; sku: string | null } | null;
};

export type ReleaseRow = {
  id: string;
  release_number: number;
  released_at: string;
  notes: string | null;
  items: ReleaseItem[];
  local_delivery_bdt?: number | null;
  delivery_note?: string | null;
  local_courier_bdt?: number | null;
  local_courier_source?: string | null;
  qc_local_courier_note?: string | null;
  shipping_charge_bdt?: number | null;
  shipping_weight_kg?: number | null;
  shipping_rate_per_kg?: number | null;
  qc_status?: string | null;
  qc_at?: string | null;
  qc_notes?: string | null;
};

type Draft = Record<string, { good: number; damaged: number; extra: number }>;

export function ReleaseHistory({
  poId, brandId, po, releases, items,
}: {
  poId: string;
  brandId?: string | null;
  po?: any;
  releases: ReleaseRow[];
  items: any[];
}) {
  const qc = useQueryClient();
  const qcFn = useServerFn(qcPoRelease);
  const { data: wallets = [] } = useAccounts(brandId ? [brandId] : []);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [qcFor, setQcFor] = useState<ReleaseRow | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [qcNote, setQcNote] = useState("");
  const [lcAmount, setLcAmount] = useState("");
  const [lcWallet, setLcWallet] = useState("");
  const [lcRef, setLcRef] = useState("");

  const itemMap = useMemo(() => {
    const m = new Map<string, any>();
    items.forEach((i) => m.set(i.id, i));
    return m;
  }, [items]);

  const titleFor = (ri: ReleaseItem) =>
    ri.product?.title ?? itemMap.get(ri.po_item_id)?.product?.title ?? itemMap.get(ri.po_item_id)?.name_snapshot ?? "Item";
  const skuFor = (ri: ReleaseItem) =>
    ri.variant?.sku ?? ri.sku_snapshot ?? ri.product?.sku ?? itemMap.get(ri.po_item_id)?.product?.sku ?? "—";
  const imgFor = (ri: ReleaseItem) => {
    const it = itemMap.get(ri.po_item_id);
    return ri.variant?.image ?? ri.product?.image ?? it?.variant?.image ?? it?.product?.image ?? it?.image_snapshot ?? null;
  };
  const colorFor = (ri: ReleaseItem) => {
    const it = itemMap.get(ri.po_item_id);
    const v = ri.variant ?? it?.variant;
    if (!v?.color_name && !v?.color_hex) return null;
    return { name: v?.color_name ?? "Color", hex: v?.color_hex ?? "#999" };
  };

  const startQc = (r: ReleaseRow) => {
    const d: Draft = {};
    for (const ri of r.items ?? []) {
      d[ri.id] = {
        good: ri.qc_good_qty ?? Number(ri.quantity ?? 0),
        damaged: ri.qc_damaged_qty ?? Number(ri.damaged_qty ?? 0),
        extra: ri.qc_extra_qty ?? 0,
      };
    }
    setDraft(d);
    setQcNote(r.qc_notes ?? "");
    setLcAmount(Number(r.local_courier_bdt ?? 0) > 0 ? String(r.local_courier_bdt) : "");
    setLcWallet("");
    setLcRef("");
    setQcFor(r);
  };

  const qcModeCourier = ((qcFor?.local_courier_source ?? "release") === "qc");
  const lcNum = Math.max(0, Number(lcAmount) || 0);
  const draftGood = (qcFor?.items ?? []).reduce((s, ri) => s + (draft[ri.id]?.good ?? 0), 0);
  const draftReleaseCost = (qcFor?.items ?? []).reduce(
    (s, ri) => s + Number(ri.unit_landed_cost_bdt ?? 0) * (Number(ri.quantity ?? 0) + Number(ri.damaged_qty ?? 0)),
    0,
  );
  const finalPerPc = draftGood > 0 ? (draftReleaseCost + (qcModeCourier ? lcNum : 0)) / draftGood : 0;

  const mut = useMutation({
    mutationFn: () =>
      qcFn({
        data: {
          release_id: qcFor!.id,
          notes: qcNote || undefined,
          items: (qcFor!.items ?? []).map((ri) => ({
            release_item_id: ri.id,
            good_qty: draft[ri.id]?.good ?? 0,
            damaged_qty: draft[ri.id]?.damaged ?? 0,
            extra_qty: draft[ri.id]?.extra ?? 0,
          })),
          local_courier: qcModeCourier && lcNum > 0
            ? {
                amount_bdt: +lcNum.toFixed(2),
                wallet_id: lcWallet || undefined,
                payment_date: new Date().toISOString().slice(0, 10),
                reference: lcRef || undefined,
                note: lcRef || undefined,
              }
            : undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Warehouse QC confirm holo — stock sellable, final cost boshe gelo");
      setQcFor(null);
      qc.invalidateQueries({ queryKey: ["imp-po", poId] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "QC failed"),
  });

  if (releases.length === 0) return null;

  return (
    <Card className="overflow-hidden">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Release history & warehouse QC</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Release-er pcs QC na howa porjonto <b>reserved</b> — sellable na. QC confirm korle sellable hobe ar final cost boshbe.
          </p>
        </div>
        <Badge variant="outline" className="text-[11px]">{releases.length}</Badge>
      </div>

      <div className="divide-y divide-border">
        {releases.map((r) => {
          const list = r.items ?? [];
          const qty = list.reduce((s, i) => s + Number(i.quantity ?? 0), 0);
          const dmg = list.reduce((s, i) => s + Number(i.damaged_qty ?? 0), 0);
          const miss = list.reduce((s, i) => s + Number(i.missing_qty ?? 0), 0);
          const ld = Number(r.local_delivery_bdt ?? 0) + Number(r.local_courier_bdt ?? 0);
          const value = list.reduce((s, i) => s + Number(i.quantity ?? 0) * Number(i.unit_landed_cost_bdt ?? 0), 0);
          const totalPcs = list.reduce(
            (s, i) => s + Number(i.quantity ?? 0) + Number(i.damaged_qty ?? 0) + Number(i.missing_qty ?? 0), 0,
          );
          const avgLanded = qty > 0 ? value / qty : 0;
          const done = r.qc_status === "done";
          const qcGood = list.reduce((s, i) => s + Number(i.qc_good_qty ?? 0), 0);
          const qcDmg = list.reduce((s, i) => s + Number(i.qc_damaged_qty ?? 0), 0);
          const qcExtra = list.reduce((s, i) => s + Number(i.qc_extra_qty ?? 0), 0);
          const finalAvg = (() => {
            const g = list.reduce((s, i) => s + Number(i.qc_good_qty ?? 0), 0);
            const t = list.reduce((s, i) => s + Number(i.final_unit_cost_bdt ?? 0) * Number(i.qc_good_qty ?? 0), 0);
            return g > 0 ? t / g : 0;
          })();
          const isOpen = !!open[r.id];

          return (
            <div key={r.id}>
              <div className="p-3 flex items-center gap-3 flex-wrap text-sm">
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 hover:text-primary"
                  onClick={() => setOpen((o) => ({ ...o, [r.id]: !o[r.id] }))}
                >
                  {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <Badge variant="secondary" className="font-mono">#{r.release_number}</Badge>
                </button>
                <span className="text-muted-foreground text-xs">{new Date(r.released_at).toLocaleString()}</span>
                <span className="tabular-nums font-medium">{qty} pcs</span>
                {dmg > 0 && <span className="text-xs text-orange-600 tabular-nums">{dmg} damaged</span>}
                {miss > 0 && <span className="text-xs text-red-600 tabular-nums">{miss} missing</span>}
                {ld > 0 && (
                  <span className="text-xs text-sky-600 tabular-nums inline-flex items-center gap-1">
                    <Truck className="h-3 w-3" />{fmtBdt(ld)}
                  </span>
                )}
                <span className="text-xs text-muted-foreground tabular-nums">
                  {done && finalAvg > 0 ? <>final {fmtBdt(finalAvg)}/pc</> : <>avg landed {fmtBdt(avgLanded)}/pc</>}
                </span>

                {done ? (
                  <Badge className="bg-emerald-600 text-white hover:bg-emerald-600 text-[10px]">
                    QC done · {qcGood} good{qcDmg > 0 ? ` · ${qcDmg} bad` : ""}{qcExtra > 0 ? ` · +${qcExtra} extra` : ""}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] border-orange-400 text-orange-600">
                    QC pending · {qty} pcs reserved
                  </Badge>
                )}

                <span className="ml-auto tabular-nums font-semibold">{fmtBdt(value)}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  title={done ? "QC report print" : "Release slip print"}
                  onClick={() =>
                    done
                      ? printQcReport({ po, release: r, titleFor, skuFor, colorFor })
                      : printReleaseSlip({ po, release: r, titleFor, skuFor, colorFor })
                  }
                >
                  <Printer className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant={done ? "outline" : "default"} onClick={() => startQc(r)}>
                  <ClipboardCheck className="h-3.5 w-3.5 mr-1" />
                  {done ? "QC edit" : "Warehouse QC"}
                </Button>
                {(r.notes || r.delivery_note || r.qc_notes) && (
                  <div className="w-full text-xs text-muted-foreground">
                    {[r.notes, r.delivery_note, r.qc_notes].filter(Boolean).join(" · ")}
                  </div>
                )}
              </div>

              {isOpen && (
                <div className="px-3 pb-4">
                  <div className="rounded-md border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead className="text-right">Released</TableHead>
                          <TableHead className="text-right">Damaged</TableHead>
                          <TableHead className="text-right">Missing</TableHead>
                          <TableHead className="text-right">Landed / pc</TableHead>
                          <TableHead className="text-right">Final / pc</TableHead>
                          <TableHead className="text-right">QC (good / bad / extra)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {list.map((ri) => {
                          const col = colorFor(ri);
                          return (
                            <TableRow key={ri.id}>
                              <TableCell>
                                <div className="flex items-center gap-2 min-w-0">
                                  {imgFor(ri) ? (
                                    <img src={imgFor(ri)!} alt="" className="h-8 w-8 rounded object-cover border border-border" />
                                  ) : (
                                    <div className="h-8 w-8 rounded bg-muted border border-dashed border-border" />
                                  )}
                                  <div className="min-w-0">
                                    <div className="truncate text-sm font-medium">{titleFor(ri)}</div>
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-[10px] font-mono text-muted-foreground truncate">{skuFor(ri)}</span>
                                      {col && <ColorChip name={col.name} hex={col.hex} />}
                                    </div>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="text-right tabular-nums font-semibold">{ri.quantity}</TableCell>
                              <TableCell className="text-right tabular-nums">
                                {Number(ri.damaged_qty ?? 0) > 0 ? <span className="text-orange-600">{ri.damaged_qty}</span> : "—"}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {Number(ri.missing_qty ?? 0) > 0 ? <span className="text-red-600">{ri.missing_qty}</span> : "—"}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">{fmtBdt(ri.unit_landed_cost_bdt)}</TableCell>
                              <TableCell className="text-right tabular-nums font-semibold">
                                {ri.final_unit_cost_bdt ? fmtBdt(ri.final_unit_cost_bdt) : <span className="text-muted-foreground">—</span>}
                              </TableCell>
                              <TableCell className="text-right tabular-nums text-xs">
                                {ri.qc_good_qty === null || ri.qc_good_qty === undefined ? (
                                  <span className="text-muted-foreground">pending</span>
                                ) : (
                                  <>
                                    <span className="text-emerald-600 font-semibold">{ri.qc_good_qty}</span>
                                    {" / "}
                                    <span className="text-orange-600">{ri.qc_damaged_qty ?? 0}</span>
                                    {" / "}
                                    <span className="text-sky-600">+{ri.qc_extra_qty ?? 0}</span>
                                  </>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="grid sm:grid-cols-4 gap-3 text-sm mt-3">
                    <Tile label="Total pcs (ei release)" value={`${totalPcs} pcs`} />
                    <Tile label={done ? "Sellable stock" : "Reserved (QC pending)"} value={`${done ? qcGood + qcExtra : qty} pcs`} />
                    <Tile label="Local courier" value={fmtBdt(ld)} />
                    <Tile
                      label={done ? "Final cost / pc" : "Avg landed / pc"}
                      value={fmtBdt(done && finalAvg > 0 ? finalAvg : avgLanded)}
                      className="text-emerald-600"
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <QcReleaseDialog
        release={qcFor}
        brandId={brandId}
        helpers={{ titleFor, skuFor, imgFor, colorFor }}
        onClose={() => setQcFor(null)}
      />

    </Card>
  );
}

function ColorChip({ name, hex }: { name: string; hex: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border px-1.5 py-px text-[10px]">
      <span className="h-2 w-2 rounded-full border border-border" style={{ background: hex }} />
      {name}
    </span>
  );
}

function Tile({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-md border border-border p-2.5 bg-background/60">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`font-semibold tabular-nums ${className ?? ""}`}>{value}</div>
    </div>
  );
}
