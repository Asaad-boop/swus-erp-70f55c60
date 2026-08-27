import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Loader2, ArrowRight, Truck, PackageCheck, ClipboardCheck, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  updateReturnStatus, completeQC, markExchangeReplacementSent, completeExchange,
} from "@/lib/erp/returns/returns.functions";

type Props = {
  caseId: string;
  type: "return" | "exchange";
  status: string;
  size?: "sm" | "default";
  variant?: "default" | "outline" | "secondary";
  compact?: boolean;
};

const RETURN_FLOW: Record<string, { next: string; label: string }> = {
  initiated: { next: "courier_picked", label: "Mark Picked by Courier" },
  courier_picked: { next: "in_transit", label: "Mark In Transit" },
  in_transit: { next: "received", label: "Mark Received" },
  received: { next: "qc_pending", label: "Start QC" },
  restocked: { next: "closed", label: "Close Case" },
  loss_recorded: { next: "closed", label: "Close Case" },
};

const EXCHANGE_FLOW: Record<string, { next: string; label: string }> = {
  initiated: { next: "processing", label: "Start Processing" },
  processing: { next: "replacement_sent", label: "Mark Replacement Sent" },
  replacement_sent: { next: "replacement_delivered", label: "Mark Delivered" },
  replacement_delivered: { next: "return_in_transit", label: "Mark Return Picked" },
  return_in_transit: { next: "return_received", label: "Mark Return Received" },
  return_received: { next: "completed", label: "Complete Exchange" },
};

