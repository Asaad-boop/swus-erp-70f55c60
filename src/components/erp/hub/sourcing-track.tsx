import { CheckCircle2, Circle, Loader2, PackageSearch, ShoppingCart, Ship, Warehouse, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type SourcingStage =
  | "to_source"
  | "sourcing"
  | "sourced"
  | "ordered"
  | "in_transit"
  | "received";

export const STAGE_ORDER: SourcingStage[] = [
  "to_source",
  "sourcing",
  "sourced",
  "ordered",
  "in_transit",
  "received",
];

export const STAGE_META: Record<
  SourcingStage,
  { label: string; short: string; icon: LucideIcon; tone: string; dot: string }
> = {
  to_source:  { label: "To source",       short: "To source",  icon: Sparkles,     tone: "bg-muted text-muted-foreground border-border",                          dot: "bg-muted-foreground/50" },
  sourcing:   { label: "Sourcing started", short: "Sourcing",  icon: PackageSearch, tone: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30", dot: "bg-amber-500" },
  sourced:    { label: "Sourcing done",    short: "Sourced",   icon: CheckCircle2,  tone: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/30",         dot: "bg-sky-500" },
  ordered:    { label: "Ordered",          short: "Ordered",   icon: ShoppingCart,  tone: "bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/30", dot: "bg-violet-500" },
  in_transit: { label: "In transit",       short: "Transit",   icon: Ship,          tone: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30",     dot: "bg-blue-500" },
  received:   { label: "Received",         short: "Received",  icon: Warehouse,     tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30", dot: "bg-emerald-500" },
};

/** Derive the live sourcing stage from idea state + linked PO status. */
export function deriveStage(args: {
  status: string;
  quoteCount: number;
  selectedQuoteId: string | null;
  impPoId?: string | null;
  poStatus?: string | null;
}): SourcingStage {
  const { status, quoteCount, selectedQuoteId, impPoId, poStatus } = args;
  if (impPoId || status === "ordered") {
    const s = poStatus ?? "";
    if (s === "completed" || s === "partially_received") return "received";
    if (s === "in_transit" || s === "at_china_warehouse" || s === "arrived_bd") return "in_transit";
    return "ordered";
  }
  if (selectedQuoteId) return "sourced";
  if (quoteCount > 0 || status === "sourcing") return "sourcing";
  return "to_source";
}

export function StageBadge({ stage, className = "" }: { stage: SourcingStage; className?: string }) {
  const m = STAGE_META[stage];
  const Icon = m.icon;
  return (
    <Badge variant="outline" className={`gap-1 border text-[10px] font-medium ${m.tone} ${className}`}>
      <Icon className="h-3 w-3" />
      {m.short}
    </Badge>
  );
}

export function StageFilterBar({
  counts,
  value,
  onChange,
}: {
  counts: Record<SourcingStage, number> & { all: number };
  value: SourcingStage | "all";
  onChange: (v: SourcingStage | "all") => void;
}) {
  const items: Array<{ key: SourcingStage | "all"; label: string; n: number; dot?: string }> = [
    { key: "all", label: "All", n: counts.all },
    ...STAGE_ORDER.map((s) => ({
      key: s,
      label: STAGE_META[s].short,
      n: counts[s],
      dot: STAGE_META[s].dot,
    })),
  ];
  return (
    <div className="flex flex-wrap gap-1 rounded-full border border-border/60 bg-muted/40 p-1">
      {items.map((it) => {
        const on = value === it.key;
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => onChange(it.key)}
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-all ${
              on
                ? "bg-card font-semibold text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:bg-card/60 hover:text-foreground"
            }`}
          >
            {it.dot && (
              <span
                className={`h-1.5 w-1.5 rounded-full ${it.dot} ${on ? "" : "opacity-60"}`}
              />
            )}
            {it.label}
            <span
              className={`rounded-full px-1.5 text-[10px] tabular-nums ${
                on ? "bg-primary/10 text-primary" : "bg-background/70 text-muted-foreground"
              }`}
            >
              {it.n}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export type TrackStep = {
  stage: SourcingStage;
  date?: string | null;
  note?: string | null;
};

/** Horizontal stage tracker with dates + current-step pulse. */
export function SourcingTimeline({
  current,
  steps,
}: {
  current: SourcingStage;
  steps: TrackStep[];
}) {
  const curIdx = STAGE_ORDER.indexOf(current);
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        {steps.map((st, i) => {
          const idx = STAGE_ORDER.indexOf(st.stage);
          const done = idx < curIdx;
          const active = idx === curIdx;
          const m = STAGE_META[st.stage];
          const Icon = m.icon;
          return (
            <div key={st.stage} className="flex flex-1 items-start gap-2 sm:flex-col sm:gap-1.5">
              <div className="flex w-full items-center gap-2">
                <span
                  className={`relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                    done
                      ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                      : active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  {done ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : active ? (
                    <Icon className="h-3.5 w-3.5" />
                  ) : (
                    <Circle className="h-3 w-3" />
                  )}
                  {active && (
                    <span className="absolute inset-0 animate-ping rounded-full border border-primary/60" />
                  )}
                </span>
                {i < steps.length - 1 && (
                  <span
                    className={`hidden h-0.5 flex-1 rounded-full sm:block ${
                      done ? "bg-emerald-500/50" : "bg-border"
                    }`}
                  />
                )}
              </div>
              <div className="min-w-0">
                <p
                  className={`truncate text-[11px] font-semibold ${
                    done || active ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {m.label}
                </p>
                <p className="truncate text-[10px] text-muted-foreground">
                  {st.date ? new Date(st.date).toLocaleDateString() : st.note ? st.note : "—"}
                  {st.date && st.note ? ` · ${st.note}` : ""}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function StageKpi({
  label,
  value,
  sub,
  tone = "",
  loading,
  dot,
  active,
  onClick,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: string;
  loading?: boolean;
  dot?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={`group relative overflow-hidden rounded-xl border bg-card p-3 text-left transition-all ${
        onClick ? "hover:-translate-y-0.5 hover:shadow-md" : ""
      } ${active ? "border-primary/50 ring-1 ring-primary/30" : "border-border/70"}`}
    >
      {dot && (
        <span
          className={`absolute inset-x-0 top-0 h-0.5 ${dot} ${active ? "" : "opacity-50"}`}
        />
      )}
      <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        {dot && <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />}
        {label}
      </p>
      <p className={`mt-0.5 font-display text-xl font-bold tabular-nums ${tone}`}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : value}
      </p>
      {sub && <p className="truncate text-[10px] text-muted-foreground">{sub}</p>}
    </Tag>
  );
}
