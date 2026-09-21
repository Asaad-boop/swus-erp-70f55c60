import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Printer, Package, PackageCheck, CheckCheck, Truck, ChevronDown,
  Loader2, AlertCircle, Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { statusBadge, type OrderRow, type OrderStatus } from "@/lib/erp/orders";
import { pathaoBookOrderAutoFn } from "@/lib/erp/pathao.functions";
import { steadfastBookOrderFn } from "@/lib/erp/steadfast.functions";
import { supabase } from "@/integrations/supabase/client";
import { dispatchFeedback, primeAudio } from "@/lib/erp/dispatch/feedback";

export type DispatchMode = "pack" | "packdone" | "ready" | "ship";

const DISPATCHABLE: OrderStatus[] = [
  "confirmed",
  "ready_to_pack",
  "packaging",
  "packed",
  "ready_to_ship",
];

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  confirmed: "packaging",
  ready_to_pack: "packaging",
  packaging: "packed",
  packed: "ready_to_ship",
  ready_to_ship: "shipped",
};

const MODE_ICON: Record<DispatchMode, React.ElementType> = {
  pack: Package,
  packdone: PackageCheck,
  ready: CheckCheck,
  ship: Send,
};

const MODE_LABEL: Record<DispatchMode, string> = {
  pack: "Pack",
  packdone: "Packed",
  ready: "RTS",
  ship: "Ship",
};

const PROVIDERS = [
  { key: "pathao", label: "Pathao", icon: "P" },
  { key: "steadfast", label: "Steadfast", icon: "S" },
  { key: "manual", label: "Manual", icon: "M" },
] as const;

type Provider = (typeof PROVIDERS)[number]["key"];

function nextMode(status: OrderStatus): DispatchMode | null {
  if (["confirmed", "ready_to_pack"].includes(status)) return "pack";
  if (status === "packaging") return "packdone";
  if (status === "packed") return "ready";
  if (status === "ready_to_ship") return "ship";
  return null;
}

function isCod(o: OrderRow) {
  const m = (o.payment_method ?? "").toLowerCase();
  return m.includes("cod") || m.includes("cash");
}

export type DispatchActionsCellProps = {
  order: OrderRow;
  onStatusChange: (id: string, status: OrderStatus) => void;
  onPrint: (id: string) => void;
  busy?: boolean;
};

export function DispatchActionsCell({ order, onStatusChange, onPrint, busy }: DispatchActionsCellProps) {
  const [working, setWorking] = useState<DispatchMode | "print" | null>(null);
  const [provider, setProvider] = useState<Provider>("pathao");
  const bookPathao = useServerFn(pathaoBookOrderAutoFn);
  const bookSteadfast = useServerFn(steadfastBookOrderFn);

  if (!DISPATCHABLE.includes(order.status)) return null;

  const mode = nextMode(order.status);
  const isShip = mode === "ship";

  const runAdvance = async () => {
    if (!mode) return;
    primeAudio();
    if (isShip) {
      setWorking("ship");
      try {
        await shipOrder(order, provider);
        dispatchFeedback("ship");
      } catch (e: any) {
        dispatchFeedback("error");
        toast.error(e?.message ?? "Ship failed");
      } finally {
        setWorking(null);
      }
      return;
    }
    const next = NEXT_STATUS[order.status];
    if (!next) return;
    setWorking(mode);
    try {
      await onStatusChange(order.id, next);
      dispatchFeedback(mode === "ready" ? "ready" : "pack");
    } catch (e: any) {
      dispatchFeedback("error");
      toast.error(e?.message ?? "Update failed");
    } finally {
      setWorking(null);
    }
  };

  const shipOrder = async (o: OrderRow, prov: Provider) => {
    const dup = await existingShipment(o.id);
    if (dup?.consignment_id) {
      dispatchFeedback("duplicate");
      toast.warning(`Already booked · ${dup.consignment_id}`);
      // still move to shipped if somehow not yet
      await onStatusChange(o.id, "shipped");
      return;
    }

    let consignment = "";
    if (prov === "pathao") {
      const res: any = await bookPathao({ data: { orderId: o.id } });
      if (res?.blocked || res?.code === "PATHAO_CUSTOMER_BLOCKED") {
        throw new Error(res?.message || "Pathao এই customer number-এ booking block করেছে।");
      }
      consignment = String(res?.consignment ?? res?.consignment_id ?? res?.tracking ?? "");
    } else if (prov === "steadfast") {
      const res: any = await bookSteadfast({
        data: { orderId: o.id, cod_amount: isCod(o) ? Number(o.total ?? 0) : 0 },
      });
      consignment = String(res?.consignment ?? res?.tracking ?? "");
    } else {
      // manual: just move to shipped, tracking can be added later
      await onStatusChange(o.id, "shipped");
      toast.success("Moved to Shipped (manual courier)");
      return;
    }

    await supabase.from("orders").update({
      courier_name: prov,
      tracking_number: consignment || o.tracking_number,
      courier_assigned_at: new Date().toISOString(),
    } as never).eq("id", o.id);

    await onStatusChange(o.id, "shipped");
    toast.success(`Booked ${prov}${consignment ? ` · ${consignment}` : ""}`);
  };

  const Icon = mode ? MODE_ICON[mode] : Truck;
  const label = mode ? MODE_LABEL[mode] : "Dispatch";

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              disabled={busy || !!working}
              onClick={() => onPrint(order.id)}
            >
              {working === "print" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5 text-muted-foreground" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">Print waybill</TooltipContent>
        </Tooltip>

        {mode && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className={cn(
                    "h-7 px-2 text-[11px] font-semibold gap-1 transition-colors",
                    isShip && "text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30",
                  )}
                  disabled={busy || !!working}
                  onClick={runAdvance}
                >
                  {working === mode ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
                  {label}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                {isShip ? `Book ${provider} & mark shipped` : `Mark as ${statusBadge(NEXT_STATUS[order.status] ?? order.status).label}`}
              </TooltipContent>
            </Tooltip>

            {isShip && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-7 w-6 px-0" disabled={busy || !!working}>
                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem disabled className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Courier
                  </DropdownMenuItem>
                  {PROVIDERS.map((p) => (
                    <DropdownMenuItem
                      key={p.key}
                      onClick={() => setProvider(p.key)}
                      className={cn("text-xs", provider === p.key && "bg-muted")}
                    >
                      <span className="h-5 w-5 rounded grid place-items-center text-[10px] font-bold bg-primary/10 text-primary mr-2">
                        {p.icon}
                      </span>
                      {p.label}
                      {provider === p.key && <CheckCheck className="h-3 w-3 ml-auto" />}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <div className="px-2 py-1.5 text-[10px] text-muted-foreground flex items-start gap-1.5">
                    <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                    Manual courier moves to shipped without booking.
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
        )}
      </div>
    </TooltipProvider>
  );
}

async function existingShipment(orderId: string) {
  const { data: rows } = await supabase
    .from("courier_shipments")
    .select("id, consignment_id, tracking_code, status, provider")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false })
    .limit(1);
  const row = (rows ?? [])[0];
  if (!row) return null;
  if (/cancel/i.test(row.status ?? "")) return null;
  return row;
}
