import { useMemo } from "react";
import { AlertTriangle, Boxes, CheckCircle2, Package, Truck, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { fmtBdt } from "@/lib/erp/imports/types";
import {
  buildLeaves,
  leafKey,
  type PoCartonDraft,
  type PoItemDraft,
  type VariantMeta,
} from "@/components/erp/imports/po-line-builder";

export type PoReviewProps = {
  items: PoItemDraft[];
  cartons: PoCartonDraft[];
  variantsByProduct: Record<string, VariantMeta[]>;
  receiveMode: "carton" | "quantity";
  fxRate: number;
  currency?: string;
  /** Planned landed cost per unit in BDT (optional, for margin view). */
  plannedLandedPerUnit?: number;
  targetPriceMax?: number | null;
  supplierLabel?: string | null;
  agentLabel?: string | null;
  advance?: { amount: number; walletLabel?: string | null } | null;
  notes?: string | null;
  title?: string | null;
};

/** Read-only final review of a Purchase Order draft: totals, allocation and warnings. */
export function PoReviewPanel({
  items,
  cartons,
  variantsByProduct,
  receiveMode,
  fxRate,
  currency = "CNY",
  plannedLandedPerUnit = 0,
  targetPriceMax,
  supplierLabel,
  agentLabel,
  advance,
  notes,
  title,
}: PoReviewProps) {
  const leaves = useMemo(() => buildLeaves(items, variantsByProduct), [items, variantsByProduct]);

  const totals = useMemo(() => {
    const units = items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
    const foreign = items.reduce(
      (s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_cost_foreign) || 0),
      0,
    );
    const bdt = foreign * (Number(fxRate) || 0);
    const landed = units * (Number(plannedLandedPerUnit) || 0);
    const weight = cartons.reduce((s, c) => s + (Number(c.weight_kg) || 0), 0);
    return {
      units,
      lines: leaves.length,
      foreign,
      bdt,
      landed,
      weight,
      avgForeign: units > 0 ? foreign / units : 0,
      avgBdt: units > 0 ? bdt / units : 0,
    };
  }, [items, cartons, leaves.length, fxRate, plannedLandedPerUnit]);

  const allocated = useMemo(() => {
    const map: Record<string, number> = {};
    leaves.forEach((l) => {
      map[l.key] = 0;
    });
    cartons.forEach((c) =>
      Object.entries(c.allocations).forEach(([k, q]) => {
        if (map[k] !== undefined) map[k] += Number(q) || 0;
      }),
    );
    return map;
  }, [leaves, cartons]);

  const warnings = useMemo(() => {
    const out: string[] = [];
    if (totals.units <= 0) out.push("Total quantity 0 — কমপক্ষে ১ pcs দিতে হবে।");
    if (!fxRate || fxRate <= 0) out.push("FX rate দেওয়া হয়নি।");
    if (!agentLabel) out.push("Cargo agent select করা হয়নি।");
    if (!supplierLabel) out.push("Supplier select বা নাম দেওয়া হয়নি।");
    items.forEach((i, idx) => {
      if (!i.picked.title.trim()) out.push(`Item ${idx + 1}: product/name খালি।`);
      if ((Number(i.unit_cost_foreign) || 0) <= 0)
        out.push(`${i.picked.title || `Item ${idx + 1}`}: unit price 0 দেওয়া আছে।`);
      const alloc = i.allocations
        ? Object.values(i.allocations).reduce((s, q) => s + (Number(q) || 0), 0)
        : 0;
      if (alloc > 0 && alloc !== (Number(i.quantity) || 0))
        out.push(
          `${i.picked.title || `Item ${idx + 1}`}: variant allocation ${alloc} ≠ quantity ${i.quantity}।`,
        );
    });
    if (receiveMode === "carton") {
      if (cartons.length === 0) out.push("Carton mode-এ কোনো carton যোগ করা হয়নি।");
      leaves.forEach((l) => {
        const a = allocated[l.key] ?? 0;
        if (a !== l.qty) {
          const label = l.variantLabel ? `${l.title} — ${l.variantLabel}` : l.title;
          out.push(`Carton allocation mismatch — ${label}: ${a}/${l.qty}`);
        }
      });
      if (cartons.some((c) => (Number(c.weight_kg) || 0) <= 0))
        out.push("কিছু carton-এ weight (kg) দেওয়া হয়নি।");
    }
    if (advance && advance.amount > 0) {
      if (!advance.walletLabel) out.push("Advance payment-এর wallet select করা হয়নি।");
      if (totals.bdt > 0 && advance.amount > totals.bdt)
        out.push("Advance amount PO value-এর চেয়ে বেশি।");
    }
    if (
      targetPriceMax != null &&
      plannedLandedPerUnit > 0 &&
      plannedLandedPerUnit > targetPriceMax
    )
      out.push(
        `Planned landed ৳${Math.round(plannedLandedPerUnit)} target max ৳${Math.round(targetPriceMax)} ছাড়িয়ে যাচ্ছে।`,
      );
    return out;
  }, [
    items,
    cartons,
    leaves,
    allocated,
    receiveMode,
    fxRate,
    agentLabel,
    supplierLabel,
    advance,
    targetPriceMax,
    plannedLandedPerUnit,
    totals.units,
    totals.bdt,
  ]);

  return (
    <div className="space-y-4">
      {/* Warnings */}
      {warnings.length > 0 ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4" /> {warnings.length} টি বিষয় খেয়াল করুন
          </div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-800 dark:text-amber-300">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm font-medium text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4" /> সব ঠিক আছে — PO তৈরি করার জন্য প্রস্তুত।
        </div>
      )}

      {/* Totals */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Stat label="Total units" value={`${totals.units} pcs`} icon={Package} />
        <Stat
          label={`Product value (${currency})`}
          value={`¥${totals.foreign.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
        />
        <Stat label="PO value (৳)" value={fmtBdt(Math.round(totals.bdt))} strong />
        <Stat label="Avg / unit (৳)" value={fmtBdt(Math.round(totals.avgBdt))} />
        {plannedLandedPerUnit > 0 && (
          <Stat label="Planned landed total (৳)" value={fmtBdt(Math.round(totals.landed))} />
        )}
        {receiveMode === "carton" && (
          <>
            <Stat label="Cartons" value={`${cartons.length}`} icon={Boxes} />
            <Stat label="Total weight" value={`${totals.weight.toFixed(2)} kg`} icon={Truck} />
          </>
        )}
        {advance && advance.amount > 0 && (
          <Stat
            label="Advance now"
            value={fmtBdt(Math.round(advance.amount))}
            icon={Wallet}
            hint={advance.walletLabel ?? undefined}
          />
        )}
        {advance && advance.amount > 0 && (
          <Stat label="Due after advance" value={fmtBdt(Math.round(Math.max(0, totals.bdt - advance.amount)))} />
        )}
      </div>

      {/* Meta */}
      <div className="grid gap-2 rounded-xl border bg-muted/30 p-3 text-xs sm:grid-cols-2">
        {title && <Meta label="Sourcing item" value={title} />}
        <Meta label="Supplier" value={supplierLabel || "—"} />
        <Meta label="Cargo agent" value={agentLabel || "—"} />
        <Meta label="FX rate" value={`৳ ${fxRate || 0} / ¥`} />
        <Meta
          label="Receive mode"
          value={receiveMode === "quantity" ? "Quantity wise (piece by piece)" : "Carton wise"}
        />
        {notes?.trim() && <Meta label="Note" value={notes.trim()} />}
      </div>

      {/* Allocation summary */}
      <div className="overflow-hidden rounded-xl border">
        <div className="border-b bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Allocation summary — {leaves.length} line
        </div>
        <div className="divide-y">
          {leaves.map((l) => {
            const item = items.find((i) => i.id === l.itemId);
            const unit = Number(item?.unit_cost_foreign || 0);
            const a = allocated[l.key] ?? 0;
            const mismatch = receiveMode === "carton" && a !== l.qty;
            return (
              <div key={l.key} className="flex items-center gap-3 px-3 py-2 text-sm">
                {l.image ? (
                  <img
                    src={l.image}
                    alt={l.title}
                    loading="lazy"
                    className="h-9 w-9 rounded-md object-cover"
                  />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted">
                    <Package className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{l.title}</p>
                  {l.variantLabel && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      {l.variantHex && (
                        <span
                          className="h-2.5 w-2.5 rounded-full border"
                          style={{ background: l.variantHex }}
                        />
                      )}
                      {l.variantLabel}
                    </span>
                  )}
                </div>
                <div className="text-right text-xs">
                  <p className="font-semibold">{l.qty} pcs</p>
                  <p className="text-muted-foreground">
                    ¥{unit} · {fmtBdt(Math.round(l.qty * unit * (Number(fxRate) || 0)))}
                  </p>
                </div>
                {receiveMode === "carton" && (
                  <Badge
                    variant="outline"
                    className={cn(
                      "shrink-0 text-[10px]",
                      mismatch
                        ? "border-destructive/50 text-destructive"
                        : "border-emerald-500/50 text-emerald-600",
                    )}
                  >
                    {a}/{l.qty}
                  </Badge>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Carton breakdown */}
      {receiveMode === "carton" && cartons.length > 0 && (
        <div className="overflow-hidden rounded-xl border">
          <div className="border-b bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Carton breakdown
          </div>
          <div className="divide-y">
            {cartons.map((c) => {
              const lines = leaves
                .map((l) => ({ l, q: Number(c.allocations[leafKey(l.itemId, l.variantId)] || 0) }))
                .filter((x) => x.q > 0);
              const units = lines.reduce((s, x) => s + x.q, 0);
              return (
                <div key={c.id} className="px-3 py-2 text-xs">
                  <div className="flex items-center justify-between font-medium">
                    <span>Carton #{c.carton_number}</span>
                    <span className="text-muted-foreground">
                      {units} pcs · {(Number(c.weight_kg) || 0).toFixed(2)} kg
                    </span>
                  </div>
                  {lines.length === 0 ? (
                    <p className="mt-1 text-destructive">কোনো item allocate করা হয়নি।</p>
                  ) : (
                    <p className="mt-1 text-muted-foreground">
                      {lines
                        .map(
                          (x) =>
                            `${x.l.title}${x.l.variantLabel ? ` (${x.l.variantLabel})` : ""} × ${x.q}`,
                        )
                        .join(" · ")}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** Same warning list the panel renders — use it to gate the submit button. */
export function poReviewWarnings(props: PoReviewProps): string[] {
  const leaves = buildLeaves(props.items, props.variantsByProduct);
  const map: Record<string, number> = {};
  leaves.forEach((l) => {
    map[l.key] = 0;
  });
  props.cartons.forEach((c) =>
    Object.entries(c.allocations).forEach(([k, q]) => {
      if (map[k] !== undefined) map[k] += Number(q) || 0;
    }),
  );
  const out: string[] = [];
  if (props.receiveMode === "carton")
    leaves.forEach((l) => {
      if ((map[l.key] ?? 0) !== l.qty) out.push(`${l.title}: ${map[l.key] ?? 0}/${l.qty}`);
    });
  return out;
}

function Stat({
  label,
  value,
  icon: Icon,
  strong,
  hint,
}: {
  label: string;
  value: string;
  icon?: React.ComponentType<{ className?: string }>;
  strong?: boolean;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {Icon && <Icon className="h-3.5 w-3.5" />} {label}
      </div>
      <p className={cn("mt-0.5 font-semibold", strong ? "font-display text-lg" : "text-sm")}>
        {value}
      </p>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
