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
  Loader2,
  Package,
  PackageCheck,
  ScanLine,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ErpPageHeader, EmptyState } from "@/components/erp/ui";
import { CameraScanner } from "@/components/erp/dispatch/camera-scanner";
import { dispatchFeedback } from "@/lib/erp/dispatch/feedback";
import { useBrand } from "@/contexts/brand-context";
import { cn } from "@/lib/utils";
import {
  NEXT_LABEL,
  PACK_STAGE,
  packLookup,
  packQueue,
  packScan,
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

const MODES: { key: PackMode; label: string; hint: string }[] = [
  { key: "auto", label: "Auto", hint: "প্রতি scan-এ পরের ধাপে" },
  { key: "pack", label: "Start packing", hint: "Confirmed → Packing" },
  { key: "packed", label: "Packed", hint: "→ Packed" },
  { key: "ready", label: "Ready to ship", hint: "Packed → Ready" },
];

type Log = { at: number; ok: boolean; msg: string; order?: PackOrder };

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

function PackingStation() {
  const qc = useQueryClient();
  const { brandIds } = useBrand();
  const [mode, setMode] = useState<PackMode>("auto");
  const [code, setCode] = useState("");
  const [camera, setCamera] = useState(false);
  const [current, setCurrent] = useState<{ ok: boolean; msg: string; order?: PackOrder } | null>(
    null,
  );
  const [choices, setChoices] = useState<PackOrder[]>([]);
  const [log, setLog] = useState<Log[]>([]);
  const [tab, setTab] = useState<"to_pack" | "packing" | "packed" | "ready">("to_pack");
  const inputRef = useRef<HTMLInputElement>(null);
  const lastRef = useRef({ code: "", at: 0 });

  const scope = brandIds.length ? brandIds : null;
  const stats = useQuery({
    queryKey: ["packing", "stats", scope],
    queryFn: () => packStats(scope),
    refetchInterval: 30_000,
  });
  const queue = useQuery({
    queryKey: ["packing", "queue", scope],
    queryFn: () => packQueue(scope),
    refetchInterval: 30_000,
  });

  const refocus = () =>
    setTimeout(() => {
      if (!camera) inputRef.current?.focus();
    }, 30);
  useEffect(() => {
    refocus();
  }, [camera]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["packing"] });
    void qc.invalidateQueries({ queryKey: ["hr", "my-status"] });
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
        msg: `Undone → ${PACK_STAGE[o.status]?.label ?? o.status}`,
        order: o,
      });
      refresh();
      refocus();
    },
    onError: (e) => {
      toast.error(errText(e));
      refocus();
    },
  });

  const handle = async (raw: string) => {
    const c = raw.trim();
    if (!c || scan.isPending) return;
    const now = Date.now();
    if (lastRef.current.code === c && now - lastRef.current.at < 2500) {
      dispatchFeedback("duplicate");
      return;
    }
    lastRef.current = { code: c, at: now };
    setCode("");
    setChoices([]);
    try {
      const found = await packLookup(c);
      if (!found.length) {
        dispatchFeedback("error");
        setCurrent({ ok: false, msg: `"${c}" — কোনো order পাওয়া যায়নি` });
        push({ ok: false, msg: `${c} — not found` });
        refocus();
        return;
      }
      const exact = found.find((o) => o.invoice_no === c || o.tracking === c || o.id === c);
      if (!exact && found.length > 1) {
        setChoices(found);
        return;
      }
      scan.mutate(exact ?? found[0]);
    } catch (e) {
      dispatchFeedback("error");
      setCurrent({ ok: false, msg: errText(e) });
    }
  };

  const lists = useMemo(() => {
    const q = queue.data ?? [];
    return {
      to_pack: q.filter((o) => o.status === "confirmed" || o.status === "ready_to_pack"),
      packing: q.filter((o) => o.status === "packaging"),
      packed: q.filter((o) => o.status === "packed"),
      ready: q.filter((o) => o.status === "ready_to_ship"),
    };
  }, [queue.data]);

  const s = stats.data;
  const lastUndoable =
    current?.ok &&
    current.order &&
    log[0]?.order?.id === current.order.id &&
    Date.now() - log[0].at < 15 * 60_000;

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 p-4 pb-24 md:p-6">
      <ErpPageHeader
        eyebrow="Fulfillment"
        live
        title="Packing Station"
        subtitle="Invoice scan করুন — order নিজে থেকে পরের ধাপে যাবে। ভুল হলে ১৫ মিনিটের মধ্যে Undo।"
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[
          { k: "to_pack", l: "To pack", v: s?.to_pack },
          { k: "packing", l: "Packing", v: s?.packing },
          { k: "packed", l: "Packed", v: s?.packed },
          { k: "ready", l: "Ready to ship", v: s?.ready },
        ].map((x) => (
          <button
            key={x.k}
            onClick={() => setTab(x.k as typeof tab)}
            className={cn(
              "rounded-xl border bg-card p-3 text-left transition-colors hover:bg-muted/40",
              tab === x.k && "border-primary",
            )}
          >
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {x.l}
            </div>
            <div className="text-2xl font-bold tabular-nums">{x.v ?? "—"}</div>
          </button>
        ))}
        <div className="col-span-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 sm:col-span-1">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
            আমি আজ
          </div>
          <div className="text-2xl font-bold tabular-nums">
            {s?.my_packed_today ?? 0}{" "}
            <span className="text-sm font-medium text-muted-foreground">packed</span>
          </div>
          <div className="text-xs text-muted-foreground">{s?.my_scans_today ?? 0} scans</div>
        </div>
      </div>

      <section className="rounded-2xl border bg-card p-4 md:p-5">
        <div className="flex flex-wrap gap-1.5">
          {MODES.map((m) => (
            <button
              key={m.key}
              onClick={() => {
                setMode(m.key);
                refocus();
              }}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                mode === m.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "hover:bg-muted",
              )}
            >
              {m.label}
            </button>
          ))}
          <span className="self-center text-xs text-muted-foreground">
            {MODES.find((m) => m.key === mode)?.hint}
          </span>
        </div>

        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void handle(code);
          }}
        >
          <div className="relative flex-1">
            <ScanLine className="absolute left-3 top-3.5 size-5 text-muted-foreground" />
            <Input
              ref={inputRef}
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onBlur={() => !camera && refocus()}
              placeholder="Scan invoice / tracking barcode…"
              className="h-12 pl-10 text-lg font-mono"
              inputMode="text"
              autoComplete="off"
            />
          </div>
          <Button type="submit" size="lg" className="h-12 px-5" disabled={scan.isPending}>
            {scan.isPending ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <ArrowRight className="size-5" />
            )}
          </Button>
          <Button
            type="button"
            size="lg"
            variant={camera ? "default" : "outline"}
            className="h-12 px-4"
            onClick={() => setCamera((v) => !v)}
          >
            {camera ? <CameraOff className="size-5" /> : <Camera className="size-5" />}
          </Button>
        </form>

        {camera && (
          <div className="mt-3 overflow-hidden rounded-xl border">
            <CameraScanner
              inline
              continuous
              open={camera}
              paused={scan.isPending}
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
                className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm hover:bg-muted/40"
              >
                <span>
                  <b className="font-mono">{o.invoice_no}</b> · {o.customer}
                </span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px]",
                    PACK_STAGE[o.status]?.cls ?? "bg-muted",
                  )}
                >
                  {PACK_STAGE[o.status]?.label ?? o.status}
                </span>
              </button>
            ))}
          </div>
        )}

        {current && (
          <div
            className={cn(
              "mt-4 rounded-xl border p-4",
              current.ok
                ? "border-emerald-500/40 bg-emerald-500/5"
                : "border-rose-500/40 bg-rose-500/5",
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div
                className={cn(
                  "flex items-center gap-2 text-base font-semibold",
                  current.ok ? "text-emerald-700" : "text-rose-700",
                )}
              >
                {current.ok ? (
                  <CheckCircle2 className="size-5" />
                ) : (
                  <AlertTriangle className="size-5" />
                )}
                {current.msg}
              </div>
              {lastUndoable && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={undo.isPending}
                  onClick={() => current.order && undo.mutate(current.order.id)}
                  className="gap-1.5"
                >
                  <Undo2 className="size-4" /> Undo
                </Button>
              )}
            </div>
            {current.order && <OrderBody o={current.order} big />}
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Package className="size-4" />
            {
              {
                to_pack: "To pack",
                packing: "Packing now",
                packed: "Packed",
                ready: "Ready to ship",
              }[tab]
            }
            <span className="text-muted-foreground">({lists[tab].length})</span>
          </div>
          {queue.isLoading ? (
            <Skeleton className="h-40" />
          ) : lists[tab].length === 0 ? (
            <div className="rounded-xl border bg-card">
              <EmptyState
                compact
                icon={<PackageCheck className="size-5" />}
                title="এখানে কোনো order নেই"
              />
            </div>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {lists[tab].map((o) => (
                <div key={o.id} className="rounded-xl border bg-card p-3">
                  <OrderBody o={o} />
                  {NEXT_LABEL[o.status] && (
                    <div className="mt-2 text-[11px] text-muted-foreground">
                      Scan → {NEXT_LABEL[o.status]}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-2">
          <div className="text-sm font-semibold">This session</div>
          <div className="rounded-xl border bg-card">
            {log.length === 0 ? (
              <EmptyState compact title="এখনো scan করা হয়নি" />
            ) : (
              <ul className="max-h-[480px] divide-y overflow-y-auto text-sm">
                {log.map((l, i) => (
                  <li key={i} className="flex items-start gap-2 px-3 py-2">
                    {l.ok ? (
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                    ) : (
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-rose-600" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{l.msg}</div>
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

function OrderBody({ o, big = false }: { o: PackOrder; big?: boolean }) {
  const stage = PACK_STAGE[o.status];
  return (
    <div className={cn(big && "mt-3")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <span className={cn("font-mono font-bold", big ? "text-lg" : "text-sm")}>
            {o.invoice_no ?? o.id.slice(0, 8)}
          </span>
          <span className="text-sm text-muted-foreground">
            {" "}
            · {o.customer ?? "—"}
            {o.area ? ` · ${o.area}` : ""}
          </span>
        </div>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[11px] font-medium",
            stage?.cls ?? "bg-muted text-muted-foreground",
          )}
        >
          {stage?.label ?? o.status}
        </span>
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
                  big ? "size-14" : "size-9",
                )}
                loading="lazy"
              />
            ) : (
              <div
                className={cn(
                  "grid shrink-0 place-items-center rounded-md border bg-muted",
                  big ? "size-14" : "size-9",
                )}
              >
                <Package className="size-4 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className={cn("truncate", big ? "text-sm font-medium" : "text-xs")}>
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
