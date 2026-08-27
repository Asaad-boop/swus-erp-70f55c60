import { cn } from "@/lib/utils";

export type CallStatusKey =
  | "not_called"
  | "attempting"
  | "reached"
  | "no_response"
  | "wrong_number"
  | "customer_confirmed"
  | "customer_cancelled"
  | "needs_followup";

type Tone = "neutral" | "info" | "success" | "warning" | "danger";

const TONE: Record<Tone, string> = {
  neutral: "bg-[var(--neutral-soft)] text-[var(--neutral-text)] border-[var(--neutral-border)]",
  info: "bg-[var(--info-soft)] text-[var(--info-text)] border-[var(--info-border)]",
  success: "bg-[var(--success-soft)] text-[var(--success-text)] border-[var(--success-border)]",
  warning: "bg-[var(--warning-soft)] text-[var(--warning-text)] border-[var(--warning-border)]",
  danger: "bg-[var(--danger-soft)] text-[var(--danger-text)] border-[var(--danger-border)]",
};

const DOT: Record<Tone, string> = {
  neutral: "bg-[var(--neutral-solid)]",
  info: "bg-[var(--info-solid)]",
  success: "bg-[var(--success-solid)]",
  warning: "bg-[var(--warning-solid)]",
  danger: "bg-[var(--danger-solid)]",
};

const META: Record<CallStatusKey, { label: string; tone: Tone }> = {
  not_called: { label: "Not called", tone: "neutral" },
  attempting: { label: "Attempted", tone: "info" },
  reached: { label: "Reached", tone: "info" },
  no_response: { label: "No answer", tone: "danger" },
  wrong_number: { label: "Wrong number", tone: "danger" },
  customer_confirmed: { label: "Confirmed", tone: "success" },
  customer_cancelled: { label: "Cancelled", tone: "warning" },
  needs_followup: { label: "Follow up", tone: "warning" },
};

export function callStatusMeta(status: string | null | undefined, attempts?: number | null) {
  const key = (status ?? "not_called") as CallStatusKey;
  const m = META[key] ?? META.not_called;
  const n = attempts ?? 0;
  const label =
    (key === "attempting" || key === "needs_followup") && n > 0 ? `${m.label} ${n}×` : m.label;
  return { ...m, label, key };
}

/** The single call-status pill used on the orders list and web orders. */
export function CallStatusChip({
  status,
  attempts,
  className,
}: {
  status: string | null | undefined;
  attempts?: number | null;
  className?: string;
}) {
  const { label, tone } = callStatusMeta(status, attempts);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-badge)] border px-1.5 py-0.5",
        "text-[11px] font-semibold leading-4",
        TONE[tone],
        className,
      )}
    >
      <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", DOT[tone])} />
      {label}
    </span>
  );
}
