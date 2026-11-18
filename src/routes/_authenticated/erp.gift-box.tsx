import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  AlertTriangle,
  Boxes,
  ClipboardCheck,
  Gift,
  Loader2,
  PackageMinus,
  PackagePlus,
  Pencil,
  Plane,
  Plus,
  Search,
  Ship,
  Truck,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  bdt,
  fetchGiftBox,
  fetchMovements,
  PART_LABEL,
  REASON_LABEL,
  setBatchStatus,
  updateSettings,
  type Color,
  type KigbBatch,
  type KigbPart,
  type KigbSettings,
} from "@/lib/erp/gift-box";
import {
  AdjustDialog,
  BatchFormDialog,
  ColorDot,
  CountDialog,
  GIFT_BOX_QK,
  ReceiveDialog,
  type AdjustMode,
} from "@/components/erp/gift-box/gift-box-dialogs";

export const Route = createFileRoute("/_authenticated/erp/gift-box")({
  head: () => ({ meta: [{ title: "Islamic Gift Box — Costing & Stock" }] }),
  component: GiftBoxPage,
});

const STATUS_TONE: Record<KigbBatch["status"], string> = {
  ordered: "bg-slate-500/10 text-slate-700 border-slate-300 dark:text-slate-300",
  in_transit: "bg-sky-500/10 text-sky-700 border-sky-300 dark:text-sky-300",
  received: "bg-emerald-500/10 text-emerald-700 border-emerald-300 dark:text-emerald-300",
  cancelled: "bg-rose-500/10 text-rose-700 border-rose-300 dark:text-rose-300",
};
const STATUS_LABEL: Record<KigbBatch["status"], string> = {
  ordered: "Ordered",
  in_transit: "In transit",
  received: "Received",
  cancelled: "Cancelled",
};

function setCost(parts: KigbPart[], color: Color) {
  return parts.filter((p) => p.color === color).reduce((s, p) => s + p.wac, 0);
}
function canMake(parts: KigbPart[], color: Color) {
  const cp = parts.filter((p) => p.color === color);
  if (cp.length === 0) return { sets: 0, limiting: null as KigbPart | null };
  const limiting = cp.reduce((a, b) => (b.on_hand < a.on_hand ? b : a));
  return { sets: Math.max(0, limiting.on_hand), limiting };
}

function GiftBoxPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: GIFT_BOX_QK,
    queryFn: fetchGiftBox,
    refetchInterval: 60_000,
  });
  const parts = data?.parts ?? [];
  const settings = data?.settings ?? null;
  const batches = data?.batches ?? [];

  const [tab, setTab] = useState("overview");
  const [batchForm, setBatchForm] = useState<{
    kind: "china" | "box";
    batch: KigbBatch | null;
  } | null>(null);
  const [receiving, setReceiving] = useState<KigbBatch | null>(null);
  const [adjust, setAdjust] = useState<AdjustMode | null>(null);
  const [counting, setCounting] = useState(false);

  const needsSetup = parts.length > 0 && parts.every((p) => p.wac === 0);

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1400px] mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Gift className="h-6 w-6 text-primary" /> Islamic Gift Box
          </h1>
          <p className="text-sm text-muted-foreground">
            Costing · parts stock · purchases & QC — Toyora
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setBatchForm({ kind: "box", batch: null })}>
            <Truck className="h-4 w-4 mr-1.5" /> New box order
          </Button>
          <Button onClick={() => setBatchForm({ kind: "china", batch: null })}>
            <Ship className="h-4 w-4 mr-1.5" /> New China shipment
          </Button>
        </div>
      </div>

      {error && (
        <Card className="p-4 text-sm text-destructive flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" /> {(error as Error).message}
        </Card>
      )}

      {needsSetup && (
        <Card className="p-4 border-amber-300 bg-amber-50 dark:bg-amber-950/30 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            <div className="font-semibold">Start with today's stock</div>
            <div className="text-muted-foreground">
              Gudam e ekhon ja ache gune <b>Physical count</b> din (per pc cost soho). Tarpor theke
              order dispatch hole parts nije nije kombe.
            </div>
          </div>
          <Button onClick={() => setCounting(true)}>
            <ClipboardCheck className="h-4 w-4 mr-1.5" /> Physical count
          </Button>
        </Card>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="purchases">Purchases</TabsTrigger>
          <TabsTrigger value="stock">Stock & QC</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          {isLoading ? (
            <Skeleton className="h-80 w-full" />
          ) : (
            <Overview parts={parts} settings={settings} batches={batches} />
          )}
        </TabsContent>

        <TabsContent value="purchases" className="mt-4">
          <Purchases
            batches={batches}
            parts={parts}
            loading={isLoading}
            onEdit={(b) => setBatchForm({ kind: b.kind, batch: b })}
            onReceive={setReceiving}
          />
        </TabsContent>

        <TabsContent value="stock" className="mt-4">
          <StockTab parts={parts} onAdjust={setAdjust} onCount={() => setCounting(true)} />
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          {settings && <SettingsTab parts={parts} settings={settings} />}
        </TabsContent>
      </Tabs>

      <BatchFormDialog
        open={!!batchForm}
        kind={batchForm?.kind ?? "china"}
        batch={batchForm?.batch ?? null}
        parts={parts}
        onClose={() => setBatchForm(null)}
      />
      <ReceiveDialog batch={receiving} parts={parts} onClose={() => setReceiving(null)} />
      <AdjustDialog mode={adjust} parts={parts} onClose={() => setAdjust(null)} />
      <CountDialog open={counting} parts={parts} onClose={() => setCounting(false)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Overview({
  parts,
  settings,
  batches,
}: {
  parts: KigbPart[];
  settings: KigbSettings | null;
  batches: KigbBatch[];
}) {
  const blueCost = setCost(parts, "blue");
  const pinkCost = setCost(parts, "pink");
  const avgSet = (blueCost + pinkCost) / 2;
  const stockValue = parts.reduce((s, p) => s + Math.max(0, p.on_hand) * p.wac, 0);
  const low = parts.filter((p) => p.on_hand < p.reorder_point);
  const incoming = batches.filter((b) => b.status === "ordered" || b.status === "in_transit");

  const pk = settings?.packaging_cost ?? 0;
  const dl = settings?.delivery_cost ?? 0;
  const ad = settings?.ad_cost_per_order ?? 0;
  const single = settings?.sell_price_single ?? 0;
  const pair = settings?.sell_price_pair ?? 0;
  const singleProfit = single - avgSet - pk - dl - ad;
  const pairProfit = pair - 2 * avgSet - 2 * pk - dl - ad;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi
          label="Cost per set (avg)"
          value={avgSet > 0 ? bdt(avgSet, 2) : "—"}
          hint="parts landed cost"
        />
        <Kpi
          label="Sets you can make"
          value={`${(canMake(parts, "blue").sets + canMake(parts, "pink").sets).toLocaleString()}`}
          hint={`${canMake(parts, "blue").sets.toLocaleString()} blue · ${canMake(parts, "pink").sets.toLocaleString()} pink`}
        />
        <Kpi label="Parts stock value" value={bdt(stockValue)} hint="at landed cost" />
        <Kpi
          label="Incoming"
          value={`${incoming.length} batch${incoming.length === 1 ? "" : "es"}`}
          hint={`${incoming.reduce((s, b) => s + b.lines.reduce((x, l) => x + l.ordered_qty, 0), 0).toLocaleString()} pcs on the way`}
        />
      </div>

      {low.length > 0 && (
        <Card className="p-3 border-amber-300 bg-amber-50 dark:bg-amber-950/30 text-sm flex flex-wrap items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <span className="font-medium">Low stock:</span>
          {low.map((p) => (
            <span
              key={p.id}
              className="inline-flex items-center gap-1 rounded-full bg-background px-2 py-0.5 text-xs border"
            >
              <ColorDot color={p.color} /> {PART_LABEL[p.code]} {p.on_hand.toLocaleString()}
            </span>
          ))}
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {(["blue", "pink"] as const).map((color) => (
          <ColorCard key={color} color={color} parts={parts.filter((p) => p.color === color)} />
        ))}
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Profit per order</h3>
          <span className="text-xs text-muted-foreground">
            Edit prices & per-order costs in Settings
          </span>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Economics
            title="1 set"
            rows={[
              ["Selling price", single],
              ["Set cost (parts)", -avgSet],
              ["Packaging", -pk],
              ["Delivery", -dl],
              ["Ad cost / order", -ad],
            ]}
            result={singleProfit}
          />
          <Economics
            title="2 sets (pair offer)"
            rows={[
              ["Selling price", pair],
              ["2 × set cost", -2 * avgSet],
              ["Packaging × 2", -2 * pk],
              ["Delivery", -dl],
              ["Ad cost / order", -ad],
            ]}
            result={pairProfit}
          />
        </div>
        {avgSet === 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            Parts er cost ekhono nai — prothome count ba purchase receive korun.
          </p>
        )}
      </Card>
    </div>
  );
}

function ColorCard({ color, parts }: { color: Color; parts: KigbPart[] }) {
  const { sets, limiting } = canMake(parts, color);
  const cost = parts.reduce((s, p) => s + p.wac, 0);
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-semibold">
            <ColorDot color={color} /> {color === "blue" ? "Blue set (boys)" : "Pink set (girls)"}
          </div>
          <div className="text-xs text-muted-foreground">
            {limiting && sets >= 0 ? `Limited by ${PART_LABEL[limiting.code].toLowerCase()}` : ""}
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold tabular-nums">{sets.toLocaleString()}</div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            sets you can make
          </div>
        </div>
      </div>
      <div className="rounded-lg border divide-y text-sm">
        {parts.map((p) => {
          const lowStock = p.on_hand < p.reorder_point;
          return (
            <div
              key={p.id}
              className="grid grid-cols-[1fr_80px_90px_90px] gap-2 px-3 py-2 items-center"
            >
              <span className="flex items-center gap-1.5">
                {PART_LABEL[p.code]}
                <span className="text-[10px] uppercase text-muted-foreground">
                  {p.source === "china" ? "CN" : "BD"}
                </span>
              </span>
              <span
                className={cn(
                  "text-right tabular-nums font-medium",
                  p.on_hand < 0 ? "text-destructive" : lowStock && "text-amber-600",
                )}
              >
                {p.on_hand.toLocaleString()}
              </span>
              <span className="text-right tabular-nums text-muted-foreground">
                {p.wac > 0 ? bdt(p.wac, 2) : "—"}
              </span>
              <span className="text-right tabular-nums">{bdt(Math.max(0, p.on_hand) * p.wac)}</span>
            </div>
          );
        })}
        <div className="grid grid-cols-[1fr_80px_90px_90px] gap-2 px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/40">
          <span>Part</span>
          <span className="text-right">In stock</span>
          <span className="text-right">Cost / pc</span>
          <span className="text-right">Value</span>
        </div>
      </div>
      <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
        <span className="text-sm text-muted-foreground">Cost per set</span>
        <span className="text-lg font-bold tabular-nums">{cost > 0 ? bdt(cost, 2) : "—"}</span>
      </div>
    </Card>
  );
}

function Economics({
  title,
  rows,
  result,
}: {
  title: string;
  rows: [string, number][];
  result: number;
}) {
  return (
    <div className="rounded-lg border p-3 text-sm space-y-1">
      <div className="font-medium mb-1">{title}</div>
      {rows.map(([label, v]) => (
        <div key={label} className="flex justify-between">
          <span className="text-muted-foreground">{label}</span>
          <span className="tabular-nums">{v < 0 ? `− ${bdt(-v, 2)}` : bdt(v, 2)}</span>
        </div>
      ))}
      <div
        className={cn(
          "flex justify-between border-t pt-1.5 font-bold",
          result < 0 ? "text-destructive" : "text-emerald-700 dark:text-emerald-400",
        )}
      >
        <span>Profit</span>
        <span className="tabular-nums">{bdt(result, 2)}</span>
      </div>
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-xl font-bold tabular-nums mt-0.5">{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>}
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function batchTotals(b: KigbBatch) {
  const goods = b.lines.reduce((s, l) => s + (l.paid_qty ?? l.ordered_qty) * l.unit_price_bdt, 0);
  const extras = b.china_shipping_bdt + b.cargo_bdt + b.agent_fee_bdt + b.other_cost_bdt;
  const ordered = b.lines.reduce((s, l) => s + l.ordered_qty, 0);
  const good = b.lines.reduce((s, l) => s + (l.good_qty ?? 0), 0);
  const damaged = b.lines.reduce((s, l) => s + (l.damaged_qty ?? 0), 0);
  return { goods, extras, total: goods + extras, ordered, good, damaged };
}

function Purchases({
  batches,
  parts,
  loading,
  onEdit,
  onReceive,
}: {
  batches: KigbBatch[];
  parts: KigbPart[];
  loading: boolean;
  onEdit: (b: KigbBatch) => void;
  onReceive: (b: KigbBatch) => void;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState<string | null>(null);
  const status = useMutation({
    mutationFn: ({ id, s }: { id: string; s: "in_transit" | "cancelled" }) => setBatchStatus(id, s),
    onSuccess: () => qc.invalidateQueries({ queryKey: GIFT_BOX_QK }),
    onError: (e: Error) => toast.error(e.message),
  });
  const partName = (id: string) => parts.find((p) => p.id === id)?.name ?? "—";

  if (loading) return <Skeleton className="h-60 w-full" />;
  if (batches.length === 0)
    return (
      <Card className="p-10 text-center text-sm text-muted-foreground">
        <Boxes className="h-6 w-6 mx-auto mb-2 opacity-60" />
        Ekhono kono purchase nai. Upore "New China shipment" ba "New box order" diye shuru korun.
      </Card>
    );

  return (
    <Card className="overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Batch</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Supplier</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Pcs</TableHead>
            <TableHead className="text-right">Goods</TableHead>
            <TableHead className="text-right">Extra</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {batches.map((b) => {
            const t = batchTotals(b);
            const editable = b.status === "ordered" || b.status === "in_transit";
            return (
              <Fragment key={b.id}>
                <TableRow
                  className="cursor-pointer"
                  onClick={() => setOpen(open === b.id ? null : b.id)}
                >
                  <TableCell className="font-medium">
                    {b.batch_no}
                    <div className="text-xs text-muted-foreground">
                      {b.ordered_at ? format(new Date(b.ordered_at), "dd MMM yyyy") : ""}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1 text-sm">
                      {b.kind === "china" ? (
                        <Plane className="h-3.5 w-3.5" />
                      ) : (
                        <Truck className="h-3.5 w-3.5" />
                      )}
                      {b.kind === "china" ? "China" : "Box (BD)"}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">{b.supplier ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={STATUS_TONE[b.status]}>
                      {STATUS_LABEL[b.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {b.status === "received" ? (
                      <>
                        {t.good.toLocaleString()} good
                        {t.damaged > 0 && (
                          <div className="text-xs text-amber-600">{t.damaged} damaged</div>
                        )}
                      </>
                    ) : (
                      t.ordered.toLocaleString()
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{bdt(t.goods)}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{bdt(t.extras)}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {bdt(t.total)}
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="inline-flex gap-1">
                      {editable && (
                        <Button size="sm" onClick={() => onReceive(b)}>
                          <PackagePlus className="h-3.5 w-3.5 mr-1" /> Receive & QC
                        </Button>
                      )}
                      {b.status === "ordered" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => status.mutate({ id: b.id, s: "in_transit" })}
                        >
                          In transit
                        </Button>
                      )}
                      {editable && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => onEdit(b)}
                          aria-label="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {editable && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive"
                          aria-label="Cancel batch"
                          onClick={() => {
                            if (confirm(`Cancel ${b.batch_no}?`))
                              status.mutate({ id: b.id, s: "cancelled" });
                          }}
                        >
                          <XCircle className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
                {open === b.id && (
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableCell colSpan={9}>
                      <div className="rounded-lg border bg-background divide-y text-sm">
                        <div className="grid grid-cols-[1.4fr_repeat(5,90px)_1fr] gap-2 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          <span>Part</span>
                          <span className="text-right">Ordered</span>
                          <span className="text-right">৳ / pc</span>
                          <span className="text-right">Good</span>
                          <span className="text-right">Damaged</span>
                          <span className="text-right">Landed</span>
                          <span>QC note</span>
                        </div>
                        {b.lines.map((l) => (
                          <div
                            key={l.id}
                            className="grid grid-cols-[1.4fr_repeat(5,90px)_1fr] gap-2 px-3 py-2"
                          >
                            <span>{partName(l.part_id)}</span>
                            <span className="text-right tabular-nums">
                              {l.ordered_qty.toLocaleString()}
                            </span>
                            <span className="text-right tabular-nums">
                              {bdt(l.unit_price_bdt, 2)}
                            </span>
                            <span className="text-right tabular-nums">
                              {l.good_qty?.toLocaleString() ?? "—"}
                            </span>
                            <span
                              className={cn(
                                "text-right tabular-nums",
                                (l.damaged_qty ?? 0) > 0 && "text-amber-600",
                              )}
                            >
                              {l.damaged_qty ?? "—"}
                            </span>
                            <span className="text-right tabular-nums font-semibold">
                              {l.landed_unit_cost != null
                                ? bdt(Number(l.landed_unit_cost), 2)
                                : "—"}
                            </span>
                            <span className="text-muted-foreground">{l.qc_note ?? ""}</span>
                          </div>
                        ))}
                      </div>
                      {b.notes && (
                        <p className="mt-2 text-xs text-muted-foreground">Note: {b.notes}</p>
                      )}
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function StockTab({
  parts,
  onAdjust,
  onCount,
}: {
  parts: KigbPart[];
  onAdjust: (m: AdjustMode) => void;
  onCount: () => void;
}) {
  const [partId, setPartId] = useState<string>("all");
  const [reason, setReason] = useState<string>("all");
  const [q, setQ] = useState("");
  const { data: moves = [], isLoading } = useQuery({
    queryKey: ["gift-box-movements", partId, reason],
    queryFn: () =>
      fetchMovements({
        partId: partId === "all" ? null : partId,
        reason: reason === "all" ? null : reason,
      }),
  });
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return moves;
    return moves.filter((m) => (m.note ?? "").toLowerCase().includes(s));
  }, [moves, q]);
  const partName = (id: string) => parts.find((p) => p.id === id);

  const damage30 = moves
    .filter(
      (m) =>
        (m.reason === "damage" || m.reason === "lost") &&
        Date.now() - new Date(m.created_at).getTime() < 30 * 864e5,
    )
    .reduce((s, m) => s + Math.abs(m.total_cost), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button onClick={onCount}>
          <ClipboardCheck className="h-4 w-4 mr-1.5" /> Physical count
        </Button>
        <Button variant="outline" onClick={() => onAdjust("opening")}>
          <Plus className="h-4 w-4 mr-1.5" /> Opening stock
        </Button>
        <Button variant="outline" className="text-destructive" onClick={() => onAdjust("damage")}>
          <PackageMinus className="h-4 w-4 mr-1.5" /> Report damage
        </Button>
        <Button variant="outline" onClick={() => onAdjust("lost")}>
          Lost
        </Button>
        <Button variant="outline" onClick={() => onAdjust("found")}>
          Found
        </Button>
        <Button variant="ghost" onClick={() => onAdjust("adjust")}>
          Manual adjust
        </Button>
        {damage30 > 0 && (
          <span className="ml-auto self-center text-sm text-muted-foreground">
            Damage / loss last 30 days: <b className="text-destructive">{bdt(damage30)}</b>
          </span>
        )}
      </div>

      <Card className="p-3 flex flex-wrap items-center gap-2">
        <Select value={partId} onValueChange={setPartId}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All parts</SelectItem>
            {parts.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={reason} onValueChange={setReason}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All movements</SelectItem>
            {[
              "purchase",
              "order_sale",
              "order_sale_reversal",
              "order_return",
              "damage",
              "lost",
              "found",
              "adjust",
              "opening",
              "count",
            ].map((r) => (
              <SelectItem key={r} value={r}>
                {REASON_LABEL[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8 w-56"
            placeholder="Search note…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Part</TableHead>
              <TableHead>Movement</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Cost / pc</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead className="text-right">Stock after</TableHead>
              <TableHead>Note</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center">
                  <Loader2 className="h-5 w-5 animate-spin inline" />
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                  No movements yet
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((m) => {
                const p = partName(m.part_id);
                return (
                  <TableRow key={m.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {format(new Date(m.created_at), "dd/MM/yy h:mm a")}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        {p && <ColorDot color={p.color} />}
                        {p ? PART_LABEL[p.code] : "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">{REASON_LABEL[m.reason] ?? m.reason}</TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums font-medium",
                        m.delta < 0 ? "text-destructive" : "text-emerald-600",
                      )}
                    >
                      {m.delta > 0 ? "+" : ""}
                      {m.delta.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {bdt(m.unit_cost, 2)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {bdt(Math.abs(m.total_cost))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {m.on_hand_after.toLocaleString()}
                    </TableCell>
                    <TableCell
                      className="text-xs text-muted-foreground max-w-[280px] truncate"
                      title={m.note ?? ""}
                    >
                      {m.note}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function SettingsTab({ parts, settings }: { parts: KigbPart[]; settings: KigbSettings }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    sell_price_single: String(settings.sell_price_single),
    sell_price_pair: String(settings.sell_price_pair),
    packaging_cost: String(settings.packaging_cost),
    delivery_cost: String(settings.delivery_cost),
    ad_cost_per_order: String(settings.ad_cost_per_order),
    sync_cost: settings.sync_cost,
    default_color: settings.default_color,
  });
  const [reorder, setReorder] = useState<Record<string, string>>({});
  useEffect(() => {
    setReorder(Object.fromEntries(parts.map((p) => [p.id, String(p.reorder_point)])));
  }, [parts]);

  const save = useMutation({
    mutationFn: () =>
      updateSettings({
        sell_price_single: Number(form.sell_price_single),
        sell_price_pair: Number(form.sell_price_pair),
        packaging_cost: Number(form.packaging_cost),
        delivery_cost: Number(form.delivery_cost),
        ad_cost_per_order: Number(form.ad_cost_per_order),
        sync_cost: form.sync_cost,
        default_color: form.default_color,
        reorder_points: parts.map((p) => ({
          part_id: p.id,
          reorder_point: Math.max(0, Math.round(Number(reorder[p.id] ?? p.reorder_point))),
        })),
      }),
    onSuccess: () => {
      toast.success("Settings saved");
      qc.invalidateQueries({ queryKey: GIFT_BOX_QK });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const field = (key: keyof typeof form, label: string) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        type="number"
        min={0}
        value={String(form[key])}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
      />
    </div>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-4 space-y-3">
        <h3 className="font-semibold">Prices & per-order costs</h3>
        <div className="grid grid-cols-2 gap-3">
          {field("sell_price_single", "Price — 1 set (৳)")}
          {field("sell_price_pair", "Price — 2 sets (৳)")}
          {field("packaging_cost", "Packaging per set (৳)")}
          {field("delivery_cost", "Delivery per order (৳)")}
          {field("ad_cost_per_order", "Ad cost per order (৳)")}
        </div>
        <p className="text-xs text-muted-foreground">
          Shudhu "Profit per order" hisaber jonno. Website er dam ekhan theke bodlay na.
        </p>
      </Card>

      <Card className="p-4 space-y-3">
        <h3 className="font-semibold">Reorder alert (pcs)</h3>
        <div className="grid grid-cols-2 gap-3">
          {parts.map((p) => (
            <div key={p.id} className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <ColorDot color={p.color} /> {PART_LABEL[p.code]}
              </Label>
              <Input
                type="number"
                min={0}
                value={reorder[p.id] ?? ""}
                onChange={(e) => setReorder((r) => ({ ...r, [p.id]: e.target.value }))}
              />
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-4 space-y-3 lg:col-span-2">
        <h3 className="font-semibold">Automation</h3>
        <div className="flex items-center justify-between gap-4">
          <div className="text-sm">
            <div className="font-medium">Use parts cost as the gift set's cost in ERP</div>
            <div className="text-muted-foreground">
              On thakle Blue/Pink set er cost = 4 part er landed cost er jog — P&L ar profit report
              e eta jabe.
            </div>
          </div>
          <Switch
            checked={form.sync_cost}
            onCheckedChange={(v) => setForm((f) => ({ ...f, sync_cost: v }))}
          />
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="text-sm">
            <div className="font-medium">Color when an order has no color</div>
            <div className="text-muted-foreground">
              Kono order e blue/pink select na thakle ei rong er parts kombe.
            </div>
          </div>
          <Select
            value={form.default_color}
            onValueChange={(v) => setForm((f) => ({ ...f, default_color: v as Color }))}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="blue">Blue</SelectItem>
              <SelectItem value="pink">Pink</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">
          Order dispatch hole (ERP er stock deduction) proti set e 1 ta mat, tasbeeh, camera ar box
          automatic kombe; return receive / cancel hole abar fire ashbe.
        </p>
      </Card>

      <div className="lg:col-span-2 flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
          Save settings
        </Button>
      </div>
    </div>
  );
}
