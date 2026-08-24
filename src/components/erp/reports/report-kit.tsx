import type { ReactNode } from "react";
import { Download, FileSpreadsheet, FileText, Printer, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { fmtBdt } from "@/lib/erp/finance";
import { exportCsv, exportXlsx, exportReportPdf, type Aoa } from "@/lib/erp/reports/export";

/** Shared caching policy for every report query — stops refetch storms on tab switch. */
export const REPORT_QUERY_OPTS = {
  staleTime: 5 * 60 * 1000,
  gcTime: 15 * 60 * 1000,
  refetchOnWindowFocus: false,
  refetchOnMount: false,
} as const;

export function Panel({
  title,
  subtitle,
  action,
  children,
  className,
  flush = false,
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Remove body padding — use for full-bleed tables. */
  flush?: boolean;
}) {
  return (
    <Card className={cn("rpt-surface overflow-hidden border-0 bg-transparent p-0 shadow-none", className)}>
      <div className="rpt-surface overflow-hidden">
        {(title || action) && (
          <div className="rpt-head flex flex-wrap items-center justify-between gap-3 px-[var(--rpt-pad)] py-3">
            <div className="flex min-w-0 items-start gap-2.5">
              <span
                aria-hidden
                className="mt-1 h-3.5 w-[3px] shrink-0 rounded-full"
                style={{ background: "var(--rpt-accent)" }}
              />
              <div className="min-w-0">
                {title && <h3 className="rpt-title truncate">{title}</h3>}
                {subtitle && <p className="rpt-sub mt-0.5">{subtitle}</p>}
              </div>
            </div>
            {action}
          </div>
        )}
        <div className={flush ? "" : "p-[var(--rpt-pad)]"}>{children}</div>
      </div>
    </Card>
  );
}


export type Kpi = {
  label: string;
  value: number;
  kind?: "money" | "number" | "percent";
  hint?: string;
  tone?: "default" | "good" | "bad";
  /** Same metric for the previous comparable period — renders a delta chip. */
  prev?: number | null;
  /** Which direction is good. Defaults to "up". */
  goodWhen?: "up" | "down";
};

export function fmtKpi(k: Kpi) {
  if (k.kind === "percent") return `${(k.value ?? 0).toFixed(2)}%`;
  if (k.kind === "number") return (k.value ?? 0).toLocaleString();
  return fmtBdt(k.value);
}

function Delta({ k }: { k: Kpi }) {
  if (k.prev == null || !Number.isFinite(Number(k.prev))) return null;
  const prev = Number(k.prev);
  const cur = Number(k.value ?? 0);
  const diff = cur - prev;
  if (Math.abs(diff) < 1e-9) {
    return <span className="text-[11px] text-muted-foreground">no change vs prev</span>;
  }
  const pct = prev === 0 ? null : (diff / Math.abs(prev)) * 100;
  const up = diff > 0;
  const good = (k.goodWhen ?? "up") === "up" ? up : !up;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[11px] font-medium",
        good ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
      )}
    >
      <Icon className="h-3 w-3" />
      {pct == null ? (up ? "new" : "—") : `${up ? "+" : ""}${pct.toFixed(1)}%`}
      <span className="text-muted-foreground">vs prev</span>
    </span>
  );
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
          className={cn(
            "group relative overflow-hidden rounded-xl border border-border/60 bg-card px-4 py-3",
            "shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all duration-200",
            "hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_10px_28px_-18px_rgba(16,24,40,0.45)]",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "absolute inset-y-0 left-0 w-[3px] rounded-r-full opacity-70 transition-opacity group-hover:opacity-100",
              k.tone === "good" ? "bg-emerald-500" : k.tone === "bad" ? "bg-rose-500" : "bg-primary/60",
            )}
          />
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {k.label}
          </p>
          <p
            className={cn(
              "mt-0.5 font-display text-[22px] font-bold leading-tight tabular-nums tracking-tight",
              k.tone === "good" && "text-emerald-600 dark:text-emerald-400",
              k.tone === "bad" && "text-rose-600 dark:text-rose-400",
            )}
          >
            {fmtKpi(k)}
          </p>
          <div className="mt-0.5 flex flex-col gap-0.5">
            <Delta k={k} />
            {k.hint && <p className="text-[11px] text-muted-foreground">{k.hint}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

/** One export control for every report panel: Excel, CSV and a print-ready PDF. */
export function ExportMenu({
  aoa,
  filename,
  title,
  subtitle,
  rangeLabel,
  kpis,
  note,
  size = "sm",
  label = "Export",
  disabled,
}: {
  aoa: Aoa | (() => Aoa);
  filename: string;
  title: string;
  subtitle?: string;
  rangeLabel?: string;
  kpis?: Kpi[];
  note?: string;
  size?: "sm" | "default";
  label?: string;
  disabled?: boolean;
}) {
  const get = () => (typeof aoa === "function" ? aoa() : aoa);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={size} disabled={disabled} className="h-7 px-2.5 text-xs">
          <Download className="mr-1.5 h-3.5 w-3.5" />
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel className="text-xs">{title}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => exportXlsx(get(), title.slice(0, 28), filename)}>
          <FileSpreadsheet className="mr-2 h-3.5 w-3.5" />Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportCsv(get(), filename)}>
          <FileText className="mr-2 h-3.5 w-3.5" />CSV (UTF-8)
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() =>
            exportReportPdf({
              title,
              subtitle,
              rangeLabel,
              note,
              aoa: get(),
              kpis: (kpis ?? []).map((k) => ({ label: k.label, value: fmtKpi(k), hint: k.hint })),
            })
          }
        >
          <Printer className="mr-2 h-3.5 w-3.5" />PDF / Print
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="py-10 text-center text-sm text-muted-foreground">{text}</div>
  );
}
