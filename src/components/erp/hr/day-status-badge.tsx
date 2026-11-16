import { cn } from "@/lib/utils";
import type { DayStatus } from "@/lib/erp/hr/api";
import { STATUS_META } from "@/lib/erp/hr/format";

export function DayStatusBadge({ status, className }: { status: DayStatus; className?: string }) {
  const m = STATUS_META[status];
  if (m.label === "—")
    return <span className={cn("text-xs text-muted-foreground", className)}>—</span>;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
        m.className,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", m.dot)} />
      {m.label}
    </span>
  );
}
