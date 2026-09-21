import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Camera, Keyboard, ScanLine, CheckCircle2, AlertCircle, Package, CheckCheck, Send,
  Loader2, Volume2, VolumeX, Zap, ZapOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { statusBadge, type OrderRow, type OrderStatus } from "@/lib/erp/orders";
import { pathaoBookOrderAutoFn } from "@/lib/erp/pathao.functions";
import { steadfastBookOrderFn } from "@/lib/erp/steadfast.functions";
import { CameraScanner } from "@/components/erp/dispatch/camera-scanner";
import { dispatchFeedback, isDispatchMuted, setDispatchMuted, primeAudio } from "@/lib/erp/dispatch/feedback";

type ScanMode = "pack" | "ready" | "ship";
type Provider = "pathao" | "steadfast" | "manual";

const MODES: { key: ScanMode; label: string; icon: React.ElementType; tone: string }[] = [
  { key: "pack", label: "Pack", icon: Package, tone: "bg-amber-500" },
  { key: "ready", label: "RTS", icon: CheckCheck, tone: "bg-violet-500" },
  { key: "ship", label: "Ship", icon: Send, tone: "bg-emerald-500" },
];

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  confirmed: "packaging",
  ready_to_pack: "packaging",
  packaging: "packed",
  packed: "ready_to_ship",
  ready_to_ship: "shipped",
};

const PACKABLE = ["confirmed", "ready_to_pack", "packaging"];

const PROVIDERS: { key: Provider; label: string }[] = [
  { key: "pathao", label: "Pathao" },
  { key: "steadfast", label: "Steadfast" },
  { key: "manual", label: "Manual" },
];

const SELECT_COLS =
  "id, invoice_no, status, total, payment_method, courier_name, tracking_number, shipping_name, guest_name, shipping_phone, guest_phone, shipping_address, shipping_thana, shipping_city, shipping_district, brand_id, source, created_at";

