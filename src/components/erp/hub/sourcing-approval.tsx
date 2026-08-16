import { useEffect, useState } from "react";
import { Send, ShieldCheck, ShieldAlert, Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

export type ReviewStatus = "draft" | "submitted" | "approved" | "rejected";

export const REVIEW_META: Record<ReviewStatus, { label: string; tone: string }> = {
  draft: { label: "Not submitted", tone: "bg-muted text-muted-foreground border-border" },
  submitted: {
    label: "Waiting for admin approval",
    tone: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/30",
  },
  approved: {
    label: "Approved — order করা যাবে",
    tone: "bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-500/30",
  },
  rejected: {
    label: "Sent back — আবার দেখুন",
    tone: "bg-destructive/10 text-destructive border-destructive/30",
  },
};

/**
 * Sourcing approval gate: staff submits the picked supplier + price,
 * an admin approves (or sends it back) before any PO can be placed.
 */
export function ApprovalCard({
  status,
  submittedAt,
  reviewedAt,
  reviewNote,
  canSubmit,
  submitBlockedReason,
  isAdmin,
  busy,
  onSubmit,
  onDecision,
}: {
  status: ReviewStatus;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  reviewNote?: string | null;
  canSubmit: boolean;
  submitBlockedReason?: string | null;
  isAdmin: boolean;
  busy?: boolean;
  onSubmit: (note: string) => void;
  onDecision: (decision: "approved" | "rejected", note: string) => void;
}) {
  const [note, setNote] = useState("");
  useEffect(() => {
    setNote("");
  }, [status]);

  const meta = REVIEW_META[status] ?? REVIEW_META.draft;
  const Icon =
    status === "approved" ? ShieldCheck : status === "rejected" ? ShieldAlert : status === "submitted" ? Clock : Send;

  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <p className="text-xs font-semibold">Approval</p>
        <Badge variant="outline" className={`text-[10px] ${meta.tone}`}>
          {meta.label}
        </Badge>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {status === "submitted" && submittedAt
            ? `submitted ${new Date(submittedAt).toLocaleString()}`
            : reviewedAt
              ? `reviewed ${new Date(reviewedAt).toLocaleString()}`
              : ""}
        </span>
      </div>

      {reviewNote && (
        <p className="mt-2 rounded-md border border-dashed bg-background/60 p-2 text-[11px] text-muted-foreground">
          Note: {reviewNote}
        </p>
      )}

      {(status === "draft" || status === "rejected") && (
        <div className="mt-2 space-y-2">
          <Textarea
            rows={2}
            className="text-xs"
            placeholder="Admin-এর জন্য নোট (optional) — supplier, price কেন এটা বেছে নিলে"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" className="h-8" disabled={!canSubmit || busy} onClick={() => onSubmit(note)}>
              {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
              Submit for approval
            </Button>
            {!canSubmit && submitBlockedReason && (
              <span className="text-[11px] text-muted-foreground">{submitBlockedReason}</span>
            )}
          </div>
        </div>
      )}

      {status === "submitted" &&
        (isAdmin ? (
          <div className="mt-2 space-y-2">
            <Textarea
              rows={2}
              className="text-xs"
              placeholder="Decision note (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" className="h-8" disabled={busy} onClick={() => onDecision("approved", note)}>
                <ShieldCheck className="mr-1.5 h-3.5 w-3.5" /> Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-destructive"
                disabled={busy}
                onClick={() => onDecision("rejected", note)}
              >
                <ShieldAlert className="mr-1.5 h-3.5 w-3.5" /> Send back
              </Button>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Admin approve করলেই Place order খুলবে।
          </p>
        ))}

      {status === "approved" && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Approved — এখন supplier link, cargo agent আর payment দিয়ে order place করো।
        </p>
      )}
    </div>
  );
}
