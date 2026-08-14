import { type ReactNode } from "react";
import { CONTENT_STATUSES, CONTENT_PRIORITIES } from "@/lib/erp/hub/hub-data";

export const STATUS_TONE: Record<string, string> = {
  planned: "bg-muted text-muted-foreground",
  briefing: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  shooting: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  editing: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  scheduled: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
  live: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  cancelled: "bg-destructive/15 text-destructive",
};

export const STATUS_DOT: Record<string, string> = {
  planned: "bg-muted-foreground/60",
  briefing: "bg-amber-500",
  shooting: "bg-blue-500",
  editing: "bg-violet-500",
  scheduled: "bg-cyan-500",
  live: "bg-emerald-500",
  cancelled: "bg-destructive",
};

export const PRIORITY_TONE: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  normal: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  high: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  urgent: "bg-destructive/15 text-destructive",
};

export const PRIORITY_BAR: Record<string, string> = {
  low: "bg-muted-foreground/30",
  normal: "bg-sky-500/70",
  high: "bg-amber-500/80",
  urgent: "bg-destructive",
};

export const statusLabel = (k: string) =>
  CONTENT_STATUSES.find((s) => s.key === k)?.label ?? k;
export const priorityLabel = (k: string) =>
  CONTENT_PRIORITIES.find((p) => p.key === k)?.label ?? k;

export const todayISO = () => new Date().toISOString().slice(0, 10);

/** Days until a date string (negative = overdue). */
export function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const d = new Date(`${date}T00:00:00`).getTime();
  const t = new Date(`${todayISO()}T00:00:00`).getTime();
  return Math.round((d - t) / 86400000);
}

export function DueChip({ date, done }: { date: string | null; done?: boolean }) {
  const d = daysUntil(date);
  if (d == null) return null;
  const tone = done
    ? "bg-muted text-muted-foreground"
    : d < 0
      ? "bg-destructive/15 text-destructive"
      : d <= 2
        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
        : "bg-muted text-muted-foreground";
  const text = done ? date : d < 0 ? `${Math.abs(d)}d overdue` : d === 0 ? "Due today" : `in ${d}d`;
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${tone}`}>{text}</span>
  );
}

/** Clickable KPI tile used in the desk header strip. */
export function KpiTile({
  label,
  value,
  hint,
  active,
  accent = "primary",
  onClick,
}: {
  label: string;
  value: string;
  hint?: string;
  active?: boolean;
  accent?: "primary" | "amber" | "destructive" | "emerald" | "muted";
  onClick?: () => void;
}) {
  const ring: Record<string, string> = {
    primary: "ring-primary/40 bg-primary/5",
    amber: "ring-amber-500/40 bg-amber-500/5",
    destructive: "ring-destructive/40 bg-destructive/5",
    emerald: "ring-emerald-500/40 bg-emerald-500/5",
    muted: "ring-border bg-muted/30",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`rounded-xl border p-3 text-left transition-all ${
        onClick ? "hover:-translate-y-0.5 hover:shadow-md" : "cursor-default"
      } ${active ? `ring-2 ${ring[accent]}` : "bg-card"}`}
    >
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="font-display text-lg font-bold leading-tight">{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </button>
  );
}

export function BudgetBar({ budget, spent }: { budget: number; spent: number }) {
  const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : spent > 0 ? 100 : 0;
  const over = budget > 0 && spent > budget;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={`h-full rounded-full transition-all ${over ? "bg-destructive" : "bg-primary"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

/** Simple month grid; items are placed on their date. */
export function MonthGrid<T>({
  month,
  items,
  dateOf,
  render,
}: {
  month: Date;
  items: T[];
  dateOf: (item: T) => string | null;
  render: (item: T) => ReactNode;
}) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push(d);
  }
  const byDate = new Map<string, T[]>();
  for (const it of items) {
    const k = dateOf(it);
    if (!k) continue;
    const list = byDate.get(k) ?? [];
    list.push(it);
    byDate.set(k, list);
  }
  const today = todayISO();
  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="grid grid-cols-7 border-b bg-muted/40 text-[11px] font-medium text-muted-foreground">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="px-2 py-1.5 text-center">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d, i) => {
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
            d.getDate(),
          ).padStart(2, "0")}`;
          const inMonth = d.getMonth() === month.getMonth();
          const list = byDate.get(key) ?? [];
          return (
            <div
              key={i}
              className={`min-h-[92px] space-y-1 border-b border-r p-1.5 ${
                inMonth ? "" : "bg-muted/20 opacity-60"
              } ${key === today ? "bg-primary/5" : ""}`}
            >
              <p
                className={`text-[10px] ${
                  key === today ? "font-bold text-primary" : "text-muted-foreground"
                }`}
              >
                {d.getDate()}
              </p>
              {list.map((it, j) => (
                <div key={j}>{render(it)}</div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}