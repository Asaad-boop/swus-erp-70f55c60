import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  Camera,
  CameraOff,
  CheckCircle2,
  ChevronDown,
  Keyboard,
  Loader2,
  Package,
  PackageCheck,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/erp/ui";
import { CameraScanner } from "@/components/erp/dispatch/camera-scanner";
import { dispatchFeedback } from "@/lib/erp/dispatch/feedback";
import { beep, unlockBeep, warmScanner } from "@/lib/erp/dispatch/scan-engine";
import { useBrand } from "@/contexts/brand-context";
import { cn } from "@/lib/utils";
import {
  NEXT_LABEL,
  PACK_STAGE,
  packQueue,
  packScan,
  packScanCode,
  packStats,
  packUndo,
  type PackMode,
  type PackOrder,
} from "@/lib/erp/packing/api";
import { clock } from "@/lib/erp/hr/format";

export const Route = createFileRoute("/_authenticated/erp/packing")({
  head: () => ({ meta: [{ title: "Packing Station" }] }),
  component: PackingStation,
});

/** Same stages as the order list tabs. */
type Tab = "pending" | "packing" | "packed" | "rts";
const TABS: { key: Tab; label: string; statuses: string[] }[] = [
  { key: "pending", label: "Pending", statuses: ["confirmed"] },
  { key: "packing", label: "Packing", statuses: ["packaging", "ready_to_pack"] },
  { key: "packed", label: "Packed", statuses: ["packed"] },
  { key: "rts", label: "RTS", statuses: ["ready_to_ship"] },
];

const MODES: { key: PackMode; label: string; hint: string }[] = [
  { key: "auto", label: "Auto", hint: "প্রতি scan-এ পরের ধাপে: Pending → Packing → Packed → RTS" },
  { key: "pack", label: "Packing", hint: "শুধু Pending → Packing" },
  { key: "packed", label: "Packed", hint: "Pending/Packing → Packed" },
  { key: "ready", label: "RTS", hint: "শুধু Packed → RTS" },
];

const OLD_DAYS = 7;

type Log = { at: number; ok: boolean; msg: string; order?: PackOrder };

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

