import { ArrowDownRight, ArrowUpRight, ChevronRight, Info } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  STAGE_META,
  deltaPct,
  type Ladder,
  type LadderStage,
  type StageKey,
} from "@/lib/erp/marketing/roas-ladder";

export const bdt = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : "৳" + Math.round(v).toLocaleString("en-IN");

export const fmtRoas = (r: number | null | undefined) =>
  r === null || r === undefined || r <= 0 ? "—" : `${r.toFixed(2)}x`;

/** Colour for a ROAS value. Delivered/confirmed use breakeven when known. */
export function roasTone(r: number | null | undefined, breakeven?: number | null) {
  if (!r || r <= 0) return "text-muted-foreground";
  const be = breakeven && breakeven > 0 ? breakeven : 1;
  if (r >= be * 1.2) return "text-emerald-600 dark:text-emerald-400";
  if (r >= be) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

function Delta({
  cur,
  prev,
  invert = false,
}: {
  cur: number;
  prev?: number | null;
  invert?: boolean;
}) {
  const d = deltaPct(cur, prev);
  if (d === null || !Number.isFinite(d)) return null;
  const up = d >= 0;
  const good = invert ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[10px] font-medium tabular-nums",
        good ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
      )}
    >
      <Icon className="h-3 w-3" />
      {Math.abs(d)}%
    </span>
  );
}

function StageInfo({ k }: { k: StageKey }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="text-muted-foreground/70 hover:text-foreground"
          aria-label="What is this"
        >
          <Info className="h-3 w-3" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-[240px] text-xs leading-relaxed">
        {STAGE_META[k].hint}
      </TooltipContent>
    </Tooltip>
  );
}

function StageCard({
  s,
  prev,
  emphasis,
  footer,
  breakeven,
}: {
  s: LadderStage;
  prev?: LadderStage;
  emphasis?: boolean;
  footer?: React.ReactNode;
  breakeven?: number | null;
}) {
  return (
    <div
      className={cn(
        "relative rounded-lg border bg-card px-3 py-2.5",
        emphasis && "border-primary/40 bg-primary/[0.03] ring-1 ring-primary/10",
        s.key === "meta" && "bg-muted/30",
      )}
    >
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        {s.label}
        <StageInfo k={s.key} />
        {s.keptPct !== null && (
          <span
            className="ml-auto rounded bg-muted px-1 py-px text-[10px] tabular-nums"
            title="আগের ধাপের value এর কত % রইল"
          >
            {s.keptPct}% রইল
          </span>
        )}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span
          className={cn(
            "font-display text-2xl font-bold tabular-nums",
            // Only the decision number is coloured; earlier stages stay neutral
            s.key === "delivered"
              ? roasTone(s.roas, breakeven)
              : s.key === "meta"
                ? "text-foreground/60"
                : "text-foreground",
          )}
        >
          {fmtRoas(s.roas)}
        </span>
        {prev && <Delta cur={s.roas} prev={prev.roas} />}
      </div>
      <div className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
        {bdt(s.value)} · {s.count.toLocaleString()} {s.key === "meta" ? "purchase" : "order"}
      </div>
      {footer && (
        <div className="mt-1.5 border-t pt-1.5 text-[10px] text-muted-foreground">{footer}</div>
      )}
    </div>
  );
}

/**
 * The four-stage ROAS ladder: Meta → Booked → Confirmed → Delivered.
 * Delivered is emphasised because it is the decision number.
 */
export function RoasLadder({
  ladder,
  prev,
  expectedDelivered,
  breakeven,
  loading,
  compareLabel,
}: {
  ladder?: Ladder;
  prev?: Ladder;
  expectedDelivered?: number | null;
  breakeven?: number | null;
  loading?: boolean;
  compareLabel?: string;
}) {
  if (loading || !ladder) {
    return (
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[104px] rounded-lg" />
        ))}
      </div>
    );
  }
  const [meta, booked, confirmed, delivered] = ladder.stages;
  const showExpected =
    expectedDelivered !== null &&
    expectedDelivered !== undefined &&
    ladder.pipelineCount > 0 &&
    expectedDelivered > delivered.roas;
  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <StageCard
            s={meta}
            prev={prev?.stages[0]}
            footer={
              ladder.metaGapPct !== null
                ? ladder.metaGapPct > 0
                  ? `Meta ${ladder.metaGapPct}% বেশি দাবি করছে`
                  : `Meta ${Math.abs(ladder.metaGapPct)}% কম দেখাচ্ছে`
                : undefined
            }
          />
          <StageCard
            s={booked}
            prev={prev?.stages[1]}
            footer={
              ladder.costPerBooked !== null
                ? `প্রতি order খরচ ${bdt(ladder.costPerBooked)}`
                : undefined
            }
          />
          <StageCard
            s={confirmed}
            prev={prev?.stages[2]}
            footer={ladder.confirmRate !== null ? `Confirm rate ${ladder.confirmRate}%` : undefined}
          />
          <StageCard
            s={delivered}
            prev={prev?.stages[3]}
            emphasis
            breakeven={breakeven}
            footer={
              <span className="flex flex-wrap gap-x-2">
                {ladder.deliverySuccess !== null && <span>Success {ladder.deliverySuccess}%</span>}
                {ladder.pipelineCount > 0 && <span>{ladder.pipelineCount} পথে</span>}
                {showExpected && (
                  <span
                    className="font-medium text-foreground"
                    title="পথে থাকা order পুরনো delivery rate এ deliver হলে আনুমানিক ROAS (estimate)"
                  >
                    ≈ {fmtRoas(expectedDelivered)} হতে পারে
                  </span>
                )}
              </span>
            }
          />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] text-muted-foreground">
          <span>
            Spend <b className="text-foreground tabular-nums">{bdt(ladder.spend)}</b>
            {prev && (
              <span className="ml-1">
                <Delta cur={ladder.spend} prev={prev.spend} invert />
              </span>
            )}
          </span>
          {ladder.costPerDelivered !== null && (
            <span>
              প্রতি delivered order{" "}
              <b className="text-foreground tabular-nums">{bdt(ladder.costPerDelivered)}</b>
            </span>
          )}
          {breakeven ? (
            <span>
              Breakeven ROAS <b className="text-foreground tabular-nums">{fmtRoas(breakeven)}</b>
            </span>
          ) : null}
          {compareLabel && prev && <span className="ml-auto">তুলনা: {compareLabel}</span>}
        </div>
      </div>
    </TooltipProvider>
  );
}

/** Compact inline ladder for table cells: 6.0 › 5.0 › 4.0 › 2.5 */
export function LadderInline({ ladder, breakeven }: { ladder: Ladder; breakeven?: number | null }) {
  return (
    <span className="inline-flex items-center gap-0.5 whitespace-nowrap text-xs tabular-nums">
      {ladder.stages.map((s, i) => (
        <span key={s.key} className="inline-flex items-center gap-0.5">
          {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground/50" />}
          <span
            title={`${s.label}: ${fmtRoas(s.roas)} · ${bdt(s.value)}`}
            className={cn(
              s.key === "delivered"
                ? roasTone(s.roas, breakeven)
                : s.key === "meta"
                  ? "text-muted-foreground"
                  : "text-foreground",
              s.key === "delivered" && "font-semibold",
            )}
          >
            {s.roas > 0 ? s.roas.toFixed(1) : "—"}
          </span>
        </span>
      ))}
    </span>
  );
}
