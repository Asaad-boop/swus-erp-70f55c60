import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function KpiTile({ icon, label, value, valueClass, hint }: { icon: ReactNode; label: string; value: string; valueClass?: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-2 text-[11px] font-medium tracking-wider text-muted-foreground">
        <span className="h-5 w-5 inline-flex items-center justify-center rounded-md bg-muted">{typeof icon === "string" ? icon : icon}</span>
        {label}
      </div>
      <div className={cn("text-xl font-bold tabular-nums mt-1", valueClass)}>{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}

export function Mini({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div>
      <div className="text-[10px] tracking-wider text-muted-foreground font-medium">{label}</div>
      <div className={cn("font-bold tabular-nums text-sm mt-0.5", valueClass)}>{value}</div>
    </div>
  );
}

export function SummaryBox({ tone, label, cartons, pieces }: { tone: "emerald" | "orange" | "indigo" | "slate"; label: string; cartons: number; pieces: number }) {
  const toneMap = {
    emerald: "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/40 text-emerald-700 dark:text-emerald-300",
    orange:  "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-900/40 text-orange-700 dark:text-orange-300",
    indigo:  "bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-900/40 text-indigo-700 dark:text-indigo-300",
    slate:   "bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300",
  };
  return (
    <div className={cn("rounded-lg border p-3", toneMap[tone])}>
      <div className="text-[10px] tracking-wider font-semibold opacity-80">{label}</div>
      <div className="text-xl font-bold tabular-nums mt-1">{cartons} <span className="text-[11px] font-medium opacity-70">cartons</span></div>
      <div className="text-[11px] opacity-70 mt-0.5">{pieces} pcs</div>
    </div>
  );
}

export function BillTile({
  label,
  value,
  valueClass,
  hint,
  title,
}: {
  label: string;
  value: string;
  valueClass?: string;
  hint?: string;
  title?: string;
}) {
  return (
    <div
      title={title}
      className="rounded-lg bg-background/70 border border-border/60 px-3 py-2.5 shadow-[0_1px_0_0_color-mix(in oklab, var(--border) 40%, transparent)] transition-colors hover:border-border"
    >
      <div className="text-[10px] tracking-wider font-semibold text-muted-foreground uppercase truncate">{label}</div>
      <div className={cn("font-bold tabular-nums text-base leading-tight mt-1", valueClass)}>{value}</div>
      {hint && <div className="mt-0.5 text-[10px] text-muted-foreground tabular-nums truncate">{hint}</div>}
    </div>
  );
}

export function Row({ left, right, rightClass }: { left: string; right: string; rightClass?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{left}</span>
      <span className={cn("tabular-nums", rightClass)}>{right}</span>
    </div>
  );
}