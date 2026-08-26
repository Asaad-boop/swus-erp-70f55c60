import type { ReactNode } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type Density = "compact" | "default" | "relaxed";

export type FilterChip = {
  value: string;
  label: ReactNode;
  count?: number;
};

export type ToolbarProps = {
  /** Multi-select filter chips. */
  chips?: FilterChip[];
  selected?: string[];
  onToggleChip?: (value: string) => void;
  /** Search box; omit `onSearchChange` to hide it. */
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  /** Density toggle; omit `onDensityChange` to hide it. */
  density?: Density;
  onDensityChange?: (d: Density) => void;
  /** Right-aligned primary action slot. */
  actions?: ReactNode;
  className?: string;
};

const DENSITIES: { value: Density; label: string }[] = [
  { value: "compact", label: "S" },
  { value: "default", label: "M" },
  { value: "relaxed", label: "L" },
];

/** Filter chips + search + density toggle + primary action, in one row. */
export function Toolbar({
  chips,
  selected = [],
  onToggleChip,
  search,
  onSearchChange,
  searchPlaceholder = "Search…",
  density = "default",
  onDensityChange,
  actions,
  className,
}: ToolbarProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2 py-2", className)}>
      {chips?.map((c) => {
        const on = selected.includes(c.value);
        return (
          <button
            key={c.value}
            type="button"
            onClick={() => onToggleChip?.(c.value)}
            aria-pressed={on}
            className={cn(
              "focus-ring inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-caption-v2 font-semibold",
              "transition-colors duration-[var(--motion-fast)] ease-out",
              on
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-muted",
            )}
          >
            {c.label}
            {c.count != null && <span className="tabular-nums opacity-70">{c.count}</span>}
          </button>
        );
      })}

      {onSearchChange && (
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search ?? ""}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className={cn(
              "focus-ring w-full rounded-md border border-border bg-card pl-8 pr-7 text-small-v2",
              "h-[var(--control-h-md)] placeholder:text-muted-foreground",
            )}
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              aria-label="Clear search"
              className="focus-ring absolute right-1.5 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      <div className="ml-auto flex items-center gap-2">
        {onDensityChange && (
          <div className="inline-flex items-center rounded-md border border-border bg-card p-0.5" role="group" aria-label="Row density">
            {DENSITIES.map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => onDensityChange(d.value)}
                aria-pressed={density === d.value}
                className={cn(
                  "focus-ring h-6 w-6 rounded text-caption-v2 font-semibold transition-colors duration-[var(--motion-fast)] ease-out",
                  density === d.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
        )}
        {actions}
      </div>
    </div>
  );
}
