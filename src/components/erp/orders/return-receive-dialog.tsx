import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PackageCheck, PackageX, Ban, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import type { OrderStatus } from "@/lib/erp/orders";

export type ReturnReceiveTarget = {
  id: string;
  invoice_no?: string | null;
  shipping_name?: string | null;
  total?: number | null;
  status?: OrderStatus;
};

type Condition = "good" | "damaged" | "lost";

const CONDITIONS: {
  key: Condition;
  label: string;
  hint: string;
  icon: typeof PackageCheck;
  tone: string;
  finalStatus: OrderStatus;
}[] = [
  {
    key: "good",
    label: "Good — restock",
    hint: "Parcel পাওয়া গেছে, product ঠিক আছে। Stock-এ পুরোটা ফেরত যাবে।",
    icon: PackageCheck,
    tone: "text-emerald-600 border-emerald-500/40 bg-emerald-500/5",
    finalStatus: "returned",
  },
  {
    key: "damaged",
    label: "Damaged — no restock",
    hint: "Parcel এসেছে কিন্তু product নষ্ট। Stock বাড়বে না, loss হিসেবে থাকবে।",
    icon: PackageX,
    tone: "text-amber-600 border-amber-500/40 bg-amber-500/5",
    finalStatus: "returned",
  },
  {
    key: "lost",
    label: "Lost / not received",
    hint: "Courier return দিয়েছে কিন্তু parcel হারিয়ে গেছে। Stock বাড়বে না।",
    icon: Ban,
    tone: "text-rose-600 border-rose-500/40 bg-rose-500/5",
    finalStatus: "returned",
  },
];

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orders: ReturnReceiveTarget[];
  onDone?: () => void;
};

export function ReturnReceiveDialog({ open, onOpenChange, orders, onDone }: Props) {
  const [condition, setCondition] = useState<Condition>("good");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) { setCondition("good"); setNote(""); }
  }, [open]);

  const meta = CONDITIONS.find((c) => c.key === condition)!;
  const count = orders.length;

  const submit = async () => {
    if (!count) return;
    setBusy(true);
    let ok = 0;
    const failures: string[] = [];
    for (const o of orders) {
      const { error } = await supabase.rpc("confirm_return_received", {
        _order_id: o.id,
        _condition: condition,
        _note: note.trim() || undefined,
        _final_status: meta.finalStatus,
      });
      if (error) failures.push(`${o.invoice_no ?? o.id.slice(0, 8)}: ${error.message}`);
      else ok++;
    }
    setBusy(false);
    if (ok) {
      toast.success(
        condition === "good"
          ? `${ok} return received — stock restocked`
          : `${ok} return received — marked ${condition}`,
      );
    }
    if (failures.length) toast.error(failures[0]);
    if (ok) { onOpenChange(false); onDone?.(); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (!busy ? onOpenChange(v) : null)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Confirm return received</DialogTitle>
          <DialogDescription>
            Parcel হাতে আসার পর confirm করো। শুধু "Good" দিলে stock ফেরত যাবে।
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
          {count === 1 ? (
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">{orders[0]?.invoice_no ?? orders[0]?.id.slice(0, 8)}</span>
              <span className="text-muted-foreground truncate">{orders[0]?.shipping_name ?? "—"}</span>
              <span className="tabular-nums font-semibold">৳{Number(orders[0]?.total ?? 0).toLocaleString()}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{count}</Badge>
              <span className="text-muted-foreground">orders will be marked received</span>
            </div>
          )}
        </div>

        <div className="grid gap-2">
          {CONDITIONS.map((c) => {
            const Icon = c.icon;
            const active = c.key === condition;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => setCondition(c.key)}
                className={cn(
                  "flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                  active ? c.tone : "border-border hover:bg-muted/50",
                )}
              >
                <Icon className={cn("h-4 w-4 mt-0.5", active ? "" : "text-muted-foreground")} />
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{c.label}</div>
                  <div className="text-xs text-muted-foreground">{c.hint}</div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="return-note" className="text-xs">Note (optional)</Label>
          <Textarea
            id="return-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="যেমন: 2 pcs ভাঙা, box ছেঁড়া…"
            rows={2}
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !count}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirm received
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