export function CaseActionButton({ caseId, type, status, size = "sm", variant = "default", compact }: Props) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [trackingOpen, setTrackingOpen] = useState(false);
  const [qcOpen, setQcOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);

  const updateStatus = useServerFn(updateReturnStatus);
  const completeQc = useServerFn(completeQC);
  const markSent = useServerFn(markExchangeReplacementSent);
  const completeExc = useServerFn(completeExchange);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["returns-list"] });
    qc.invalidateQueries({ queryKey: ["exchanges-list"] });
    qc.invalidateQueries({ queryKey: ["case-detail", caseId] });
  };

  const simpleMut = useMutation({
    mutationFn: (next: string) =>
      updateStatus({ data: { caseId, status: next, isExchange: type === "exchange" } }),
    onSuccess: (_d, next) => { toast.success(`Moved to "${next.replace(/_/g, " ")}"`); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const flow = type === "return" ? RETURN_FLOW : EXCHANGE_FLOW;
  const step = flow[status];

  // Return QC — available as soon as the parcel is received.
  if (type === "return" && (status === "qc_pending" || status === "received")) {
    return (
      <>
        <Button size={size} variant={variant} onClick={(e) => { e.stopPropagation(); setQcOpen(true); }}>
          <ClipboardCheck className="h-3.5 w-3.5 mr-1" />{compact ? "QC" : "Do QC"}
        </Button>
        <QcDialog open={qcOpen} onOpenChange={setQcOpen} onDone={(c, n) => {
          completeQc({ data: { caseId, condition: c, notes: n || undefined } })
            .then((r: any) => { toast.success(r?.restocked ? "Restocked" : "QC done"); invalidate(); setQcOpen(false); })
            .catch((e) => toast.error(e.message));
        }} />
      </>
    );
  }

  // Closed / completed — view only
  if (status === "closed" || status === "completed") {
    return (
      <Button size={size} variant="ghost" onClick={(e) => { e.stopPropagation(); navigate({ to: "/erp/returns/$caseId", params: { caseId } }); }}>
        View
      </Button>
    );
  }

  if (!step) return null;

  // Exchange: replacement_sent needs tracking input
  if (type === "exchange" && status === "processing") {
    return (
      <>
        <Button size={size} variant={variant} onClick={(e) => { e.stopPropagation(); setTrackingOpen(true); }}>
          <Truck className="h-3.5 w-3.5 mr-1" />{step.label}
        </Button>
        <TrackingDialog open={trackingOpen} onOpenChange={setTrackingOpen} onSubmit={(tracking, courier) => {
          markSent({ data: { caseId, trackingId: tracking, courierName: courier } })
            .then(() => { toast.success("Marked sent"); invalidate(); setTrackingOpen(false); })
            .catch((e) => toast.error(e.message));
        }} />
      </>
    );
  }

  // Exchange: return_received → complete with old item condition
  if (type === "exchange" && status === "return_received") {
    return (
      <>
        <Button size={size} variant={variant} onClick={(e) => { e.stopPropagation(); setCompleteOpen(true); }}>
          <PackageCheck className="h-3.5 w-3.5 mr-1" />{step.label}
        </Button>
        <QcDialog open={completeOpen} onOpenChange={setCompleteOpen} title="Old Item Condition" onDone={(c, n) => {
          completeExc({ data: { caseId, oldCondition: c, notes: n || undefined } })
            .then((r: any) => { toast.success(r?.restocked ? "Old item restocked" : "Exchange completed"); invalidate(); setCompleteOpen(false); })
            .catch((e) => toast.error(e.message));
        }} />
      </>
    );
  }

  return (
    <Button size={size} variant={variant} disabled={simpleMut.isPending}
      onClick={(e) => { e.stopPropagation(); simpleMut.mutate(step.next); }}>
      {simpleMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <>{step.label}<ArrowRight className="h-3.5 w-3.5 ml-1" /></>}
    </Button>
  );
}

/* ---------- Sub-dialogs ---------- */

function TrackingDialog({ open, onOpenChange, onSubmit }: { open: boolean; onOpenChange: (v: boolean) => void; onSubmit: (t: string, c?: string) => void }) {
  const [tracking, setTracking] = useState("");
  const [courier, setCourier] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
        <DialogHeader><DialogTitle>Replacement Shipment Details</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Tracking ID *</Label>
            <Input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="e.g. PD23409823" />
          </div>
          <div>
            <Label className="text-xs">Courier</Label>
            <Input value={courier} onChange={(e) => setCourier(e.target.value)} placeholder="Pathao / Steadfast" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!tracking.trim()} onClick={() => onSubmit(tracking.trim(), courier.trim() || undefined)}>Confirm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QcDialog({ open, onOpenChange, onDone, title = "Quality Check" }: {
  open: boolean; onOpenChange: (v: boolean) => void; onDone: (c: "sellable" | "damaged" | "missing", n: string) => void; title?: string;
}) {
  const [condition, setCondition] = useState<"sellable" | "damaged" | "missing">("sellable");
  const [notes, setNotes] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs mb-1.5 block">Condition</Label>
            <div className="grid grid-cols-3 gap-2">
              <ConditionBtn active={condition === "sellable"} onClick={() => setCondition("sellable")} icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />} label="Good — Restock" />
              <ConditionBtn active={condition === "damaged"} onClick={() => setCondition("damaged")} icon={<XCircle className="h-4 w-4 text-rose-600" />} label="Damaged" />
              <ConditionBtn active={condition === "missing"} onClick={() => setCondition("missing")} icon={<AlertTriangle className="h-4 w-4 text-amber-600" />} label="Missing" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </div>
          {condition === "sellable" && (
            <p className="text-[11px] text-emerald-700 bg-emerald-50 px-2 py-1 rounded">
              ✓ Stock will be auto-incremented (+1 unit added back)
            </p>
          )}
          {condition !== "sellable" && (
            <p className="text-[11px] text-rose-700 bg-rose-50 px-2 py-1 rounded">
              ⚠ Loss will be recorded. No stock movement.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onDone(condition, notes)}>Confirm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConditionBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button type="button" onClick={onClick} className={
      "flex flex-col items-center gap-1 rounded-md border px-2 py-2 text-[11px] font-medium transition-colors " +
      (active ? "border-amber-500 bg-amber-100/60 text-amber-900" : "border-border bg-card hover:bg-muted/50")
    }>
      {icon}{label}
    </button>
  );
}