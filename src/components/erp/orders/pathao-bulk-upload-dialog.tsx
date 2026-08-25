import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  X as XIcon,
  Truck,
  Search,
  RefreshCw,
  Copy,
  Check,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { pathaoBookOrderAutoFn } from "@/lib/erp/pathao.functions";
import { invoiceDisplay, type OrderRow } from "@/lib/erp/orders";

type RowStatus = "pending" | "uploading" | "success" | "failed" | "blocked" | "skipped";
type RowFilter = "all" | "errors" | RowStatus;

type Row = {
  orderId: string;
  display: string;
  status: RowStatus;
  tracking: string | null;
  message: string;
  ms: number;
};

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  orders: Pick<OrderRow, "id" | "invoice_no">[];
};

const CONCURRENCY = 3;
const ROW_HEIGHT = 40;
const VIEWPORT_H = 380;
const OVERSCAN = 6;

function normalizeBookingError(error: unknown): { status: "failed" | "blocked"; message: string } {
  const raw = error instanceof Error ? error.message : String(error || "Failed");
  if (raw.includes("[PATHAO_CUSTOMER_BLOCKED]")) {
    return {
      status: "blocked",
      message: raw.replace("[PATHAO_CUSTOMER_BLOCKED]", "").trim(),
    };
  }
  return { status: "failed", message: raw };
}

