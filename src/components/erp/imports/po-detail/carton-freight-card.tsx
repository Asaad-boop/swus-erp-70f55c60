import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Save, Scale, Undo2, Receipt, Clock3, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { saveCartonFreight } from "@/lib/erp/imports/imports.functions";
import { CARTON_STATUS_LABEL, fmtBdt, fmtBdtShort, type ImpCartonStatus } from "@/lib/erp/imports/types";
import { BillTile } from "./atoms";

type Draft = { weight: string; freight: string };
type Mode = "rate" | "total";

/** Group carton numbers into a compact range string: 1,2,3,7 -> "1–3, 7" */
function rangeLabel(nums: number[]) {
  const s = [...nums].sort((a, b) => a - b);
  const out: string[] = [];
  let i = 0;
  while (i < s.length) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    out.push(i === j ? `${s[i]}` : `${s[i]}–${s[j]}`);
    i = j + 1;
  }
  return out.join(", ");
}

export function CartonFreightCard({
  poId,
  poNumber,
  cartons,
  plannedShipping,
  defaultRate,
  poWeightKg = 0,
}: {
  poId: string;
  poNumber: string;
  cartons: any[];
  plannedShipping: number;
  defaultRate: number;
  poWeightKg?: number;
}) {
  const qc = useQueryClient();
  const fn = useServerFn(saveCartonFreight);

  // PO-te already rate boshano thakle rate mode, shudhu total amount thakle total mode.
  const [mode, setMode] = useState<Mode>(defaultRate > 0 ? "rate" : plannedShipping > 0 ? "total" : "rate");
  const [rate, setRate] = useState<string>(defaultRate ? String(defaultRate) : "");
  const [lump, setLump] = useState<string>("");
  const [note, setNote] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});


  const rateNum = Number(rate) || 0;
  const lumpNum = Number(lump) || 0;

  const isBilled = (c: any) => c.shipping_freight_bdt !== null && c.shipping_freight_bdt !== undefined;

  const draftOf = (c: any): Draft =>
    drafts[c.id] ?? {
      weight: c.weight_kg ? String(c.weight_kg) : "",
      freight: isBilled(c) ? String(Number(c.shipping_freight_bdt)) : "",
    };

  const setDraft = (id: string, patch: Partial<Draft>) =>
    setDrafts((d) => ({ ...d, [id]: { ...(d[id] ?? { weight: "", freight: "" }), ...patch } }));

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const selCartons = useMemo(() => cartons.filter((c) => selected.has(c.id)), [cartons, selected]);

  /** In total-mode, distribute the lump amount across selected cartons by weight (fallback: equal). */
  const lumpShares = useMemo(() => {
    const map: Record<string, number> = {};
    if (mode !== "total" || selCartons.length === 0 || lumpNum <= 0) return map;
    const weights = selCartons.map((c) => Number(draftOf(c).weight) || 0);
    const wSum = weights.reduce((s, w) => s + w, 0);
    let acc = 0;
    selCartons.forEach((c, i) => {
      const share =
        wSum > 0 ? (lumpNum * weights[i]) / wSum : lumpNum / selCartons.length;
      const v = i === selCartons.length - 1 ? +(lumpNum - acc).toFixed(2) : +share.toFixed(2);
      acc += v;
      map[c.id] = v;
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, lumpNum, selCartons, drafts]);

  const computed = (c: any) => {
    const d = draftOf(c);
    if (mode === "total" && selected.has(c.id)) return lumpShares[c.id] ?? 0;
    if (d.freight.trim() !== "") return Number(d.freight) || 0;
    return +((Number(d.weight) || 0) * rateNum).toFixed(2);
  };

  const billedCartons = useMemo(() => cartons.filter(isBilled), [cartons]);
  const pendingCartons = useMemo(() => cartons.filter((c) => !isBilled(c)), [cartons]);
  const billedTotal = billedCartons.reduce((s, c) => s + Number(c.shipping_freight_bdt || 0), 0);
  const remainingPlanned = Math.max(0, plannedShipping - billedTotal);

  /** Bill batches = group billed cartons by (note + billed date-time to the minute). */
  const bills = useMemo(() => {
    const groups = new Map<string, { key: string; note: string | null; at: string | null; nums: number[]; total: number; kg: number }>();
    for (const c of billedCartons) {
      const at = c.shipping_billed_at ? String(c.shipping_billed_at).slice(0, 16) : "";
      const key = `${c.shipping_note ?? ""}|${at}`;
      const g = groups.get(key) ?? { key, note: c.shipping_note ?? null, at: c.shipping_billed_at ?? null, nums: [] as number[], total: 0, kg: 0 };
      g.nums.push(Number(c.carton_number));
      g.total += Number(c.shipping_freight_bdt || 0);
      g.kg += Number(c.weight_kg || 0);
      groups.set(key, g);
    }
    return [...groups.values()]
      .sort((a, b) => String(a.at ?? "").localeCompare(String(b.at ?? "")))
      .map((g, i) => ({ ...g, no: i + 1 }));
  }, [billedCartons]);

  /** carton id -> bill no (kon bill-e ache) */
  const billNoOf = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of billedCartons) {
      const at = c.shipping_billed_at ? String(c.shipping_billed_at).slice(0, 16) : "";
      const key = `${c.shipping_note ?? ""}|${at}`;
      const b = bills.find((x) => x.key === key);
      if (b) map[c.id] = b.no;
    }
    return map;
  }, [billedCartons, bills]);

  const selTotal = selCartons.reduce((s, c) => s + computed(c), 0);
  const selWeight = selCartons.reduce((s, c) => s + (Number(draftOf(c).weight) || 0), 0);
  const selNums = selCartons.map((c) => Number(c.carton_number));

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
            const w = Number(d.weight) || 0;
            const explicit =
              mode === "total"
                ? lumpShares[c.id] ?? 0
                : d.freight.trim() !== ""
                  ? Number(d.freight) || 0
                  : undefined;
            return {
              carton_id: c.id,
              weight_kg: w,
              rate_per_kg: mode === "total" ? (w > 0 ? +((explicit ?? 0) / w).toFixed(4) : 0) : rateNum,
              ...(explicit !== undefined ? { freight_bdt: explicit } : {}),
            };
          }),
        },
      });
    },
    onSuccess: (_r, clear) => {
      toast.success(
        clear
          ? `${selCartons.length} carton-er shipping bill sorano hoyeche`
          : `CTN ${rangeLabel(selNums)} — ${selCartons.length} carton · ${fmtBdt(selTotal)} bill save holo`,
      );
      setSelected(new Set());
      setDrafts({});
      setLump("");
      qc.invalidateQueries({ queryKey: ["imp-po", poId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const unbilledIds = pendingCartons.map((c) => c.id);
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
          Jei carton gulo eshechhe shudhu shei gulo select korun — total shipping charge othoba rate/kg diye bill hobe.
          Baki carton pore ashle tokhon alada bill deben; ekhane pending list-e thakbe.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
          <BillTile
            label="PO planned shipping"
            value={fmtBdtShort(plannedShipping)}
            hint={plannedShipping >= 1000 ? fmtBdt(plannedShipping) : undefined}
            title={fmtBdt(plannedShipping)}
          />
          <BillTile
            label={`Billed — ${billedCartons.length} carton`}
            value={fmtBdtShort(billedTotal)}
            hint={billedTotal >= 1000 ? fmtBdt(billedTotal) : undefined}
            title={fmtBdt(billedTotal)}
            valueClass="text-blue-700 dark:text-blue-300"
          />
          <BillTile
            label="Pending carton (pore bill hobe)"
            value={pendingCartons.length ? `${pendingCartons.length} carton` : "0"}
            hint={pendingCartons.length ? `CTN ${rangeLabel(pendingCartons.map((c) => Number(c.carton_number)))}` : undefined}
            valueClass={pendingCartons.length ? "text-amber-700 dark:text-amber-300" : undefined}
          />
          <BillTile
            label="Planned baki (unbilled share)"
            value={fmtBdtShort(remainingPlanned)}
            hint={remainingPlanned >= 1000 ? fmtBdt(remainingPlanned) : undefined}
            title={fmtBdt(remainingPlanned)}
          />
        </div>
      </div>

      {/* Bill history */}
      {bills.length > 0 && (
        <div className="px-4 py-3 border-b border-border bg-muted/20 space-y-1.5">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Receipt className="h-3.5 w-3.5" /> Shipping bills ({bills.length})
          </div>
          {bills.map((b) => (
            <div
              key={b.key}
              className="flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-lg border border-blue-100 bg-background/80 px-3 py-2 text-xs shadow-sm dark:border-blue-900/40"
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-blue-600 shrink-0" />
              <Badge className="bg-blue-600 text-white hover:bg-blue-600 text-[10px] px-1.5">Bill #{b.no}</Badge>
              <span
                className="text-sm font-bold tabular-nums text-blue-700 dark:text-blue-300"
                title={fmtBdt(b.total)}
              >
                {fmtBdtShort(b.total)}
              </span>
              <span className="text-muted-foreground/60">·</span>
              <span className="font-medium">{b.nums.length} carton</span>
              <Badge variant="outline" className="font-mono text-[10px]">CTN {rangeLabel(b.nums)}</Badge>
              {b.kg > 0 && (
                <span className="tabular-nums text-muted-foreground">
                  {b.kg.toFixed(2)} kg
                  <span className="text-muted-foreground/70"> · ≈{fmtBdt(+(b.total / b.kg).toFixed(2))}/kg</span>
                </span>
              )}
              {b.kg <= 0 && (
                <span className="text-[10px] italic text-amber-600 dark:text-amber-400">kg deya hoy nai</span>
              )}
              {b.note && <span className="truncate text-muted-foreground">“{b.note}”</span>}
              {b.at && (
                <span className="ml-auto text-[10px] text-muted-foreground">
                  {new Date(b.at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Charge input */}
      <div className="p-4 border-b border-border space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Charge type:</span>
          {([
            { v: "total" as const, label: "Total shipping amount" },
            { v: "rate" as const, label: "Rate per KG" },
          ]).map((o) => (
            <button
              key={o.v}
              type="button"
              onClick={() => setMode(o.v)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition",
                mode === o.v ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>

        {(plannedShipping > 0 || defaultRate > 0 || poWeightKg > 0) && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-blue-200 bg-blue-50/60 px-3 py-2 text-[11px] dark:border-blue-900/40 dark:bg-blue-950/20">
            <span className="text-muted-foreground">
              Ei PO-te already shipping boshano ache
              {poWeightKg > 0 ? ` — ${poWeightKg} kg` : ""}
              {defaultRate > 0 ? ` · ${fmtBdt(defaultRate)}/kg` : ""}
              {plannedShipping > 0 ? ` · total ${fmtBdt(plannedShipping)}` : ""}
              {billedTotal > 0 ? ` (billed ${fmtBdt(billedTotal)}, baki ${fmtBdt(remainingPlanned)})` : ""}.
            </span>
            {remainingPlanned > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[11px]"
                onClick={() => { setMode("total"); setLump(String(remainingPlanned)); setSelected(new Set(unbilledIds)); }}
              >
                Baki {fmtBdt(remainingPlanned)} unbilled carton-e bhag koro
              </Button>
            )}
            {defaultRate > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[11px]"
                onClick={() => { setMode("rate"); setRate(String(defaultRate)); }}
              >
                PO rate use koro
              </Button>
            )}
            {poWeightKg > 0 && cartons.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[11px]"
                onClick={() =>
                  setDrafts((d) => {
                    const per = +(poWeightKg / cartons.length).toFixed(3);
                    const n = { ...d };
                    cartons.forEach((c) => { n[c.id] = { ...(n[c.id] ?? draftOf(c)), weight: String(per) }; });
                    return n;
                  })
                }
              >
                Weight shoman bhag ({(poWeightKg / Math.max(1, cartons.length)).toFixed(2)} kg/ctn)
              </Button>
            )}
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-4">
          {mode === "total" ? (
            <div>
              <Label className="text-xs">Total shipping charge (৳)</Label>
              <Input
                type="number"
                step="0.01"
                value={lump}
                onChange={(e) => setLump(e.target.value)}
                placeholder="e.g. 125000"
              />
              <p className="mt-1 text-[10px] text-muted-foreground">
                Selected carton-e weight onujayi bhag hobe (weight na thakle shoman bhag).
              </p>
            </div>
          ) : (
            <div>
              <Label className="text-xs">Rate (৳/KG)</Label>
              <Input type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="e.g. 750" />
            </div>
          )}
          <div className="md:col-span-2">
            <Label className="text-xs">Bill note (optional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. 1st shipment — 10 carton" />
          </div>
          <div className="flex items-end gap-1 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => setSelected(new Set(unbilledIds))}>Unbilled</Button>
            <Button size="sm" variant="outline" onClick={() => setSelected(new Set(arrivedIds))}>Arrived</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
          </div>
        </div>
      </div>

      {pendingCartons.length > 0 && (
        <div className="px-4 py-2 border-b border-border flex items-center gap-2 text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50/60 dark:bg-amber-950/20">
          <Clock3 className="h-3.5 w-3.5" />
          {pendingCartons.length} carton ekhono bill kora hoy nai (CTN {rangeLabel(pendingCartons.map((c) => Number(c.carton_number)))}) — pore alada bill dite parben.
        </div>
      )}

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
                  value={mode === "total" && sel ? String(lumpShares[c.id] ?? 0) : d.freight}
                  disabled={mode === "total" && sel}
                  onChange={(e) => setDraft(c.id, { freight: e.target.value })}
                  placeholder="freight ৳ (auto)"
                />
              </div>
              <div className="text-xs tabular-nums font-semibold w-24 text-right">{fmtBdt(value)}</div>
              {billed ? (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge variant="secondary" className="bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300 text-[10px]">
                    Billed {fmtBdt(c.shipping_freight_bdt)}
                  </Badge>
                  {billNoOf[c.id] && (
                    <Badge className="bg-blue-600 text-white hover:bg-blue-600 text-[10px] px-1.5">Bill #{billNoOf[c.id]}</Badge>
                  )}
                  {c.shipping_note && (
                    <span className="text-[10px] text-muted-foreground truncate max-w-[160px]">“{c.shipping_note}”</span>
                  )}
                </div>
              ) : (
                <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 dark:text-amber-300">
                  Pending · planned {fmtBdt(c.cost_share_bdt ?? 0)}
                </Badge>
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
          Selected: <span className="font-semibold text-foreground">{selCartons.length}</span> carton
          {selNums.length > 0 && <> (<span className="font-mono text-foreground">CTN {rangeLabel(selNums)}</span>)</>} ·{" "}
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
            Save bill {selTotal > 0 ? `— ${fmtBdt(selTotal)} / ${selCartons.length} ctn` : ""}
          </Button>
        </div>
      </div>
    </Card>
  );
}
