import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardList, Loader2, MinusCircle, StickyNote, ListX } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const fmtBdt = (n: number) =>
  new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(n || 0);

type StocktakeItem = {
  id: string;
  system_qty: number;
  counted_qty: number | null;
  variance: number | null;
  variance_value: number | null;
  notes: string | null;
  product?: { title?: string; sku?: string } | null;
  variant?: { title?: string; sku?: string } | null;
};

type CheckDef = {
  key: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  tone: "amber" | "rose" | "sky" | "emerald";
  rows?: { label: string; detail: string; tone?: string }[];
};

const toneStyles: Record<CheckDef["tone"], string> = {
  amber: "border-amber-300 bg-amber-500/10 text-amber-700",
  rose: "border-rose-300 bg-rose-500/10 text-rose-700",
  sky: "border-sky-300 bg-sky-500/10 text-sky-700",
  emerald: "border-emerald-300 bg-emerald-500/10 text-emerald-700",
};

export function FinalizeChecklistDialog({
  items,
  stats,
  isPending,
  onFinalize,
}: {
  items: StocktakeItem[];
  stats: { variance: number; totalVarVal: number };
  isPending: boolean;
  onFinalize: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const checks: CheckDef[] = useMemo(() => {
    const list: CheckDef[] = [];

    const uncounted = items.filter((i) => i.counted_qty == null);
    if (uncounted.length > 0) {
      list.push({
        key: "uncounted",
        icon: <ListX className="h-4 w-4" />,
        title: `${uncounted.length} item${uncounted.length > 1 ? "s" : ""} without a count`,
        description: "These will be SKIPPED — no stock change for them. Tick to confirm you intentionally left them blank.",
        tone: "amber",
        rows: uncounted.slice(0, 8).map((i) => ({
          label: i.product?.title ?? "—",
          detail: i.variant?.title ?? i.variant?.sku ?? i.product?.sku ?? "",
        })),
      });
    }

    const bigVariance = items
      .filter((i) => i.counted_qty != null && i.variance !== 0)
      .filter((i) => Math.abs(Number(i.variance)) >= 20 || Math.abs(Number(i.variance_value || 0)) >= 5000)
      .sort((a, b) => Math.abs(Number(b.variance_value || 0)) - Math.abs(Number(a.variance_value || 0)));
    if (bigVariance.length > 0) {
      list.push({
        key: "bigvariance",
        icon: <AlertTriangle className="h-4 w-4" />,
        title: `${bigVariance.length} large variance${bigVariance.length > 1 ? "s" : ""} (±20 pcs or ±৳5,000)`,
        description: "Review each number below against the physical sheet. Tick once every count is double-checked.",
        tone: "rose",
        rows: bigVariance.slice(0, 10).map((i) => ({
          label: `${i.product?.title ?? "—"}${i.variant?.title ? ` · ${i.variant.title}` : ""}`,
          detail: `${i.system_qty} → ${i.counted_qty} (${Number(i.variance) > 0 ? "+" : ""}${i.variance})`,
          tone: Number(i.variance) < 0 ? "text-rose-600" : "text-emerald-600",
        })),
      });
    }

    const negative = items.filter((i) => i.counted_qty != null && i.system_qty < 0);
    if (negative.length > 0) {
      list.push({
        key: "negative",
        icon: <MinusCircle className="h-4 w-4" />,
        title: `${negative.length} item${negative.length > 1 ? "s" : ""} had negative system stock`,
        description: "These will jump from a negative balance to the counted qty. Confirm the counts are real, not placeholders.",
        tone: "amber",
        rows: negative.slice(0, 8).map((i) => ({
          label: i.product?.title ?? "—",
          detail: `${i.system_qty} → ${i.counted_qty}`,
        })),
      });
    }

    const noted = items.filter((i) => i.notes && i.notes.trim() !== "");
    if (noted.length > 0) {
      list.push({
        key: "notes",
        icon: <StickyNote className="h-4 w-4" />,
        title: `${noted.length} item${noted.length > 1 ? "s" : ""} carry notes`,
        description: "Read the notes once more so no special case (damage, removal, hold) gets missed.",
        tone: "sky",
        rows: noted.slice(0, 8).map((i) => ({
          label: i.product?.title ?? "—",
          detail: i.notes ?? "",
        })),
      });
    }

    list.push({
      key: "confirm",
      icon: <CheckCircle2 className="h-4 w-4" />,
      title: "Final confirmation",
      description: `Apply ${stats.variance} adjustment${stats.variance === 1 ? "" : "s"} with net value ${fmtBdt(stats.totalVarVal)}. This posts ledger corrections and cannot be undone.`,
      tone: "emerald",
    });

    return list;
  }, [items, stats]);

  const doneCount = checks.filter((c) => checked[c.key]).length;
  const allDone = doneCount === checks.length;

  const toggle = (key: string, v: boolean) =>
    setChecked((p) => ({ ...p, [key]: v }));

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setChecked({}); }}>
      <DialogTrigger asChild>
        <Button size="sm"><CheckCircle2 className="h-4 w-4 mr-1" />Finalize</Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" /> Final review checklist
          </DialogTitle>
          <DialogDescription>
            Tick every item to unlock finalize. Nothing is applied until the last step.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <span className="text-muted-foreground">
            Progress: <b className="text-foreground">{doneCount}/{checks.length}</b> confirmed
          </span>
          <Badge variant="outline" className={cn("border", stats.totalVarVal < 0 ? "border-rose-300 bg-rose-500/10 text-rose-700" : "border-emerald-300 bg-emerald-500/10 text-emerald-700")}>
            Net {fmtBdt(stats.totalVarVal)}
          </Badge>
        </div>

        <ScrollArea className="max-h-[50vh] pr-3">
          <div className="space-y-3">
            {checks.map((c) => {
              const isOn = !!checked[c.key];
              return (
                <label
                  key={c.key}
                  className={cn(
                    "flex gap-3 rounded-lg border p-3 cursor-pointer transition-colors",
                    isOn ? "border-primary/50 bg-primary/5" : "hover:bg-muted/40",
                  )}
                >
                  <Checkbox
                    checked={isOn}
                    onCheckedChange={(v) => toggle(c.key, v === true)}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 font-medium text-sm">
                      <span className={cn("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px]", toneStyles[c.tone])}>
                        {c.icon}
                      </span>
                      {c.title}
                    </div>
                    <p className="text-xs text-muted-foreground">{c.description}</p>
                    {c.rows && c.rows.length > 0 && (
                      <div className="mt-1 rounded-md border bg-background/60 divide-y text-xs">
                        {c.rows.map((r, idx) => (
                          <div key={idx} className="flex items-center justify-between gap-2 px-2 py-1.5">
                            <span className="truncate font-medium">{r.label}</span>
                            <span className={cn("shrink-0 tabular-nums text-muted-foreground", r.tone)}>{r.detail}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </label>
              );
            })}
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Not yet</Button>
          <Button disabled={!allDone || isPending} onClick={onFinalize}>
            {isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
            Finalize & adjust stock
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
