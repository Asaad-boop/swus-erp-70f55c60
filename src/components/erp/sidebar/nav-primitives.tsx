import { memo } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { NavItem } from "@/lib/erp/nav";
import { InboxQueueBadge } from "@/components/erp/inbox/inbox-unread-badge";

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
 * One navigation row. Memoized: it only re-renders when its own flags change,
 * so a route change touches two rows, not ninety.
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
    <div className="group/row relative">
      <Link
        to={item.to as never}
        search={item.search as never}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          "relative flex items-center gap-2.5 rounded-lg outline-none transition-colors duration-150",
          "focus-visible:ring-2 focus-visible:ring-sidebar-ring",
          mini
            ? "mx-auto h-9 w-9 justify-center"
            : indented
              ? "h-[30px] pl-[34px] pr-2 text-[13px]"
              : "h-8 px-2 text-[13.5px]",
          active
            ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
            : "text-sidebar-foreground/65 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
        )}
      >
        {indented ? (
          <span
            aria-hidden
            className={cn(
              "absolute left-[15px] top-1/2 h-[14px] w-[2px] -translate-y-1/2 rounded-full transition-colors",
              active ? "bg-primary" : "bg-transparent",
            )}
          />
        ) : null}
        <Icon
          className={cn(
            "h-4 w-4 shrink-0",
            active ? "text-primary" : "opacity-75",
            indented && "h-[15px] w-[15px]",
          )}
          strokeWidth={1.85}
        />
        {!mini && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
        {item.badge && <InboxQueueBadge queue={item.badge} mini={mini} />}
      </Link>
      {!mini && onPin && !item.badge && (
        <button
          type="button"
          aria-label={pinned ? "Unpin" : "Pin"}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onPin(item);
          }}
          className={cn(
            "absolute right-1 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md outline-none",
            "text-sidebar-foreground/40 hover:bg-background hover:text-primary focus-visible:opacity-100",
            pinned ? "text-primary opacity-100" : "opacity-0 group-hover/row:opacity-100",
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
  badge?: NavItem["badge"];
};

export const SectionHeader = memo(function SectionHeader({
  label,
  icon: Icon,
  open,
  hasActive,
  onToggle,
  badge,
}: SectionProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={cn(
        "group/sec flex h-8 w-full items-center gap-2.5 rounded-lg px-2 text-[13.5px] outline-none transition-colors duration-150",
        "hover:bg-sidebar-accent/70 focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        hasActive
          ? "font-medium text-sidebar-foreground"
          : "text-sidebar-foreground/70 hover:text-sidebar-foreground",
      )}
    >
      <Icon
        className={cn("h-4 w-4 shrink-0", hasActive ? "text-primary" : "opacity-75")}
        strokeWidth={1.85}
      />
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      {badge && !open && <InboxQueueBadge queue={badge} />}
      <ChevronRight
        className={cn(
          "h-3.5 w-3.5 shrink-0 text-sidebar-foreground/35 transition-transform duration-200 ease-out group-hover/sec:text-sidebar-foreground/60",
          open && "rotate-90",
        )}
      />
    </button>
  );
});

export function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1 px-2 text-[11.5px] font-medium text-sidebar-foreground/45">{children}</div>
  );
}
