import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, ClipboardCheck, Loader2, PackageCheck, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { AccountCombobox } from "@/components/erp/finance/account-combobox";
import { useAccounts } from "@/hooks/erp/use-finance-query";
import { qcPoRelease } from "@/lib/erp/imports/imports.functions";
import { fmtBdt } from "@/lib/erp/imports/types";

type Draft = Record<string, { good: number; damaged: number; extra: number }>;

export type QcHelpers = {
  titleFor: (ri: any) => string;
  skuFor: (ri: any) => string;
  imgFor: (ri: any) => string | null;
  colorFor: (ri: any) => { name: string; hex: string } | null;
};

/**
 * Warehouse QC — release hate ashar por good/damaged/extra + local courier
 * bosiye confirm korle stock sellable hoy ar final per-pc cost boshe jay.
 */
export function QcReleaseDialog({
  release, brandId, helpers, onClose, onDone,
}: {
  release: any | null;
  brandId?: string | null;
  helpers: QcHelpers;
  onClose: () => void;
  onDone?: () => void;
}) {
  const qc = useQueryClient();
  const qcFn = useServerFn(qcPoRelease);
  const { data: wallets = [] } = useAccounts(brandId ? [brandId] : []);
  const [draft, setDraft] = useState<Draft>({});
  const [qcNote, setQcNote] = useState("");
  const [lcAmount, setLcAmount] = useState("");
  const [lcWallet, setLcWallet] = useState("");
  const [lcRef, setLcRef] = useState("");

  useEffect(() => {
    if (!release) return;
    const d: Draft = {};
    for (const ri of release.items ?? []) {
      d[ri.id] = {
        good: ri.qc_good_qty ?? Number(ri.quantity ?? 0),
        damaged: ri.qc_damaged_qty ?? Number(ri.damaged_qty ?? 0),
        extra: ri.qc_extra_qty ?? 0,
      };
    }
    setDraft(d);
    setQcNote(release.qc_notes ?? "");
    setLcAmount(Number(release.local_courier_bdt ?? 0) > 0 ? String(release.local_courier_bdt) : "");
    setLcWallet("");
    setLcRef("");
  }, [release]);

  const qcModeCourier = ((release?.local_courier_source ?? "release") === "qc");
  const lcNum = Math.max(0, Number(lcAmount) || 0);
  const draftGood = (release?.items ?? []).reduce(
    (s: number, ri: any) => s + (draft[ri.id]?.good ?? 0) + (draft[ri.id]?.extra ?? 0), 0,
  );
  const draftReleaseCost = (release?.items ?? []).reduce(
    (s: number, ri: any) =>
      s + Number(ri.unit_landed_cost_bdt ?? 0) * (Number(ri.quantity ?? 0) + Number(ri.damaged_qty ?? 0)),
    0,
  );
  const finalPerPc = draftGood > 0 ? (draftReleaseCost + (qcModeCourier ? lcNum : 0)) / draftGood : 0;

  const mut = useMutation({
    mutationFn: () =>
      qcFn({
        data: {
          release_id: release.id,
          notes: qcNote || undefined,
          items: (release.items ?? []).map((ri: any) => ({
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
      qc.invalidateQueries({ queryKey: ["imp-po"] });
      qc.invalidateQueries({ queryKey: ["imp-incoming"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      onDone?.();
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "QC failed"),
  });

  return (
    <Dialog open={!!release} onOpenChange={(v) => !mut.isPending && !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="inline-flex items-center gap-2">
            <PackageCheck className="h-5 w-5 text-emerald-600" />
            Warehouse QC — Release #{release?.release_number}
            {release?.po_number && <span className="font-mono text-xs text-muted-foreground">{release.po_number}</span>}
          </DialogTitle>
          <DialogDescription>
            Maal hate esheche — koto pcs bhalo, koto damaged/missing, extra koto. Local courier charge o ekhane din.
            Confirm korle stock sellable hobe ar final per-piece cost boshe jabe.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
          {(release?.items ?? []).map((ri: any) => {
            const d = draft[ri.id] ?? { good: 0, damaged: 0, extra: 0 };
            const stocked = d.good + d.extra;
            const landed = Number(ri.unit_landed_cost_bdt ?? 0);
            const col = helpers.colorFor(ri);
            const img = helpers.imgFor(ri);
            return (
              <div key={ri.id} className="rounded-md border border-border p-3 space-y-2">
                <div className="flex items-center gap-2">
                  {img ? (
                    <img src={img} alt="" className="h-9 w-9 rounded object-cover border border-border" />
                  ) : (
                    <div className="h-9 w-9 rounded bg-muted border border-dashed border-border" />
                  )}
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{helpers.titleFor(ri)}</div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono text-muted-foreground">{helpers.skuFor(ri)}</span>
                      {col && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-border px-1.5 py-px text-[10px]">
                          <span className="h-2 w-2 rounded-full border border-border" style={{ background: col.hex }} />
                          {col.name}
                        </span>
                      )}
                    </div>
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

          {qcModeCourier ? (
            <div className="rounded-md border border-sky-200 dark:border-sky-900/40 bg-sky-50/60 dark:bg-sky-950/20 p-3 space-y-3">
              <div className="text-sm font-medium inline-flex items-center gap-2">
                <Truck className="h-4 w-4 text-sky-600" />
                Local courier charge (cargo → amader warehouse)
              </div>
              <div className="grid md:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Charge (BDT)</Label>
                  <Input
                    type="number" min={0} className="h-9 tabular-nums" placeholder="0"
                    value={lcAmount} onChange={(e) => setLcAmount(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs">Kon account theke</Label>
                  <AccountCombobox
                    accounts={(wallets as any[]).filter((w) => w.is_active)}
                    value={lcWallet}
                    onChange={setLcWallet}
                    requiredAmount={lcNum}
                    placeholder="Record only (pay later)"
                  />
                </div>
                <div>
                  <Label className="text-xs">Reference / note</Label>
                  <Input
                    className="h-9" placeholder="e.g. Sundarban, 3 bosta"
                    value={lcRef} onChange={(e) => setLcRef(e.target.value)}
                  />
                </div>
              </div>
            </div>
          ) : (
            Number(release?.local_delivery_bdt ?? 0) > 0 && (
              <div className="text-[11px] text-muted-foreground">
                Ei purono release-e local delivery {fmtBdt(Number(release?.local_delivery_bdt ?? 0))} release-er
                shomoy-i neya hoyechilo — ekhane abar nite hobe na.
              </div>
            )
          )}

          <div className="rounded-md border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/60 dark:bg-emerald-950/20 p-3">
            <div className="text-[11px] uppercase tracking-wider text-emerald-800 dark:text-emerald-300 font-semibold mb-1.5">
              Final cost of goods
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <Tile label="Goods + freight" value={fmtBdt(draftReleaseCost)} />
              <Tile label="Local courier" value={fmtBdt(qcModeCourier ? lcNum : 0)} />
              <Tile label="Good pcs" value={`${draftGood} pcs`} />
              <Tile label="Final / pc" value={fmtBdt(finalPerPc)} className="text-emerald-700 dark:text-emerald-300" />
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              Damage/missing pcs-er khoroch bhalo pcs-er upor bhag hoy — alada write-off entry hobe na.
            </p>
          </div>

          <div>
            <Label className="text-xs">QC note (optional)</Label>
            <Textarea rows={2} value={qcNote} onChange={(e) => setQcNote(e.target.value)} placeholder="e.g. 2 pcs box fata chilo" />
          </div>

          <div className="text-[11px] text-muted-foreground inline-flex items-start gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-orange-500" />
            Damaged pcs stock e jabe na, extra pcs 0 cost e stock e jog hobe. Ager QC edit korle purono number theke
            shudhu difference tuku adjust hobe.
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={mut.isPending}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</>
              : <><ClipboardCheck className="h-4 w-4 mr-2" />Confirm QC</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
