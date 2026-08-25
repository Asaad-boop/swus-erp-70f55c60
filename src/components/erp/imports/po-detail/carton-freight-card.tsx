import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Save, Scale, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { saveCartonFreight } from "@/lib/erp/imports/imports.functions";
import { CARTON_STATUS_LABEL, fmtBdt, type ImpCartonStatus } from "@/lib/erp/imports/types";
import { BillTile } from "./atoms";

type Draft = { weight: string; freight: string };

export function CartonFreightCard({
  poId,
  poNumber,
  cartons,
  plannedShipping,
  defaultRate,
}: {
  poId: string;
  poNumber: string;
  cartons: any[];
  plannedShipping: number;
  defaultRate: number;
}) {
  const qc = useQueryClient();
  const fn = useServerFn(saveCartonFreight);

  const [rate, setRate] = useState<string>(defaultRate ? String(defaultRate) : "");
  const [note, setNote] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  const rateNum = Number(rate) || 0;

  const isBilled = (c: any) => c.shipping_freight_bdt !== null && c.shipping_freight_bdt !== undefined;

  const draftOf = (c: any): Draft =>
    drafts[c.id] ?? {
      weight: c.weight_kg ? String(c.weight_kg) : "",
      freight: isBilled(c) ? String(Number(c.shipping_freight_bdt)) : "",
    };

  const setDraft = (id: string, patch: Partial<Draft>) =>
    setDrafts((d) => ({ ...d, [id]: { ...(d[id] ?? { weight: "", freight: "" }), ...patch } }));

  const computed = (c: any) => {
    const d = draftOf(c);
    if (d.freight.trim() !== "") return Number(d.freight) || 0;
    return +((Number(d.weight) || 0) * rateNum).toFixed(2);
  };

  const billedTotal = useMemo(
    () => cartons.filter(isBilled).reduce((s, c) => s + Number(c.shipping_freight_bdt || 0), 0),
    [cartons],
  );
  const billedCount = cartons.filter(isBilled).length;
  const pendingCount = cartons.length - billedCount;
  const remainingPlanned = Math.max(0, plannedShipping - billedTotal);

  const selCartons = cartons.filter((c) => selected.has(c.id));
  const selTotal = selCartons.reduce((s, c) => s + computed(c), 0);
  const selWeight = selCartons.reduce((s, c) => s + (Number(draftOf(c).weight) || 0), 0);

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const mut = useMutation({
    mutationFn: async (clear: boolean) => {
      if (selCartons.length === 0) throw new Error("Age carton select korun");
      return await fn({
        data: {
          po_id: poId,
          clear,
          note: note || undefined,
          cartons: selCartons.map((c) => {
            const d = draftOf(c);
            return {
              carton_id: c.id,
              weight_kg: Number(d.weight) || 0,
              rate_per_kg: rateNum,
              ...(d.freight.trim() !== "" ? { freight_bdt: Number(d.freight) || 0 } : {}),
            };
          }),
        },
      });
    },
    onSuccess: (_r, clear) => {
      toast.success(clear ? "Shipping bill sorano hoyeche" : `${selCartons.length} carton-er shipping bill save holo`);
      setSelected(new Set());
      setDrafts({});
      qc.invalidateQueries({ queryKey: ["imp-po", poId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const unbilledIds = cartons.filter((c) => !isBilled(c)).map((c) => c.id);
  const arrivedIds = cartons
    .filter((c) => ["arrived_bd", "released", "in_stock"].includes(c.status))
    .map((c) => c.id);

  return (
    <Card className="overflow-hidden border-blue-200 dark:border-blue-900/40">
      <div className="p-4 border-b border-border bg-blue-50/50 dark:bg-blue-950/20">
        <div className="flex items-center gap-2">
          <Scale className="h-4 w-4 text-blue-600" />
          <h3 className="font-semibold text-sm">Carton-wise Shipping Bill (CN→BD)</h3>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Jei carton gulo eshechhe shudhu shei gulo select kore Weight × Rate/kg bill din — landed cost e shudhu oi lot-e boshbe.
          Baki carton pore ashle tokhon alada bill deben.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
          <BillTile label="PO planned shipping" value={fmtBdt(plannedShipping)} />
          <BillTile
            label={`Billed (${billedCount} carton)`}
            value={fmtBdt(billedTotal)}
            valueClass="text-blue-700 dark:text-blue-300"
          />
          <BillTile label={`Pending carton`} value={`${pendingCount}`} />
          <BillTile label="Planned baki (unbilled share)" value={fmtBdt(remainingPlanned)} />
        </div>
      </div>

      <div className="p-4 border-b border-border grid gap-3 md:grid-cols-4">
        <div>
          <Label className="text-xs">Rate (৳/KG)</Label>
          <Input type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="e.g. 750" />
        </div>
        <div className="md:col-span-2">
          <Label className="text-xs">Bill note (optional)</Label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. 17 carton shipment — bill #1" />
        </div>
        <div className="flex items-end gap-1 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => setSelected(new Set(unbilledIds))}>Unbilled</Button>
          <Button size="sm" variant="outline" onClick={() => setSelected(new Set(arrivedIds))}>Arrived</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      </div>

      <div className="divide-y divide-border max-h-[420px] overflow-auto">
        {cartons.map((c) => {
          const d = draftOf(c);
          const billed = isBilled(c);
          const meta = CARTON_STATUS_LABEL[c.status as ImpCartonStatus];
          const value = computed(c);
          const sel = selected.has(c.id);
          return (
            <div
              key={c.id}
              className={cn("px-4 py-2.5 flex items-center gap-3 flex-wrap", sel && "bg-primary/5")}
            >
              <Checkbox checked={sel} onCheckedChange={() => toggle(c.id)} aria-label="Select carton" />
              <div className="w-40 min-w-0">
                <div className="font-mono text-xs font-semibold truncate">{poNumber}-C{c.carton_number}</div>
                <div className="text-[10px] text-muted-foreground">{c.expected_quantity} pcs · {meta?.label}</div>
              </div>
              <div className="w-28">
                <Input
                  className="h-8 text-xs"
                  type="number"
                  step="0.01"
                  value={d.weight}
                  onChange={(e) => setDraft(c.id, { weight: e.target.value })}
                  placeholder="kg"
                />
              </div>
              <div className="w-32">
                <Input
                  className="h-8 text-xs"
                  type="number"
                  step="0.01"
                  value={d.freight}
                  onChange={(e) => setDraft(c.id, { freight: e.target.value })}
                  placeholder="freight ৳ (auto)"
                />
              </div>
              <div className="text-xs tabular-nums font-semibold w-24 text-right">{fmtBdt(value)}</div>
              {billed ? (
                <Badge variant="secondary" className="bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300 text-[10px]">
                  Billed {fmtBdt(c.shipping_freight_bdt)}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px]">Planned share {fmtBdt(c.cost_share_bdt ?? 0)}</Badge>
              )}
            </div>
          );
        })}
        {cartons.length === 0 && (
          <div className="p-6 text-center text-sm text-muted-foreground">Kono carton nei.</div>
        )}
      </div>

      <div className="p-4 border-t border-border flex items-center justify-between gap-3 flex-wrap bg-muted/20">
        <div className="text-xs text-muted-foreground">
          Selected: <span className="font-semibold text-foreground">{selCartons.length}</span> carton ·{" "}
          {selWeight.toFixed(2)} kg · Freight{" "}
          <span className="font-semibold tabular-nums text-foreground">{fmtBdt(selTotal)}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={mut.isPending || selCartons.length === 0}
            onClick={() => mut.mutate(true)}
          >
            <Undo2 className="h-4 w-4 mr-1" />Bill sorao
          </Button>
          <Button size="sm" disabled={mut.isPending || selCartons.length === 0} onClick={() => mut.mutate(false)}>
            {mut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save bill {selTotal > 0 ? `— ${fmtBdt(selTotal)}` : ""}
          </Button>
        </div>
      </div>
    </Card>
  );
}
