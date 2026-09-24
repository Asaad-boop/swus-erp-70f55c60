import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Camera, CameraOff, ScanLine, CheckCircle2, AlertCircle, AlertTriangle, Package, PackageCheck,
  CheckCheck, Send, Loader2, Volume2, VolumeX, Zap, ZapOff, Undo2, Printer, Download,
  ShieldCheck, Search, X, Phone, MapPin, ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { statusBadge, type OrderRow, type OrderStatus } from "@/lib/erp/orders";
import { pathaoBookOrderAutoFn } from "@/lib/erp/pathao.functions";
import { steadfastBookOrderFn } from "@/lib/erp/steadfast.functions";
import { CameraScanner } from "@/components/erp/dispatch/camera-scanner";
import { dispatchFeedback, isDispatchMuted, setDispatchMuted, primeAudio } from "@/lib/erp/dispatch/feedback";

type ScanMode = "pack" | "packed" | "ready" | "ship";
type Provider = "pathao" | "steadfast" | "manual";

const MODES: { key: ScanMode; label: string; icon: React.ElementType; tone: string; ring: string }[] = [
  { key: "pack", label: "Pack", icon: Package, tone: "bg-amber-500", ring: "shadow-[0_0_24px_-4px] shadow-amber-500/70" },
  { key: "packed", label: "Packed", icon: PackageCheck, tone: "bg-sky-500", ring: "shadow-[0_0_24px_-4px] shadow-sky-500/70" },
  { key: "ready", label: "RTS", icon: CheckCheck, tone: "bg-violet-500", ring: "shadow-[0_0_24px_-4px] shadow-violet-500/70" },
  { key: "ship", label: "Ship", icon: Send, tone: "bg-emerald-500", ring: "shadow-[0_0_24px_-4px] shadow-emerald-500/70" },
];

/** Which statuses each mode accepts, and where it moves them. */
const MODE_FROM: Record<ScanMode, OrderStatus[]> = {
  pack: ["confirmed", "ready_to_pack"],
  packed: ["packaging"],
  ready: ["packed"],
  ship: ["ready_to_ship", "packed"],
};
const MODE_TO: Record<ScanMode, OrderStatus> = {
  pack: "packaging",
  packed: "packed",
  ready: "ready_to_ship",
  ship: "shipped",
};
const BLOCKED: OrderStatus[] = [
  "cancelled", "on_hold", "returned", "pending_return", "partial_return", "incomplete",
] as OrderStatus[];

const PROVIDERS: { key: Provider; label: string }[] = [
  { key: "pathao", label: "Pathao" },
  { key: "steadfast", label: "Steadfast" },
  { key: "manual", label: "Manual" },
];

const SELECT_COLS =
  "id, invoice_no, status, total, payment_method, payment_status, courier_name, tracking_number, shipping_name, guest_name, shipping_phone, guest_phone, shipping_address, shipping_thana, shipping_city, shipping_district, brand_id, source, created_at";

type Item = { name: string; variant_label: string | null; quantity: number };

type LogEntry = {
  ok: boolean;
  msg: string;
  invoice?: string | null;
  orderId?: string;
  from?: OrderStatus;
  to?: OrderStatus;
  undoable?: boolean;
  at: number;
};

const LOG_KEY = "erp.scan.session";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 01XXXXXXXXX from +880 / 880 / spaced input, else null. */
function normPhone(v: string): string | null {
  const d = v.replace(/\D/g, "");
  if (/^8801\d{9}$/.test(d)) return d.slice(2);
  if (/^01\d{9}$/.test(d)) return d;
  return null;
}
const esc = (s: string) => s.replace(/[,()%*]/g, "");

function modeFor(status: OrderStatus): ScanMode | null {
  if (MODE_FROM.pack.includes(status)) return "pack";
  if (MODE_FROM.packed.includes(status)) return "packed";
  if (status === "packed") return "ready";
  if (status === "ready_to_ship") return "ship";
  return null;
}

