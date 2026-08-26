import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatusVariant = "success" | "warning" | "danger" | "info" | "neutral";
export type StatusVisual = "solid" | "soft" | "outline";

const SOLID: Record<StatusVariant, string> = {
  success: "bg-[var(--success-solid)] text-[var(--status-on-solid)]",
  warning: "bg-[var(--warning-solid)] text-[var(--status-on-solid)]",
  danger: "bg-[var(--danger-solid)] text-[var(--status-on-solid)]",
  info: "bg-[var(--info-solid)] text-[var(--status-on-solid)]",
  neutral: "bg-[var(--neutral-solid)] text-[var(--status-on-solid)]",
};

const SOFT: Record<StatusVariant, string> = {
  success: "bg-[var(--success-soft)] text-[var(--success-text)] border border-[var(--success-border)]",
  warning: "bg-[var(--warning-soft)] text-[var(--warning-text)] border border-[var(--warning-border)]",
  danger: "bg-[var(--danger-soft)] text-[var(--danger-text)] border border-[var(--danger-border)]",
  info: "bg-[var(--info-soft)] text-[var(--info-text)] border border-[var(--info-border)]",
  neutral: "bg-[var(--neutral-soft)] text-[var(--neutral-text)] border border-[var(--neutral-border)]",
};

const OUTLINE: Record<StatusVariant, string> = {
  success: "text-[var(--success-text)] border border-[var(--success-border)]",
  warning: "text-[var(--warning-text)] border border-[var(--warning-border)]",
  danger: "text-[var(--danger-text)] border border-[var(--danger-border)]",
  info: "text-[var(--info-text)] border border-[var(--info-border)]",
  neutral: "text-[var(--neutral-text)] border border-[var(--neutral-border)]",
};

const DOT: Record<StatusVariant, string> = {
  success: "bg-[var(--success-solid)]",
  warning: "bg-[var(--warning-solid)]",
  danger: "bg-[var(--danger-solid)]",
  info: "bg-[var(--info-solid)]",
  neutral: "bg-[var(--neutral-solid)]",
};

export type StatusBadgeProps = {
  /** Semantic tone from the shared status scale. */
  variant?: StatusVariant;
  /** Rendering style. `soft` is the default across the ERP. */
  visual?: StatusVisual;
  /** Show a leading dot in the tone colour. */
  dot?: boolean;
  /** Optional leading icon (lucide element). */
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
};

/**
 * The single status pill for the whole ERP. Never re-implement per page —
 * map your domain status to one of the five semantic tones instead.
 */
export function StatusBadge({
  variant = "neutral",
  visual = "soft",
  dot = false,
  icon,
  children,
  className,
}: StatusBadgeProps) {
  const tone = visual === "solid" ? SOLID[variant] : visual === "outline" ? OUTLINE[variant] : SOFT[variant];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 font-semibold",
        "text-[length:var(--text-caption)] leading-[var(--leading-caption)]",
        tone,
        className,
      )}
    >
      {dot && (
        <span
          aria-hidden
          className={cn("h-1.5 w-1.5 shrink-0 rounded-full", visual === "solid" ? "bg-current" : DOT[variant])}
        />
      )}
      {icon}
      {children}
    </span>
  );
}
