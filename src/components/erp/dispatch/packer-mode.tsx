import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  X, PackageOpen, PackagePlus, Send, Camera, Undo2, Volume2, VolumeX, Loader2, CheckCircle2, AlertCircle, Phone, MapPin, Keyboard, KeyboardOff, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ScanInput, type ScanInputHandle } from "./scan-input";
import { CameraScanner } from "./camera-scanner";
import {
  bdt, customerName, customerPhone, customerArea, isCod, itemCount, timeAgo,
  type DispatchMode, type UseDispatch,
} from "@/hooks/erp/use-dispatch";
import { isDispatchMuted, setDispatchMuted, primeAudio } from "@/lib/erp/dispatch/feedback";

const MODES: { key: DispatchMode; label: string; sub: string; icon: React.ReactNode; tone: string; ring: string }[] = [
  { key: "pack", label: "PACK", sub: "Pending → Packed", icon: <PackageOpen className="h-5 w-5" />, tone: "bg-amber-500", ring: "ring-amber-500" },
  { key: "ready", label: "READY", sub: "Packed → Ready", icon: <PackagePlus className="h-5 w-5" />, tone: "bg-violet-500", ring: "ring-violet-500" },
  { key: "ship", label: "SHIP", sub: "Ready → Shipped", icon: <Send className="h-5 w-5" />, tone: "bg-emerald-500", ring: "ring-emerald-500" },
];

