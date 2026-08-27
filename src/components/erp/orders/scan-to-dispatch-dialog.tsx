import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Camera, Keyboard, ScanLine, CheckCircle2, AlertCircle, Package, CheckCheck, Send, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { statusBadge, type OrderRow, type OrderStatus } from "@/lib/erp/orders";
import { pathaoBookOrderAutoFn } from "@/lib/erp/pathao.functions";
import { steadfastBookOrderFn } from "@/lib/erp/steadfast.functions";
import { CameraScanner } from "@/components/erp/dispatch/camera-scanner";

type ScanMode = "pack" | "ready" | "ship";
type Provider = "pathao" | "steadfast" | "manual";

const MODES: { key: ScanMode; label: string; icon: React.ElementType; tone: string }[] = [
  { key: "pack", label: "Pack", icon: Package, tone: "bg-amber-500" },
  { key: "ready", label: "RTS", icon: CheckCheck, tone: "bg-violet-500" },
  { key: "ship", label: "Ship", icon: Send, tone: "bg-emerald-500" },
];

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  confirmed: "packed",
  ready_to_pack: "packed",
  packaging: "packed",
  packed: "ready_to_ship",
  ready_to_ship: "shipped",
};

const PROVIDERS: { key: Provider; label: string }[] = [
  { key: "pathao", label: "Pathao" },
  { key: "steadfast", label: "Steadfast" },
  { key: "manual", label: "Manual" },
];

type ScanResult = {
  ok: boolean;
  msg: string;
  order?: OrderRow;
  toStatus?: OrderStatus;
};

export type ScanToDispatchDialogProps = {
  open: boolean;
  onClose: () => void;
  onStatusChange: (id: string, status: OrderStatus) => Promise<void>;
};