function useIsTouch() {
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    setTouch(mq.matches);
    const on = () => setTouch(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return touch;
}

function age(iso: string) {
  const d = (Date.now() - Date.parse(iso)) / 86_400_000;
  if (d < 1) return `${Math.max(1, Math.round(d * 24))}h`;
  return `${Math.floor(d)}d`;
}

function PackingStation() {
  const qc = useQueryClient();
  const { brandIds } = useBrand();
  const isTouch = useIsTouch();
  const [mode, setMode] = useState<PackMode>("auto");
  const [code, setCode] = useState("");
  const [camera, setCamera] = useState(false);
  const [typing, setTyping] = useState(false);
  const [current, setCurrent] = useState<{ ok: boolean; msg: string; order?: PackOrder } | null>(
    null,
  );
  const [choices, setChoices] = useState<PackOrder[]>([]);
  const [log, setLog] = useState<Log[]>([]);
  const [tab, setTab] = useState<Tab>("pending");
  const [showOld, setShowOld] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastRef = useRef({ code: "", at: 0 });

  const scope = brandIds.length ? brandIds : null;
  const stats = useQuery({
    queryKey: ["packing", "stats", scope],
    queryFn: () => packStats(scope),
    refetchInterval: 30_000,
    placeholderData: (p) => p,
  });
  const queue = useQuery({
    queryKey: ["packing", "queue", scope],
    queryFn: () => packQueue(scope),
    refetchInterval: 30_000,
    placeholderData: (p) => p,
  });

  // Desktop with a USB scanner: keep the field focused. Phones: never auto-focus
  // (it pops the keyboard and makes the page jump) — the camera is the scanner.
  const refocus = () => {
    if (isTouch || camera) return;
    setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 30);
  };
  useEffect(() => {
    refocus();
  }, [camera, isTouch]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    warmScanner();
  }, []);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["packing"] });
  };
  const push = (l: Omit<Log, "at">) => setLog((s) => [{ ...l, at: Date.now() }, ...s].slice(0, 30));

  const scan = useMutation({
    mutationFn: async (o: PackOrder) => packScan(o.id, mode),
    onSuccess: (o) => {
      const from = PACK_STAGE[o.from_status ?? ""]?.label ?? o.from_status;
      const to = PACK_STAGE[o.status]?.label ?? o.status;
      const msg = `${from} → ${to}`;
      dispatchFeedback(o.status === "ready_to_ship" ? "ready" : "pack");
      setCurrent({ ok: true, msg, order: o });
      push({ ok: true, msg: `${o.invoice_no ?? ""} · ${msg}`, order: o });
      refresh();
      refocus();
    },
    onError: (e, o) => {
      dispatchFeedback("error");
      setCurrent({ ok: false, msg: errText(e), order: o });
      push({ ok: false, msg: errText(e), order: o });
      refocus();
    },
  });

  const undo = useMutation({
    mutationFn: (id: string) => packUndo(id),
    onSuccess: (o) => {
      dispatchFeedback("undo");
      toast.success(`Undo · ${o.invoice_no ?? ""} → ${PACK_STAGE[o.status]?.label ?? o.status}`);
      setCurrent({
        ok: true,
        msg: `Undo হয়েছে → ${PACK_STAGE[o.status]?.label ?? o.status}`,
        order: o,
      });
      setLog((s) => s.slice(1));
      refresh();
      refocus();
    },
    onError: (e) => {
      toast.error(errText(e));
      refocus();
    },
  });

  const [busy, setBusy] = useState(false);

  const okResult = (o: PackOrder) => {
    const from = PACK_STAGE[o.from_status ?? ""]?.label ?? o.from_status;
    const to = PACK_STAGE[o.status]?.label ?? o.status;
    const msg = `${from} → ${to}`;
    dispatchFeedback(o.status === "ready_to_ship" ? "ready" : "pack");
    setCurrent({ ok: true, msg, order: o });
    push({ ok: true, msg: `${o.invoice_no ?? ""} · ${msg}`, order: o });
    refresh();
  };
  const failResult = (msg: string, o?: PackOrder | null) => {
    beep(false);
    dispatchFeedback("error");
    setCurrent({ ok: false, msg, order: o ?? undefined });
    push({ ok: false, msg, order: o ?? undefined });
  };

  /** Scanner path: one server round trip finds the order and moves it. */
  const handle = async (raw: string) => {
    const c = raw.trim();
    if (!c || busy) return;
    const now = Date.now();
    if (lastRef.current.code === c && now - lastRef.current.at < 2500) {
      dispatchFeedback("duplicate");
      return;
    }
    lastRef.current = { code: c, at: now };
    setCode("");
    setChoices([]);
    setBusy(true);
    try {
      const r = await packScanCode(c, mode);
      if (r.result === "ok") okResult(r.order);
      else if (r.result === "choose") setChoices(r.choices);
      else if (r.result === "error") failResult(r.message, r.order);
      else failResult(`"${c}" — কোনো order পাওয়া যায়নি`);
    } catch (e) {
      failResult(errText(e));
    } finally {
      setBusy(false);
      refocus();
    }
  };

  const lists = useMemo(() => {
    const q = queue.data ?? [];
    const by = (t: Tab) =>
      q.filter((o) => TABS.find((x) => x.key === t)!.statuses.includes(o.status));
    return { pending: by("pending"), packing: by("packing"), packed: by("packed"), rts: by("rts") };
  }, [queue.data]);

  const cutoff = Date.now() - OLD_DAYS * 86_400_000;
  const shown = lists[tab];
  const fresh = tab === "pending" ? shown.filter((o) => Date.parse(o.created_at) >= cutoff) : shown;
  const old = tab === "pending" ? shown.filter((o) => Date.parse(o.created_at) < cutoff) : [];

  const lastUndoable =
    current?.ok &&
    current.order &&
    log[0]?.order?.id === current.order.id &&
    Date.now() - log[0].at < 15 * 60_000;
  const showInput = !isTouch || typing;

  return (
    <div className="mx-auto max-w-[1400px] space-y-3 px-3 pb-28 pt-3 md:space-y-4 md:p-6">
      <div className="flex items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold tracking-tight md:text-2xl">Packing Station</h1>
          <p className="text-xs text-muted-foreground">Invoice scan করুন — order পরের ধাপে যাবে</p>
        </div>
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-3 py-1.5 text-right">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
            আমি আজ
          </div>
          <div className="text-lg font-bold leading-tight tabular-nums">
            {stats.data?.my_packed_today ?? 0}{" "}
            <span className="text-xs font-medium text-muted-foreground">packed</span>
          </div>
        </div>
      </div>

      {/* SCANNER */}
      <section className="rounded-2xl border bg-card p-3 md:p-5">
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
          {MODES.map((m) => (
            <button
              key={m.key}
              onClick={() => {
                setMode(m.key);
                refocus();
              }}
              className={cn(
                "shrink-0 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                mode === m.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-background hover:bg-muted",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {MODES.find((m) => m.key === mode)?.hint}
        </p>

        {isTouch && (
          <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
            <Button
              size="lg"
              onClick={() => {
                unlockBeep();
                setCamera((v) => !v);
              }}
              className={cn(
                "h-14 gap-2 rounded-xl text-base font-semibold",
                camera ? "bg-rose-600 hover:bg-rose-700" : "bg-indigo-600 hover:bg-indigo-700",
              )}
            >
              {camera ? <CameraOff className="size-5" /> : <Camera className="size-5" />}
              {camera ? "Camera বন্ধ" : "Camera দিয়ে scan"}
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-14 rounded-xl px-4"
              onClick={() => setTyping((v) => !v)}
              aria-label="Type invoice"
            >
              <Keyboard className="size-5" />
            </Button>
          </div>
        )}

        {showInput && (
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void handle(code);
            }}
          >
            <Input
              ref={inputRef}
              autoFocus={!isTouch || typing}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onBlur={() => refocus()}
              placeholder="Invoice / tracking নম্বর…"
              className="h-12 flex-1 font-mono text-base"
              autoComplete="off"
              autoCapitalize="characters"
              enterKeyHint="go"
            />
            <Button type="submit" size="lg" className="h-12 px-4" disabled={busy || !code.trim()}>
              {busy ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <ArrowRight className="size-5" />
              )}
            </Button>
            {!isTouch && (
              <Button
                type="button"
                size="lg"
                variant={camera ? "default" : "outline"}
                className="h-12 px-4"
                onClick={() => {
                  unlockBeep();
                  setCamera((v) => !v);
                }}
              >
                {camera ? <CameraOff className="size-5" /> : <Camera className="size-5" />}
              </Button>
            )}
          </form>
        )}

        {camera && (
          <div className="mt-3 overflow-hidden rounded-xl border">
            <CameraScanner
              inline
              continuous
              open={camera}
              paused={busy || scan.isPending}
              onClose={() => setCamera(false)}
              onDetect={(c) => void handle(c)}
            />
          </div>
        )}

        {choices.length > 0 && (
          <div className="mt-3 space-y-1.5">
            <p className="text-xs text-muted-foreground">একাধিক order মিলেছে — সঠিকটা বাছাই করুন:</p>
            {choices.map((o) => (
              <button
                key={o.id}
                onClick={() => {
                  setChoices([]);
                  scan.mutate(o);
                }}
                className="flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-3 text-left text-sm active:bg-muted"
              >
                <span className="min-w-0 truncate">
                  <b className="font-mono">{o.invoice_no}</b> · {o.customer}
                </span>
                <StageChip status={o.status} />
              </button>
            ))}
          </div>
        )}

        {busy && !current && (
          <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Checking…
          </div>
        )}

        {current && (
          <div
            className={cn(
              "mt-3 rounded-xl border p-3",
              current.ok
                ? "border-emerald-500/40 bg-emerald-500/5"
                : "border-rose-500/40 bg-rose-500/5",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div
                className={cn(
                  "flex min-w-0 items-start gap-2 text-sm font-semibold md:text-base",
                  current.ok ? "text-emerald-700" : "text-rose-700",
                )}
              >
                {current.ok ? (
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
                ) : (
                  <AlertTriangle className="mt-0.5 size-5 shrink-0" />
                )}
                <span className="break-words">{current.msg}</span>
              </div>
              {lastUndoable && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={undo.isPending}
                  onClick={() => current.order && undo.mutate(current.order.id)}
                  className="h-9 shrink-0 gap-1.5"
                >
                  <Undo2 className="size-4" /> Undo
                </Button>
              )}
            </div>
            {current.order && <OrderBody o={current.order} big />}
          </div>
        )}
      </section>

      {/* STAGES — same as order list tabs */}
      <div className="sticky top-0 z-10 -mx-3 bg-background/95 px-3 py-2 backdrop-blur md:static md:mx-0 md:bg-transparent md:p-0">
        <div className="grid grid-cols-4 gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "rounded-xl border bg-card px-2 py-2 text-center transition-colors",
                tab === t.key
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "active:bg-muted",
              )}
            >
              <div className="text-xl font-bold leading-tight tabular-nums">
                {queue.data ? lists[t.key].length : "–"}
              </div>
              <div className="truncate text-[11px] font-medium text-muted-foreground">
                {t.label}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <section className="space-y-2">
          {queue.isLoading ? (
            <Skeleton className="h-40" />
          ) : fresh.length === 0 && old.length === 0 ? (
            <div className="rounded-xl border bg-card">
              <EmptyState
                compact
                icon={<PackageCheck className="size-5" />}
                title="এই ধাপে কোনো order নেই"
              />
            </div>
          ) : (
            <>
              {fresh.length === 0 && tab === "pending" && (
                <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
                  গত {OLD_DAYS} দিনের কোনো pending order নেই
                </p>
              )}
              <div className="grid gap-2 md:grid-cols-2">
                {fresh.map((o) => (
                  <QueueCard key={o.id} o={o} />
                ))}
              </div>
              {old.length > 0 && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5">
                  <button
                    onClick={() => setShowOld((v) => !v)}
                    className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm"
                  >
                    <span className="flex items-center gap-2 font-medium text-amber-800">
                      <AlertTriangle className="size-4" /> পুরনো pending — {OLD_DAYS} দিনের বেশি (
                      {old.length})
                    </span>
                    <ChevronDown
                      className={cn("size-4 transition-transform", showOld && "rotate-180")}
                    />
                  </button>
                  {showOld && (
                    <div className="grid gap-2 p-2 pt-0 md:grid-cols-2">
                      {old.map((o) => (
                        <QueueCard key={o.id} o={o} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </section>

        <section className="space-y-2">
          <div className="text-sm font-semibold">এই session-এ scan</div>
          <div className="rounded-xl border bg-card">
            {log.length === 0 ? (
              <EmptyState compact title="এখনো scan করা হয়নি" />
            ) : (
              <ul className="max-h-[420px] divide-y overflow-y-auto text-sm">
                {log.map((l, i) => (
                  <li key={i} className="flex items-start gap-2 px-3 py-2">
                    {l.ok ? (
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                    ) : (
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-rose-600" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="break-words">{l.msg}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {clock(new Date(l.at).toISOString())}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function StageChip({ status }: { status: string }) {
  const s = PACK_STAGE[status];
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
        s?.cls ?? "bg-muted text-muted-foreground",
      )}
    >
      {s?.label ?? status}
    </span>
  );
}

function QueueCard({ o }: { o: PackOrder }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <OrderBody o={o} />
      <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{NEXT_LABEL[o.status] ? `Scan → ${NEXT_LABEL[o.status]}` : ""}</span>
        <span>{age(o.created_at)} আগে</span>
      </div>
    </div>
  );
}

function OrderBody({ o, big = false }: { o: PackOrder; big?: boolean }) {
  return (
    <div className={cn(big && "mt-3")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className={cn("font-mono font-bold", big ? "text-lg" : "text-sm")}>
            {o.invoice_no ?? o.id.slice(0, 8)}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {o.customer ?? "—"}
            {o.area ? ` · ${o.area}` : ""}
          </div>
        </div>
        <StageChip status={o.status} />
      </div>
      <ul className={cn("mt-2 space-y-1.5", big && "space-y-2")}>
        {o.items.map((it, i) => (
          <li key={i} className="flex items-center gap-2.5">
            {it.image ? (
              <img
                src={it.image}
                alt=""
                className={cn(
                  "shrink-0 rounded-md border object-cover",
                  big ? "size-14" : "size-10",
                )}
                loading="lazy"
              />
            ) : (
              <div
                className={cn(
                  "grid shrink-0 place-items-center rounded-md border bg-muted",
                  big ? "size-14" : "size-10",
                )}
              >
                <Package className="size-4 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className={cn("line-clamp-2", big ? "text-sm font-medium" : "text-xs")}>
                {it.name}
              </div>
              {it.variant && (
                <div className="truncate text-[11px] text-muted-foreground">{it.variant}</div>
              )}
            </div>
            <span
              className={cn(
                "shrink-0 rounded-md bg-foreground px-2 py-0.5 font-bold tabular-nums text-background",
                big ? "text-base" : "text-xs",
              )}
            >
              ×{it.qty}
            </span>
          </li>
        ))}
      </ul>
      {o.note && (
        <p className="mt-2 rounded-md bg-amber-500/10 px-2 py-1 text-xs text-amber-800">
          📝 {o.note}
        </p>
      )}
      {big && o.last_by && (
        <p className="mt-2 text-[11px] text-muted-foreground">Last updated by {o.last_by}</p>
      )}
    </div>
  );
}
