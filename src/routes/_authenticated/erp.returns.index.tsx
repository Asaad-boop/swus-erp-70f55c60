import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format, formatDistanceToNow } from "date-fns";
import {
  Download, RotateCcw, Repeat, Search, Plus,
  Inbox, X, Package, ArrowUpRight, Filter, Circle, Clock,
  CheckCircle2, AlertCircle, ArrowRight,
} from "lucide-react";
import { useBrand } from "@/contexts/brand-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ReturnStatusBadge } from "@/components/erp/returns/return-status-badge";
import { listReturnCases, listExchangeCases } from "@/lib/erp/returns/returns.functions";
import { NewReturnDialog } from "@/components/erp/returns/new-return-dialog";
import { NewExchangeDialog } from "@/components/erp/returns/new-exchange-dialog";
import { CaseActionButton } from "@/components/erp/returns/case-action-button";

export const Route = createFileRoute("/_authenticated/erp/returns/")({
  head: () => ({ meta: [{ title: "Returns & Exchanges — ERP" }] }),
  component: ReturnsListPage,
});

/* ---------- Theme tokens (Returns = Amber, Exchanges = Violet) ---------- */
const RETURN = {
  base: "#D97706",        // amber-600
  soft: "#FEF3C7",        // amber-100
  softer: "#FFFBEB",      // amber-50
  ink: "#78350F",         // amber-900
  ring: "rgba(217,119,6,0.22)",
};
const EXCHANGE = {
  base: "#7C3AED",        // violet-600
  soft: "#EDE9FE",        // violet-100
  softer: "#F5F3FF",      // violet-50
  ink: "#4C1D95",         // violet-900
  ring: "rgba(124,58,237,0.22)",
};
const theme = (t: "return" | "exchange") => (t === "return" ? RETURN : EXCHANGE);

type Tab = "all" | "returns" | "exchanges" | "pending_qc" | "restocked" | "closed";

/** Returns waiting on warehouse QC action (received = just arrived, qc_pending = QC started). */
const PENDING_QC = new Set(["received", "qc_pending"]);

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