export function ScanToDispatchDialog({ open, onClose, onStatusChange }: ScanToDispatchDialogProps) {
  const [mode, setMode] = useState<ScanMode>("pack");
  const [provider, setProvider] = useState<Provider>("pathao");
  const [input, setInput] = useState("");
  const [camera, setCamera] = useState(false);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<ScanResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const bookPathao = useServerFn(pathaoBookOrderAutoFn);
  const bookSteadfast = useServerFn(steadfastBookOrderFn);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
      setLast(null);
      setInput("");
    }
  }, [open]);

  const lookup = async (term: string) => {
    const clean = term.trim();
    if (!clean) return null;
    // Try invoice number first, then id prefix, then phone
    let q = supabase
      .from("orders")
      .select(
        "id, invoice_no, status, total, payment_method, courier_name, tracking_number, shipping_name, guest_name, shipping_phone, guest_phone, shipping_address, shipping_thana, shipping_city, shipping_district, brand_id, source"
      )
      .order("created_at", { ascending: false })
      .limit(1);
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean)) {
      q = q.eq("id", clean);
    } else if (/^\d+$/.test(clean)) {
      q = q.or(`invoice_no.ilike.%${clean}%,shipping_phone.ilike.%${clean}%,guest_phone.ilike.%${clean}%`);
    } else {
      q = q.or(`invoice_no.ilike.%${clean}%,shipping_name.ilike.%${clean}%,guest_name.ilike.%${clean}%`);
    }
    const { data, error } = await q;
    if (error) throw error;
    return (data?.[0] ?? null) as OrderRow | null;
  };

  const isCod = (o: OrderRow) => {
    const m = (o.payment_method ?? "").toLowerCase();
    return m.includes("cod") || m.includes("cash");
  };

  const shipOrder = async (o: OrderRow) => {
    if (provider === "manual") {
      await onStatusChange(o.id, "shipped");
      return { ok: true, msg: `Shipped (manual) · ${o.invoice_no ?? o.id.slice(0, 8)}`, order: o, toStatus: "shipped" as OrderStatus };
    }

    const existing = await existingShipment(o.id);
    if (existing?.consignment_id) {
      await onStatusChange(o.id, "shipped");
      return { ok: true, msg: `Already booked · ${existing.consignment_id}`, order: o, toStatus: "shipped" as OrderStatus };
    }

    let consignment = "";
    if (provider === "pathao") {
      const res: any = await bookPathao({ data: { orderId: o.id } });
      if (res?.blocked || res?.code === "PATHAO_CUSTOMER_BLOCKED") {
        throw new Error(res?.message || "Pathao এই customer number-এ booking block করেছে।");
      }
      consignment = String(res?.consignment ?? res?.consignment_id ?? res?.tracking ?? "");
    } else {
      const res: any = await bookSteadfast({
        data: { orderId: o.id, cod_amount: isCod(o) ? Number(o.total ?? 0) : 0 },
      });
      consignment = String(res?.consignment ?? res?.tracking ?? "");
    }

    await supabase.from("orders").update({
      courier_name: provider,
      tracking_number: consignment || o.tracking_number,
      courier_assigned_at: new Date().toISOString(),
    } as never).eq("id", o.id);

    await onStatusChange(o.id, "shipped");
    return { ok: true, msg: `Booked ${provider}${consignment ? ` · ${consignment}` : ""} · ${o.invoice_no ?? o.id.slice(0, 8)}`, order: o, toStatus: "shipped" as OrderStatus };
  };

  const process = async (term: string) => {
    if (!term.trim() || busy) return;
    setBusy(true);
    try {
      const order = await lookup(term);
      if (!order) {
        setLast({ ok: false, msg: `Order not found: ${term}` });
        toast.error(`Order not found: ${term}`);
        return;
      }

      if (mode === "ship") {
        const res = await shipOrder(order);
        setLast(res);
        toast.success(res.msg);
      } else {
        const next = NEXT_STATUS[order.status];
        if (!next) {
          setLast({ ok: false, msg: `${statusBadge(order.status).label} → no next step`, order });
          toast.error(`No next step for ${statusBadge(order.status).label}`);
          return;
        }
        if (mode === "pack" && !["confirmed", "ready_to_pack", "packaging"].includes(order.status)) {
          setLast({ ok: false, msg: `Not packable · ${statusBadge(order.status).label}`, order });
          toast.error(`Not packable: ${statusBadge(order.status).label}`);
          return;
        }
        if (mode === "ready" && order.status !== "packed") {
          setLast({ ok: false, msg: `Must be Packed first · current ${statusBadge(order.status).label}`, order });
          toast.error(`Must be Packed first`);
          return;
        }
        await onStatusChange(order.id, next);
        setLast({ ok: true, msg: `${statusBadge(order.status).label} → ${statusBadge(next).label} · ${order.invoice_no ?? order.id.slice(0, 8)}`, order, toStatus: next });
        toast.success(`Updated to ${statusBadge(next).label}`);
      }
      setInput("");
      setTimeout(() => inputRef.current?.focus(), 50);
    } catch (e: any) {
      const msg = e?.message ?? "Scan failed";
      setLast({ ok: false, msg });
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      process(input);
    }
    if (e.key === "Escape") {
      setInput("");
      setLast(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg p-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ScanLine className="h-5 w-5 text-primary" />
            Scan to Dispatch
          </DialogTitle>
        </DialogHeader>

        <div className="px-4 pb-4 space-y-4">
          {/* Mode selector */}
          <div className="grid grid-cols-3 gap-2">
            {MODES.map((m) => {
              const Icon = m.icon;
              const on = mode === m.key;
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => { setMode(m.key); setLast(null); setTimeout(() => inputRef.current?.focus(), 50); }}
                  className={cn(
                    "rounded-xl border px-2 py-2 text-center transition-all active:scale-[0.97]",
                    on ? cn(m.tone, "text-white border-transparent shadow-md") : "bg-card hover:border-foreground/40",
                  )}
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <Icon className="h-4 w-4" />
                    <span className="text-sm font-bold">{m.label}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {mode === "ship" && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Courier:</span>
              <div className="flex gap-1">
                {PROVIDERS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setProvider(p.key)}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors",
                      provider === p.key
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card hover:border-foreground/40 text-muted-foreground",
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Invoice, phone, or scan barcode…"
                className="pr-10"
                disabled={busy}
                autoFocus
              />
              <Keyboard className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
            </div>
            <Button
              size="icon"
              variant={camera ? "default" : "outline"}
              onClick={() => setCamera((v) => !v)}
              title={camera ? "Close camera" : "Open camera"}
            >
              {camera ? <X className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
            </Button>
          </div>

          {camera && (
            <div className="rounded-xl overflow-hidden border bg-black">
              <CameraScanner
                onScan={(code) => {
                  setInput(code);
                  process(code);
                }}
                onError={(msg) => toast.error(msg)}
              />
            </div>
          )}

          {/* Last result */}
          {last && (
            <div
              className={cn(
                "rounded-xl border-2 p-3 flex items-start gap-3",
                last.ok
                  ? "border-emerald-400 bg-emerald-50/60 dark:bg-emerald-950/20"
                  : "border-rose-400 bg-rose-50/60 dark:bg-rose-950/20",
              )}
            >
              {last.ok ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">{last.msg}</p>
                {last.order && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {last.order.shipping_name || last.order.guest_name || "—"} · ৳{Number(last.order.total ?? 0).toLocaleString()}
                  </div>
                )}
              </div>
              {last.toStatus && (
                <Badge className={statusBadge(last.toStatus).className}>{statusBadge(last.toStatus).label}</Badge>
              )}
            </div>
          )}

          {busy && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Processing…
            </div>
          )}

          <div className="text-[10px] text-muted-foreground flex items-start gap-1.5">
            <ScanLine className="h-3 w-3 mt-0.5 shrink-0" />
            Tip: Type invoice/phone and press Enter. In ship mode, choose Pathao/Steadfast/Manual before scanning.
          </div>
        </div>
      </DialogContent>
    </Dialog>
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
