import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle, ChevronDown, ChevronRight, ClipboardCheck, Loader2, PackageCheck, Truck,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { qcPoRelease } from "@/lib/erp/imports/imports.functions";
import { fmtBdt } from "@/lib/erp/imports/types";

export type ReleaseItem = {
  id: string;
  po_item_id: string;
  quantity: number;
  damaged_qty: number;
  missing_qty?: number;
  unit_landed_cost_bdt: number;
  sku_snapshot: string | null;
  qc_good_qty?: number | null;
  qc_damaged_qty?: number | null;
  qc_extra_qty?: number | null;
};

export type ReleaseRow = {
  id: string;
  release_number: number;
  released_at: string;
  notes: string | null;
  items: ReleaseItem[];
  local_delivery_bdt?: number | null;
  delivery_note?: string | null;
  qc_status?: string | null;
  qc_at?: string | null;
  qc_notes?: string | null;
};

type Draft = Record<string, { good: number; damaged: number; extra: number }>;

export function ReleaseHistory({
  poId, releases, items,
}: {
  poId: string;
  releases: ReleaseRow[];
  items: any[];
}) {
  const qc = useQueryClient();
  const qcFn = useServerFn(qcPoRelease);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [qcFor, setQcFor] = useState<ReleaseRow | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [qcNote, setQcNote] = useState("");

  const itemMap = useMemo(() => {
    const m = new Map<string, any>();
    items.forEach((i) => m.set(i.id, i));
    return m;
  }, [items]);

  const titleFor = (ri: ReleaseItem) => {
    const it = itemMap.get(ri.po_item_id);
    return it?.product?.title ?? it?.name_snapshot ?? "Item";
  };
  const skuFor = (ri: ReleaseItem) =>
    ri.sku_snapshot ?? itemMap.get(ri.po_item_id)?.product?.sku ?? "—";
  const imgFor = (ri: ReleaseItem) => {
    const it = itemMap.get(ri.po_item_id);
    return it?.variant?.image ?? it?.product?.image ?? it?.image_snapshot ?? null;
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
    setQcFor(r);
  };

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
        },
      }),
    onSuccess: () => {
      toast.success("Warehouse QC confirm holo — stock adjust hoye gelo");
      setQcFor(null);
      qc.invalidateQueries({ queryKey: ["imp-po", poId] });
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
            Release warehouse e pouchale — koto pcs bhalo, koto damaged, extra koto — ekhane confirm korun.
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
          const ld = Number(r.local_delivery_bdt ?? 0);
          const value = list.reduce((s, i) => s + Number(i.quantity ?? 0) * Number(i.unit_landed_cost_bdt ?? 0), 0);
          const totalPcs = list.reduce(
            (s, i) => s + Number(i.quantity ?? 0) + Number(i.damaged_qty ?? 0) + Number(i.missing_qty ?? 0), 0,
          );
          const avgLanded = qty > 0 ? value / qty : 0;
          const done = r.qc_status === "done";
          const qcGood = list.reduce((s, i) => s + Number(i.qc_good_qty ?? 0), 0);
          const qcDmg = list.reduce((s, i) => s + Number(i.qc_damaged_qty ?? 0), 0);
          const qcExtra = list.reduce((s, i) => s + Number(i.qc_extra_qty ?? 0), 0);
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
                  avg landed {fmtBdt(avgLanded)}/pc
                </span>

                {done ? (
                  <Badge className="bg-emerald-600 text-white hover:bg-emerald-600 text-[10px]">
                    QC done · {qcGood} good{qcDmg > 0 ? ` · ${qcDmg} bad` : ""}{qcExtra > 0 ? ` · +${qcExtra} extra` : ""}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] border-orange-400 text-orange-600">
                    QC pending
                  </Badge>
                )}

                <span className="ml-auto tabular-nums font-semibold">{fmtBdt(value)}</span>
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
                          <TableHead className="text-right">Line value</TableHead>
                          <TableHead className="text-right">QC (good / bad / extra)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {list.map((ri) => (
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
                                  <div className="text-[10px] font-mono text-muted-foreground truncate">{skuFor(ri)}</div>
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
                            <TableCell className="text-right tabular-nums font-medium">
                              {fmtBdt(Number(ri.quantity ?? 0) * Number(ri.unit_landed_cost_bdt ?? 0))}
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
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="grid sm:grid-cols-4 gap-3 text-sm mt-3">
                    <Tile label="Total pcs (ei release)" value={`${totalPcs} pcs`} />
                    <Tile label="Stock e gieche" value={`${qty} pcs`} />
                    <Tile label="Avg landed / pc" value={fmtBdt(avgLanded)} />
                    <Tile label="Inventory value" value={fmtBdt(value)} className="text-emerald-600" />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Dialog open={!!qcFor} onOpenChange={(v) => !mut.isPending && !v && setQcFor(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="inline-flex items-center gap-2">
              <PackageCheck className="h-5 w-5 text-emerald-600" />
              Warehouse QC — Release #{qcFor?.release_number}
            </DialogTitle>
            <DialogDescription>
              Warehouse e maal esheche — koto pcs bhalo, koto kharap, extra koto pele boshan. Confirm korle stock
              ei number onushare adjust hobe.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
            {(qcFor?.items ?? []).map((ri) => {
              const d = draft[ri.id] ?? { good: 0, damaged: 0, extra: 0 };
              const stocked = d.good + d.extra;
              const landed = Number(ri.unit_landed_cost_bdt ?? 0);
              return (
                <div key={ri.id} className="rounded-md border border-border p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    {imgFor(ri) ? (
                      <img src={imgFor(ri)!} alt="" className="h-9 w-9 rounded object-cover border border-border" />
                    ) : (
                      <div className="h-9 w-9 rounded bg-muted border border-dashed border-border" />
                    )}
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{titleFor(ri)}</div>
                      <div className="text-[10px] font-mono text-muted-foreground">{skuFor(ri)}</div>
                    </div>
                    <div className="ml-auto text-right text-xs text-muted-foreground tabular-nums">
                      Released {ri.quantity} pcs · landed {fmtBdt(landed)}/pc
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-[11px] text-emerald-700 dark:text-emerald-400">Good (stock e)</Label>
                      <Input
                        type="number" min={0} className="h-9 tabular-nums"
                        value={d.good}
                        onChange={(e) =>
                          setDraft((p) => ({ ...p, [ri.id]: { ...d, good: Math.max(0, Number(e.target.value) || 0) } }))
                        }
                      />
                    </div>
                    <div>
                      <Label className="text-[11px] text-orange-700 dark:text-orange-400">Damaged / bad</Label>
                      <Input
                        type="number" min={0} className="h-9 tabular-nums"
                        value={d.damaged}
                        onChange={(e) =>
                          setDraft((p) => ({ ...p, [ri.id]: { ...d, damaged: Math.max(0, Number(e.target.value) || 0) } }))
                        }
                      />
                    </div>
                    <div>
                      <Label className="text-[11px] text-sky-700 dark:text-sky-400">Extra paoa</Label>
                      <Input
                        type="number" min={0} className="h-9 tabular-nums"
                        value={d.extra}
                        onChange={(e) =>
                          setDraft((p) => ({ ...p, [ri.id]: { ...d, extra: Math.max(0, Number(e.target.value) || 0) } }))
                        }
                      />
                    </div>
                  </div>
                  <div className="text-[11px] text-muted-foreground tabular-nums">
                    Stock e thakbe <span className="font-semibold text-foreground">{stocked} pcs</span> ·
                    value {fmtBdt(stocked * landed)}
                    {stocked !== Number(ri.quantity ?? 0) && (
                      <span className="ml-1 text-orange-600">
                        (adjust {stocked - Number(ri.quantity ?? 0) > 0 ? "+" : ""}
                        {stocked - Number(ri.quantity ?? 0)} pcs)
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            <div>
              <Label className="text-xs">QC note (optional)</Label>
              <Textarea rows={2} value={qcNote} onChange={(e) => setQcNote(e.target.value)} placeholder="e.g. 2 pcs box fata chilo" />
            </div>

            <div className="text-[11px] text-muted-foreground inline-flex items-start gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-orange-500" />
              Damaged pcs stock e jabe na, extra pcs stock e jog hobe. Ager QC edit korle purono number theke
              shudhu difference tuku adjust hobe.
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setQcFor(null)} disabled={mut.isPending}>Cancel</Button>
            <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
              {mut.isPending
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</>
                : <><ClipboardCheck className="h-4 w-4 mr-2" />Confirm QC</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Tile({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-md border border-border p-2.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`font-semibold tabular-nums ${className ?? ""}`}>{value}</div>
    </div>
  );
}