export function PackerMode({ d, onExit }: { d: UseDispatch; onExit: () => void }) {
  const scanRef = useRef<ScanInputHandle>(null);
  const [camera, setCamera] = useState(false);
  const [muted, setMuted] = useState(false);
  const [noKeyboard, setNoKeyboard] = useState(false);
  const [flash, setFlash] = useState<"ok" | "err" | null>(null);
  const [logOpen, setLogOpen] = useState(false);

  useEffect(() => setMuted(isDispatchMuted()), []);
  useEffect(() => {
    primeAudio();
  }, []);

  // Full-screen colour flash on every scan result
  const lastAt = useRef(0);
  useEffect(() => {
    if (!d.lastResult || d.lastResult.at === lastAt.current) return;
    lastAt.current = d.lastResult.at;
    setFlash(d.lastResult.ok ? "ok" : "err");
    const t = setTimeout(() => setFlash(null), 450);
    return () => clearTimeout(t);
  }, [d.lastResult]);

  const counts = d.sessionCount;
  const last = d.lastResult;
  const order = last?.order;
  const activeMode = MODES.find((m) => m.key === d.mode)!;

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col overscroll-none">
      {flash && (
        <div
          className={cn(
            "pointer-events-none absolute inset-0 z-20 animate-in fade-in",
            flash === "ok" ? "bg-emerald-500/25" : "bg-rose-500/25",
          )}
        />
      )}

      {/* Header */}
      <div
        className="flex items-center justify-between gap-2 px-3 py-2 border-b shrink-0"
        style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
      >
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Packer Station</div>
          <div className="flex items-center gap-2 text-[11px] font-semibold tabular-nums">
            <span className="rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 px-2 py-0.5">{counts.pack} packed</span>
            <span className="rounded-full bg-violet-500/15 text-violet-600 dark:text-violet-400 px-2 py-0.5">{counts.ready} ready</span>
            <span className="rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-2 py-0.5">{counts.ship} shipped</span>
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <Button
            size="icon"
            variant="ghost"
            className="h-11 w-11"
            onClick={() => setNoKeyboard((v) => !v)}
            title={noKeyboard ? "Enable keyboard" : "Disable keyboard"}
          >
            {noKeyboard ? <KeyboardOff className="h-5 w-5" /> : <Keyboard className="h-5 w-5" />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-11 w-11"
            onClick={() => {
              const v = !muted;
              setMuted(v);
              setDispatchMuted(v);
            }}
            title={muted ? "Unmute" : "Mute"}
          >
            {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </Button>
          <Button size="icon" variant="ghost" className="h-11 w-11" onClick={onExit}>
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Stage selector */}
      <div className="grid grid-cols-3 gap-2 p-2.5 shrink-0">
        {MODES.map((m) => {
          const on = d.mode === m.key;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => {
                d.setMode(m.key);
                primeAudio();
                scanRef.current?.focus();
              }}
              className={cn(
                "rounded-2xl border px-2 py-2.5 text-center transition-all active:scale-[0.97] min-h-[58px]",
                on ? cn(m.tone, "text-white border-transparent shadow-lg ring-2 ring-offset-2 ring-offset-background", m.ring) : "bg-card hover:border-foreground/40",
              )}
            >
              <div className="flex items-center justify-center gap-1.5">
                {m.icon}
                <span className="text-base font-bold tracking-tight">{m.label}</span>
              </div>
              <div className={cn("text-[10px] mt-0.5 hidden sm:block", on ? "opacity-80" : "text-muted-foreground")}>{m.sub}</div>
            </button>
          );
        })}
      </div>

      {/* Result / log — scrollable middle */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-4 space-y-3">
        {d.busy && (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Processing…
          </div>
        )}

        {!last && !d.busy && (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-muted-foreground">
            <div className={cn("rounded-2xl p-4 text-white", activeMode.tone)}>{activeMode.icon}</div>
            <p className="text-sm font-medium">Scan an invoice to {activeMode.label.toLowerCase()}</p>
            <p className="text-xs">{activeMode.sub}</p>
          </div>
        )}

        {last && (
          <div
            className={cn(
              "rounded-2xl border-2 p-4",
              last.ok
                ? "border-emerald-400 bg-emerald-50/70 dark:bg-emerald-950/30"
                : "border-rose-400 bg-rose-50/70 dark:bg-rose-950/30",
            )}
          >
            <div className="flex items-start gap-2 text-base font-bold">
              {last.ok ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" /> : <AlertCircle className="h-5 w-5 shrink-0 text-rose-600" />}
              <span className="leading-snug">{last.msg}</span>
            </div>
            {order && (
              <div className="mt-3 space-y-1 text-sm">
                <div className="font-semibold text-base">{customerName(order)}</div>
                <a
                  href={`tel:${customerPhone(order)}`}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-2 hover:underline"
                >
                  <Phone className="h-3 w-3" /> {customerPhone(order) || "—"}
                </a>
                <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3 mt-0.5 shrink-0" /> <span>{customerArea(order) || "—"}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-1.5 text-base font-bold">
                  <span
                    className={cn(
                      "rounded-lg px-2 py-1",
                      isCod(order) ? "bg-amber-500/15 text-amber-700 dark:text-amber-400" : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
                    )}
                  >
                    {isCod(order) ? "COD" : "PAID"} {bdt(order.total ?? 0)}
                  </span>
                  <span className="text-muted-foreground text-sm font-medium">{itemCount(order)} pcs</span>
                </div>
                {(order.items ?? []).length > 0 && (
                  <ul className="pt-2 space-y-1">
                    {(order.items ?? []).map((it, i) => (
                      <li key={i} className="flex items-center justify-between gap-2 rounded-lg bg-background/70 px-2.5 py-2 text-xs">
                        <span className="truncate">
                          {it.name}
                          {it.variant_label ? <span className="text-muted-foreground"> · {it.variant_label}</span> : null}
                        </span>
                        <span className="font-bold tabular-nums shrink-0 text-sm">×{it.quantity}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        {d.scanLog.length > 0 && (
          <div className="rounded-2xl border">
            <button
              type="button"
              onClick={() => setLogOpen((v) => !v)}
              className="flex w-full items-center justify-between px-3 py-2.5 text-xs font-semibold"
            >
              <span>Recent scans ({d.scanLog.length})</span>
              <ChevronDown className={cn("h-4 w-4 transition-transform", logOpen && "rotate-180")} />
            </button>
            {logOpen && (
              <div className="space-y-1.5 px-2 pb-2">
                {d.scanLog.map((e) => (
                  <div
                    key={e.id}
                    className={cn(
                      "flex items-center gap-2 text-xs px-3 py-2 rounded-xl border",
                      e.ok
                        ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/50 dark:bg-emerald-950/30"
                        : "border-rose-200 bg-rose-50/60 dark:border-rose-900/50 dark:bg-rose-950/30",
                    )}
                  >
                    {e.ok ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" /> : <AlertCircle className="h-3.5 w-3.5 shrink-0 text-rose-600" />}
                    <span className="truncate flex-1">{e.msg}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(new Date(e.at).toISOString())}</span>
                    {e.undoable && (
                      <Button size="sm" variant="ghost" className="h-8 px-2 text-[10px] shrink-0" onClick={() => d.undo(e.id)}>
                        <Undo2 className="h-3 w-3 mr-1" /> Undo
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sticky scan bar — always reachable by thumb */}
      <div
        className="shrink-0 border-t bg-card/95 backdrop-blur px-3 pt-2.5"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex gap-2">
          <div className="flex-1 min-w-0">
            <ScanInput
              ref={scanRef}
              onScan={(v) => {
                primeAudio();
                d.scan(v);
              }}
              disabled={d.brandIds.length === 0}
              noKeyboard={noKeyboard}
              hideSubmit
              placeholder={`Scan to ${d.mode.toUpperCase()}…`}
            />
          </div>
          <Button
            size="lg"
            className={cn("h-14 px-5 shrink-0 text-white", activeMode.tone)}
            onClick={() => {
              primeAudio();
              setCamera(true);
            }}
          >
            <Camera className="h-6 w-6" />
          </Button>
        </div>
      </div>

      <CameraScanner
        open={camera}
        onClose={() => setCamera(false)}
        onDetect={(code) => {
          setCamera(false);
          primeAudio();
          d.scan(code);
        }}
      />
    </div>
  );
}
