import * as React from "react";
import { useBrand } from "@/contexts/brand-context";
import { DateRangePicker, buildPreset, type MktRangeValue } from "@/components/erp/marketing/date-range-picker";

const KEY = "growth-os-range";

/** Global Growth date range — shared across every Growth page via localStorage. */
export function useGrowthRange() {
  const [value, setValue] = React.useState<MktRangeValue>(() => {
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(KEY);
        if (raw) return JSON.parse(raw) as MktRangeValue;
      } catch {
        /* ignore */
      }
    }
    return buildPreset("30d");
  });

  const update = React.useCallback((v: MktRangeValue) => {
    setValue(v);
    try {
      window.localStorage.setItem(KEY, JSON.stringify(v));
    } catch {
      /* ignore */
    }
  }, []);

  return { range: value, setRange: update };
}

/** Page header with the global brand scope + date range for every Growth page. */
export function GrowthHeader({
  title,
  subtitle,
  range,
  onRangeChange,
  actions,
}: {
  title: string;
  subtitle?: string;
  range: MktRangeValue;
  onRangeChange: (v: MktRangeValue) => void;
  actions?: React.ReactNode;
}) {
  const { activeBrand, isAllBrands } = useBrand();
  return (
    <div className="flex flex-col gap-3 border-b border-border px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
      <div className="min-w-0">
        <h1 className="font-display text-xl font-semibold tracking-tight md:text-2xl">{title}</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            {isAllBrands ? "All brands" : (activeBrand?.name ?? "Brand")}
          </span>
          {subtitle ? ` · ${subtitle}` : ""}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {actions}
        <DateRangePicker value={range} onChange={onRangeChange} />
      </div>
    </div>
  );
}

/** Explicit "no real data" state — never fake numbers. */
export function InsufficientData({ note }: { note?: string }) {
  return (
    <div className="flex min-h-[96px] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border px-4 py-6 text-center">
      <p className="text-sm font-medium text-muted-foreground">Insufficient data</p>
      {note && <p className="text-xs text-muted-foreground/80">{note}</p>}
    </div>
  );
}

/** Lightweight tabs driven by a `tab` search param. */
export function GrowthTabs({
  tabs,
  value,
  onChange,
}: {
  tabs: { key: string; label: string }[];
  value: string;
  onChange: (k: string) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-border px-4 md:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={`shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
            value === t.key
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
