import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import {
  Download, RotateCcw, Repeat, Search, Plus, Inbox, X, Package, ArrowUpRight,
  Circle, Clock, CheckCircle2, AlertCircle, ArrowRight, Truck, ClipboardCheck,
  Loader2, XCircle, RefreshCcw,
} from "lucide-react";
import { useBrand } from "@/contexts/brand-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ReturnStatusBadge } from "@/components/erp/returns/return-status-badge";
import { listReturnCases, listExchangeCases, updateReturnStatus } from "@/lib/erp/returns/returns.functions";
import { NewReturnDialog } from "@/components/erp/returns/new-return-dialog";
import { NewExchangeDialog } from "@/components/erp/returns/new-exchange-dialog";
import { CaseActionButton } from "@/components/erp/returns/case-action-button";

export const Route = createFileRoute("/_authenticated/erp/returns/")({
  head: () => ({
    meta: [
      { title: "Returns & Exchanges — Synq ERP" },
      { name: "description", content: "Track return and exchange tickets end to end — courier pickup, QC, restock and refunds in one workspace." },
      { property: "og:title", content: "Returns & Exchanges — Synq ERP" },
      { property: "og:description", content: "Return and exchange pipeline with QC, restock and refund tracking." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReturnsListPage,
});

/* ---------- Flow maps (mirrors CaseActionButton) ---------- */
const RETURN_NEXT: Record<string, { next: string; label: string }> = {
  initiated: { next: "courier_picked", label: "Picked by courier" },
  courier_picked: { next: "in_transit", label: "In transit" },
  in_transit: { next: "received", label: "Received" },
  restocked: { next: "closed", label: "Close" },
  loss_recorded: { next: "closed", label: "Close" },
};
const EXCHANGE_NEXT: Record<string, { next: string; label: string }> = {
  initiated: { next: "processing", label: "Processing" },
  replacement_sent: { next: "replacement_delivered", label: "Delivered" },
  replacement_delivered: { next: "return_in_transit", label: "Return picked" },
  return_in_transit: { next: "return_received", label: "Return received" },
};

const PENDING_QC = new Set(["received", "qc_pending"]);
const TRANSIT = new Set([
  "courier_picked", "in_transit", "replacement_sent", "replacement_delivered", "return_in_transit",
]);
const DONE = new Set(["closed", "completed"]);

type Stage = "all" | "action" | "transit" | "qc" | "restocked" | "loss" | "closed";
type TypeFilter = "all" | "return" | "exchange";

type Row = {
  id: string;
  type: "return" | "exchange";
  caseNumber: string;
  orderNumber?: string | number | null;
  customer: string;
  productTitle: string;
  productSku?: string | null;
  productImage?: string | null;
  status: string;
  qc: string | null;
  amount: number;
  createdAt: string;
};

const stageOf = (r: Row): Exclude<Stage, "all"> => {
  if (DONE.has(r.status)) return "closed";
  if (r.status === "restocked") return "restocked";
  if (r.status === "loss_recorded") return "loss";
  if (PENDING_QC.has(r.status)) return "qc";
  if (TRANSIT.has(r.status)) return "transit";
  return "action";
};

const nextStepFor = (r: Row) => (r.type === "return" ? RETURN_NEXT : EXCHANGE_NEXT)[r.status];

function ReturnsListPage() {
  const { brandIds } = useBrand();
  const navigate = useNavigate();
  const qcClient = useQueryClient();
  const listRet = useServerFn(listReturnCases);
  const listExc = useServerFn(listExchangeCases);
  const bulkUpdate = useServerFn(updateReturnStatus);

  const [stage, setStage] = useState<Stage>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [newReturnOpen, setNewReturnOpen] = useState(false);
  const [newExchangeOpen, setNewExchangeOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const retQ = useQuery({
    queryKey: ["returns-list", brandIds, from, to],
    enabled: brandIds.length > 0,
    queryFn: () => listRet({ data: { brandIds, from: from || undefined, to: to || undefined } }),
  });
  const excQ = useQuery({
    queryKey: ["exchanges-list", brandIds, from, to],
    enabled: brandIds.length > 0,
    queryFn: () => listExc({ data: { brandIds, from: from || undefined, to: to || undefined } }),
  });

  const loading = retQ.isLoading || excQ.isLoading;

  const allRows = useMemo<Row[]>(() => {
    const rets: Row[] = (retQ.data ?? []).map((r: any) => ({
      id: r.id, type: "return" as const, caseNumber: r.case_number ?? r.id.slice(0, 8),
      orderNumber: r.order?.invoice_no ?? (r.order_id ? String(r.order_id).slice(0, 8) : null),
      customer: r.order?.shipping_name ?? "—",
      productTitle: r.product?.title ?? r.item?.name ?? "Item not linked",
      productSku: r.product?.sku ?? r.sku ?? null,
      productImage: r.product?.image ?? r.item?.image ?? null,
      status: r.return_status, qc: r.qc_condition,
      amount: Number(r.refund_amount ?? 0) || Number(r.item?.line_total ?? 0),
      createdAt: r.created_at,
    }));
    const excs: Row[] = (excQ.data ?? []).map((r: any) => ({
      id: r.id, type: "exchange" as const, caseNumber: r.case_number ?? r.id.slice(0, 8),
      orderNumber: r.order?.invoice_no ?? (r.original_order_id ? String(r.original_order_id).slice(0, 8) : null),
      customer: r.order?.shipping_name ?? "—",
      productTitle: r.product?.title ?? r.item?.name ?? "Item not linked",
      productSku: r.product?.sku ?? null,
      productImage: r.product?.image ?? r.item?.image ?? null,
      status: r.exchange_status, qc: null,
      amount: Number(r.exchange_charge_collected ?? r.refund_amount ?? 0),
      createdAt: r.created_at,
    }));
    return [...rets, ...excs].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [retQ.data, excQ.data]);

  const counts = useMemo(() => {
    const base = { all: allRows.length, action: 0, transit: 0, qc: 0, restocked: 0, loss: 0, closed: 0 };
    for (const r of allRows) base[stageOf(r)]++;
    return base;
  }, [allRows]);

  const typeCounts = useMemo(() => ({
    all: allRows.length,
    return: allRows.filter((r) => r.type === "return").length,
    exchange: allRows.filter((r) => r.type === "exchange").length,
  }), [allRows]);

  const rows = useMemo(() => {
    let out = allRows;
    if (typeFilter !== "all") out = out.filter((r) => r.type === typeFilter);
    if (stage !== "all") out = out.filter((r) => stageOf(r) === stage);
    if (q.trim()) {
      const needle = q.toLowerCase();
      out = out.filter((r) =>
        r.caseNumber?.toString().toLowerCase().includes(needle) ||
        r.orderNumber?.toString().toLowerCase().includes(needle) ||
        r.customer?.toLowerCase().includes(needle) ||
        r.productSku?.toLowerCase().includes(needle) ||
        r.productTitle?.toLowerCase().includes(needle),
      );
    }
    return out;
  }, [allRows, typeFilter, stage, q]);

  const totalRefunds = (retQ.data ?? []).reduce((s: number, r: any) => s + Number(r.refund_amount ?? 0), 0);
  const lastUpdated = (retQ.dataUpdatedAt && excQ.dataUpdatedAt)
    ? new Date(Math.max(retQ.dataUpdatedAt, excQ.dataUpdatedAt))
    : null;

  /* ---------- Bulk advance ---------- */
  const selectedRows = rows.filter((r) => checked.has(r.id));
  const advanceable = selectedRows.filter((r) => !!nextStepFor(r));
  const bulkMut = useMutation({
    mutationFn: async () => {
      let ok = 0;
      const fails: string[] = [];
      for (const r of advanceable) {
        const step = nextStepFor(r)!;
        try {
          await bulkUpdate({ data: { caseId: r.id, status: step.next, isExchange: r.type === "exchange" } });
          ok++;
        } catch (e: any) {
          fails.push(`${r.caseNumber}: ${e?.message ?? "failed"}`);
        }
      }
      return { ok, fails };
    },
    onSuccess: ({ ok, fails }) => {
      if (ok) toast.success(`${ok} ticket egiye gelo`);
      if (fails.length) toast.error(fails[0]!);
      setChecked(new Set());
      void qcClient.invalidateQueries({ queryKey: ["returns-list"] });
      void qcClient.invalidateQueries({ queryKey: ["exchanges-list"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleRow = (id: string) =>
    setChecked((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const allChecked = rows.length > 0 && rows.every((r) => checked.has(r.id));
  const toggleAll = () => setChecked(allChecked ? new Set() : new Set(rows.map((r) => r.id)));

  const exportCsv = () => {
    const header = ["Case#", "Type", "Order#", "Customer", "Product", "Status", "Amount", "Date"];
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push([
        r.caseNumber, r.type, r.orderNumber ?? "", `"${(r.customer ?? "").replace(/"/g, '""')}"`,
        `"${(r.productTitle ?? "").replace(/"/g, '""')}"`, r.status, r.amount,
        format(new Date(r.createdAt), "yyyy-MM-dd HH:mm"),
      ].join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `returns-${format(new Date(), "yyyyMMdd-HHmm")}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const setQuickRange = (days: number | null) => {
    if (days === null) { setFrom(""); setTo(""); return; }
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (days - 1));
    setFrom(format(start, "yyyy-MM-dd"));
    setTo(format(end, "yyyy-MM-dd"));
  };
  const activeRange = !from && !to ? "all" : "custom";

  return (
    <div className="min-h-screen bg-muted/30 text-foreground pb-24">
      {/* === Header === */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between gap-3 px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-gradient-to-br from-amber-500 to-violet-600 text-white shadow-sm">
              <RotateCcw className="h-3.5 w-3.5" />
            </div>
            <h1 className="truncate text-[15px] font-semibold tracking-tight">Returns &amp; Exchanges</h1>
            <span className="ml-1 hidden items-center gap-1 border-l border-border pl-3 text-[11px] font-medium text-muted-foreground md:inline-flex">
              <Circle className="h-1.5 w-1.5 fill-emerald-500 text-emerald-500" />
              {counts.all - counts.closed} open
              {lastUpdated && <span className="opacity-70">· {formatDistanceToNow(lastUpdated, { addSuffix: true })}</span>}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground" aria-label="Refresh"
              onClick={() => { void retQ.refetch(); void excQ.refetch(); }}>
              <RefreshCcw className={cn("h-4 w-4", (retQ.isFetching || excQ.isFetching) && "animate-spin")} />
            </Button>
            <Button variant="ghost" size="sm" onClick={exportCsv} className="h-8 w-8 p-0 text-muted-foreground" aria-label="Export CSV">
              <Download className="h-4 w-4" />
            </Button>
            <span className="mx-1 h-5 w-px bg-border" />
            <Button size="sm" variant="outline" onClick={() => setNewExchangeOpen(true)}
              className="h-8 border-violet-500/30 px-3 text-xs font-medium text-violet-600 hover:bg-violet-500/10 dark:text-violet-400">
              <Repeat className="mr-1.5 h-3.5 w-3.5" />Exchange
            </Button>
            <Button size="sm" onClick={() => setNewReturnOpen(true)} className="h-8 px-3 text-xs font-medium">
              <Plus className="mr-1 h-3.5 w-3.5" />New Return
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] space-y-4 px-4 py-5 md:px-6">
        {/* === Pipeline === */}
        <section className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          <PipelineCard label="All tickets" value={counts.all} active={stage === "all"} onClick={() => setStage("all")}
            accent="#0EA5E9" icon={<Inbox className="h-3.5 w-3.5" />}
            sub={`${typeCounts.return}R · ${typeCounts.exchange}E`} loading={loading} />
          <PipelineCard label="Needs action" value={counts.action} active={stage === "action"} onClick={() => setStage("action")}
            accent="#D97706" pulse={counts.action > 0} icon={<AlertCircle className="h-3.5 w-3.5" />} sub="Pickup baki" loading={loading} />
          <PipelineCard label="In transit" value={counts.transit} active={stage === "transit"} onClick={() => setStage("transit")}
            accent="#2563EB" icon={<Truck className="h-3.5 w-3.5" />} sub="Courier-e" loading={loading} />
          <PipelineCard label="Pending QC" value={counts.qc} active={stage === "qc"} onClick={() => setStage("qc")}
            accent="#7C3AED" pulse={counts.qc > 0} icon={<ClipboardCheck className="h-3.5 w-3.5" />} sub="Check korte hobe" loading={loading} />
          <PipelineCard label="Restocked" value={counts.restocked} active={stage === "restocked"} onClick={() => setStage("restocked")}
            accent="#059669" icon={<CheckCircle2 className="h-3.5 w-3.5" />} sub="Back in stock" loading={loading} />
          <PipelineCard label="Loss / Closed" value={counts.loss + counts.closed} active={stage === "closed"} onClick={() => setStage("closed")}
            accent="#64748B" icon={<Clock className="h-3.5 w-3.5" />}
            sub={`৳${totalRefunds.toLocaleString("en-IN")} refunded`} loading={loading} />
        </section>

        {/* === Filter bar === */}
        <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-card p-2.5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-0.5 rounded-lg bg-muted/60 p-0.5">
              <SegBtn active={typeFilter === "all"} onClick={() => setTypeFilter("all")} label="All" count={typeCounts.all} />
              <SegBtn active={typeFilter === "return"} onClick={() => setTypeFilter("return")} label="Returns" count={typeCounts.return} dot="#D97706" />
              <SegBtn active={typeFilter === "exchange"} onClick={() => setTypeFilter("exchange")} label="Exchanges" count={typeCounts.exchange} dot="#7C3AED" />
            </div>
            {stage !== "all" && (
              <button onClick={() => setStage("all")}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground">
                Stage: {stage} <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 lg:flex-none">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input className="h-8 w-full pl-8 text-xs lg:w-[260px]"
                placeholder="Case, order, customer, SKU…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="inline-flex items-center gap-0.5 rounded-lg bg-muted/60 p-0.5">
              <RangeBtn active={activeRange === "all"} onClick={() => setQuickRange(null)} label="All time" />
              <RangeBtn active={false} onClick={() => setQuickRange(7)} label="7d" />
              <RangeBtn active={false} onClick={() => setQuickRange(30)} label="30d" />
            </div>
            <Input type="date" className="h-8 w-[132px] text-xs" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
            <Input type="date" className="h-8 w-[132px] text-xs" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
          </div>
        </div>

        {/* === List + preview === */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <div className={cn(selectedId ? "lg:col-span-3" : "lg:col-span-5")}>
            <div className="mb-2 flex items-center justify-between px-1">
              <label className="flex cursor-pointer items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                <Checkbox checked={allChecked} onCheckedChange={toggleAll} aria-label="Select all" />
                {rows.length} {rows.length === 1 ? "ticket" : "tickets"}
              </label>
              <span className="text-[10.5px] font-medium text-muted-foreground">Newest first</span>
            </div>

            {loading ? (
              <ul className="space-y-1.5">
                {Array.from({ length: 6 }).map((_, i) => (
                  <li key={i} className="rounded-lg border border-border bg-card p-3">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-11 w-11 rounded-md" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-3 w-1/3" />
                        <Skeleton className="h-3 w-1/4" />
                      </div>
                      <Skeleton className="h-8 w-28 rounded-md" />
                    </div>
                  </li>
                ))}
              </ul>
            ) : rows.length === 0 ? (
              <div className="rounded-xl border border-border bg-card">
                <EmptyState onNew={() => setNewReturnOpen(true)} filtered={counts.all > 0} onReset={() => { setStage("all"); setTypeFilter("all"); setQ(""); setQuickRange(null); }} />
              </div>
            ) : (
              <ul className="-mr-1 max-h-[calc(100vh-320px)] space-y-1.5 overflow-y-auto pr-1">
                {rows.map((r) => (
                  <CaseRow key={r.id} r={r} selected={selectedId === r.id}
                    checked={checked.has(r.id)} onCheck={() => toggleRow(r.id)}
                    onOpen={() => {
                      if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
                        navigate({ to: "/erp/returns/$caseId", params: { caseId: r.id } });
                      } else {
                        setSelectedId((prev) => (prev === r.id ? null : r.id));
                      }
                    }} />
                ))}
              </ul>
            )}
          </div>

          {selectedId && (
            <div className="hidden lg:col-span-2 lg:block">
              <PreviewPane
                caseId={selectedId}
                row={rows.find((r) => r.id === selectedId)}
                onClose={() => setSelectedId(null)}
                onOpenFull={() => navigate({ to: "/erp/returns/$caseId", params: { caseId: selectedId } })}
              />
            </div>
          )}
        </div>

        <NewReturnDialog open={newReturnOpen} onOpenChange={setNewReturnOpen} />
        <NewExchangeDialog open={newExchangeOpen} onOpenChange={setNewExchangeOpen} />
      </div>

      {/* === Bulk bar === */}
      {checked.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-50 w-full max-w-[min(96vw,720px)] -translate-x-1/2 px-3">
          <div className="flex flex-wrap items-center justify-center gap-1.5 rounded-2xl border border-border bg-card/95 px-3 py-2 shadow-2xl shadow-black/25 backdrop-blur">
            <span className="inline-flex items-center gap-1.5 pl-1 pr-2 text-xs font-semibold">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span className="tabular-nums">{checked.size}</span> selected
            </span>
            <span className="mx-0.5 h-5 w-px bg-border" />
            <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={advanceable.length === 0 || bulkMut.isPending}
              onClick={() => bulkMut.mutate()}>
              {bulkMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
              Advance {advanceable.length > 0 ? `(${advanceable.length})` : ""}
            </Button>
            {advanceable.length < checked.size && (
              <span className="text-[11px] text-muted-foreground">
                {checked.size - advanceable.length} ticket QC/manual step chay
              </span>
            )}
            <span className="mx-0.5 h-5 w-px bg-border" />
            <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs text-muted-foreground" onClick={() => setChecked(new Set())}>
              <X className="h-3.5 w-3.5" /> Clear
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Sub-components ---------- */

function PipelineCard({ label, value, sub, onClick, active, accent, pulse, icon, loading }: {
  label: string; value: React.ReactNode; sub?: string; onClick: () => void;
  active?: boolean; accent: string; pulse?: boolean; icon?: React.ReactNode; loading?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative rounded-xl border bg-card px-3.5 py-3 text-left transition-all hover:shadow-sm",
        active ? "border-foreground/70 shadow-sm" : "border-border hover:border-foreground/25",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md"
            style={{ background: `color-mix(in oklab, ${accent} 14%, transparent)`, color: accent }}>
            {icon}
          </span>
          <span className="truncate text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</span>
        </div>
        {pulse && (
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inset-0 animate-ping rounded-full opacity-60" style={{ background: accent }} />
            <span className="relative h-2 w-2 rounded-full" style={{ background: accent }} />
          </span>
        )}
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-6 w-12" />
      ) : (
        <div className="mt-2 text-[24px] font-semibold leading-none tracking-tight tabular-nums"
          style={active ? { color: accent } : undefined}>
          {value}
        </div>
      )}
      {sub && <div className="mt-1.5 truncate text-[10.5px] font-medium text-muted-foreground">{sub}</div>}
    </button>
  );
}

function SegBtn({ active, onClick, label, count, dot }: {
  active: boolean; onClick: () => void; label: string; count: number; dot?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors",
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} />}
      {label}
      <span className={cn(
        "rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
        active ? "bg-muted text-foreground" : "bg-muted/70 text-muted-foreground",
      )}>{count}</span>
    </button>
  );
}

function RangeBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className={cn(
      "rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors",
      active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
    )}>{label}</button>
  );
}

function initials(name: string) {
  return (name || "—").split(/\s+/).filter(Boolean).slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "").join("") || "—";
}

function CaseRow({ r, onOpen, selected, checked, onCheck }: {
  r: Row; onOpen: () => void; selected?: boolean; checked: boolean; onCheck: () => void;
}) {
  const isReturn = r.type === "return";
  const rail = isReturn ? "#D97706" : "#7C3AED";
  return (
    <li
      onClick={onOpen}
      className={cn(
        "group relative flex cursor-pointer items-stretch overflow-hidden rounded-lg border bg-card transition-all",
        selected ? "border-foreground/70 shadow-md" : "border-border hover:border-foreground/25 hover:shadow-sm",
      )}
    >
      <span className="w-1 shrink-0" style={{ background: rail }} aria-hidden />

      <div className="grid min-w-0 flex-1 grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 md:gap-4">
        <span onClick={(e) => e.stopPropagation()} className="flex items-center">
          <Checkbox checked={checked} onCheckedChange={onCheck} aria-label={`Select ${r.caseNumber}`} />
        </span>

        <div className="relative shrink-0">
          {r.productImage ? (
            <img src={r.productImage} alt="" loading="lazy"
              className="h-11 w-11 rounded-md object-cover ring-1 ring-border" />
          ) : (
            <div className="grid h-11 w-11 place-items-center rounded-md bg-muted text-muted-foreground ring-1 ring-border">
              <Package className="h-4 w-4" />
            </div>
          )}
        </div>

        <div className="grid min-w-0 grid-cols-1 items-center gap-1.5 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] md:gap-4">
          <div className="min-w-0">
            <div className="mb-0.5 flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded px-1.5 py-px font-mono text-[9.5px] font-semibold uppercase tracking-wider"
                style={{ background: `color-mix(in oklab, ${rail} 12%, transparent)`, color: rail }}>
                {isReturn ? <RotateCcw className="h-2.5 w-2.5" /> : <Repeat className="h-2.5 w-2.5" />}
                {r.caseNumber}
              </span>
              {r.orderNumber && <span className="hidden font-mono text-[10px] text-muted-foreground md:inline">#{r.orderNumber}</span>}
            </div>
            <div className="truncate text-[13px] font-medium leading-snug">{r.productTitle}</div>
            <div className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
              <span className="inline-grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full bg-muted text-[8px] font-semibold">
                {initials(r.customer)}
              </span>
              <span className="truncate">{r.customer || "Unknown"}</span>
            </div>
          </div>

          <div className="flex min-w-0 items-center gap-2">
            <ReturnStatusBadge status={r.status} />
            <span className="hidden truncate text-[10.5px] font-medium text-muted-foreground lg:inline">
              {format(new Date(r.createdAt), "dd MMM")}
            </span>
          </div>

          <div className="hidden text-right tabular-nums md:block">
            {r.amount > 0 ? (
              <div className="text-[14px] font-semibold leading-none">৳{r.amount.toLocaleString("en-IN")}</div>
            ) : (
              <span className="text-xs text-muted-foreground/50">—</span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <div className="hidden sm:block">
            <CaseActionButton caseId={r.id} type={r.type} status={r.status} compact />
          </div>
          <Link to="/erp/returns/$caseId" params={{ caseId: r.id }}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Open case">
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </li>
  );
}

function EmptyState({ onNew, filtered, onReset }: { onNew: () => void; filtered?: boolean; onReset: () => void }) {
  return (
    <div className="px-6 py-20 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-muted text-muted-foreground">
        <Inbox className="h-5 w-5" />
      </div>
      <h3 className="mt-4 text-sm font-semibold">{filtered ? "Ei filter-e kono ticket nei" : "No tickets yet"}</h3>
      <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
        {filtered ? "Filter reset koro, ba onno stage dekho." : "Returns and exchanges from orders will appear here as tickets."}
      </p>
      {filtered ? (
        <Button size="sm" variant="outline" onClick={onReset} className="mt-4 h-8 text-xs">
          <XCircle className="mr-1 h-3.5 w-3.5" />Reset filters
        </Button>
      ) : (
        <Button size="sm" onClick={onNew} className="mt-4 h-8 text-xs">
          <Plus className="mr-1 h-3.5 w-3.5" />New Return
        </Button>
      )}
    </div>
  );
}

function PreviewPane({ caseId, row, onClose, onOpenFull }: {
  caseId: string; row?: Row; onClose: () => void; onOpenFull: () => void;
}) {
  if (!row) return null;
  const isReturn = row.type === "return";
  const rail = isReturn ? "#D97706" : "#7C3AED";
  return (
    <aside className="sticky top-[72px] overflow-hidden rounded-xl border border-border bg-card shadow-lg">
      <header className="relative px-5 pb-5 pt-4"
        style={{ background: `color-mix(in oklab, ${rail} 8%, transparent)` }}>
        <span className="absolute inset-x-0 top-0 h-[2px]" style={{ background: rail }} />
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 rounded border border-border bg-background px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider"
            style={{ color: rail }}>
            {isReturn ? <RotateCcw className="h-3 w-3" /> : <Repeat className="h-3 w-3" />}
            {isReturn ? "Return" : "Exchange"} · {row.caseNumber}
          </span>
          <button onClick={onClose} className="-m-1 p-1 text-muted-foreground hover:text-foreground" aria-label="Close preview">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 flex items-end justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {isReturn ? "Refund amount" : "Exchange charge"}
            </div>
            <div className="mt-1 text-[34px] font-semibold leading-none tracking-tight tabular-nums">
              {row.amount > 0 ? <>৳{row.amount.toLocaleString("en-IN")}</> : <span className="text-muted-foreground/40">—</span>}
            </div>
          </div>
          <ReturnStatusBadge status={row.status} />
        </div>
      </header>

      <div className="space-y-4 p-5 text-xs">
        <div className="flex items-start gap-3">
          {row.productImage ? (
            <img src={row.productImage} alt="" className="h-14 w-14 rounded-md object-cover ring-1 ring-border" />
          ) : (
            <div className="grid h-14 w-14 place-items-center rounded-md bg-muted ring-1 ring-border">
              <Package className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium leading-snug">{row.productTitle}</div>
            {row.productSku && <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">{row.productSku}</div>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-3">
          <PreviewRow label="Customer" value={row.customer || "—"} />
          <PreviewRow label="Order" value={row.orderNumber ? <span className="font-mono">#{row.orderNumber}</span> : "—"} />
          <PreviewRow label="Created" value={format(new Date(row.createdAt), "dd MMM yyyy")} />
          <PreviewRow label="Time" value={format(new Date(row.createdAt), "hh:mm a")} />
          {row.qc && <PreviewRow label="QC result" value={row.qc} />}
        </div>

        <div className="space-y-2 border-t border-border pt-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Next action</div>
          <div className="flex items-center gap-2">
            <div className="flex-1"><CaseActionButton caseId={caseId} type={row.type} status={row.status} /></div>
            <Button onClick={onOpenFull} size="sm" variant="outline" className="h-8 text-xs">
              Open <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>
    </aside>
  );
}

function PreviewRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-[12px] font-medium">{value}</div>
    </div>
  );
}
