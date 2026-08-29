import { Link, useLocation } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type PageTab = { key: string; label: string; icon?: LucideIcon };

/** Reads the `?tab=` query param and falls back to the first tab. */
export function useTabParam(tabs: PageTab[]) {
  const loc = useLocation();
  const raw = new URLSearchParams(loc.searchStr ?? "").get("tab");
  return tabs.some((t) => t.key === raw) ? (raw as string) : tabs[0]!.key;
}

const AnyLink = Link as unknown as React.FC<Record<string, unknown>>;

/** Secondary in-page tab bar used by merged Growth Studio pages. */
export function GrowthPageTabs({
  base,
  tabs,
  active,
  className,
}: {
  base: string;
  tabs: PageTab[];
  active: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {tabs.map((t) => {
        const on = t.key === active;
        const Icon = t.icon;
        return (
          <AnyLink
            key={t.key}
            to={base}
            search={{ tab: t.key }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              on
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border/60 bg-card/50 text-muted-foreground hover:text-foreground hover:border-border",
            )}
          >
            {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
            {t.label}
          </AnyLink>
        );
      })}
    </div>
  );
}