type ScanResult = {
  ok: boolean;
  msg: string;
  order?: OrderRow;
  toStatus?: OrderStatus;
  at: number;
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
  const [auto, setAuto] = useState(true);
  const [muted, setMuted] = useState(false);
  const [log, setLog] = useState<ScanResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTermRef = useRef<{ term: string; at: number }>({ term: "", at: 0 });
  const bookPathao = useServerFn(pathaoBookOrderAutoFn);
  const bookSteadfast = useServerFn(steadfastBookOrderFn);

  const last = log[0] ?? null;
  const okCount = useMemo(() => log.filter((l) => l.ok).length, [log]);

  useEffect(() => {
    if (open) {
      setMuted(isDispatchMuted());
      primeAudio();
      setTimeout(() => inputRef.current?.focus(), 60);
      setInput("");
    } else {
      setLog([]);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [open]);

  const push = (r: Omit<ScanResult, "at">) => setLog((prev) => [{ ...r, at: Date.now() }, ...prev].slice(0, 6));

  const lookup = async (term: string, strict = false) => {
    const clean = term.trim();
    if (!clean) return null;
    let q = supabase.from("orders").select(SELECT_COLS).order("created_at", { ascending: false }).limit(6);
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean);
    if (isUuid) {
      q = q.eq("id", clean);
    } else if (strict) {
      // Auto-fired (scanner/paste) input must match a whole invoice or phone —
      // never a partial substring, which could hit a different order.
      q = q.or(
        `invoice_no.eq.${clean},shipping_phone.eq.${clean},guest_phone.eq.${clean}`,
      );
    } else if (/^\d+$/.test(clean)) {
      q = q.or(`invoice_no.ilike.%${clean}%,shipping_phone.ilike.%${clean}%,guest_phone.ilike.%${clean}%`);
    } else {
      q = q.or(`invoice_no.ilike.%${clean}%,shipping_name.ilike.%${clean}%,guest_name.ilike.%${clean}%`);
    }
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data ?? []) as unknown as OrderRow[];
    if (!rows.length) return null;
    // Prefer the row that is actionable for the current mode
    const wanted = mode === "ship" ? ["ready_to_ship", "packed"] : mode === "ready" ? ["packed"] : PACKABLE;
    const actionable = rows.filter((r) => wanted.includes(r.status));
    if (rows.length > 1 && actionable.length !== 1) {
      // Ambiguous — refuse to act on a guess.
      throw new Error(`Ekadhik order match korlo (${rows.length}) — puro invoice/phone din`);
    }
    return actionable[0] ?? rows[0];
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
      dispatchFeedback("duplicate");
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

  const fail = (msg: string, order?: OrderRow) => {
    dispatchFeedback("error");
    push({ ok: false, msg, order });
    toast.error(msg);
  };

  const process = async (term: string, opts?: { auto?: boolean }) => {
    const clean = term.trim();
    if (!clean || busy) return;
    if (timerRef.current) clearTimeout(timerRef.current);

    const now = Date.now();
    if (lastTermRef.current.term === clean && now - lastTermRef.current.at < 2500) {
      dispatchFeedback("duplicate");
      toast.warning("Duplicate scan skipped");
      setInput("");
      return;
    }
    lastTermRef.current = { term: clean, at: now };

    setBusy(true);
    try {
      const order = await lookup(clean, opts?.auto === true);
      if (!order) return fail(`Order not found: ${clean}`);



      if (mode === "ship") {
        const res = await shipOrder(order);
        dispatchFeedback("ship");
        push(res);
        toast.success(res.msg);
      } else {
        const next = NEXT_STATUS[order.status];
        if (!next) return fail(`${statusBadge(order.status).label} → no next step`, order);
        if (mode === "pack" && !PACKABLE.includes(order.status)) {
          return fail(`Not packable · ${statusBadge(order.status).label}`, order);
        }
        if (mode === "ready" && order.status !== "packed") {
          return fail(`Must be Packed first · now ${statusBadge(order.status).label}`, order);
        }
        await onStatusChange(order.id, next);
        dispatchFeedback(mode);
        push({
          ok: true,
          msg: `${statusBadge(order.status).label} → ${statusBadge(next).label} · ${order.invoice_no ?? order.id.slice(0, 8)}`,
          order,
          toStatus: next,
        });
        toast.success(`Updated to ${statusBadge(next).label}`);
      }
      setInput("");
    } catch (e: any) {
      fail(e?.message ?? "Scan failed");
    } finally {
      setBusy(false);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  };

  const onChange = (v: string) => {
    setInput(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!auto) return;
    const clean = v.trim();
    // Auto-fire ONLY for a complete identifier (11-digit phone or UUID).
    // Partial/hand-typed text must be confirmed with Enter — otherwise a
    // half-typed number could match and mutate a different order.
    const complete =
      /^01\d{9}$/.test(clean) ||
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean);
    if (!complete) return;
    timerRef.current = setTimeout(() => process(clean, { auto: true }), 120);
  };


  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      process(input);
    }
    if (e.key === "Escape") {
      if (timerRef.current) clearTimeout(timerRef.current);
      setInput("");
    }
  };

  const toggleMute = () => {
    const v = !muted;
    setMuted(v);
    setDispatchMuted(v);
    if (!v) dispatchFeedback("undo");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg p-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 text-base">
            <span className="flex min-w-0 items-center gap-2">
              <ScanLine className="h-5 w-5 shrink-0 text-primary" />
              <span className="truncate">Scan to Dispatch</span>
              {okCount > 0 && (
                <Badge variant="secondary" className="shrink-0 text-[10px]">{okCount} done</Badge>
              )}
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <Button
                size="icon" variant="ghost" className="h-7 w-7"
                onClick={() => setAuto((a) => !a)}
                title={auto ? "Auto-submit on" : "Auto-submit off"}
              >
                {auto ? <Zap className="h-4 w-4 text-amber-500" /> : <ZapOff className="h-4 w-4 text-muted-foreground" />}
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={toggleMute} title={muted ? "Sound off" : "Sound on"}>
                {muted ? <VolumeX className="h-4 w-4 text-muted-foreground" /> : <Volume2 className="h-4 w-4 text-emerald-500" />}
              </Button>
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="px-4 pb-4 space-y-3">
          {/* Mode selector */}
          <div className="grid grid-cols-3 gap-2">
            {MODES.map((m) => {
              const Icon = m.icon;
              const on = mode === m.key;
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => { setMode(m.key); setTimeout(() => inputRef.current?.focus(), 30); }}
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
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Invoice, phone, or scan barcode…"
                className={cn(
                  "pr-10 h-11 text-base font-semibold tracking-tight transition-shadow",
                  busy && "opacity-70",
                )}
                inputMode="text"
                autoComplete="off"
                autoFocus
              />
              {busy ? (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-primary" />
              ) : (
                <Keyboard className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
              )}
            </div>
            <Button size="icon" className="h-11 w-11" variant={camera ? "default" : "outline"} onClick={() => { primeAudio(); setCamera(true); }} title="Open camera">
              <Camera className="h-4 w-4" />
            </Button>
          </div>

          <CameraScanner
            open={camera}
            onClose={() => setCamera(false)}
            onDetect={(code: string) => {
              setInput(code);
              setCamera(false);
              process(code);
            }}
          />

          {/* Result feed */}
          {last && (
            <div
              className={cn(
                "rounded-xl border-2 p-3 flex items-start gap-3 animate-in fade-in slide-in-from-top-1 duration-200",
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
                <p className="text-sm font-semibold break-words">{last.msg}</p>
                {last.order && (
                  <div className="mt-1 text-xs text-muted-foreground truncate">
                    {last.order.shipping_name || last.order.guest_name || "—"} · ৳{Number(last.order.total ?? 0).toLocaleString()}
                  </div>
                )}
              </div>
              {last.toStatus && (
                <Badge className={cn("shrink-0", statusBadge(last.toStatus).className)}>{statusBadge(last.toStatus).label}</Badge>
              )}
            </div>
          )}

          {log.length > 1 && (
            <div className="rounded-xl border bg-muted/30 divide-y max-h-36 overflow-y-auto">
              {log.slice(1).map((r, i) => (
                <div key={`${r.at}-${i}`} className="flex items-center gap-2 px-2.5 py-1.5 text-[11px]">
                  <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", r.ok ? "bg-emerald-500" : "bg-rose-500")} />
                  <span className="truncate flex-1 text-muted-foreground">{r.msg}</span>
                </div>
              ))}
            </div>
          )}

          <div className="text-[10px] text-muted-foreground flex items-start gap-1.5">
            <ScanLine className="h-3 w-3 mt-0.5 shrink-0" />
            {auto
              ? "Auto mode on — invoice/phone টাইপ বা scan করলেই সাথে সাথে entry হবে (Enter লাগবে না)।"
              : "Auto off — invoice/phone দিয়ে Enter চাপো।"}
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
