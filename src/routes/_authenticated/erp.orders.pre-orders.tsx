import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle, CalendarClock, CheckCircle2, ExternalLink, Loader2, PackageCheck,
  PhoneCall, RefreshCw, Search, Wallet, X, Clock3, Package, TrendingUp,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { applyBrandScope } from "@/lib/erp/apply-brand-scope";
import { useBrand } from "@/contexts/brand-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { customerName, customerPhone, invoiceDisplay } from "@/lib/erp/orders";
import { cn } from "@/lib/utils";
import {
  cancelPreorder, confirmPreorderToPipeline, daysLeft, markPreorderCalled,
  markPreordersReady, recordPreorderAdvance, stageMeta,
  ADVANCE_SOURCES, PAYMENT_METHODS, type PreorderStage,
} from "@/lib/erp/preorders";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/erp/orders/pre-orders")({
  head: () => ({
    meta: [
      { title: "Pre-orders — SWUS ERP" },
      { name: "description", content: "Track pre-orders, promise dates, advance payments and due settlement in one pipeline." },
      { property: "og:title", content: "Pre-orders — SWUS ERP" },
      { property: "og:description", content: "Track pre-orders, promise dates, advance payments and due settlement in one pipeline." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PreOrdersPage,
});

const EMPTY_ORDER = { id: "", invoice_no: null, shipping_name: null, guest_name: null, shipping_phone: null, guest_phone: null };

const fmtBDT = (n: number) => `৳${Math.round(n || 0).toLocaleString()}`;
const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

type Row = {
  id: string;
  order_id: string;
  brand_id: string | null;
  stage: PreorderStage;
  promise_date: string | null;
  promise_days: number | null;
  advance_amount: number;
  advance_method: string | null;
  advance_source: string | null;
  advance_txn_id: string | null;
  due_amount: number;
  due_collect_method: string | null;
  notes: string | null;
  ready_at: string | null;
  called_at: string | null;
  confirmed_at: string | null;
  created_at: string;
  order: {
    id: string;
    invoice_no: string | null;
    created_at: string;
    status: string;
    total: number;
    source: string | null;
    shipping_name: string | null;
    shipping_phone: string | null;
    guest_name: string | null;
    guest_phone: string | null;
    items: { id: string; name: string | null; image: string | null; quantity: number; variant_label: string | null }[];
  } | null;
};

type TabKey = "open" | "ready" | "called" | "converted" | "cancelled";

const TABS: { key: TabKey; label: string; stages: PreorderStage[] }[] = [
  { key: "open", label: "Open", stages: ["open", "advance_paid"] },
  { key: "ready", label: "Stock Arrived", stages: ["ready"] },
  { key: "called", label: "Called", stages: ["called"] },
  { key: "converted", label: "Converted", stages: ["confirmed"] },
  { key: "cancelled", label: "Cancelled", stages: ["cancelled"] },
];

function PreOrdersPage() {
  const qc = useQueryClient();
  const { activeBrand, brandIds, isAllBrands } = useBrand();
  const scopeIds = isAllBrands ? brandIds : activeBrand ? [activeBrand.id] : [];

  const [tab, setTab] = useState<TabKey>("open");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [advanceRow, setAdvanceRow] = useState<Row | null>(null);
  const [cancelRow, setCancelRow] = useState<Row | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ["preorders", scopeIds],
    enabled: scopeIds.length > 0,
    queryFn: async () => {
      const { data, error } = await applyBrandScope(
        supabase
          .from("preorders")
          .select(
            "id,order_id,brand_id,stage,promise_date,promise_days,advance_amount,advance_method,advance_source,advance_txn_id,due_amount,due_collect_method,notes,ready_at,called_at,confirmed_at,created_at," +
              "order:orders!preorders_order_id_fkey(id,invoice_no,created_at,status,total,source,shipping_name,shipping_phone,guest_name,guest_phone,items:order_items(id,name,image,quantity,variant_label))",
          ),
        scopeIds,
      )
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const all = listQuery.data ?? [];

  const counts = useMemo(() => {
    const c: Record<TabKey, number> = { open: 0, ready: 0, called: 0, converted: 0, cancelled: 0 };
    for (const r of all) {
      const t = TABS.find((x) => x.stages.includes(r.stage));
      if (t) c[t.key] += 1;
    }
    return c;
  }, [all]);

  const kpis = useMemo(() => {
    const live = all.filter((r) => r.stage !== "cancelled" && r.stage !== "confirmed");
    return {
      live: live.length,
      advance: live.reduce((s, r) => s + Number(r.advance_amount || 0), 0),
      due: live.reduce((s, r) => s + Number(r.due_amount || 0), 0),
      overdue: live.filter((r) => {
        const d = daysLeft(r.promise_date);
        return d !== null && d < 0;
      }).length,
    };
  }, [all]);

  const rows = useMemo(() => {
    const stages = TABS.find((t) => t.key === tab)!.stages;
    const s = search.trim().toLowerCase();
    return all
      .filter((r) => stages.includes(r.stage))
      .filter((r) => {
        if (!s) return true;
        const o = r.order;
        return [o?.invoice_no, o?.shipping_name, o?.guest_name, o?.shipping_phone, o?.guest_phone]
          .some((v) => (v ?? "").toLowerCase().includes(s));
      });
  }, [all, tab, search]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["preorders"] });
    qc.invalidateQueries({ queryKey: ["orders"] });
    setSelected(new Set());
    setBusyId(null);
  };

  const readyMut = useMutation({
    mutationFn: async (list: Row[]) => markPreordersReady(list),
    onSuccess: () => { toast.success("Stock arrived — customer ke call den"); refresh(); },
    onError: (e: Error) => { setBusyId(null); toast.error(e.message); },
  });
  const calledMut = useMutation({
    mutationFn: async (r: Row) => markPreorderCalled(r),
    onSuccess: () => { toast.success("Called & confirmed"); refresh(); },
    onError: (e: Error) => { setBusyId(null); toast.error(e.message); },
  });
  const confirmMut = useMutation({
    mutationFn: async (r: Row) => confirmPreorderToPipeline(r),
    onSuccess: () => { toast.success("Order confirmed — packaging queue-te gelo"); refresh(); },
    onError: (e: Error) => { setBusyId(null); toast.error(e.message); },
  });

  const selectedRows = rows.filter((r) => selected.has(r.id));
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Pre-orders</h1>
          <p className="text-xs text-muted-foreground">
            Promise date, advance আর due — সব একসাথে। Stock এলে call দিয়ে confirm করলেই packaging queue-তে যাবে।
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} className="gap-1.5">
          <RefreshCw className={cn("h-3.5 w-3.5", listQuery.isFetching && "animate-spin")} /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Live pre-orders" value={String(kpis.live)} icon={CalendarClock} accent="text-indigo-600" />
        <Kpi label="Advance collected" value={fmtBDT(kpis.advance)} icon={Wallet} accent="text-emerald-600" />
        <Kpi label="Due to collect" value={fmtBDT(kpis.due)} icon={PackageCheck} accent="text-sky-600" />
        <Kpi label="Overdue promise" value={String(kpis.overdue)} icon={AlertTriangle} accent="text-rose-600" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={tab} onValueChange={(v) => { setTab(v as TabKey); setSelected(new Set()); }}>
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger key={t.key} value={t.key} className="gap-1.5">
                {t.label}
                <span className="rounded-full bg-muted px-1.5 text-[10px] font-bold tabular-nums">{counts[t.key]}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative w-72 max-w-full">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-9 pl-9" placeholder="Invoice / name / phone" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {tab === "open" && selectedRows.length > 0 && (
          <Button size="sm" className="gap-1.5" onClick={() => readyMut.mutate(selectedRows)} disabled={readyMut.isPending}>
            {readyMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PackageCheck className="h-3.5 w-3.5" />}
            Mark stock arrived ({selectedRows.length})
          </Button>
        )}
      </div>

      {listQuery.isLoading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border bg-card py-16 text-center text-sm text-muted-foreground">
          এই tab-এ কোনো pre-order নেই।
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const o = r.order;
            const meta = stageMeta(r.stage);
            const left = daysLeft(r.promise_date);
            return (
              <div
                key={r.id}
                className="rounded-xl border bg-card p-3 shadow-sm"
                style={{ borderLeft: `3px solid ${meta.accent}` }}
              >
                <div className="flex flex-wrap items-start gap-3">
                  {tab === "open" && (
                    <input
                      type="checkbox"
                      className="mt-1.5 h-4 w-4"
                      checked={selected.has(r.id)}
                      onChange={(e) => {
                        const next = new Set(selected);
                        if (e.target.checked) next.add(r.id); else next.delete(r.id);
                        setSelected(next);
                      }}
                    />
                  )}
                  <div className="min-w-[220px] flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={meta.className}>{meta.label}</Badge>
                      <Link
                        to="/erp/orders/$orderId"
                        params={{ orderId: r.order_id }}
                        className="inline-flex items-center gap-1 text-sm font-semibold hover:underline"
                      >
                        {invoiceDisplay(o ?? EMPTY_ORDER)} <ExternalLink className="h-3 w-3 opacity-60" />
                      </Link>
                      {o?.source && <span className="text-[11px] text-muted-foreground">{o.source}</span>}
                    </div>
                    <div className="mt-1 text-sm">{customerName(o ?? EMPTY_ORDER)}</div>
                    <div className="text-[11px] text-muted-foreground">{customerPhone(o ?? EMPTY_ORDER)}</div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {(o?.items ?? []).map((it) => (
                        <span key={it.id} className="rounded-md bg-muted px-1.5 py-0.5 text-[10px]">
                          {it.name}{it.variant_label ? ` · ${it.variant_label}` : ""} × {it.quantity}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="min-w-[170px] space-y-0.5 text-[11px]">
                    <Detail label="Promise" value={fmtDate(r.promise_date)} />
                    <Detail
                      label="Time left"
                      value={left === null ? "—" : left < 0 ? `${Math.abs(left)}d overdue` : `${left}d left`}
                      className={left !== null && left < 0 ? "text-rose-600 font-semibold" : ""}
                    />
                    <Detail label="Placed" value={fmtDate(o?.created_at)} />
                  </div>

                  <div className="min-w-[190px] space-y-0.5 text-[11px]">
                    <Detail label="Order total" value={fmtBDT(Number(o?.total || 0))} />
                    <Detail
                      label="Advance"
                      value={`${fmtBDT(Number(r.advance_amount || 0))}${r.advance_method ? ` · ${r.advance_method}` : ""}`}
                      className={Number(r.advance_amount) > 0 ? "text-emerald-700 dark:text-emerald-400 font-semibold" : ""}
                    />
                    {r.advance_txn_id && <Detail label="Txn" value={r.advance_txn_id} />}
                    <Detail label="Due" value={`${fmtBDT(Number(r.due_amount || 0))} · ${r.due_collect_method ?? "—"}`} />
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {(r.stage === "open" || r.stage === "advance_paid") && (
                      <>
                        <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => setAdvanceRow(r)}>
                          <Wallet className="h-3.5 w-3.5" /> Advance
                        </Button>
                        <Button size="sm" className="h-8 gap-1.5" onClick={() => readyMut.mutate([r])} disabled={readyMut.isPending}>
                          <PackageCheck className="h-3.5 w-3.5" /> Stock arrived
                        </Button>
                      </>
                    )}
                    {r.stage === "ready" && (
                      <Button size="sm" className="h-8 gap-1.5" onClick={() => calledMut.mutate(r)} disabled={calledMut.isPending}>
                        <PhoneCall className="h-3.5 w-3.5" /> Called & confirmed
                      </Button>
                    )}
                    {(r.stage === "ready" || r.stage === "called") && (
                      <Button
                        size="sm"
                        className="h-8 gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                        onClick={() => confirmMut.mutate(r)}
                        disabled={confirmMut.isPending}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Confirm order
                      </Button>
                    )}
                    {r.stage !== "cancelled" && r.stage !== "confirmed" && (
                      <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-rose-600" onClick={() => cancelMut.mutate(r)}>
                        <X className="h-3.5 w-3.5" /> Cancel
                      </Button>
                    )}
                  </div>
                </div>
                {r.notes && <div className="mt-2 rounded-lg bg-muted/50 px-2 py-1 text-[11px] text-muted-foreground">{r.notes}</div>}
              </div>
            );
          })}
        </div>
      )}

      <AdvanceDialog row={advanceRow} onClose={() => setAdvanceRow(null)} onSaved={refresh} />
    </div>
  );
}

