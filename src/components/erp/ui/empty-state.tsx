import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type EmptyStateProps = {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** A single primary call to action. Keep it to one. */
  action?: ReactNode;
  /** Tighter padding when used inside a table body. */
  compact?: boolean;
  className?: string;
};

/** The only empty state in the ERP. Never render a blank table body. */
export function EmptyState({ icon, title, description, action, compact = false, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 text-center",
        compact ? "py-10" : "py-16",
        className,
      )}
    >
      {icon != null && (
        <div className="grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">{icon}</div>
      )}
      <div className="max-w-sm">
        <div className="text-h4">{title}</div>
        {description != null && (
          <p className="mt-1 text-small-v2 text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