export type ScanToDispatchDialogProps = {
  open: boolean;
  onClose: () => void;
  onStatusChange: (id: string, status: OrderStatus) => Promise<void>;
  onPrint?: (id: string) => void;
};

export function ScanToDispatchDialog({ open, onClose, onStatusChange, onPrint }: ScanToDispatchDialogProps) {
  const [mode, setMode] = useState<ScanMode>("pack");
  const [provider, setProvider] = useState<Provider>("pathao");
  const [input, setInput] = useState("");
  const [camera, setCamera] = useState(false);
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState(true);
  const [confirmMode, setConfirmMode] = useState(false);
  const [muted, setMuted] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [logFilter, setLogFilter] = useState<"all" | "ok" | "err">("all");
  const [current, setCurrent] = useState<{ order: OrderRow; items: Item[]; ok: boolean | null; msg: string; hint?: ScanMode } | null>(null);
  const [candidates, setCandidates] = useState<OrderRow[]>([]);
  const [suggest, setSuggest] = useState<OrderRow[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTermRef = useRef<{ term: string; at: number }>({ term: "", at: 0 });
  const startedRef = useRef<number>(0);
  const bookPathao = useServerFn(pathaoBookOrderAutoFn);
  const bookSteadfast = useServerFn(steadfastBookOrderFn);

  const focus = () => setTimeout(() => { if (!camera) inputRef.current?.focus(); }, 30);

  useEffect(() => {
    if (!open) { setCamera(false); return; }
    setMuted(isDispatchMuted());
    primeAudio();
    try {
      const saved = JSON.parse(sessionStorage.getItem(LOG_KEY) ?? "null");
      if (saved?.log) { setLog(saved.log); startedRef.current = saved.started ?? Date.now(); }
      else startedRef.current = Date.now();
    } catch { startedRef.current = Date.now(); }
    setInput("");
    focus();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    try { sessionStorage.setItem(LOG_KEY, JSON.stringify({ log, started: startedRef.current })); } catch { /* ignore */ }
  }, [log, open]);

  const push = (e: Omit<LogEntry, "at">) => setLog((p) => [{ ...e, at: Date.now() }, ...p].slice(0, 50));

  const stats = useMemo(() => {
    const ok = log.filter((l) => l.ok);
    const by = (s: OrderStatus) => ok.filter((l) => l.to === s).length;
    const mins = Math.max(1, (Date.now() - (startedRef.current || Date.now())) / 60000);
    return {
      packing: by("packaging"), packed: by("packed"), rts: by("ready_to_ship"), shipped: by("shipped"),
      errors: log.length - ok.length, rate: ok.length ? (ok.length / mins).toFixed(1) : "0",
    };
  }, [log]);

  /** Build a search query. strict = scanner/auto input (exact match only). */
  const search = async (term: string, strict: boolean, limit = 8): Promise<OrderRow[]> => {
    const clean = term.trim();
    if (!clean) return [];
    let q = supabase.from("orders").select(SELECT_COLS).order("created_at", { ascending: false }).limit(limit);
    const phone = normPhone(clean);
    const t = esc(clean);
    if (UUID_RE.test(clean)) q = q.eq("id", clean);
    else if (phone) q = q.or(`shipping_phone.ilike.%${phone.slice(1)},guest_phone.ilike.%${phone.slice(1)}`);
    else if (strict) q = q.or(`invoice_no.eq.${t},tracking_number.eq.${t}`);
    else if (/^\d{1,8}$/.test(clean)) {
      q = q.or(`invoice_no.ilike.%${t},tracking_number.eq.${t}` + (clean.length === 4 ? `,shipping_phone.ilike.%${t},guest_phone.ilike.%${t}` : ""));
    } else {
      q = q.or(`invoice_no.ilike.%${t}%,tracking_number.ilike.%${t}%,shipping_name.ilike.%${t}%,guest_name.ilike.%${t}%`);
    }
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as unknown as OrderRow[];
  };

  const loadItems = async (orderId: string): Promise<Item[]> => {
    const { data } = await supabase
      .from("order_items")
      .select("name, variant_label, quantity")
      .eq("order_id", orderId)
      .eq("is_combo_child", false)
      .limit(20);
    return (data ?? []) as Item[];
  };

  const isCod = (o: OrderRow) => {
    const m = (o.payment_method ?? "").toLowerCase();
    return m.includes("cod") || m.includes("cash");
  };

  const shipOrder = async (o: OrderRow): Promise<string> => {
    if (provider === "manual") {
      await onStatusChange(o.id, "shipped");
      return "Shipped (manual)";
    }
    const existing = await existingShipment(o.id);
    if (existing?.consignment_id) {
      await onStatusChange(o.id, "shipped");
      dispatchFeedback("duplicate");
      return `Already booked · ${existing.consignment_id}`;
    }
    let consignment = "";
    if (provider === "pathao") {
      const res: any = await bookPathao({ data: { orderId: o.id } });
      if (res?.blocked || res?.code === "PATHAO_CUSTOMER_BLOCKED") {
        throw new Error(res?.message || "Pathao এই customer number-এ booking block করেছে।");
      }
      consignment = String(res?.consignment ?? res?.consignment_id ?? res?.tracking ?? "");
    } else {
      const res: any = await bookSteadfast({ data: { orderId: o.id, cod_amount: isCod(o) ? Number(o.total ?? 0) : 0 } });
      consignment = String(res?.consignment ?? res?.tracking ?? "");
    }
    await supabase.from("orders").update({
      courier_name: provider,
      tracking_number: consignment || o.tracking_number,
      courier_assigned_at: new Date().toISOString(),
    } as never).eq("id", o.id);
    await onStatusChange(o.id, "shipped");
    return `Booked ${provider}${consignment ? ` · ${consignment}` : ""}`;
  };

  const fail = (msg: string, order?: OrderRow, items: Item[] = [], hint?: ScanMode) => {
    dispatchFeedback("error");
    navigator.vibrate?.([120, 60, 120]);
    push({ ok: false, msg, invoice: order?.invoice_no, orderId: order?.id });
    if (order) setCurrent({ order, items, ok: false, msg, hint });
    else { setCurrent(null); toast.error(msg); }
  };

  /** Apply the current mode to a resolved order. */
  const apply = async (order: OrderRow, useMode: ScanMode = mode, items?: Item[]) => {
    const its = items ?? await loadItems(order.id);
    const inv = order.invoice_no ?? order.id.slice(0, 8);
    if (BLOCKED.includes(order.status)) {
      return fail(`⚠ ${statusBadge(order.status).label} order — dispatch করা যাবে না`, order, its);
    }
    if (!MODE_FROM[useMode].includes(order.status)) {
      const hint = modeFor(order.status) ?? undefined;
      return fail(`${inv} এখন ${statusBadge(order.status).label} — ${MODES.find((m) => m.key === useMode)?.label} mode-এ চলবে না`, order, its, hint && hint !== useMode ? hint : undefined);
    }
    const from = order.status;
    const to = MODE_TO[useMode];
    let msg: string;
    if (useMode === "ship") {
      msg = await shipOrder(order);
      dispatchFeedback("ship");
    } else {
      await onStatusChange(order.id, to);
      dispatchFeedback(useMode === "ready" ? "ready" : "pack");
      msg = `${statusBadge(from).label} → ${statusBadge(to).label}`;
    }
    push({ ok: true, msg: `${msg} · ${inv}`, invoice: order.invoice_no, orderId: order.id, from, to, undoable: useMode !== "ship" });
    setCurrent({ order: { ...order, status: to }, items: its, ok: true, msg });
  };

  const process = async (term: string, opts?: { strict?: boolean }) => {
    const clean = term.trim();
    if (!clean || busy) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    setSuggest([]);
    const now = Date.now();
    if (lastTermRef.current.term === clean && now - lastTermRef.current.at < 2500) {
      dispatchFeedback("duplicate");
      toast.warning("Duplicate scan skipped");
      setInput("");
      return;
    }
    lastTermRef.current = { term: clean, at: now };
    setBusy(true);
    setCandidates([]);
    try {
      const rows = await search(clean, opts?.strict === true);
      if (!rows.length) return fail(`Order পাওয়া যায়নি: ${clean}`);
      let order: OrderRow | undefined = rows[0];
      if (rows.length > 1) {
        const actionable = rows.filter((r) => MODE_FROM[mode].includes(r.status));
        if (actionable.length === 1) order = actionable[0];
        else {
          dispatchFeedback("duplicate");
          setCandidates(rows);
          setCurrent(null);
          return;
        }
      }
      if (confirmMode) {
        const items = await loadItems(order.id);
        setCurrent({ order, items, ok: null, msg: "Items মিলিয়ে Confirm চাপো" });
      } else {
        await apply(order);
      }
      setInput("");
    } catch (e: any) {
      fail(e?.message ?? "Scan failed");
    } finally {
      setBusy(false);
      focus();
    }
  };

  const runGuarded = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } catch (e: any) { fail(e?.message ?? "Failed"); } finally { setBusy(false); focus(); }
  };

  const onChange = (v: string) => {
    setInput(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (suggestRef.current) clearTimeout(suggestRef.current);
    const clean = v.trim();
    if (auto && (normPhone(clean) || UUID_RE.test(clean))) {
      timerRef.current = setTimeout(() => process(clean, { strict: true }), 120);
      return;
    }
    if (clean.length >= 3) {
      suggestRef.current = setTimeout(async () => {
        try { setSuggest(await search(clean, false, 6)); } catch { setSuggest([]); }
      }, 250);
    } else setSuggest([]);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); process(input); }
    if (e.key === "Escape") { setInput(""); setSuggest([]); }
  };

  const undoLast = () => {
    const last = log.find((l) => l.ok && l.undoable);
    if (!last?.orderId || !last.from) return;
    void runGuarded(async () => {
      await onStatusChange(last.orderId!, last.from!);
      dispatchFeedback("undo");
      setLog((p) => p.map((l) => (l === last ? { ...l, undoable: false, msg: `↩ Undone · ${l.msg}` } : l)));
      setCurrent(null);
      toast.success(`Undo · ${last.invoice ?? ""} → ${statusBadge(last.from!).label}`);
    });
  };

  const exportCsv = () => {
    const rows = [["time", "result", "invoice", "from", "to", "message"],
      ...log.map((l) => [new Date(l.at).toLocaleString("en-GB", { timeZone: "Asia/Dhaka" }), l.ok ? "ok" : "error", l.invoice ?? "", l.from ?? "", l.to ?? "", l.msg])];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `scan-session-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const resetSession = () => { setLog([]); startedRef.current = Date.now(); setCurrent(null); };

  const toggleMute = () => { const v = !muted; setMuted(v); setDispatchMuted(v); if (!v) dispatchFeedback("undo"); };

  const activeMode = MODES.find((m) => m.key === mode)!;
  const canUndo = log.some((l) => l.ok && l.undoable);
  const shownLog = log.filter((l) => logFilter === "all" || (logFilter === "ok" ? l.ok : !l.ok));

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        aria-describedby={undefined}
        className="flex h-dvh w-screen max-w-none flex-col gap-0 overflow-hidden border-0 p-0 sm:h-[min(880px,94dvh)] sm:w-[min(640px,96vw)] sm:rounded-2xl sm:border [&>button]:hidden"
      >
        {/* Header */}
        <div className="relative flex items-center gap-2 border-b px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className={cn("grid h-9 w-9 place-items-center rounded-xl text-white transition-colors duration-300", activeMode.tone, activeMode.ring)}>
            <ScanLine className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-sm font-bold leading-tight">Scan Station</DialogTitle>
            <p className="text-[11px] text-muted-foreground tabular-nums">{stats.rate}/min · {log.filter((l) => l.ok).length} done · {stats.errors} error</p>
          </div>
          <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => setConfirmMode((v) => !v)} title={confirmMode ? "Verify mode on" : "Verify mode off"}>
            <ShieldCheck className={cn("h-4 w-4", confirmMode ? "text-sky-500" : "text-muted-foreground")} />
          </Button>
          <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => setAuto((a) => !a)} title={auto ? "Auto-submit on" : "Auto-submit off"}>
            {auto ? <Zap className="h-4 w-4 text-amber-500" /> : <ZapOff className="h-4 w-4 text-muted-foreground" />}
          </Button>
          <Button size="icon" variant="ghost" className="h-9 w-9" onClick={toggleMute} title={muted ? "Sound off" : "Sound on"}>
            {muted ? <VolumeX className="h-4 w-4 text-muted-foreground" /> : <Volume2 className="h-4 w-4 text-emerald-500" />}
          </Button>
          <Button size="icon" variant="ghost" className="h-9 w-9" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Session stats */}
        <div className="grid grid-cols-4 gap-1.5 px-3 pt-2">
          {[
            { l: "Packing", v: stats.packing, c: "text-amber-600" },
            { l: "Packed", v: stats.packed, c: "text-sky-600" },
            { l: "RTS", v: stats.rts, c: "text-violet-600" },
            { l: "Shipped", v: stats.shipped, c: "text-emerald-600" },
          ].map((s) => (
            <div key={s.l} className="rounded-lg border bg-muted/30 px-2 py-1 text-center">
              <div className={cn("text-lg font-bold tabular-nums leading-tight", s.c)}>{s.v}</div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{s.l}</div>
            </div>
          ))}
        </div>

        <div className="flex-1 space-y-2.5 overflow-y-auto px-3 py-2.5">
          {/* Search / input */}
          <div className="relative">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => onChange(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="Invoice, tracking, phone, last-4, name…"
                  className={cn("h-12 pl-9 pr-9 text-base font-semibold", busy && "opacity-70")}
                  inputMode="search"
                  autoComplete="off"
                  enterKeyHint="go"
                />
                {busy && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-primary" />}
              </div>
              <Button
                size="icon"
                className="h-12 w-12 shrink-0"
                variant={camera ? "default" : "outline"}
                onClick={() => { primeAudio(); setCamera((c) => !c); }}
                title={camera ? "Close camera" : "Open camera"}
              >
                {camera ? <CameraOff className="h-5 w-5" /> : <Camera className="h-5 w-5" />}
              </Button>
            </div>
            {suggest.length > 0 && (
              <div className="absolute inset-x-0 top-[calc(100%+4px)] z-30 overflow-hidden rounded-xl border bg-popover shadow-lg animate-in fade-in slide-in-from-top-1 duration-150">
                {suggest.map((o) => (
                  <OrderPick key={o.id} o={o} onPick={() => { setSuggest([]); setInput(""); void runGuarded(async () => {
                    if (confirmMode) setCurrent({ order: o, items: await loadItems(o.id), ok: null, msg: "Items মিলিয়ে Confirm চাপো" });
                    else await apply(o);
                  }); }} />
                ))}
              </div>
            )}
          </div>

          {/* Continuous camera */}
          <CameraScanner
            inline
            continuous
            paused={busy}
            open={camera}
            onClose={() => setCamera(false)}
            onDetect={(code) => process(code, { strict: true })}
          />

          {/* Candidates */}
          {candidates.length > 0 && (
            <div className="rounded-xl border-2 border-amber-400/70 bg-amber-50/50 p-2 dark:bg-amber-950/20 animate-in fade-in duration-200">
              <p className="mb-1.5 px-1 text-xs font-semibold">{candidates.length}টা order match — কোনটা?</p>
              <div className="divide-y overflow-hidden rounded-lg border bg-card">
                {candidates.map((o) => (
                  <OrderPick key={o.id} o={o} onPick={() => { setCandidates([]); void runGuarded(() => apply(o)); }} />
                ))}
              </div>
            </div>
          )}

          {/* Current order card */}
          {current && (
            <div
              key={`${current.order.id}-${current.ok}-${log.length}`}
              className={cn(
                "rounded-2xl border-2 p-3 animate-in fade-in zoom-in-95 duration-200",
                current.ok === true && "border-emerald-400 bg-emerald-50/60 dark:bg-emerald-950/20",
                current.ok === false && "border-rose-500 bg-rose-50/70 dark:bg-rose-950/25",
                current.ok === null && "border-sky-400 bg-sky-50/50 dark:bg-sky-950/20",
              )}
            >
              <div className="flex items-start gap-2.5">
                {current.ok === true ? <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
                  : current.ok === false ? <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-rose-600" />
                  : <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-sky-600" />}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-base font-bold">{current.order.invoice_no ?? current.order.id.slice(0, 8)}</span>
                    <Badge className={cn("text-[10px]", statusBadge(current.order.status).className)}>{statusBadge(current.order.status).label}</Badge>
                  </div>
                  <p className="mt-0.5 text-sm font-semibold break-words">{current.msg}</p>
                </div>
                {onPrint && (
                  <Button size="icon" variant="outline" className="h-9 w-9 shrink-0" onClick={() => onPrint(current.order.id)} title="Print waybill">
                    <Printer className="h-4 w-4" />
                  </Button>
                )}
              </div>

              <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5 font-medium text-foreground">
                  {current.order.shipping_name || current.order.guest_name || "—"}
                  <span className="ml-auto font-bold tabular-nums">৳{Number(current.order.total ?? 0).toLocaleString()}</span>
                  <Badge variant="outline" className="text-[10px]">{isCod(current.order) ? "COD" : "Paid"}</Badge>
                </div>
                {(current.order.shipping_phone || current.order.guest_phone) && (
                  <div className="flex items-center gap-1.5"><Phone className="h-3 w-3" />{current.order.shipping_phone || current.order.guest_phone}
                    {current.order.courier_name && <span className="ml-auto capitalize">{current.order.courier_name}{current.order.tracking_number ? ` · ${current.order.tracking_number}` : ""}</span>}
                  </div>
                )}
                {current.order.shipping_address && (
                  <div className="flex items-start gap-1.5"><MapPin className="mt-0.5 h-3 w-3 shrink-0" /><span className="line-clamp-2">{[current.order.shipping_address, current.order.shipping_thana, current.order.shipping_district ?? current.order.shipping_city].filter(Boolean).join(", ")}</span></div>
                )}
              </div>

              {current.items.length > 0 && (
                <div className="mt-2 divide-y rounded-lg border bg-card/80">
                  {current.items.map((it, i) => (
                    <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 text-sm">
                      <span className="grid h-6 min-w-6 place-items-center rounded-md bg-primary/10 px-1 text-xs font-bold tabular-nums text-primary">{it.quantity}×</span>
                      <span className="min-w-0 flex-1 truncate">{it.name}{it.variant_label ? <span className="text-muted-foreground"> · {it.variant_label}</span> : null}</span>
                    </div>
                  ))}
                </div>
              )}

              {current.ok === null && (
                <Button className="mt-2.5 h-12 w-full text-base font-bold" disabled={busy} onClick={() => void runGuarded(() => apply(current.order, mode, current.items))}>
                  {busy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <activeMode.icon className="mr-2 h-5 w-5" />}
                  Confirm {activeMode.label}
                </Button>
              )}
              {current.ok === false && current.hint && (
                <Button variant="outline" className="mt-2.5 h-11 w-full font-semibold" disabled={busy} onClick={() => {
                  const h = current.hint!;
                  setMode(h);
                  void runGuarded(() => apply(current.order, h, current.items));
                }}>
                  {MODES.find((m) => m.key === current.hint)?.label} mode-এ switch করে apply <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              )}
            </div>
          )}

          {!current && !candidates.length && !camera && (
            <div className="grid place-items-center gap-2 rounded-2xl border border-dashed py-8 text-center text-muted-foreground">
              <div className={cn("grid h-14 w-14 place-items-center rounded-2xl text-white", activeMode.tone, activeMode.ring, "motion-safe:animate-pulse")}>
                <activeMode.icon className="h-7 w-7" />
              </div>
              <p className="text-sm font-medium text-foreground">{activeMode.label} mode ready</p>
              <p className="max-w-xs text-xs">Scanner gun দিয়ে scan করো, camera খোলো, অথবা invoice/phone লেখো।</p>
            </div>
          )}

          {/* Session log */}
          {log.length > 0 && (
            <div className="rounded-xl border">
              <div className="flex items-center gap-1 border-b px-2 py-1.5">
                {(["all", "ok", "err"] as const).map((f) => (
                  <button key={f} type="button" onClick={() => setLogFilter(f)}
                    className={cn("rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors", logFilter === f ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}>
                    {f === "all" ? `All ${log.length}` : f === "ok" ? "Done" : `Errors ${stats.errors}`}
                  </button>
                ))}
                <Button size="icon" variant="ghost" className="ml-auto h-7 w-7" onClick={exportCsv} title="Export CSV"><Download className="h-3.5 w-3.5" /></Button>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={resetSession}>Reset</Button>
              </div>
              <div className="max-h-48 divide-y overflow-y-auto">
                {shownLog.map((r) => (
                  <div key={r.at} className="flex items-center gap-2 px-2.5 py-1.5 text-[11px]">
                    {r.ok ? <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" /> : <AlertCircle className="h-3 w-3 shrink-0 text-rose-500" />}
                    <span className="min-w-0 flex-1 truncate">{r.msg}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">{new Date(r.at).toLocaleTimeString("en-GB", { timeZone: "Asia/Dhaka", hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Bottom: mode bar (thumb reach) */}
        <div className="border-t bg-background/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur">
          {mode === "ship" && (
            <div className="mb-2 flex items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">Courier</span>
              {PROVIDERS.map((p) => (
                <button key={p.key} type="button" onClick={() => setProvider(p.key)}
                  className={cn("rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors",
                    provider === p.key ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:border-foreground/40")}>
                  {p.label}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-stretch gap-1.5">
            {MODES.map((m) => {
              const on = mode === m.key;
              return (
                <button key={m.key} type="button"
                  onClick={() => { setMode(m.key); setCurrent(null); setCandidates([]); focus(); }}
                  className={cn("flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl border py-2 transition-all duration-200 active:scale-[0.96]",
                    on ? cn(m.tone, m.ring, "border-transparent text-white") : "bg-card text-muted-foreground hover:border-foreground/40")}>
                  <m.icon className="h-5 w-5" />
                  <span className="text-xs font-bold">{m.label}</span>
                </button>
              );
            })}
            <Button variant="outline" className="h-auto w-14 flex-col gap-0.5 rounded-xl py-2" disabled={!canUndo || busy} onClick={undoLast} title="Undo last">
              <Undo2 className="h-5 w-5" /><span className="text-[10px] font-bold">Undo</span>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function OrderPick({ o, onPick }: { o: OrderRow; onPick: () => void }) {
  return (
    <button type="button" onClick={onPick} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-muted active:bg-muted">
      <span className="font-bold">{o.invoice_no ?? o.id.slice(0, 8)}</span>
      <span className="min-w-0 flex-1 truncate text-muted-foreground">{o.shipping_name || o.guest_name || "—"} · {o.shipping_phone || o.guest_phone || ""}</span>
      <Badge className={cn("shrink-0 text-[10px]", statusBadge(o.status).className)}>{statusBadge(o.status).label}</Badge>
    </button>
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