function ReturnsListPage() {
  const { brandIds } = useBrand();
  const navigate = useNavigate();
  const listRet = useServerFn(listReturnCases);
  const listExc = useServerFn(listExchangeCases);
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [newReturnOpen, setNewReturnOpen] = useState(false);
  const [newExchangeOpen, setNewExchangeOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  const rows = useMemo(() => {
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
    let all: Row[] = [...rets, ...excs];
    if (tab === "returns") all = rets;
    else if (tab === "exchanges") all = excs;
    else if (tab === "pending_qc") all = rets.filter((r) => PENDING_QC.has(r.status));
    else if (tab === "restocked") all = rets.filter((r) => r.status === "restocked");
    else if (tab === "closed") all = all.filter((r) => r.status === "closed" || r.status === "completed");
    if (q.trim()) {
      const needle = q.toLowerCase();
      all = all.filter((r) =>
        r.caseNumber?.toString().toLowerCase().includes(needle) ||
        r.orderNumber?.toString().toLowerCase().includes(needle) ||
        r.customer?.toLowerCase().includes(needle) ||
        r.productSku?.toLowerCase().includes(needle) ||
        r.productTitle?.toLowerCase().includes(needle),
      );
    }
    return all.sort((a: Row, b: Row) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [retQ.data, excQ.data, tab, q]);

  const counts = {
    all: (retQ.data?.length ?? 0) + (excQ.data?.length ?? 0),
    returns: retQ.data?.length ?? 0,
    exchanges: excQ.data?.length ?? 0,
    pending_qc: (retQ.data ?? []).filter((r: any) => PENDING_QC.has(r.return_status)).length,
    restocked: (retQ.data ?? []).filter((r: any) => r.return_status === "restocked").length,
    closed: (retQ.data ?? []).filter((r: any) => r.return_status === "closed").length
      + (excQ.data ?? []).filter((r: any) => r.exchange_status === "completed" || r.exchange_status === "closed").length,
  };

  const totalRefunds = (retQ.data ?? []).reduce((s: number, r: any) => s + Number(r.refund_amount ?? 0), 0);
  const lastUpdated = (retQ.dataUpdatedAt && excQ.dataUpdatedAt)
    ? new Date(Math.max(retQ.dataUpdatedAt, excQ.dataUpdatedAt))
    : null;

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

  return (
    <div className="min-h-screen bg-[#FAFAF9] dark:bg-background text-zinc-900 dark:text-foreground">
      {/* === Header === */}
      <header className="sticky top-0 z-30 bg-white/85 dark:bg-card/70 backdrop-blur-md border-b border-zinc-200/80 dark:border-border">
        <div className="max-w-[1600px] mx-auto px-4 md:px-6 h-14 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-md bg-gradient-to-br from-amber-500 to-violet-600 grid place-items-center text-white shadow-sm">
                <RotateCcw className="h-3.5 w-3.5" />
              </div>
              <h1 className="text-[15px] font-semibold tracking-tight truncate">Returns & Exchanges</h1>
            </div>
            <span className="hidden md:inline-flex items-center gap-1 text-[11px] text-zinc-500 font-medium pl-3 ml-1 border-l border-zinc-200">
              <Circle className="h-1.5 w-1.5 fill-emerald-500 text-emerald-500" />
              {counts.all} active
              {lastUpdated && <span className="text-zinc-400">· {formatDistanceToNow(lastUpdated, { addSuffix: true })}</span>}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button variant="ghost" size="sm" onClick={exportCsv}
              className="text-zinc-600 hover:bg-zinc-100 h-8 w-8 p-0" aria-label="Export">
              <Download className="h-4 w-4" />
            </Button>
            <div className="h-5 w-px bg-zinc-200 mx-1" />
            <Button size="sm" onClick={() => setNewExchangeOpen(true)}
              className="bg-white border border-violet-200 text-violet-700 hover:bg-violet-50 shadow-none h-8 px-3 text-xs font-medium">
              <Repeat className="h-3.5 w-3.5 mr-1.5" />Exchange
            </Button>
            <Button size="sm" onClick={() => setNewReturnOpen(true)}
              className="bg-zinc-900 hover:bg-zinc-800 text-white h-8 px-3 text-xs font-medium shadow-sm">
              <Plus className="h-3.5 w-3.5 mr-1" />New Return
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto px-4 md:px-6 py-5 space-y-4">
        {/* === Status pipeline (Linear-style) === */}
        <section className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <PipelineCard label="All" value={counts.all} active={tab === "all"}
            onClick={() => setTab("all")} accent="#18181B" icon={<Inbox className="h-3.5 w-3.5" />}
            sub={`${counts.returns}R · ${counts.exchanges}E`} />
          <PipelineCard label="Pending QC" value={counts.pending_qc} active={tab === "pending_qc"}
            onClick={() => setTab("pending_qc")} accent="#D97706" pulse={counts.pending_qc > 0}
            icon={<AlertCircle className="h-3.5 w-3.5" />} sub="Needs action" />
          <PipelineCard label="Restocked" value={counts.restocked} active={tab === "restocked"}
            onClick={() => setTab("restocked")} accent="#059669"
            icon={<CheckCircle2 className="h-3.5 w-3.5" />} sub="Back in stock" />
          <PipelineCard label="Closed" value={counts.closed} active={tab === "closed"}
            onClick={() => setTab("closed")} accent="#52525B"
            icon={<Clock className="h-3.5 w-3.5" />} sub="Resolved" />
          <PipelineCard label="Refunds (view)" value={`৳${totalRefunds.toLocaleString("en-IN")}`}
            onClick={() => {}} accent="#E11D48" mono sub="Total impact" />
        </section>

        {/* === Filter bar === */}
        <div className="flex flex-col gap-2.5 md:flex-row md:items-center md:justify-between">
          <div className="inline-flex items-center gap-0.5 rounded-lg bg-white border border-zinc-200 p-0.5 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
            <SegBtn active={tab === "all"} onClick={() => setTab("all")} label="All" count={counts.all} />
            <SegBtn active={tab === "returns"} onClick={() => setTab("returns")} label="Returns" count={counts.returns}
              dot={RETURN.base} />
            <SegBtn active={tab === "exchanges"} onClick={() => setTab("exchanges")} label="Exchanges" count={counts.exchanges}
              dot={EXCHANGE.base} />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 md:flex-none">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
              <Input className="pl-8 h-8 w-full md:w-[280px] text-xs bg-white border-zinc-200 rounded-md focus-visible:ring-1 focus-visible:ring-zinc-400"
                placeholder="Search case, order, customer, product…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Input type="date" className="h-8 w-[130px] text-xs rounded-md border-zinc-200" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
            <Input type="date" className="h-8 w-[130px] text-xs rounded-md border-zinc-200" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
          </div>
        </div>

        {/* === Ticket list + Preview === */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className={cn(selectedId ? "lg:col-span-3" : "lg:col-span-5")}>
            <div className="flex items-center justify-between px-1 mb-2">
              <span className="text-[10.5px] uppercase tracking-[0.14em] text-zinc-500 font-semibold">
                {rows.length} {rows.length === 1 ? "ticket" : "tickets"}
              </span>
              <span className="text-[10.5px] text-zinc-400 hidden md:flex items-center gap-1 font-medium">
                <Filter className="h-3 w-3" /> Newest first
              </span>
            </div>
            {(retQ.isLoading || excQ.isLoading) ? (
              <div className="py-24 text-center text-sm text-zinc-500 bg-white rounded-xl border border-zinc-200">Loading tickets…</div>
            ) : rows.length === 0 ? (
              <div className="bg-white rounded-xl border border-zinc-200">
                <EmptyState onNew={() => setNewReturnOpen(true)} />
              </div>
            ) : (
              <ul className="space-y-1.5 max-h-[calc(100vh-340px)] overflow-y-auto pr-1 -mr-1">
                {rows.map((r, i) => (
                  <CaseRow key={r.id} r={r} index={i} selected={selectedId === r.id}
                    onOpen={() => {
                      // Preview pane only exists on lg+; on smaller screens open the full case.
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
            <div className="hidden lg:block lg:col-span-2">
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
    </div>
  );
}

/* ---------- Sub-components ---------- */

function PipelineCard({ label, value, sub, onClick, active, accent, pulse, mono, icon }: {
  label: string; value: React.ReactNode; sub?: string; onClick: () => void;
  active?: boolean; accent: string; pulse?: boolean; mono?: boolean; icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative text-left rounded-xl bg-white dark:bg-card border px-3.5 py-3 transition-all",
        "hover:border-zinc-300 hover:shadow-[0_2px_8px_-4px_rgba(0,0,0,0.08)]",
        active ? "border-zinc-900 dark:border-foreground shadow-[0_2px_8px_-4px_rgba(0,0,0,0.08)]"
               : "border-zinc-200 dark:border-border",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="grid place-items-center h-5 w-5 rounded-md shrink-0"
            style={{ background: `${accent}14`, color: accent }}>
            {icon}
          </span>
          <span className="text-[10.5px] uppercase tracking-[0.1em] text-zinc-500 font-semibold truncate">{label}</span>
        </div>
        {pulse && (
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inset-0 rounded-full animate-ping opacity-60" style={{ background: accent }} />
            <span className="relative h-2 w-2 rounded-full" style={{ background: accent }} />
          </span>
        )}
      </div>
      <div className={cn(
        "mt-2 text-[24px] leading-none tracking-tight tabular-nums font-semibold text-zinc-900",
        mono && "text-zinc-900",
      )} style={active && !mono ? { color: accent } : undefined}>
        {value}
      </div>
      {sub && <div className="mt-1.5 text-[10.5px] text-zinc-500 truncate font-medium">{sub}</div>}
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
        "relative inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors whitespace-nowrap",
        active ? "bg-zinc-100 text-zinc-900" : "text-zinc-600 hover:text-zinc-900",
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} />}
      {label}
      <span className={cn(
        "tabular-nums text-[10px] px-1.5 py-0.5 rounded font-semibold",
        active ? "bg-white text-zinc-700 ring-1 ring-zinc-200" : "bg-zinc-100 text-zinc-500",
      )}>{count}</span>
    </button>
  );
}

function initials(name: string) {
  return (name || "—")
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "").join("") || "—";
}

function CaseRow({ r, index, onOpen, selected }: { r: Row; index: number; onOpen: () => void; selected?: boolean }) {
  const isReturn = r.type === "return";
  const t = theme(r.type);
  return (
    <li
      onClick={onOpen}
      style={{ animationDelay: `${Math.min(index, 10) * 25}ms` }}
      className={cn(
        "group relative flex items-stretch gap-0 cursor-pointer animate-fade-in rounded-lg overflow-hidden",
        "bg-white dark:bg-card border transition-all",
        selected
          ? "border-zinc-900 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.12)]"
          : "border-zinc-200/80 hover:border-zinc-300 hover:shadow-[0_1px_3px_rgba(0,0,0,0.04)]",
      )}
    >
      {/* Type rail */}
      <span className="w-1 shrink-0" style={{ background: t.base }} aria-hidden />

      <div className="flex-1 min-w-0 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 md:gap-4 px-3 py-2.5">
        {/* Thumb */}
        <div className="relative shrink-0">
          {r.productImage ? (
            <img src={r.productImage} alt=""
              className="h-11 w-11 rounded-md object-cover ring-1 ring-zinc-200 bg-zinc-50" />
          ) : (
            <div className="h-11 w-11 rounded-md grid place-items-center bg-zinc-50 text-zinc-400 ring-1 ring-zinc-200">
              <Package className="h-4 w-4" />
            </div>
          )}
        </div>

        {/* Main */}
        <div className="min-w-0 grid grid-cols-1 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] items-center gap-1.5 md:gap-4">
          <div className="min-w-0">
            {/* Ticket ID strip */}
            <div className="flex items-center gap-1.5 mb-0.5">
              <span
                className="inline-flex items-center gap-1 px-1.5 py-px rounded text-[9.5px] font-mono font-semibold uppercase tracking-wider"
                style={{ background: t.softer, color: t.ink, border: `1px solid ${t.soft}` }}
              >
                {isReturn ? <RotateCcw className="h-2.5 w-2.5" /> : <Repeat className="h-2.5 w-2.5" />}
                {r.caseNumber}
              </span>
              {r.orderNumber && (
                <span className="text-[10px] font-mono text-zinc-400 hidden md:inline">#{r.orderNumber}</span>
              )}
            </div>
            <div className="text-[13px] font-medium truncate text-zinc-900 dark:text-foreground leading-snug">
              {r.productTitle}
            </div>
            <div className="text-[11px] text-zinc-500 truncate mt-0.5 flex items-center gap-1.5">
              <span className="inline-grid h-3.5 w-3.5 place-items-center rounded-full bg-zinc-100 text-[8px] font-semibold text-zinc-600 shrink-0">
                {initials(r.customer)}
              </span>
              <span className="truncate">{r.customer || "Unknown"}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 min-w-0">
            <ReturnStatusBadge status={r.status} />
            <span className="text-[10.5px] text-zinc-400 hidden lg:inline truncate font-medium">
              {format(new Date(r.createdAt), "dd MMM")}
            </span>
          </div>

          <div className="text-right tabular-nums hidden md:block">
            {r.amount > 0 ? (
              <div className="text-[14px] leading-none font-semibold text-zinc-900">
                ৳{r.amount.toLocaleString("en-IN")}
              </div>
            ) : (
              <span className="text-zinc-300 text-xs">—</span>
            )}
          </div>
        </div>

        {/* Action — most prominent */}
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          <div className="hidden sm:block">
            <CaseActionButton caseId={r.id} type={r.type} status={r.status} compact />
          </div>
          <Link to="/erp/returns/$caseId" params={{ caseId: r.id }}
            className="text-zinc-400 hover:text-zinc-900 p-1.5 rounded-md hover:bg-zinc-100 transition-colors"
            aria-label="Open">
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </li>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="py-20 px-6 text-center">
      <div className="mx-auto h-12 w-12 rounded-xl bg-zinc-100 grid place-items-center text-zinc-500">
        <Inbox className="h-5 w-5" />
      </div>
      <h3 className="mt-4 text-sm font-semibold text-zinc-900">No tickets yet</h3>
      <p className="mt-1 text-xs text-zinc-500 max-w-sm mx-auto">
        Returns and exchanges from orders will appear here as tickets.
      </p>
      <Button size="sm" onClick={onNew} className="mt-4 bg-zinc-900 hover:bg-zinc-800 text-white text-xs h-8">
        <Plus className="h-3.5 w-3.5 mr-1" />New Return
      </Button>
    </div>
  );
}

function PreviewPane({ caseId, row, onClose, onOpenFull }: {
  caseId: string; row?: Row; onClose: () => void; onOpenFull: () => void;
}) {
  if (!row) return null;
  const isReturn = row.type === "return";
  const t = theme(row.type);
  return (
    <aside className="sticky top-[72px] rounded-xl overflow-hidden bg-white dark:bg-card border border-zinc-200 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-12px_rgba(0,0,0,0.12)] animate-fade-in">
      {/* Header band */}
      <header className="relative px-5 pt-4 pb-5" style={{ background: t.softer }}>
        <span className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: t.base }} />
        <div className="flex items-center justify-between">
          <span
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-bold font-mono"
            style={{ background: "white", color: t.ink, border: `1px solid ${t.soft}` }}
          >
            {isReturn ? <RotateCcw className="h-3 w-3" /> : <Repeat className="h-3 w-3" />}
            {isReturn ? "Return" : "Exchange"} · {row.caseNumber}
          </span>
          <button onClick={onClose} className="p-1 -m-1 text-zinc-400 hover:text-zinc-700" aria-label="Close preview">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 flex items-end justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-600 font-semibold">
              {isReturn ? "Refund amount" : "Exchange charge"}
            </div>
            <div className="mt-1 text-[34px] leading-none tracking-tight font-semibold tabular-nums" style={{ color: t.ink }}>
              {row.amount > 0 ? <>৳{row.amount.toLocaleString("en-IN")}</> : <span className="text-zinc-300">—</span>}
            </div>
          </div>
          <ReturnStatusBadge status={row.status} />
        </div>
      </header>

      <div className="p-5 space-y-4 text-xs">
        <div className="flex items-start gap-3">
          {row.productImage ? (
            <img src={row.productImage} alt="" className="h-14 w-14 rounded-md object-cover ring-1 ring-zinc-200" />
          ) : (
            <div className="h-14 w-14 rounded-md bg-zinc-50 ring-1 ring-zinc-200 grid place-items-center">
              <Package className="h-5 w-5 text-zinc-400" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium text-zinc-900 leading-snug">{row.productTitle}</div>
            {row.productSku && <div className="text-[10px] font-mono text-zinc-500 mt-0.5">{row.productSku}</div>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-3 pt-3 border-t border-zinc-100">
          <PreviewRow label="Customer" value={row.customer || "—"} />
          <PreviewRow label="Order" value={row.orderNumber ? <span className="font-mono">#{row.orderNumber}</span> : "—"} />
          <PreviewRow label="Created" value={format(new Date(row.createdAt), "dd MMM yyyy")} />
          <PreviewRow label="Time" value={format(new Date(row.createdAt), "hh:mm a")} />
        </div>

        {/* Prominent action area */}
        <div className="pt-4 border-t border-zinc-100 space-y-2">
          <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-500 font-semibold">Next action</div>
          <div className="flex items-center gap-2">
            <div className="flex-1"><CaseActionButton caseId={caseId} type={row.type} status={row.status} /></div>
            <Button onClick={onOpenFull} size="sm" variant="outline"
              className="border-zinc-200 hover:bg-zinc-50 text-xs h-8">
              Open <ArrowRight className="h-3 w-3 ml-1" />
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
      <div className="text-[9.5px] uppercase tracking-[0.12em] text-zinc-500 font-semibold">{label}</div>
      <div className="text-[12px] text-zinc-900 dark:text-foreground mt-1 truncate font-medium">{value}</div>
    </div>
  );
}