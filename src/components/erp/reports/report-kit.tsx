import type { ReactNode } from "react";
import { Download, FileSpreadsheet, FileText, Printer, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

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
    <section className={cn("rpt-surface group/panel overflow-hidden", className)}>
      {(title || action) && (
        <div className="rpt-head flex flex-wrap items-start justify-between gap-3 px-[var(--rpt-pad)] pb-3 pt-[var(--rpt-pad)]">
          <div className="min-w-0">
            <span aria-hidden className="rpt-rule mb-2 block" />
            {title && <h3 className="rpt-title truncate">{title}</h3>}
            {subtitle && <p className="rpt-sub mt-1 max-w-2xl">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0 pt-1">{action}</div>}
        </div>
      )}
      <div className={flush ? "" : "p-[var(--rpt-pad)]"}>{children}</div>
    </section>
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
    return <span className="rpt-eyebrow">flat vs prev</span>;
  }
  const pct = prev === 0 ? null : (diff / Math.abs(prev)) * 100;
  const up = diff > 0;
  const good = (k.goodWhen ?? "up") === "up" ? up : !up;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        "rpt-num inline-flex items-center gap-1 border-l-2 pl-1.5 text-[11px] font-bold",
        good ? "text-[var(--rpt-good)]" : "text-[var(--rpt-bad)]",
      )}
      style={{ borderColor: good ? "var(--rpt-good)" : "var(--rpt-bad)" }}
    >
      <Icon className="h-3 w-3" />
      {pct == null ? (up ? "new" : "—") : `${up ? "+" : ""}${pct.toFixed(1)}%`}
    </span>
  );
}

/**
 * Magazine KPI layout: the first metric runs as the lead story (large
 * display numeral, accent field), the rest sit in a hairline-ruled grid.
 */
export function KpiStrip({ items, loading }: { items: Kpi[]; loading?: boolean }) {
  if (loading) {
    return (
      <div className="grid gap-[var(--rpt-gap)] lg:grid-cols-4">
        <Skeleton className="h-[168px] rounded-[var(--rpt-radius)] lg:col-span-2" />
        <Skeleton className="h-[168px] rounded-[var(--rpt-radius)] lg:col-span-2" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[104px] rounded-[var(--rpt-radius)]" />
        ))}
      </div>
    );
  }
  if (items.length === 0) return null;

  const [lead, ...rest] = items;
  const toneOf = (k: Kpi) =>
    k.tone === "good" ? "var(--rpt-good)" : k.tone === "bad" ? "var(--rpt-bad)" : "var(--rpt-accent)";

  return (
    <div className="grid gap-[var(--rpt-gap)] lg:grid-cols-4">
      {/* Lead metric */}
      <div
        className="rpt-surface relative overflow-hidden px-6 py-6 lg:col-span-2"
        style={{ background: "linear-gradient(135deg, var(--rpt-accent-soft), transparent 62%), var(--rpt-surface)" }}
      >
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-[3px]"
          style={{ background: toneOf(lead) }}
        />
        <p className="rpt-kicker">Lead metric</p>
        <p className="rpt-eyebrow mt-2 text-foreground">{lead.label}</p>
        <p className="rpt-metric-xl mt-2" style={{ color: toneOf(lead) }}>
          {fmtKpi(lead)}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
          <Delta k={lead} />
          {lead.hint && <p className="rpt-sub">{lead.hint}</p>}
        </div>
      </div>

      {/* Supporting metrics */}
      {rest.map((k, i) => (
        <div
          key={k.label}
          className={cn(
            "rpt-surface group relative overflow-hidden px-4 py-4",
            i === 0 && rest.length > 3 && "lg:col-span-2",
          )}
        >
          <span
            aria-hidden
            className="absolute inset-y-3 left-0 w-[2px] opacity-0 transition-opacity group-hover:opacity-100"
            style={{ background: toneOf(k) }}
          />
          <p className="rpt-eyebrow">{k.label}</p>
          <p
            className="rpt-metric mt-1.5"
            style={k.tone && k.tone !== "default" ? { color: toneOf(k) } : undefined}
          >
            {fmtKpi(k)}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <Delta k={k} />
            {k.hint && <p className="rpt-sub truncate">{k.hint}</p>}
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
    <div className="flex flex-col items-center justify-center gap-2 rounded-[var(--rpt-radius)] border border-dashed border-[var(--rpt-border-strong)] bg-[var(--rpt-surface-2)] py-14 text-center">
      <span aria-hidden className="rpt-rule mb-1" />
      <p className="rpt-kicker">Nothing to report</p>
      <p className="rpt-sub max-w-sm">{text}</p>
    </div>
  );
}

