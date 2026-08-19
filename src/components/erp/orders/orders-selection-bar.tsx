import { CheckCircle2, X, Printer, Truck, RefreshCcw, PackageCheck, Loader2, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  count: number;
  totalMatching: number;
  allMatchingSelected: boolean;
  onSelectAllMatching: () => void;
  onClear: () => void;
  onQuickStatus: (s: "ready_to_ship" | "delivered" | "cancelled") => void;
  onPrint: () => void;
  onBookCourier: () => void;
  onSyncCourier: () => void;
  isPending?: boolean;
  isSelectingAll?: boolean;
};

export function OrdersSelectionBar({
  count, totalMatching, allMatchingSelected, onSelectAllMatching, onClear,
  onQuickStatus, onPrint, onBookCourier, onSyncCourier, isPending, isSelectingAll,
}: Props) {
  if (count === 0) return null;
  const canSelectAll = !allMatchingSelected && totalMatching > count;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-5 px-3 w-full max-w-[min(96vw,900px)]">
      <div className="flex flex-wrap items-center justify-center gap-1 rounded-2xl border border-border bg-card/95 shadow-2xl shadow-black/25 px-2.5 py-2 backdrop-blur">
        <div className="inline-flex items-center gap-1.5 pl-1.5 pr-2.5 text-xs font-semibold">
          {isPending ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
          <span className="tabular-nums">{count.toLocaleString()}</span> selected
        </div>

        {canSelectAll && (
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={onSelectAllMatching} disabled={isSelectingAll}>
            {isSelectingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ListChecks className="h-3.5 w-3.5" />}
            Select all {totalMatching.toLocaleString()}
          </Button>
        )}

        <span className="h-5 w-px bg-border mx-0.5" />

        <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs text-emerald-600" onClick={() => onQuickStatus("ready_to_ship")} disabled={isPending}>
          <PackageCheck className="h-3.5 w-3.5" /> Ready to ship
        </Button>
        <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs" onClick={onBookCourier} disabled={isPending}>
          <Truck className="h-3.5 w-3.5" /> Book courier
        </Button>
        <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs" onClick={onPrint} disabled={isPending}>
          <Printer className="h-3.5 w-3.5" /> Print
        </Button>
        <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs" onClick={onSyncCourier} disabled={isPending}>
          <RefreshCcw className="h-3.5 w-3.5" /> Sync
        </Button>
        <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs text-destructive" onClick={() => onQuickStatus("cancelled")} disabled={isPending}>
          <X className="h-3.5 w-3.5" /> Cancel
        </Button>

        <span className="h-5 w-px bg-border mx-0.5" />
        <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={onClear}>
          <X className="h-3.5 w-3.5" /> Clear
        </Button>
      </div>
    </div>
  );
}
