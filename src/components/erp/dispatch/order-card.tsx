import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Phone, MapPin, Package, Clock, Printer, AlertTriangle, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { courierCodDue } from "@/lib/erp/courier-cod";
import { FixMenu } from "./fix-menu";
import {
  bdt, customerArea, customerName, customerPhone, isCod, itemCount, preflight, stageTime, timeAgo,
  type DispatchOrder, type DispatchStage, type UseDispatch,
} from "@/hooks/erp/use-dispatch";

export function OrderCard({
  order, stage, d, selected, onToggleSelect, actionLabel, onAction, busy,
}: {
  order: DispatchOrder;
  stage: DispatchStage;
  d: UseDispatch;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  actionLabel?: string;
  onAction?: (o: DispatchOrder) => void;
  busy?: boolean;
}) {
  const phone = customerPhone(order);
  const area = customerArea(order);
  const cod = isCod(order);
  const issues = stage === "ready" ? preflight(order) : [];

  return (
    <div
      className={cn(
        "group rounded-xl border bg-background p-2.5 text-sm transition-all",
        selected ? "border-foreground ring-1 ring-foreground" : "hover:border-foreground/30 hover:shadow-sm",
      )}
    >
      <div className="flex items-start gap-2">
        {onToggleSelect && (
          <Checkbox
            checked={!!selected}
            onCheckedChange={() => onToggleSelect(order.id)}
            className="mt-0.5 shrink-0 opacity-40 group-hover:opacity-100 data-[state=checked]:opacity-100 transition-opacity"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-mono text-xs font-bold tracking-tight">{order.invoice_no ?? order.id.slice(0, 8)}</span>
            <span
              className={cn(
                "inline-flex items-center text-[9px] h-4 px-1.5 rounded-full border font-semibold",
                cod
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/60"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {cod ? "COD" : "PAID"}
            </span>
            <span className="inline-flex items-center gap-0.5 text-[9px] h-4 px-1.5 rounded-full bg-muted text-muted-foreground">
              <Package className="h-2.5 w-2.5" />
              {itemCount(order)}
            </span>
            {order.printed_at && (
              <span className="inline-flex items-center gap-0.5 text-[9px] h-4 px-1.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900/60">
                <Printer className="h-2.5 w-2.5" /> printed
              </span>
            )}
          </div>

          <div className="truncate text-xs font-medium mt-1">{customerName(order)}</div>
          {phone && (
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
              <Phone className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate">{phone}</span>
            </div>
          )}
          {area && (
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <MapPin className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate">{area}</span>
            </div>
          )}
          {stage === "shipped" && order.courier_name && (
            <div className="text-[10px] font-mono mt-1 text-emerald-700 dark:text-emerald-300 truncate">
              {order.courier_name} · {order.tracking_number ?? "—"}
            </div>
          )}
          {issues.length > 0 && (
            <div className="flex items-center gap-1 text-[10px] text-amber-600 mt-1">
              <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate">{issues[0]}</span>
            </div>
          )}
        </div>

        <div className="text-right shrink-0 flex flex-col items-end gap-1">
          <div className="flex items-center gap-0.5">
            <span className="text-xs font-bold tabular-nums">{bdt(cod ? courierCodDue(order.total, order.advance_amount) : order.total ?? 0)}</span>
            <FixMenu order={order} d={d} />
          </div>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Clock className="h-2.5 w-2.5" />
            {timeAgo(stageTime(order, stage))}
          </div>
          {actionLabel && onAction && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              className="h-6 text-[10px] px-2 rounded-full"
              onClick={() => onAction(order)}
            >
              {actionLabel} <ChevronRight className="h-3 w-3 ml-0.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
