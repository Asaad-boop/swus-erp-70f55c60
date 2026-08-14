import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Search, X, LayoutGrid, Rows3, Download, Inbox, Filter, Tag } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useBrand } from "@/contexts/brand-context";

/* ------------------------------------------------------------------ *
 * Page hero — gradient header shared by every Content Studio screen
 * ------------------------------------------------------------------ */

export function ContentHero({
  icon: Icon,
  eyebrow = "Content Studio",
  title,
  subtitle,
  actions,
  children,
}: {
  icon: LucideIcon;
  eyebrow?: string;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br from-primary/10 via-card to-card p-4 shadow-sm sm:p-5">
      <div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-primary/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 left-1/3 h-40 w-40 rounded-full bg-sky-500/10 blur-3xl" />
      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary shadow-sm">
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary/80">
              {eyebrow}
            </p>
            <h1 className="font-display text-xl font-bold tracking-tight sm:text-2xl">{title}</h1>
            {subtitle && (
              <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground sm:text-[13px]">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children && <div className="relative mt-4">{children}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * KPI strip — clickable stat tiles that double as filters
 * ------------------------------------------------------------------ */

export type KpiTone = "default" | "good" | "warn" | "bad" | "info";

const TONE_TEXT: Record<KpiTone, string> = {
  default: "text-foreground",
  good: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  bad: "text-destructive",
  info: "text-sky-600 dark:text-sky-400",
};

const TONE_RING: Record<KpiTone, string> = {
  default: "ring-primary/25 border-primary/40",
  good: "ring-emerald-500/25 border-emerald-500/40",
  warn: "ring-amber-500/25 border-amber-500/40",
  bad: "ring-destructive/25 border-destructive/40",
  info: "ring-sky-500/25 border-sky-500/40",
};

export function KpiStrip({ children, cols = 4 }: { children: ReactNode; cols?: 3 | 4 | 5 | 6 }) {
  const grid =
    cols === 3
      ? "sm:grid-cols-3"
      : cols === 5
        ? "sm:grid-cols-3 lg:grid-cols-5"
        : cols === 6
          ? "sm:grid-cols-3 lg:grid-cols-6"
          : "sm:grid-cols-2 lg:grid-cols-4";
  return <div className={cn("grid grid-cols-2 gap-2", grid)}>{children}</div>;
}

export function Kpi({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  onClick,
  active,
  progress,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: KpiTone;
  onClick?: () => void;
  active?: boolean;
  /** 0..1 — renders a thin progress bar at the bottom */
  progress?: number;
}) {
  const Tag = (onClick ? "button" : "div") as "button";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-card px-3 py-2.5 text-left shadow-sm transition-all",
        onClick && "hover:-translate-y-0.5 hover:shadow-md",
        active ? cn("ring-1", TONE_RING[tone]) : "border-border/70",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        {Icon && <Icon className={cn("h-3.5 w-3.5 opacity-70", TONE_TEXT[tone])} />}
      </div>
      <p className={cn("mt-1 text-xl font-bold tabular-nums leading-none", TONE_TEXT[tone])}>
        {value}
      </p>
      {hint && <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p>}
      {progress != null && (
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              tone === "bad"
                ? "bg-destructive"
                : tone === "warn"
                  ? "bg-amber-500"
                  : tone === "good"
                    ? "bg-emerald-500"
                    : "bg-primary",
            )}
            style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
          />
        </div>
      )}
    </Tag>
  );
}

/* ------------------------------------------------------------------ *
 * Sticky glass toolbar + search
 * ------------------------------------------------------------------ */

export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "sticky top-[52px] z-20 -mx-1 flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-background/80 px-2 py-2 backdrop-blur-md md:top-[46px]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SearchBox({
  value,
  onChange,
  placeholder = "Search…",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [local, setLocal] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => setLocal(value), [value]);
  useEffect(() => {
    const t = setTimeout(() => {
      if (local !== value) onChange(local);
    }, 220);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className={cn("relative min-w-[160px] flex-1 sm:max-w-xs", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={ref}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder={placeholder}
        className="h-9 pl-8 pr-8 text-sm"
      />
      {local && (
        <button
          type="button"
          onClick={() => {
            setLocal("");
            onChange("");
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label="Clear search"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Segmented control / filter chips
 * ------------------------------------------------------------------ */

export type SegOption<T extends string> = { key: T; label: string; count?: number; icon?: LucideIcon };

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "sm",
}: {
  options: readonly SegOption<T>[];
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "xs";
}) {
  return (
    <div className="inline-flex shrink-0 items-center gap-0.5 rounded-lg border border-border/70 bg-muted/50 p-0.5">
      {options.map((o) => {
        const on = o.key === value;
        const Icon = o.icon;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md font-medium transition-all",
              size === "xs" ? "px-2 py-1 text-[11px]" : "px-2.5 py-1.5 text-xs",
              on
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {Icon && <Icon className="h-3.5 w-3.5" />}
            <span>{o.label}</span>
            {o.count != null && (
              <span
                className={cn(
                  "rounded px-1 text-[10px] tabular-nums",
                  on ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                )}
              >
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function ChipFilter<T extends string>({
  options,
  value,
  onChange,
  allLabel = "All",
}: {
  options: readonly { key: T; label: string; count?: number }[];
  value: T | "all";
  onChange: (v: T | "all") => void;
  allLabel?: string;
}) {
  const all = [{ key: "all" as const, label: allLabel }, ...options];
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {all.map((o) => {
        const on = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key as T | "all")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
              on
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border/70 text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {o.label}
            {"count" in o && o.count != null && (
              <span className="tabular-nums opacity-70">{o.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function DensityToggle({
  value,
  onChange,
}: {
  value: "comfortable" | "compact";
  onChange: (v: "comfortable" | "compact") => void;
}) {
  return (
    <Segmented
      size="xs"
      value={value}
      onChange={onChange}
      options={[
        { key: "comfortable", label: "Cozy", icon: LayoutGrid },
        { key: "compact", label: "Compact", icon: Rows3 },
      ]}
    />
  );
}

/* ------------------------------------------------------------------ *
 * States
 * ------------------------------------------------------------------ */

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/20 px-6 py-14 text-center">
      <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <Icon className="h-5 w-5" />
      </span>
      <p className="font-display text-sm font-semibold">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function LoadingGrid({ rows = 6, height = 92 }: { rows?: number; height?: number }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="w-full rounded-xl" style={{ height }} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Small display atoms
 * ------------------------------------------------------------------ */

export function StatusDot({ tone }: { tone: KpiTone }) {
  const bg =
    tone === "good"
      ? "bg-emerald-500"
      : tone === "warn"
        ? "bg-amber-500"
        : tone === "bad"
          ? "bg-destructive"
          : tone === "info"
            ? "bg-sky-500"
            : "bg-muted-foreground";
  return <span className={cn("inline-block h-1.5 w-1.5 shrink-0 rounded-full", bg)} />;
}

export function Pill({
  children,
  tone = "default",
  className,
}: {
  children: ReactNode;
  tone?: KpiTone;
  className?: string;
}) {
  const map: Record<KpiTone, string> = {
    default: "border-border/70 bg-muted/60 text-muted-foreground",
    good: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    warn: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
    bad: "border-destructive/30 bg-destructive/10 text-destructive",
    info: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
        map[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function MiniBar({
  value,
  max,
  tone = "default",
  className,
}: {
  value: number;
  max: number;
  tone?: KpiTone;
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const bg =
    tone === "bad"
      ? "bg-destructive"
      : tone === "warn"
        ? "bg-amber-500"
        : tone === "good"
          ? "bg-emerald-500"
          : tone === "info"
            ? "bg-sky-500"
            : "bg-primary";
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div className={cn("h-full rounded-full transition-all", bg)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Avatar({ name, url, size = 28 }: { name: string; url?: string | null; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
  return url ? (
    <img
      src={url}
      alt={name}
      loading="lazy"
      className="shrink-0 rounded-full object-cover ring-1 ring-border"
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary ring-1 ring-primary/20"
      style={{ width: size, height: size }}
    >
      {initials || "?"}
    </span>
  );
}

export function FilterButton({
  count,
  onClick,
}: {
  count: number;
  onClick: () => void;
}) {
  return (
    <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={onClick}>
      <Filter className="h-3.5 w-3.5" />
      Filters
      {count > 0 && (
        <span className="rounded bg-primary/10 px-1 text-[10px] font-bold text-primary">{count}</span>
      )}
    </Button>
  );
}

/* ------------------------------------------------------------------ *
 * Persisted view state (per screen) + CSV export
 * ------------------------------------------------------------------ */

export function usePersistedState<T>(key: string, initial: T) {
  const storageKey = `content-studio:${key}`;
  const [state, setState] = useState<T>(initial);
  const loaded = useRef(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) setState({ ...(initial as object), ...(JSON.parse(raw) as object) } as T);
    } catch {
      /* ignore */
    }
    loaded.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [storageKey, state]);

  const patch = useCallback((p: Partial<T>) => setState((s) => ({ ...s, ...p })), []);
  return [state, patch, setState] as const;
}

export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = "\uFEFF" + rows.map((r) => r.map(esc).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExportButton({ onClick, label = "CSV" }: { onClick: () => void; label?: string }) {
  return (
    <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={onClick}>
      <Download className="h-3.5 w-3.5" />
      {label}
    </Button>
  );
}

/** Sorted helper that keeps stable ordering. */
export function sortBy<T>(arr: T[], key: (t: T) => number | string, dir: "asc" | "desc" = "desc") {
  return [...arr].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka === kb) return 0;
    const cmp = ka > kb ? 1 : -1;
    return dir === "asc" ? cmp : -cmp;
  });
}

export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function fmtNum(n: number | null | undefined) {
  const v = Number(n ?? 0);
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return String(Math.round(v));
}

/* ------------------------------------------------------------------ *
 * Brand helpers — every content record belongs to a brand
 * ------------------------------------------------------------------ */

export function useBrandLookup() {
  const { brands } = useBrand();
  return useCallback(
    (id: string | null | undefined) => (id ? (brands.find((b) => b.id === id) ?? null) : null),
    [brands],
  );
}

/** Small brand chip shown on cards / rows so it's always clear which brand owns a piece. */
export function BrandTag({
  brandId,
  className,
}: {
  brandId: string | null | undefined;
  className?: string;
}) {
  const { brands } = useBrand();
  const brand = brandId ? brands.find((b) => b.id === brandId) : null;
  if (!brandId) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full border border-dashed border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400",
          className,
        )}
      >
        No brand
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/70 px-2 py-0.5 text-[10px] font-medium text-foreground/80",
        className,
      )}
    >
      {brand?.logo_url ? (
        <img src={brand.logo_url} alt="" className="h-3 w-3 rounded-full object-cover" />
      ) : (
        <Tag className="h-2.5 w-2.5 opacity-60" />
      )}
      {brand?.name ?? "Unknown brand"}
    </span>
  );
}

/** Brand picker for create/edit forms. Required whenever the user is in "All brands" mode. */
export function BrandSelect({
  value,
  onChange,
  label = "Brand",
  className,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  label?: string;
  className?: string;
}) {
  const { brands } = useBrand();
  return (
    <div className={cn("space-y-1.5", className)}>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
      >
        <option value="">Brand বাছাই করুন…</option>
        {brands.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Chip row to filter a list by brand. Returns "all" or a brand id. */
export function BrandFilter({
  value,
  onChange,
  counts,
}: {
  value: string;
  onChange: (v: string) => void;
  counts?: Map<string | null, number>;
}) {
  const { brands } = useBrand();
  if (brands.length < 2) return null;
  const opts = [{ id: "all", name: "All brands" }, ...brands.map((b) => ({ id: b.id, name: b.name }))];
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {opts.map((o) => {
        const n = o.id === "all" ? undefined : counts?.get(o.id);
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
              active
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border/70 bg-background/60 text-muted-foreground hover:text-foreground",
            )}
          >
            {o.name}
            {n !== undefined && <span className="opacity-60">{n}</span>}
          </button>
        );
      })}
    </div>
  );
}
