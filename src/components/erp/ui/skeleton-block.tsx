import { cn } from "@/lib/utils";

export type SkeletonBlockProps = {
  className?: string;
  /** Convenience sizing; anything else goes through className. */
  width?: string | number;
  height?: string | number;
  rounded?: "sm" | "md" | "lg" | "full";
};

const RADIUS = {
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
  full: "rounded-full",
} as const;

/**
 * Loading placeholder. Shimmers normally; under `prefers-reduced-motion`
 * it falls back to a slow opacity fade (handled in styles.css).
 */
export function SkeletonBlock({ className, width, height, rounded = "md" }: SkeletonBlockProps) {
  return (
    <div
      aria-hidden
      className={cn("skeleton-shimmer bg-muted", RADIUS[rounded], className)}
      style={{ width, height }}
    />
  );
}

/** Convenience: n stacked text lines. */
export function SkeletonLines({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonBlock key={i} height={12} className={i === lines - 1 ? "w-2/3" : "w-full"} />
      ))}
    </div>
  );
}
