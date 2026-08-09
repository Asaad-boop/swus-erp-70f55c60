import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtBdt } from "@/lib/erp/finance";

export function Panel({
  title,
  subtitle,
  action,
  children,
  className,
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("overflow-hidden border-border/70", className)}>
      {(title || action) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-4 py-2.5">
          <div>
            {title && <h3 className="text-sm font-semibold tracking-tight">{title}</h3>}
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      <div className="p-4">{children}</div>
    </Card>
  );
}

export type Kpi = {
  label: string;
  value: number;
  kind?: "money" | "number" | "percent";
  hint?: string;
  tone?: "default" | "good" | "bad";
};

export function fmtKpi(k: Kpi) {
  if (k.kind === "percent") return `${(k.value ?? 0).toFixed(2)}%`;
  if (k.kind === "number") return (k.value ?? 0).toLocaleString();
  return fmtBdt(k.value);
}

export function KpiStrip({ items, loading }: { items: Kpi[]; loading?: boolean }) {
  if (loading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-[74px] rounded-xl" />
        ))}
      </div>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((k) => (
        <div
          key={k.label}
          className="rounded-xl border bg-card px-4 py-3 transition-colors hover:border-primary/40"
        >
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {k.label}
          </p>
          <p
            className={cn(
              "mt-0.5 text-xl font-bold tabular-nums tracking-tight",
              k.tone === "good" && "text-emerald-600 dark:text-emerald-400",
              k.tone === "bad" && "text-rose-600 dark:text-rose-400",
            )}
          >
            {fmtKpi(k)}
          </p>
          {k.hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{k.hint}</p>}
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="py-10 text-center text-sm text-muted-foreground">{text}</div>
  );
}
