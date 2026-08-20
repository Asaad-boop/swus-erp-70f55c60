import { useBrand } from "@/contexts/brand-context";
import { cn } from "@/lib/utils";

// Deterministic color palette for brands (no schema change needed)
const PALETTE = [
  { bg: "bg-rose-50 dark:bg-rose-950/40", text: "text-rose-700 dark:text-rose-300", border: "border-rose-200 dark:border-rose-900/60", dot: "bg-rose-500" },
  { bg: "bg-indigo-50 dark:bg-indigo-950/40", text: "text-indigo-700 dark:text-indigo-300", border: "border-indigo-200 dark:border-indigo-900/60", dot: "bg-indigo-500" },
  { bg: "bg-emerald-50 dark:bg-emerald-950/40", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-200 dark:border-emerald-900/60", dot: "bg-emerald-500" },
  { bg: "bg-amber-50 dark:bg-amber-950/40", text: "text-amber-800 dark:text-amber-300", border: "border-amber-200 dark:border-amber-900/60", dot: "bg-amber-500" },
  { bg: "bg-sky-50 dark:bg-sky-950/40", text: "text-sky-700 dark:text-sky-300", border: "border-sky-200 dark:border-sky-900/60", dot: "bg-sky-500" },
  { bg: "bg-violet-50 dark:bg-violet-950/40", text: "text-violet-700 dark:text-violet-300", border: "border-violet-200 dark:border-violet-900/60", dot: "bg-violet-500" },
];

function hashIndex(key: string, mod: number) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return Math.abs(h) % mod;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

type Props = {
  brandId: string | null | undefined;
  variant?: "chip" | "dot" | "compact" | "text";
  className?: string;
};

export function BrandBadge({ brandId, variant = "chip", className }: Props) {
  const { brands } = useBrand();
  if (!brandId) {
    return <span className={cn("text-[10px] text-muted-foreground/50", className)}>—</span>;
  }
  const brand = brands.find((b) => b.id === brandId);
  const name = brand?.name ?? "Unknown";
  const tone = PALETTE[hashIndex(brand?.slug ?? brandId, PALETTE.length)];

  if (variant === "dot") {
    return (
      <span className={cn("inline-flex items-center gap-1.5", className)} title={name}>
        <span className={cn("h-2 w-2 rounded-full", tone.dot)} />
        <span className="text-xs text-muted-foreground">{name}</span>
      </span>
    );
  }

  if (variant === "text") {
    return (
      <span className={cn("font-semibold", tone.text, className)} title={name}>
        {name}
      </span>
    );
  }

  if (variant === "compact") {
    return (
      <span
        title={name}
        className={cn(
          "inline-flex items-center justify-center h-5 min-w-5 px-1 rounded text-[9px] font-bold uppercase tracking-wider border",
          tone.bg, tone.text, tone.border,
          className,
        )}
      >
        {initials(name)}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-1.5 h-5 rounded-full border text-[10px] font-semibold whitespace-nowrap w-fit",
        tone.bg, tone.text, tone.border,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", tone.dot)} />
      {name}
    </span>
  );
}