function Kpi({ label, value, icon: Icon, accent }: { label: string; value: string; icon: React.ElementType; accent: string }) {
  return (
    <div className="rounded-xl border bg-card p-3 shadow-sm">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className={cn("h-3.5 w-3.5", accent)} /> {label}
      </div>
      <div className="mt-1 text-xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

function Detail({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("tabular-nums", className)}>{value}</span>
    </div>
  );
}

function AdvanceDialog({ row, onClose, onSaved }: { row: Row | null; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("bKash");
  const [source, setSource] = useState("bKash");
  const [txnId, setTxnId] = useState("");

  const save = useMutation({
    mutationFn: async () => {
      if (!row) return;
      if (!(Number(amount) > 0)) throw new Error("Amount din");
      await recordPreorderAdvance({ preorder: row, amount: Number(amount), method, source, txnId: txnId || null });
    },
    onSuccess: () => { toast.success("Advance saved"); onClose(); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!row} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Advance payment</DialogTitle>
          <DialogDescription>Customer কত টাকা advance দিলো, কোন method-এ — সেটা রাখুন।</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-[11px]">Amount</Label>
            <Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Source / wallet</Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ADVANCE_SOURCES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Txn ID (optional)</Label>
            <Input value={txnId} onChange={(e) => setTxnId(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}