export function PathaoBulkUploadDialog({ open, onOpenChange, orders }: Props) {
  const bookFn = useServerFn(pathaoBookOrderAutoFn);
  const qc = useQueryClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [filter, setFilter] = useState<RowFilter>("all");
  const [query, setQuery] = useState("");
  const [scrollTop, setScrollTop] = useState(0);
  const [startedAt, setStartedAt] = useState<number>(0);
  const cancelRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Batched state updates — rather than setState() per row mutation, queue
  // patches and flush them once per animation frame. This keeps the UI smooth
  // when 1000 rows are updating in parallel.
  const pendingPatchesRef = useRef<Map<number, Partial<Row>>>(new Map());
  const flushScheduledRef = useRef(false);
  const scheduleFlush = () => {
    if (flushScheduledRef.current) return;
    flushScheduledRef.current = true;
    requestAnimationFrame(() => {
      flushScheduledRef.current = false;
      const patches = pendingPatchesRef.current;
      if (patches.size === 0) return;
      const entries = Array.from(patches.entries());
      patches.clear();
      setRows((prev) => {
        const next = prev.slice();
        for (const [i, patch] of entries) {
          if (next[i]) next[i] = { ...next[i], ...patch };
        }
        return next;
      });
    });
  };
  const patchRow = (i: number, patch: Partial<Row>) => {
    const prev = pendingPatchesRef.current.get(i) ?? {};
    pendingPatchesRef.current.set(i, { ...prev, ...patch });
    scheduleFlush();
  };

  const runQueue = async (indexes: number[]) => {
    let cursor = 0;
    const runOne = async (i: number) => {
      patchRow(i, { status: "uploading", message: "Uploading…" });
      const t0 = Date.now();
      try {
        const res = (await bookFn({ data: { orderId: rowsRef.current[i].orderId } })) as {
          consignment?: string | null;
          tracking?: string | null;
          skipped?: boolean;
          message?: string;
        };
        const ms = Date.now() - t0;
        const tracking = res.tracking || res.consignment || null;
        patchRow(i, {
          status: res.skipped ? "skipped" : "success",
          tracking,
          message: res.skipped ? (res.message ?? "Already booked") : "Upload successful",
          ms,
        });
      } catch (e) {
        const ms = Date.now() - t0;
        const failure = normalizeBookingError(e);
        patchRow(i, { status: failure.status, message: failure.message, ms });
      }
    };
    const worker = async () => {
      while (!cancelRef.current) {
        const k = cursor++;
        if (k >= indexes.length) break;
        await runOne(indexes[k]);
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, indexes.length) }, worker));
  };

  // Keep a live ref to rows so the worker reads fresh data without re-binding.
  const rowsRef = useRef<Row[]>([]);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  // Initialise queue + run on open
  useEffect(() => {
    if (!open) return;
    const initial: Row[] = orders.map((o) => ({
      orderId: o.id,
      display: invoiceDisplay(o),
      status: "pending",
      tracking: null,
      message: "Waiting…",
      ms: 0,
    }));
    setRows(initial);
    rowsRef.current = initial;
    setDone(false);
    setRunning(true);
    setStartedAt(Date.now());
    setFilter("all");
    setQuery("");
    setScrollTop(0);
    cancelRef.current = false;

    (async () => {
      await runQueue(initial.map((_, i) => i));
      setRunning(false);
      setDone(true);
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["courier-shipments"] });
    })();

    return () => {
      cancelRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const total = rows.length;
  const counts = useMemo(() => {
    const c = { pending: 0, uploading: 0, success: 0, failed: 0, blocked: 0, skipped: 0 };
    for (const r of rows) c[r.status]++;
    return c;
  }, [rows]);
  const completed = counts.success + counts.failed + counts.blocked + counts.skipped;
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
  const elapsedSec = running || startedAt === 0 ? (Date.now() - startedAt) / 1000 : 0;
  const rate = elapsedSec > 0 && completed > 0 ? completed / elapsedSec : 0;
  const etaSec = rate > 0 && running ? Math.max(0, (total - completed) / rate) : 0;

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (filter === "all" && !q) return rows;
    return rows.filter((r) => {
      if (filter === "errors" && r.status !== "failed" && r.status !== "blocked") return false;
      if (filter !== "all" && filter !== "errors" && r.status !== filter) return false;
      if (q && !(r.display.toLowerCase().includes(q) || (r.tracking ?? "").toLowerCase().includes(q))) return false;
      return true;
    });
  }, [rows, filter, query]);

  // Virtualization — only render rows in/near the viewport.
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const endIndex = Math.min(filteredRows.length, Math.ceil((scrollTop + VIEWPORT_H) / ROW_HEIGHT) + OVERSCAN);
  const visible = filteredRows.slice(startIndex, endIndex);

  const retryFailed = async () => {
    const idxs: number[] = [];
    rows.forEach((r, i) => {
      if (r.status === "failed") {
        idxs.push(i);
        patchRow(i, { status: "pending", message: "Queued…", ms: 0, tracking: null });
      }
    });
    if (idxs.length === 0) return;
    setRunning(true);
    setDone(false);
    setStartedAt(Date.now());
    cancelRef.current = false;
    await runQueue(idxs);
    setRunning(false);
    setDone(true);
    qc.invalidateQueries({ queryKey: ["orders"] });
    qc.invalidateQueries({ queryKey: ["courier-shipments"] });
  };

  const copyAllTracking = async () => {
    const ids = rows.filter((r) => r.tracking).map((r) => r.tracking!).join("\n");
    if (!ids) return;
    await navigator.clipboard.writeText(ids);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && running) return; // block close while running
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-3xl p-0 overflow-hidden gap-0">
        {/* HERO HEADER with gradient + ring progress */}
        <DialogHeader className="px-6 py-5 border-b bg-gradient-to-br from-emerald-500/10 via-card to-card relative">
          <div className="flex items-center gap-4">
            <RingProgress pct={pct} running={running} done={done} failed={counts.failed + counts.blocked} />
            <div className="flex-1 min-w-0">
              <DialogTitle className="flex items-center gap-2 text-base font-bold">
                <Truck className="h-4 w-4 text-emerald-600" />
                Pathao Bulk Upload
                <StatusPill done={done} running={running} failed={counts.failed + counts.blocked} />
              </DialogTitle>
              <div className="mt-1 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground tabular-nums">{completed}</span>
                <span> / {total} orders</span>
                <span className="mx-2">·</span>
                <span>{rate > 0 ? `${rate.toFixed(1)}/s` : "—"}</span>
                {running && etaSec > 0 && (
                  <>
                    <span className="mx-2">·</span>
                    <span>ETA {formatEta(etaSec)}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Stat chips */}
          <div className="mt-4 grid grid-cols-4 gap-2">
            <StatChip tone="emerald" label="Success" value={counts.success} active={filter === "success"} onClick={() => setFilter(filter === "success" ? "all" : "success")} />
            <StatChip tone="sky" label="Skipped" value={counts.skipped} active={filter === "skipped"} onClick={() => setFilter(filter === "skipped" ? "all" : "skipped")} />
            <StatChip tone="amber" label="In Queue" value={counts.pending + counts.uploading} active={filter === "pending" || filter === "uploading"} onClick={() => setFilter(filter === "pending" ? "all" : "pending")} />
            <StatChip tone="red" label={counts.blocked ? "Failed / Blocked" : "Failed"} value={counts.failed + counts.blocked} active={filter === "errors"} onClick={() => setFilter(filter === "errors" ? "all" : "errors")} />
          </div>

          {/* Animated progress bar */}
          <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                "h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-[width] duration-300",
                running && "animate-pulse",
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
        </DialogHeader>

        {/* TOOLBAR */}
        <div className="px-4 py-2.5 border-b bg-muted/30 flex items-center gap-2">
          <div className="relative flex-1 max-w-xs">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search order or tracking…"
              className="h-8 pl-8 text-xs"
            />
          </div>
          <div className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
            {filter !== "all" && (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setFilter("all")}>
                Clear filter
              </Button>
            )}
            <span className="tabular-nums">
              Showing <span className="font-semibold text-foreground">{filteredRows.length}</span>
            </span>
          </div>
        </div>

        {/* VIRTUALIZED TABLE */}
        <div className="border-b">
          <div className="grid grid-cols-[1.1fr_0.9fr_1.1fr_1.4fr_0.5fr] px-3 py-2 text-[10px] uppercase tracking-wider font-bold text-muted-foreground bg-muted/40 border-b">
            <div>Order</div>
            <div>Status</div>
            <div>Tracking</div>
            <div>Message</div>
            <div className="text-right">Time</div>
          </div>
          <div
            ref={scrollRef}
            onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
            className="overflow-y-auto bg-card"
            style={{ height: VIEWPORT_H }}
          >
            {filteredRows.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                No orders match this filter
              </div>
            ) : (
              <div style={{ height: filteredRows.length * ROW_HEIGHT, position: "relative" }}>
                <div style={{ position: "absolute", top: startIndex * ROW_HEIGHT, left: 0, right: 0 }}>
                  {visible.map((r) => (
                    <RowItem key={r.orderId} row={r} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* FAILED DETAILS — full error messages, always visible & copyable */}
        {counts.failed + counts.blocked > 0 && (
          <div className="border-b bg-red-50/60 dark:bg-red-500/5 max-h-40 overflow-y-auto">
            <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider font-bold text-red-700 dark:text-red-300 sticky top-0 bg-red-50/90 dark:bg-red-500/10 backdrop-blur border-b border-red-200/60 dark:border-red-500/20">
              Failed details ({counts.failed + counts.blocked})
            </div>
            <div className="divide-y divide-red-200/50 dark:divide-red-500/10">
              {rows.filter((r) => r.status === "failed" || r.status === "blocked").map((r) => (
                <div key={r.orderId} className="px-3 py-2 text-[11px] flex gap-3 items-start">
                  <span className="font-mono font-bold text-red-800 dark:text-red-200 shrink-0 min-w-[80px]">
                    {r.display}
                  </span>
                  <span className="text-red-700 dark:text-red-300 break-all whitespace-pre-wrap flex-1">
                    {r.message}
                  </span>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(r.message).catch(() => {})}
                    className="shrink-0 text-red-600 hover:text-red-800 dark:text-red-300"
                    title="Copy error"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* FOOTER ACTIONS */}
        <div className="px-5 py-3 bg-muted/30 flex items-center justify-between gap-2">
          <div className="text-[11px] text-muted-foreground">
            {running ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" />
                {CONCURRENCY} parallel workers
              </span>
            ) : done ? (
              <span>Finished in {((Date.now() - startedAt) / 1000).toFixed(1)}s</span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {!running && counts.failed > 0 && (
              <Button size="sm" variant="outline" onClick={retryFailed} className="h-8 gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" /> Retry {counts.failed} failed
              </Button>
            )}
            {!running && counts.success > 0 && (
              <CopyButton onClick={copyAllTracking} count={rows.filter((r) => r.tracking).length} />
            )}
            {running ? (
              <Button variant="outline" size="sm" className="h-8" onClick={() => { cancelRef.current = true; }}>
                Stop
              </Button>
            ) : (
              <Button size="sm" className="h-8" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function formatEta(s: number): string {
  if (s < 60) return `${Math.ceil(s)}s`;
  const m = Math.floor(s / 60);
  const r = Math.ceil(s % 60);
  return `${m}m ${r}s`;
}

function RingProgress({ pct, running, done, failed }: { pct: number; running: boolean; done: boolean; failed: number }) {
  const size = 56;
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  const color = done && failed > 0 ? "text-amber-500" : "text-emerald-500";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="currentColor" className="text-muted" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="currentColor"
          className={cn(color, "transition-all duration-300")}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${dash} ${c}`}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-xs font-bold tabular-nums">
        {running && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground absolute -top-0.5 right-0" />}
        {pct}%
      </div>
    </div>
  );
}

function StatChip({ tone, label, value, active, onClick }: { tone: "emerald" | "sky" | "amber" | "red"; label: string; value: number; active: boolean; onClick: () => void }) {
  const tones: Record<string, string> = {
    emerald: "border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
    sky: "border-sky-500/30 bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300",
    amber: "border-amber-500/30 bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
    red: "border-red-500/30 bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border px-2.5 py-1.5 text-left transition-all hover:scale-[1.02]",
        tones[tone],
        active && "ring-2 ring-offset-1 ring-offset-card ring-current shadow-sm",
      )}
    >
      <div className="text-[9px] uppercase tracking-wider font-bold opacity-80">{label}</div>
      <div className="text-base font-bold tabular-nums leading-tight">{value}</div>
    </button>
  );
}

function CopyButton({ onClick, count }: { onClick: () => Promise<void>; count: number }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      className="h-8 gap-1.5"
      onClick={async () => {
        await onClick();
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      Copy {count} tracking
    </Button>
  );
}

function StatusPill({ done, running, failed }: { done: boolean; running: boolean; failed: number }) {
  if (running) {
    return (
      <span className="inline-flex items-center gap-1 h-5 px-2 rounded-full bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[10px] font-bold tracking-wider">
        <Loader2 className="h-2.5 w-2.5 animate-spin" /> RUNNING
      </span>
    );
  }
  if (done && failed === 0) {
    return (
      <span className="inline-flex items-center gap-1 h-5 px-2 rounded-full bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold tracking-wider">
        <CheckCircle2 className="h-2.5 w-2.5" /> COMPLETE
      </span>
    );
  }
  if (done && failed > 0) {
    return (
      <span className="inline-flex items-center gap-1 h-5 px-2 rounded-full bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[10px] font-bold tracking-wider">
        <XCircle className="h-2.5 w-2.5" /> WITH ERRORS
      </span>
    );
  }
  return null;
}

function RowItem({ row }: { row: Row }) {
  const failed = row.status === "failed" || row.status === "blocked";
  return (
    <div
      className="grid grid-cols-[1.1fr_0.9fr_1.1fr_1.4fr_0.5fr] items-center px-3 text-xs border-b last:border-b-0 hover:bg-muted/30"
      style={{ height: ROW_HEIGHT }}
    >
      <div className="font-mono font-semibold truncate pr-2">{row.display}</div>
      <div>
        <StatusBadge status={row.status} />
      </div>
      <div className="pr-2">
        {row.tracking ? (
          <span className="inline-flex items-center h-5 px-2 rounded-full bg-emerald-500 text-white font-mono text-[10px] font-bold">
            {row.tracking}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>
      <div
        className={cn(
          "pr-2 truncate",
          failed ? "text-red-600" : "text-muted-foreground",
        )}
        title={row.message}
      >
        {row.message}
      </div>
      <div className="text-right text-muted-foreground tabular-nums">
        {row.ms > 0 ? `${(row.ms / 1000).toFixed(1)}s` : ""}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: RowStatus }) {
  const map: Record<RowStatus, { label: string; cls: string; icon?: React.ReactNode }> = {
    pending: { label: "PENDING", cls: "bg-muted text-muted-foreground" },
    uploading: {
      label: "UPLOADING",
      cls: "bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300",
      icon: <Loader2 className="h-2.5 w-2.5 animate-spin" />,
    },
    success: {
      label: "SUCCESS",
      cls: "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    },
    skipped: {
      label: "SKIPPED",
      cls: "bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300",
    },
    blocked: {
      label: "BLOCKED",
      cls: "bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300",
      icon: <XIcon className="h-2.5 w-2.5" />,
    },
    failed: {
      label: "FAILED",
      cls: "bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300",
      icon: <XIcon className="h-2.5 w-2.5" />,
    },
  };
  const m = map[status];
  return (
    <span className={cn("inline-flex items-center gap-1 h-5 px-2 rounded-full text-[10px] font-bold tracking-wider", m.cls)}>
      {m.icon}
      {m.label}
    </span>
  );
}