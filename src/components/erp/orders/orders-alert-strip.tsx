import { ShieldAlert } from "lucide-react";
import type { OrderRow } from "@/lib/erp/orders";

type Props = {
  rows: OrderRow[];
  /** Selects the flagged orders so the user can act on them right away. */
  onReview: (ids: string[]) => void;
};

/**
 * Red risk strip. Renders only when the current page actually has
 * risk / duplicate / hold flagged orders.
 */
export function OrdersAlertStrip({ rows, onReview }: Props) {
  const risk = rows.filter((r) => r.risk_flag);
  const dup = rows.filter((r) => r.duplicate_flag);
  const hold = rows.filter((r) => (r.hold_reason ?? "").trim().length > 0);
  const ids = Array.from(new Set([...risk, ...dup, ...hold].map((r) => r.id)));
  if (ids.length === 0) return null;

  const parts = [
    risk.length ? `${risk.length} risk` : null,
    dup.length ? `${dup.length} duplicate` : null,
    hold.length ? `${hold.length} on hold` : null,
  ].filter(Boolean) as string[];

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-[var(--danger-border)] bg-[var(--danger-soft)] px-3.5 py-2.5 text-[12.5px] text-[var(--danger-text)]"
    >
      <ShieldAlert className="h-4 w-4 shrink-0" />
      <span>
        <span className="num font-semibold">{ids.length}</span> order need attention — {parts.join(" · ")}
      </span>
      <button
        type="button"
        onClick={() => onReview(ids)}
        className="focus-ring ml-auto rounded-[var(--radius-chip)] font-semibold underline underline-offset-4 hover:opacity-80"
      >
        Review now
      </button>
    </div>
  );
}
