import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Truck, Printer, BarChart3, FileText, Loader2, RefreshCw, ScanLine, LayoutGrid, Rows3,
  Volume2, VolumeX, Undo2, AlertCircle, X, RotateCw, Zap,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { ErpPageHeader } from "@/components/erp/ui/page-header";
import { BatchPrintDialog } from "@/components/erp/dispatch/batch-print-dialog";
import { DispatchSummary } from "@/components/erp/dispatch/dispatch-summary";
import { DispatchReportsDialog } from "@/components/erp/dispatch/dispatch-reports-dialog";
import { PipelineColumn } from "./pipeline-board";
import { DispatchTable } from "./dispatch-table";
import { PackerMode } from "./packer-mode";
import { ShipDialog } from "./ship-dialog";
import { isDispatchMuted, setDispatchMuted, primeAudio } from "@/lib/erp/dispatch/feedback";
import {
  bdt, isCod, stageFor, sumTotal, timeAgo,
  useDispatch, type DispatchOrder, type DispatchStage,
} from "@/hooks/erp/use-dispatch";

type PrintJob = { id: string; at: number; count: number; mode: string };

export function DispatchShell() {
  const d = useDispatch();
  const [packer, setPacker] = useState(false);
  const [view, setView] = useState<"board" | "table">("board");
  const [muted, setMuted] = useState(() => isDispatchMuted());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [shipTarget, setShipTarget] = useState<DispatchOrder | null>(null);
  const [printOpen, setPrintOpen] = useState(false);
  const [printOverride, setPrintOverride] = useState<{ orders: DispatchOrder[]; mode: "manifest" | "picking" | "invoice" | "both" } | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [printJobs, setPrintJobs] = useState<PrintJob[]>([]);

  const { pending, packed, ready, shipped, hold } = d.lists;
  const allRows = useMemo(() => [...pending, ...packed, ...ready, ...hold], [pending, packed, ready, hold]);
  const selectedRows = useMemo(() => allRows.filter((o) => selected.has(o.id)), [allRows, selected]);

  const toggleSelect = useCallback((id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }, []);
  const selectAll = useCallback((ids: string[]) => {
    setSelected((s) => {
      const n = new Set(s);
      const allIn = ids.every((i) => n.has(i));
      ids.forEach((i) => (allIn ? n.delete(i) : n.add(i)));
      return n;
    });
  }, []);

  const onAdvance = useCallback(
    async (o: DispatchOrder) => {
      primeAudio();
      const stage = stageFor(o.status);
      if (stage === "ready") {
        setShipTarget(o);
        return;
      }
      if (stage === "pending") await d.advance(o, "pack");
      else if (stage === "packed") await d.advance(o, "ready");
    },
    [d],
  );

  const bulkRun = useCallback(async () => {
    if (selectedRows.length === 0) return;
    setBulkBusy(true);
    try {
      await d.bulkAdvance(selectedRows);
      setSelected(new Set());
    } finally {
      setBulkBusy(false);
    }
  }, [d, selectedRows]);

  const codShipped = shipped.filter(isCod);

  if (packer) return <PackerMode d={d} onExit={() => setPacker(false)} />;

  return (
    <div className="space-y-4">
      <ErpPageHeader
        title="Dispatch Center"
        description="Pending → Packed → Ready to Ship → Shipped"
        icon={Truck}
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                const v = !muted;
                setMuted(v);
                setDispatchMuted(v);
              }}
              title={muted ? "Unmute" : "Mute"}
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </Button>
            <Button size="sm" variant="outline" onClick={() => d.refetch()} disabled={d.isFetching}>
              <RefreshCw className={cn("h-4 w-4 mr-1.5", d.isFetching && "animate-spin")} /> Refresh
            </Button>
            <Button size="sm" variant="outline" onClick={() => setReportsOpen(true)}>
              <FileText className="h-4 w-4 mr-1.5" /> Reports
            </Button>
            <Button size="sm" variant="outline" onClick={() => setSummaryOpen(true)}>
              <BarChart3 className="h-4 w-4 mr-1.5" /> Day end
            </Button>
            <Button size="sm" variant="outline" onClick={() => setPrintOpen(true)}>
              <Printer className="h-4 w-4 mr-1.5" /> Print
            </Button>
            <Button
              size="sm"
              onClick={() => {
                primeAudio();
                setPacker(true);
              }}
            >
              <ScanLine className="h-4 w-4 mr-1.5" /> Packer mode
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
        {([
          { k: "pending", label: "Pending", rows: pending, tone: "text-amber-600" },
          { k: "packed", label: "Packed", rows: packed, tone: "text-blue-600" },
          { k: "ready", label: "Ready to ship", rows: ready, tone: "text-violet-600" },
          { k: "shipped", label: "Shipped today", rows: shipped, tone: "text-emerald-600" },
          { k: "hold", label: "On hold", rows: hold, tone: "text-rose-600" },
        ] as { k: DispatchStage; label: string; rows: DispatchOrder[]; tone: string }[]).map((s) => (
          <Card key={s.k} className="p-3 border bg-card/60">
            <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{s.label}</div>
            <div className={cn("text-2xl font-bold tabular-nums", s.tone)}>{s.rows.length}</div>
            <div className="text-[11px] text-muted-foreground tabular-nums">{bdt(sumTotal(s.rows))}</div>
          </Card>
        ))}
      </div>

      {d.failed.length > 0 && (
        <Card className="p-3 border-rose-300 bg-rose-50/60 dark:bg-rose-950/20">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="h-4 w-4 text-rose-600" />
            <span className="text-sm font-semibold">Failed bookings ({d.failed.length})</span>
            <Button size="sm" variant="outline" className="ml-auto h-7 text-xs" onClick={() => d.retryFailed()}>
              <RotateCw className="h-3.5 w-3.5 mr-1" /> Retry all
            </Button>
          </div>
          <div className="space-y-1">
            {d.failed.map((f) => (
              <div key={f.orderId} className="flex items-center gap-2 text-xs bg-background rounded-lg px-2.5 py-1.5">
                <span className="font-mono font-semibold">#{f.invoice}</span>
                <span className="text-muted-foreground truncate flex-1">{f.error}</span>
                <span className="text-[10px] text-muted-foreground">{f.provider}</span>
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => d.dismissFailed(f.orderId)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup type="single" value={view} onValueChange={(v) => v && setView(v as "board" | "table")} size="sm">
          <ToggleGroupItem value="board" className="text-xs px-3">
            <LayoutGrid className="h-3.5 w-3.5 mr-1.5" /> Board
          </ToggleGroupItem>
          <ToggleGroupItem value="table" className="text-xs px-3">
            <Rows3 className="h-3.5 w-3.5 mr-1.5" /> Table
          </ToggleGroupItem>
        </ToggleGroup>

        {selected.size > 0 && (
          <>
            <Badge variant="secondary" className="rounded-full">{selected.size} selected</Badge>
            <Button size="sm" onClick={bulkRun} disabled={bulkBusy || d.busy}>
              {bulkBusy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Zap className="h-3.5 w-3.5 mr-1.5" />}
              Advance selected
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setPrintOverride({ orders: selectedRows, mode: "both" });
                setPrintOpen(true);
              }}
            >
              <Printer className="h-3.5 w-3.5 mr-1.5" /> Print selected
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
          </>
        )}

        {d.scanLog.some((e) => e.undoable) && (
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => d.undo()}>
            <Undo2 className="h-3.5 w-3.5 mr-1.5" /> Undo last
          </Button>
        )}
      </div>

      {view === "board" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <PipelineColumn
            title="Pending" stage="pending" rows={pending} d={d} accent="bg-amber-500"
            actionLabel="Pack" onAction={onAdvance} loading={d.isLoading}
            selected={selected} onToggleSelect={toggleSelect} onSelectAll={selectAll}
          />
          <PipelineColumn
            title="Packed" stage="packed" rows={packed} d={d} accent="bg-blue-500"
            actionLabel="Ready" onAction={onAdvance} loading={d.isLoading}
            selected={selected} onToggleSelect={toggleSelect} onSelectAll={selectAll}
          />
          <PipelineColumn
            title="Ready to ship" stage="ready" rows={ready} d={d} accent="bg-violet-500"
            actionLabel="Ship" onAction={onAdvance} loading={d.isLoading}
            selected={selected} onToggleSelect={toggleSelect} onSelectAll={selectAll}
          />
          <PipelineColumn
            title="Shipped today" stage="shipped" rows={shipped} d={d} accent="bg-emerald-500"
            loading={d.isLoading}
          />
        </div>
      ) : (
        <DispatchTable
          rows={[...pending, ...packed, ...ready, ...hold, ...shipped]}
          d={d}
          selected={selected}
          onToggleSelect={toggleSelect}
          onSelectAll={selectAll}
          onAdvance={onAdvance}
        />
      )}

      {hold.length > 0 && view === "board" && (
        <Card className="p-3 border-rose-200 bg-rose-50/40 dark:bg-rose-950/10">
          <div className="text-xs font-semibold mb-2">On hold ({hold.length})</div>
          <div className="flex flex-wrap gap-1.5">
            {hold.map((o) => (
              <button
                key={o.id}
                onClick={() => d.moveTo(o, "confirmed", "Release from hold")}
                className="text-[11px] font-mono px-2 py-1 rounded-full border bg-background hover:border-foreground"
                title="Click to release back to Pending"
              >
                #{o.invoice_no ?? o.id.slice(0, 8)}
              </button>
            ))}
          </div>
        </Card>
      )}

      {printJobs.length > 0 && (
        <Card className="p-3">
          <div className="text-xs font-semibold mb-2">Recent print jobs</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {printJobs.map((j) => (
              <div key={j.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-background text-xs">
                <span className="font-medium">{j.count} × {j.mode}</span>
                <span className="ml-auto text-muted-foreground">{timeAgo(new Date(j.at).toISOString())}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <ShipDialog open={!!shipTarget} order={shipTarget} d={d} onClose={() => setShipTarget(null)} />

      <BatchPrintDialog
        open={printOpen}
        onClose={() => {
          setPrintOpen(false);
          setPrintOverride(null);
        }}
        orders={(printOverride?.orders ?? (selectedRows.length > 0 ? selectedRows : [...pending, ...packed, ...ready])) as never}
        initialMode={printOverride?.mode}
        onPrinted={(count, mode) =>
          setPrintJobs((j) => [{ id: crypto.randomUUID(), at: Date.now(), count, mode }, ...j].slice(0, 6))
        }
      />

      <DispatchSummary open={summaryOpen} onClose={() => setSummaryOpen(false)} shippedToday={shipped} packedToday={packed} />

      <DispatchReportsDialog
        open={reportsOpen}
        onClose={() => setReportsOpen(false)}
        pending={pending}
        packed={packed}
        ready={ready}
        shipped={shipped}
        brands={d.brands as never}
        onPrintManifest={(orders) => {
          setReportsOpen(false);
          setPrintOverride({ orders: orders as DispatchOrder[], mode: "manifest" });
          setPrintOpen(true);
        }}
        onPrintPicking={(orders) => {
          setReportsOpen(false);
          setPrintOverride({ orders: orders as DispatchOrder[], mode: "picking" });
          setPrintOpen(true);
        }}
        onFinalizeHandover={async (orders) => {
          const ids = (orders as DispatchOrder[]).map((o) => o.id);
          if (ids.length === 0) return;
          if (!window.confirm(`Mark ${ids.length} parcel(s) as Shipped? This finalizes the handover.`)) return;
          const { error } = await supabase
            .from("orders")
            .update({ status: "shipped", shipped_at: new Date().toISOString() } as never)
            .in("id", ids);
          if (error) {
            toast.error(`Finalize failed: ${error.message}`);
            return;
          }
          toast.success(`${ids.length} parcel handover finalized`);
          d.refetch();
        }}
      />

      <div className="text-[11px] text-muted-foreground">
        COD shipped today: {codShipped.length} · {bdt(sumTotal(codShipped))}
      </div>
    </div>
  );
}
