import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  adjustPart,
  bdt,
  previewLanded,
  receiveBatch,
  saveBatch,
  stockCount,
  type KigbBatch,
  type KigbPart,
} from "@/lib/erp/gift-box";

export const GIFT_BOX_QK = ["gift-box"] as const;

function useRefresh() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: GIFT_BOX_QK });
    qc.invalidateQueries({ queryKey: ["gift-box-movements"] });
  };
}

const n = (v: string) => (v.trim() === "" ? 0 : Number(v));

export function ColorDot({ color }: { color: "blue" | "pink" }) {
  return (
    <span
      className={cn(
        "inline-block h-2.5 w-2.5 rounded-full",
        color === "blue" ? "bg-sky-500" : "bg-pink-500",
      )}
      aria-hidden
    />
  );
}

/* ------------------------------------------------------------------ */
/* New / edit purchase batch                                           */
/* ------------------------------------------------------------------ */

type LineDraft = { part_id: string; qty: string; price: string; rmb: string };

export function BatchFormDialog({
  open,
  kind,
  batch,
  parts,
  onClose,
}: {
  open: boolean;
  kind: "china" | "box";
  batch: KigbBatch | null;
  parts: KigbPart[];
  onClose: () => void;
}) {
  const refresh = useRefresh();
  const allowed = useMemo(
    () => parts.filter((p) => (kind === "china" ? p.source === "china" : p.source === "local")),
    [parts, kind],
  );

  const [supplier, setSupplier] = useState("");
  const [orderedAt, setOrderedAt] = useState("");
  const [expectedAt, setExpectedAt] = useState("");
  const [rate, setRate] = useState("");
  const [chinaShip, setChinaShip] = useState("");
  const [cargo, setCargo] = useState("");
  const [agent, setAgent] = useState("");
  const [other, setOther] = useState("");
  const [allocation, setAllocation] = useState<"value" | "qty">("value");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([]);

  useEffect(() => {
    if (!open) return;
    if (batch) {
      setSupplier(batch.supplier ?? "");
      setOrderedAt(batch.ordered_at ?? "");
      setExpectedAt(batch.expected_at ?? "");
      setRate(batch.rmb_rate ? String(batch.rmb_rate) : "");
      setChinaShip(String(batch.china_shipping_bdt || ""));
      setCargo(String(batch.cargo_bdt || ""));
      setAgent(String(batch.agent_fee_bdt || ""));
      setOther(String(batch.other_cost_bdt || ""));
      setAllocation(batch.allocation);
      setNotes(batch.notes ?? "");
      setLines(
        batch.lines.map((l) => ({
          part_id: l.part_id,
          qty: String(l.ordered_qty),
          price: String(l.unit_price_bdt),
          rmb: l.unit_price_rmb ? String(l.unit_price_rmb) : "",
        })),
      );
    } else {
      setSupplier("");
      setOrderedAt(new Date().toISOString().slice(0, 10));
      setExpectedAt("");
      setRate("");
      setChinaShip("");
      setCargo("");
      setAgent("");
      setOther("");
      setAllocation("value");
      setNotes("");
      setLines(allowed.map((p) => ({ part_id: p.id, qty: "", price: "", rmb: "" })));
    }
  }, [open, batch?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const goods = lines.reduce((s, l) => s + n(l.qty) * n(l.price), 0);
  const extras = n(chinaShip) + n(cargo) + n(agent) + n(other);
  const units = lines.reduce((s, l) => s + n(l.qty), 0);

  const setLine = (i: number, patch: Partial<LineDraft>) =>
    setLines((prev) =>
      prev.map((l, idx) => {
        if (idx !== i) return l;
        const next = { ...l, ...patch };
        // RMB helper: price = rmb × rate
        if (patch.rmb !== undefined && n(rate) > 0 && patch.rmb.trim() !== "") {
          next.price = String(Math.round(n(patch.rmb) * n(rate) * 100) / 100);
        }
        return next;
      }),
    );

  const save = useMutation({
    mutationFn: async () => {
      const clean = lines.filter((l) => l.part_id && n(l.qty) > 0);
      if (clean.length === 0) throw new Error("Kom pokkhe 1ta item er quantity din");
      return saveBatch({
        id: batch?.id,
        kind,
        supplier,
        ordered_at: orderedAt || undefined,
        expected_at: expectedAt || undefined,
        rmb_rate: n(rate) || null,
        china_shipping_bdt: n(chinaShip),
        cargo_bdt: n(cargo),
        agent_fee_bdt: n(agent),
        other_cost_bdt: n(other),
        allocation,
        notes,
        lines: clean.map((l) => ({
          part_id: l.part_id,
          ordered_qty: Math.round(n(l.qty)),
          unit_price_bdt: n(l.price),
          unit_price_rmb: n(l.rmb) || null,
        })),
      });
    },
    onSuccess: () => {
      toast.success(batch ? "Batch updated" : "Purchase saved");
      refresh();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const partName = (id: string) => parts.find((p) => p.id === id)?.name ?? "—";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !save.isPending && onClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {batch
              ? `Edit ${batch.batch_no}`
              : kind === "china"
                ? "New China shipment"
                : "New box order"}
          </DialogTitle>
          <DialogDescription>
            {kind === "china"
              ? "Mat, tasbeeh, camera — 1688 dam + China shipping + cargo + agent fee. Shob khoroch receive er somoy per unit e bhag hobe."
              : "Bangladesh e box order. Receive er somoy koto ta bhalo elo seta diben — damage er khoroch bhalo box gulor dame dhukbe."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-3">
              <Label>Supplier / agent</Label>
              <Input
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                placeholder={kind === "china" ? "1688 shop / agent name" : "Box factory name"}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Order date</Label>
              <Input type="date" value={orderedAt} onChange={(e) => setOrderedAt(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Expected arrival</Label>
              <Input
                type="date"
                value={expectedAt}
                onChange={(e) => setExpectedAt(e.target.value)}
              />
            </div>
            {kind === "china" && (
              <div className="space-y-1.5">
                <Label>RMB rate (optional)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  placeholder="e.g. 17.2"
                />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Items</Label>
            <div className="rounded-lg border divide-y">
              <div className="hidden sm:grid grid-cols-[1fr_90px_90px_110px_100px_32px] gap-2 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <span>Part</span>
                <span>Qty</span>
                {kind === "china" ? <span>RMB / pc</span> : <span />}
                <span>৳ / pc</span>
                <span className="text-right">Line</span>
                <span />
              </div>
              {lines.map((l, i) => (
                <div
                  key={i}
                  className="grid grid-cols-2 sm:grid-cols-[1fr_90px_90px_110px_100px_32px] gap-2 px-3 py-2 items-center"
                >
                  <Select value={l.part_id} onValueChange={(v) => setLine(i, { part_id: v })}>
                    <SelectTrigger className="h-9 col-span-2 sm:col-span-1">
                      <SelectValue placeholder="Part">{partName(l.part_id)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {allowed.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min={0}
                    className="h-9"
                    placeholder="Qty"
                    value={l.qty}
                    onChange={(e) => setLine(i, { qty: e.target.value })}
                  />
                  {kind === "china" ? (
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      className="h-9"
                      placeholder="RMB"
                      value={l.rmb}
                      onChange={(e) => setLine(i, { rmb: e.target.value })}
                    />
                  ) : (
                    <span className="hidden sm:block" />
                  )}
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    className="h-9"
                    placeholder="৳"
                    value={l.price}
                    onChange={(e) => setLine(i, { price: e.target.value })}
                  />
                  <span className="text-right text-sm tabular-nums">
                    {bdt(n(l.qty) * n(l.price))}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))}
                    aria-label="Remove line"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setLines((p) => [
                  ...p,
                  { part_id: allowed[0]?.id ?? "", qty: "", price: "", rmb: "" },
                ])
              }
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Add line
            </Button>
          </div>

          <div className="space-y-2">
            <Label>Extra costs (BDT) — spread over the items on receive</Label>
            <div className="grid gap-3 sm:grid-cols-4">
              {kind === "china" && (
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">China shipping</span>
                  <Input
                    type="number"
                    min={0}
                    value={chinaShip}
                    onChange={(e) => setChinaShip(e.target.value)}
                  />
                </div>
              )}
              {kind === "china" && (
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Cargo (BD)</span>
                  <Input
                    type="number"
                    min={0}
                    value={cargo}
                    onChange={(e) => setCargo(e.target.value)}
                  />
                </div>
              )}
              {kind === "china" && (
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Agent fee</span>
                  <Input
                    type="number"
                    min={0}
                    value={agent}
                    onChange={(e) => setAgent(e.target.value)}
                  />
                </div>
              )}
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">
                  {kind === "china" ? "Other" : "Transport / other"}
                </span>
                <Input
                  type="number"
                  min={0}
                  value={other}
                  onChange={(e) => setOther(e.target.value)}
                />
              </div>
            </div>
            {kind === "china" && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Split extra costs by</span>
                <Select
                  value={allocation}
                  onValueChange={(v) => setAllocation(v as "value" | "qty")}
                >
                  <SelectTrigger className="h-8 w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="value">Item value (recommended)</SelectItem>
                    <SelectItem value="qty">Quantity (equal per piece)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="rounded-lg bg-muted/50 p-3 text-sm grid grid-cols-3 gap-2">
            <div>
              <div className="text-xs text-muted-foreground">Goods</div>
              <div className="font-semibold tabular-nums">{bdt(goods)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Extra costs</div>
              <div className="font-semibold tabular-nums">{bdt(extras)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">
                Total · {units.toLocaleString()} pcs
              </div>
              <div className="font-bold tabular-nums">{bdt(goods + extras)}</div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {batch ? "Save changes" : "Save purchase"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Receive + QC                                                        */
/* ------------------------------------------------------------------ */

type RecvDraft = { paid: string; received: string; good: string; damaged: string; note: string };

export function ReceiveDialog({
  batch,
  parts,
  onClose,
}: {
  batch: KigbBatch | null;
  parts: KigbPart[];
  onClose: () => void;
}) {
  const refresh = useRefresh();
  const [draft, setDraft] = useState<Record<string, RecvDraft>>({});

  useEffect(() => {
    if (!batch) return;
    const d: Record<string, RecvDraft> = {};
    for (const l of batch.lines) {
      d[l.id] = {
        paid: String(l.ordered_qty),
        received: String(l.ordered_qty),
        good: String(l.ordered_qty),
        damaged: "0",
        note: "",
      };
    }
    setDraft(d);
  }, [batch?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (id: string, patch: Partial<RecvDraft>) =>
    setDraft((prev) => {
      const cur = { ...prev[id], ...patch };
      // keep good = received − damaged while the user edits received/damaged
      if (patch.received !== undefined || patch.damaged !== undefined) {
        cur.good = String(Math.max(0, n(cur.received) - n(cur.damaged)));
      }
      return { ...prev, [id]: cur };
    });

  const preview = useMemo(() => {
    if (!batch) return {};
    return previewLanded(
      batch,
      batch.lines.map((l) => ({
        key: l.id,
        paid: n(draft[l.id]?.paid ?? "0"),
        received: n(draft[l.id]?.received ?? "0"),
        good: n(draft[l.id]?.good ?? "0"),
        unit: l.unit_price_bdt,
      })),
    );
  }, [batch, draft]);

  const errors = batch
    ? batch.lines.filter((l) => {
        const d = draft[l.id];
        if (!d) return true;
        return n(d.good) + n(d.damaged) > n(d.received) || n(d.received) < 0;
      }).length
    : 0;

  const recv = useMutation({
    mutationFn: async () => {
      if (!batch) return;
      await receiveBatch(
        batch.id,
        batch.lines.map((l) => {
          const d = draft[l.id];
          return {
            id: l.id,
            paid_qty: Math.round(n(d.paid)),
            received_qty: Math.round(n(d.received)),
            good_qty: Math.round(n(d.good)),
            damaged_qty: Math.round(n(d.damaged)),
            qc_note: d.note,
          };
        }),
      );
    },
    onSuccess: () => {
      toast.success("Received — stock & cost updated");
      refresh();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const partName = (id: string) => parts.find((p) => p.id === id)?.name ?? "—";
  const extras = batch
    ? batch.china_shipping_bdt + batch.cargo_bdt + batch.agent_fee_bdt + batch.other_cost_bdt
    : 0;

  return (
    <Dialog open={!!batch} onOpenChange={(o) => !o && !recv.isPending && onClose()}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Receive & QC · {batch?.batch_no}</DialogTitle>
          <DialogDescription>
            Mal gune check korun. <b>Paid</b> = joto pcs er taka diyechen, <b>Received</b> = joto
            pcs eseche, <b>Damaged</b> = QC te baad. Shudhu bhalo pcs stock e jabe; damage er taka
            bhalo pcs gulor dame bhag hobe.
          </DialogDescription>
        </DialogHeader>

        {batch && (
          <div className="space-y-3">
            <div className="rounded-lg border divide-y text-sm">
              <div className="hidden md:grid grid-cols-[1.4fr_80px_80px_80px_80px_1fr_110px] gap-2 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <span>Part · ordered</span>
                <span>Paid</span>
                <span>Received</span>
                <span>Damaged</span>
                <span>Good</span>
                <span>QC note</span>
                <span className="text-right">Landed / pc</span>
              </div>
              {batch.lines.map((l) => {
                const d = draft[l.id];
                if (!d) return null;
                const bad = n(d.good) + n(d.damaged) > n(d.received);
                return (
                  <div
                    key={l.id}
                    className="grid grid-cols-2 md:grid-cols-[1.4fr_80px_80px_80px_80px_1fr_110px] gap-2 px-3 py-2 items-center"
                  >
                    <div className="col-span-2 md:col-span-1">
                      <div className="font-medium">{partName(l.part_id)}</div>
                      <div className="text-xs text-muted-foreground">
                        {l.ordered_qty.toLocaleString()} × {bdt(l.unit_price_bdt, 2)}
                      </div>
                    </div>
                    <Input
                      type="number"
                      min={0}
                      className="h-9"
                      aria-label="Paid qty"
                      value={d.paid}
                      onChange={(e) => set(l.id, { paid: e.target.value })}
                    />
                    <Input
                      type="number"
                      min={0}
                      className="h-9"
                      aria-label="Received qty"
                      value={d.received}
                      onChange={(e) => set(l.id, { received: e.target.value })}
                    />
                    <Input
                      type="number"
                      min={0}
                      className={cn("h-9", n(d.damaged) > 0 && "border-amber-400")}
                      aria-label="Damaged qty"
                      value={d.damaged}
                      onChange={(e) => set(l.id, { damaged: e.target.value })}
                    />
                    <Input
                      type="number"
                      min={0}
                      className={cn("h-9", bad && "border-destructive")}
                      aria-label="Good qty"
                      value={d.good}
                      onChange={(e) => set(l.id, { good: e.target.value })}
                    />
                    <Input
                      className="h-9 col-span-2 md:col-span-1"
                      placeholder="e.g. 12 rong mile na"
                      value={d.note}
                      onChange={(e) => set(l.id, { note: e.target.value })}
                    />
                    <div className="text-right font-semibold tabular-nums col-span-2 md:col-span-1">
                      {bdt(preview[l.id]?.landed ?? 0, 2)}
                      {(preview[l.id]?.alloc ?? 0) > 0 && (
                        <div className="text-[10px] font-normal text-muted-foreground">
                          incl. {bdt(preview[l.id].alloc)} extra
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              Extra costs on this batch: {bdt(extras)} · split by{" "}
              {batch.allocation === "qty" ? "quantity" : "item value"}.
              {errors > 0 && (
                <span className="text-destructive font-medium">
                  {" "}
                  Good + damaged can't be more than received.
                </span>
              )}
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={recv.isPending}>
            Cancel
          </Button>
          <Button onClick={() => recv.mutate()} disabled={recv.isPending || errors > 0}>
            {recv.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Confirm receive
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Damage / lost / found / adjust / opening                            */
/* ------------------------------------------------------------------ */

export type AdjustMode = "damage" | "lost" | "found" | "adjust" | "opening";

const ADJUST_COPY: Record<AdjustMode, { title: string; desc: string; cta: string }> = {
  damage: {
    title: "Report damage",
    desc: "Gudam e bhenge geche / QC fail — stock theke baad hobe, khoroch loss hisebe.",
    cta: "Remove from stock",
  },
  lost: {
    title: "Report lost",
    desc: "Hariye geche / khuje paowa jacche na.",
    cta: "Remove from stock",
  },
  found: {
    title: "Found stock",
    desc: "Hariye jaowa mal pawa geche — current average cost e stock e jog hobe.",
    cta: "Add to stock",
  },
  adjust: {
    title: "Manual adjustment",
    desc: "+ diye barabe, − diye komabe. Count er jonno 'Physical count' use korun.",
    cta: "Save adjustment",
  },
  opening: {
    title: "Opening stock",
    desc: "Ekhon gudam e ja ache tar quantity ar per pc khoroch (landed) din — ekbar shuru korar jonno.",
    cta: "Add opening stock",
  },
};

export function AdjustDialog({
  mode,
  parts,
  onClose,
}: {
  mode: AdjustMode | null;
  parts: KigbPart[];
  onClose: () => void;
}) {
  const refresh = useRefresh();
  const [partId, setPartId] = useState("");
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!mode) return;
    setPartId(parts[0]?.id ?? "");
    setQty("");
    setCost("");
    setNote("");
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const m = useMutation({
    mutationFn: async () => {
      if (!mode) return;
      const q = Math.round(n(qty));
      if (!partId || q === 0) throw new Error("Part ar quantity din");
      if ((mode === "damage" || mode === "lost") && !note.trim())
        throw new Error("Ki hoyeche seta note e likhun");
      await adjustPart({
        partId,
        delta:
          mode === "damage" || mode === "lost" ? -Math.abs(q) : mode === "adjust" ? q : Math.abs(q),
        reason: mode,
        unitCost: mode === "opening" ? n(cost) : null,
        note,
      });
    },
    onSuccess: () => {
      toast.success("Stock updated");
      refresh();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!mode) return null;
  const copy = ADJUST_COPY[mode];
  const part = parts.find((p) => p.id === partId);

  return (
    <Dialog open={!!mode} onOpenChange={(o) => !o && !m.isPending && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.desc}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Part</Label>
            <Select value={partId} onValueChange={setPartId}>
              <SelectTrigger>
                <SelectValue>{part?.name ?? "Part"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {parts.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} · {p.on_hand.toLocaleString()} in stock
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{mode === "adjust" ? "Change (+/−)" : "Quantity"}</Label>
              <Input type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
            {mode === "opening" && (
              <div className="space-y-1.5">
                <Label>Cost per pc (৳)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                />
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Note</Label>
            <Textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={mode === "damage" ? "e.g. 5 ta camera lens bhanga" : ""}
            />
          </div>
          {part && (mode === "damage" || mode === "lost") && n(qty) > 0 && (
            <p className="text-xs text-muted-foreground">
              Loss value ≈ {bdt(Math.abs(n(qty)) * part.wac)} ({bdt(part.wac, 2)} / pc)
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={m.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => m.mutate()}
            disabled={m.isPending}
            variant={mode === "damage" || mode === "lost" ? "destructive" : "default"}
          >
            {m.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {copy.cta}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Physical count (all 8 parts at once)                                */
/* ------------------------------------------------------------------ */

export function CountDialog({
  open,
  parts,
  onClose,
}: {
  open: boolean;
  parts: KigbPart[];
  onClose: () => void;
}) {
  const refresh = useRefresh();
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [costs, setCosts] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) return;
    setCounts({});
    setCosts({});
    setNote("");
  }, [open]);

  const m = useMutation({
    mutationFn: async () => {
      const rows = parts
        .filter((p) => (counts[p.id] ?? "").trim() !== "")
        .map((p) => ({
          part_id: p.id,
          counted: Math.round(n(counts[p.id])),
          unit_cost: n(costs[p.id] ?? "") || null,
        }));
      if (rows.length === 0) throw new Error("Kom pokkhe 1ta part er count din");
      const missingCost = rows.find((r) => {
        const p = parts.find((x) => x.id === r.part_id)!;
        return r.counted > p.on_hand && p.wac === 0 && !r.unit_cost;
      });
      if (missingCost) throw new Error("Jei part er cost ekhono nai, tar per pc cost din");
      return stockCount(rows, note || undefined);
    },
    onSuccess: (changed) => {
      toast.success(
        changed ? `${changed} part adjusted to the count` : "Count matches — no change",
      );
      refresh();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !m.isPending && onClose()}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Physical count</DialogTitle>
          <DialogDescription>
            Gudam e gune ja pelen likhun. System er sathe parthokko adjustment hisebe jabe. Faka
            rakhle oi part bodlabe na.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border divide-y">
          <div className="grid grid-cols-[1fr_90px_100px_110px] gap-2 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Part</span>
            <span className="text-right">System</span>
            <span>Counted</span>
            <span>Cost / pc*</span>
          </div>
          {parts.map((p) => {
            const c = counts[p.id] ?? "";
            const diff = c.trim() === "" ? null : Math.round(n(c)) - p.on_hand;
            return (
              <div
                key={p.id}
                className="grid grid-cols-[1fr_90px_100px_110px] gap-2 px-3 py-2 items-center text-sm"
              >
                <span className="flex items-center gap-2">
                  <ColorDot color={p.color} />
                  {p.name}
                </span>
                <span className="text-right tabular-nums">
                  {p.on_hand.toLocaleString()}
                  {diff != null && diff !== 0 && (
                    <span
                      className={cn(
                        "block text-[10px]",
                        diff > 0 ? "text-emerald-600" : "text-destructive",
                      )}
                    >
                      {diff > 0 ? "+" : ""}
                      {diff}
                    </span>
                  )}
                </span>
                <Input
                  type="number"
                  min={0}
                  className="h-9"
                  value={c}
                  onChange={(e) => setCounts((s) => ({ ...s, [p.id]: e.target.value }))}
                />
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  className="h-9"
                  placeholder={p.wac > 0 ? p.wac.toFixed(2) : "required"}
                  value={costs[p.id] ?? ""}
                  onChange={(e) => setCosts((s) => ({ ...s, [p.id]: e.target.value }))}
                />
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          * Cost lagbe shudhu jokhon stock barche ar oi part er kono cost ekhono nai (prothom bar).
        </p>
        <div className="space-y-1.5">
          <Label>Note</Label>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Month-end count"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={m.isPending}>
            Cancel
          </Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending}>
            {m.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Apply count
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
