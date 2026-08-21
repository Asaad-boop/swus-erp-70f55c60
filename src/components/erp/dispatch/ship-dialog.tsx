import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Truck, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  bdt, customerName, customerPhone, fullAddress, isCod, preflight,
  type CourierProvider, type DispatchOrder, type UseDispatch,
} from "@/hooks/erp/use-dispatch";

const PROVIDERS: { key: CourierProvider; label: string; hint: string }[] = [
  { key: "pathao", label: "Pathao", hint: "Auto city/zone/area detect" },
  { key: "steadfast", label: "Steadfast", hint: "COD amount সহ book" },
  { key: "manual", label: "Manual", hint: "নিজের courier + tracking" },
];

export function ShipDialog({
  open, order, d, onClose,
}: {
  open: boolean;
  order: DispatchOrder | null;
  d: UseDispatch;
  onClose: () => void;
}) {
  const [prov, setProv] = useState<CourierProvider>(d.provider);
  const [tracking, setTracking] = useState("");
  const [courierName, setCourierName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setProv(d.provider);
      setTracking("");
      setCourierName("");
    }
  }, [open, d.provider]);

  if (!order) return null;
  const issues = preflight(order);

  async function confirm() {
    if (!order) return;
    setBusy(true);
    const ok = await d.advance(order, "ship", { provider: prov, manualTracking: tracking, manualCourier: courierName });
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-4 w-4" /> Ship #{order.invoice_no ?? order.id.slice(0, 8)}
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-xl border bg-muted/30 p-3 text-sm space-y-0.5">
          <div className="font-semibold">{customerName(order)}</div>
          <div className="text-xs text-muted-foreground">{customerPhone(order) || "no phone"}</div>
          <div className="text-xs text-muted-foreground line-clamp-2">{fullAddress(order) || "no address"}</div>
          <div className="text-xs font-semibold pt-1">
            {isCod(order) ? `COD ${bdt(order.total ?? 0)}` : `PREPAID · ${bdt(order.total ?? 0)}`}
          </div>
        </div>

        {issues.length > 0 ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900/60 p-2.5 space-y-1">
            {issues.map((i) => (
              <div key={i} className="flex items-center gap-1.5 text-xs text-amber-800 dark:text-amber-200">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {i}
              </div>
            ))}
            <p className="text-[11px] text-amber-700 dark:text-amber-300 pt-0.5">Fix menu থেকে ঠিক করে আবার চেষ্টা করো।</p>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5" /> Pre-flight OK
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          {PROVIDERS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setProv(p.key)}
              className={cn(
                "rounded-xl border p-2.5 text-left transition-colors",
                prov === p.key ? "border-foreground bg-foreground text-background" : "hover:border-foreground/40",
              )}
            >
              <div className="text-xs font-semibold">{p.label}</div>
              <div className={cn("text-[10px] mt-0.5", prov === p.key ? "opacity-70" : "text-muted-foreground")}>{p.hint}</div>
            </button>
          ))}
        </div>

        {prov === "manual" && (
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Courier name</Label>
              <Input value={courierName} onChange={(e) => setCourierName(e.target.value)} placeholder="e.g. RedX" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Tracking / consignment</Label>
              <Input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="Required" />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={confirm} disabled={busy || issues.length > 0 || (prov === "manual" && !tracking.trim())}>
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Truck className="h-4 w-4 mr-2" />}
            Book & Ship
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
