import { memo } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { NavItem } from "@/lib/erp/nav";

export function favKey(i: { to: string; label: string; search?: Record<string, string> }) {
  return i.to + "|" + (i.search ? JSON.stringify(i.search) : "") + "|" + i.label;
}

export type LinkRowProps = {
  item: NavItem;
  active: boolean;
  /** icons-only rail rendering */
  mini?: boolean;
  /** nested inside an expanded section */
  indented?: boolean;
  pinned?: boolean;
  onPin?: (item: NavItem) => void;
  onNavigate?: () => void;
};

/**
 * A single navigation row. Memoized: it only re-renders when its own
 * active/pinned/mode flags change, so route changes touch two rows, not 90.
 */
export const NavLinkRow = memo(function NavLinkRow({
  item,
  active,
  mini,
  indented,
  pinned,
  onPin,
  onNavigate,
}: LinkRowProps) {
  const Icon = item.icon;
  const row = (
    <div className="relative group/row">
      <Link
        to={item.to as never}
        search={item.search as never}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group/link relative flex items-center gap-2.5 rounded-xl outline-none",
          "transition-all duration-200 ease-out",
          "focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-0",
          mini
            ? "justify-center h-9 w-9 mx-auto"
            : indented
              ? "pl-9 pr-8 py-1.5 text-[13px] rounded-lg"
              : "px-2.5 py-2 pr-8 text-[13.5px] font-medium",
          active
            ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold shadow-[inset_0_0_0_1px_var(--sidebar-border)]"
            : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground hover:translate-x-0.5",
        )}
      >
        {!indented && (
          <span
            aria-hidden
            className={cn(
              "absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-r-full bg-primary transition-opacity duration-150",
              active ? "opacity-100" : "opacity-0",
            )}
          />
        )}
        <Icon className={cn("h-4 w-4 shrink-0", active && "text-primary")} />
        {!mini && <span className="truncate">{item.label}</span>}
      </Link>
      {!mini && onPin && (
        <button
          type="button"
          aria-label={pinned ? "Unpin" : "Pin"}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onPin(item);
          }}
          className={cn(
            "absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 inline-flex items-center justify-center rounded",
            "text-muted-foreground/60 hover:text-primary hover:bg-sidebar-accent",
            "focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-sidebar-ring outline-none",
            pinned ? "opacity-100 text-primary" : "opacity-0 group-hover/row:opacity-100",
          )}
        >
          <Star className={cn("h-3.5 w-3.5", pinned && "fill-current")} />
        </button>
      )}
    </div>
  );

  if (!mini) return row;
  return (
    <Tooltip delayDuration={60}>
      <TooltipTrigger asChild>{row}</TooltipTrigger>
      <TooltipContent side="right" className="font-medium">
        {item.label}
      </TooltipContent>
    </Tooltip>
  );
});

export type SectionProps = {
  label: string;
  icon: NavItem["icon"];
  open: boolean;
  hasActive: boolean;
  onToggle: () => void;
};

export const SectionHeader = memo(function SectionHeader({
  label,
  icon: Icon,
  open,
  hasActive,
  onToggle,
}: SectionProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={cn(
        "w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13.5px] font-medium outline-none",
        "transition-all duration-200 ease-out hover:bg-sidebar-accent/50",
        "focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        hasActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon
        className={cn(
          "h-4 w-4 shrink-0 transition-colors duration-200",
          hasActive && "text-primary",
        )}
      />
      <span className="flex-1 truncate text-left">{label}</span>
      {!open && hasActive && (
        <span className="h-1.5 w-1.5 rounded-full bg-primary motion-safe:animate-pulse" />
      )}
      <ChevronDown
        className={cn(
          "h-3.5 w-3.5 shrink-0 text-muted-foreground/70 transition-transform duration-300 ease-out",
          open && "rotate-180",
        )}
      />
    </button>
  );
});

export function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2.5 mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/60">
      {children}
    </div>
  );
}
