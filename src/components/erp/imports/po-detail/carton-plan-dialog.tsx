import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Boxes, Loader2, Plus, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { saveCartonPlan } from "@/lib/erp/imports/imports.functions";

type Alloc = Record<string, number>; // po_item_id -> qty
type Draft = { key: string; carton_number: number; weight_kg: string; alloc: Alloc; locked: boolean; status?: string };

const LOCKED_STATUSES = ["released", "in_stock"];

function buildDrafts(cartons: any[]): Draft[] {
  return cartons.map((c, i) => ({
    key: c.id ?? `c${i}`,
    carton_number: Number(c.carton_number) || i + 1,
    weight_kg: c.weight_kg == null ? "" : String(c.weight_kg),
    locked: LOCKED_STATUSES.includes(c.status),
    status: c.status,
    alloc: (c.items ?? []).reduce((acc: Alloc, it: any) => {
      acc[it.po_item_id] = (acc[it.po_item_id] ?? 0) + Number(it.quantity_expected || 0);
      return acc;
    }, {} as Alloc),
  }));
}

export function CartonPlanDialog({
  open, onOpenChange, poId, poNumber, items, cartons,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  poId: string;
  poNumber: string;
  items: any[];
  cartons: any[];
}) {
  const qc = useQueryClient();
  const save = useServerFn(saveCartonPlan);
  const [drafts, setDrafts] = useState<Draft[]>([]);

  useEffect(() => {
    if (open) setDrafts(buildDrafts(cartons));
  }, [open, cartons]);

  const anyLocked = drafts.some((d) => d.locked);

  const perItemPlanned = useMemo(() => {
    const m: Record<string, number> = {};
    for (const d of drafts) for (const [k, v] of Object.entries(d.alloc)) m[k] = (m[k] ?? 0) + (Number(v) || 0);
    return m;
  }, [drafts]);

  const totalOrdered = items.reduce((s, it) => s + Number(it.quantity || 0), 0);
  const totalPlanned = Object.values(perItemPlanned).reduce((s, v) => s + v, 0);
  const offItems = items
    .map((it) => ({
      it,
      ordered: Number(it.quantity || 0),
      planned: perItemPlanned[it.id] ?? 0,
    }))
    .filter((x) => x.planned !== x.ordered);
  const balanced = offItems.length === 0;

  const setAlloc = (key: string, itemId: string, qty: number) =>
    setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, alloc: { ...d.alloc, [itemId]: Math.max(0, qty || 0) } } : d)));

  const addCarton = () =>
    setDrafts((ds) => [
      ...ds,
      { key: `new-${Date.now()}-${ds.length}`, carton_number: Math.max(0, ...ds.map((d) => d.carton_number)) + 1, weight_kg: "", alloc: {}, locked: false },
    ]);

  const removeCarton = (key: string) => setDrafts((ds) => ds.filter((d) => d.key !== key));

  const autoSplit = () => {
    const editable = drafts.filter((d) => !d.locked);
    if (editable.length === 0) return toast.error("Age ekta carton add korun.");
    const lockedTotals: Record<string, number> = {};
    for (const d of drafts) if (d.locked) for (const [k, v] of Object.entries(d.alloc)) lockedTotals[k] = (lockedTotals[k] ?? 0) + v;

    const next = drafts.map((d) => (d.locked ? d : { ...d, alloc: {} as Alloc }));
    for (const it of items) {
      let remaining = Number(it.quantity || 0) - (lockedTotals[it.id] ?? 0);
      if (remaining <= 0) continue;
      const base = Math.floor(remaining / editable.length);
      let extra = remaining - base * editable.length;
      for (const d of next) {
        if (d.locked) continue;
        const give = base + (extra > 0 ? 1 : 0);
        if (extra > 0) extra -= 1;
        if (give > 0) d.alloc[it.id] = give;
      }
    }
    setDrafts(next);
    toast.success("Auto split kora holo — quantity gulo somoan bhag hoyeche.");
  };

  const mut = useMutation({
    mutationFn: async () => {
      const payload = drafts
        .slice()
        .sort((a, b) => a.carton_number - b.carton_number)
        .map((d, i) => ({
          carton_number: i + 1,
          weight_kg: d.weight_kg === "" ? null : Number(d.weight_kg),
          allocations: Object.entries(d.alloc)
            .filter(([, q]) => Number(q) > 0)
            .map(([po_item_id, quantity]) => ({ po_item_id, quantity: Number(quantity) })),
        }));
      return await save({ data: { po_id: poId, cartons: payload } });
    },
    onSuccess: () => {
      toast.success("Carton plan save hoyeche");
      qc.invalidateQueries({ queryKey: ["imp-po", poId] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="inline-flex items-center gap-2">
            <Boxes className="h-4 w-4" /> Carton plan — {poNumber}
          </DialogTitle>
          <DialogDescription>
            Carton add/edit/delete korun ar prottek carton e kon item koto piece ache set korun.
            Total obosshoi PO quantity er soman hote hobe.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 text-xs">
            <Badge variant={balanced ? "secondary" : "destructive"} className="text-[11px]">
              {totalPlanned} / {totalOrdered} pcs planned
            </Badge>
            <Badge variant="outline" className="text-[11px]">{drafts.length} carton</Badge>
            {anyLocked && <span className="text-muted-foreground">Released/in-stock carton edit kora jabe na.</span>}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={autoSplit}>
              <Wand2 className="h-4 w-4 mr-1" /> Auto split
            </Button>
            <Button size="sm" variant="outline" onClick={addCarton}>
              <Plus className="h-4 w-4 mr-1" /> Add carton
            </Button>
          </div>
        </div>

        {!balanced && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs space-y-1.5">
            <div className="font-semibold text-destructive">
              Save kora jabe na — prottek item er planned qty ordered qty er soman hote hobe.
            </div>
            {offItems.map(({ it, ordered, planned }) => (
              <div key={it.id} className="flex items-center justify-between gap-2">
                <span className="truncate">
                  {it.name_snapshot}
                  {it.variant?.color_name ? ` · ${it.variant.color_name}` : ""}
                </span>
                <span className="tabular-nums shrink-0">
                  planned {planned} / {ordered}{" "}
                  <span className="font-semibold text-destructive">
                    ({planned > ordered ? `+${planned - ordered} beshi` : `${ordered - planned} baki`})
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}

        <ScrollArea className="max-h-[55vh] pr-3">
          <div className="space-y-3">
            {drafts.length === 0 && (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                Kono carton nei. "Add carton" diye shuru korun, othoba "Auto split" chapun.
              </div>
            )}
            {drafts
              .slice()
              .sort((a, b) => a.carton_number - b.carton_number)
              .map((d, idx) => {
                const total = Object.values(d.alloc).reduce((s, v) => s + (Number(v) || 0), 0);
                return (
                  <Card key={d.key} className="p-3 space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">Carton #{idx + 1}</span>
                        <Badge variant="outline" className="text-[10px]">{total} pcs</Badge>
                        {d.status && <Badge variant="secondary" className="text-[10px] capitalize">{d.status.replace(/_/g, " ")}</Badge>}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <span className="text-[11px] text-muted-foreground">Weight (kg)</span>
                          <Input
                            className="h-8 w-24"
                            type="number"
                            step="0.01"
                            min="0"
                            disabled={d.locked}
                            value={d.weight_kg}
                            onChange={(e) => setDrafts((ds) => ds.map((x) => (x.key === d.key ? { ...x, weight_kg: e.target.value } : x)))}
                          />
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive"
                          disabled={d.locked}
                          onClick={() => removeCarton(d.key)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      {items.map((it) => {
                        const planned = perItemPlanned[it.id] ?? 0;
                        const ordered = Number(it.quantity || 0);
                        return (
                          <div key={it.id} className="flex items-center gap-2 rounded-md border border-border/60 p-2">
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-medium truncate">{it.name_snapshot}</div>
                              <div className="text-[10px] text-muted-foreground truncate">
                                {it.variant?.color_name ? `${it.variant.color_name} · ` : ""}
                                {it.sku_snapshot ?? "—"} · planned {planned}/{ordered}
                              </div>
                            </div>
                            <Input
                              className="h-8 w-20 text-right tabular-nums"
                              type="number"
                              min="0"
                              disabled={d.locked}
                              value={d.alloc[it.id] ?? 0}
                              onChange={(e) => setAlloc(d.key, it.id, parseInt(e.target.value || "0", 10))}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                );
              })}
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!balanced || drafts.length === 0 || mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
            Save carton plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
