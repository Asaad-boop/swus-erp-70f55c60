import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle, CalendarClock, CheckCircle2, ExternalLink, Loader2, PackageCheck,
  PhoneCall, RefreshCw, Search, Wallet, X, Package, TrendingUp, MessageSquare,
} from "lucide-react";
import { sendPreorderBlast } from "@/lib/erp/sms/sms.functions";
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

  const blastFn = useServerFn(sendPreorderBlast);
  const [blastOpen, setBlastOpen] = useState(false);
  const blastPreview = useQuery({
    queryKey: ["preorder-blast-preview", scopeIds],
    enabled: blastOpen && scopeIds.length > 0,
    queryFn: () => blastFn({ data: { brandIds: scopeIds, template: "preorder_placed", preview: true } }),
  });
  const blastMut = useMutation({
    mutationFn: () => blastFn({ data: { brandIds: scopeIds, template: "preorder_placed" } }),
    onSuccess: (r) => {
      if ("sent" in r) {
        toast.success(`${r.sent} জনকে SMS গেছে${r.failed ? ` · ${r.failed} fail` : ""}`);
      }
      setBlastOpen(false);
      qc.invalidateQueries({ queryKey: ["sms-logs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5 p-4 pb-24 md:p-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border bg-card p-5 shadow-sm">
        <div className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600/10 text-indigo-600 ring-1 ring-inset ring-indigo-600/20">
              <CalendarClock className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Pre-orders</h1>
              <p className="mt-0.5 max-w-xl text-xs text-muted-foreground">
                Promise date, advance আর due — সব একসাথে। Stock এলে call দিয়ে confirm করলেই packaging queue-তে যাবে।
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setBlastOpen(true)} className="gap-1.5" disabled={scopeIds.length === 0}>
              <MessageSquare className="h-3.5 w-3.5" /> সবাইকে SMS
            </Button>
            <Button variant="outline" size="sm" onClick={refresh} className="gap-1.5">
              <RefreshCw className={cn("h-3.5 w-3.5 transition-transform", listQuery.isFetching && "animate-spin")} /> Refresh
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={blastOpen} onOpenChange={setBlastOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-indigo-600" /> Pre-order customer দের SMS
            </DialogTitle>
            <DialogDescription>
              Active pre-order (open / advance paid / ready / called) সব customer কে "Pre-order placed" template টা যাবে।
            </DialogDescription>
          </DialogHeader>
          {blastPreview.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : blastPreview.data && "total" in blastPreview.data ? (
            <div className="space-y-3">
              <div className="rounded-xl border bg-muted/40 p-3 text-sm">
                <span className="font-semibold">{blastPreview.data.total}</span> জন recipient
                {"already" in blastPreview.data && blastPreview.data.already > 0 && (
                  <span className="text-emerald-600"> · {blastPreview.data.already} জনকে আগেই পাঠানো হয়েছে (skip)</span>
                )}
                {blastPreview.data.skipped > 0 && (
                  <span className="text-muted-foreground"> · {blastPreview.data.skipped} skip (phone/config নেই)</span>
                )}
              </div>
              {blastPreview.data.total === 0 && (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs text-emerald-700">
                  বাকি কেউ নেই — সবাইকে SMS চলে গেছে ✅
                </div>
              )}
              {blastPreview.data.sample?.map((s) => (
                <div key={s.phone} className="rounded-lg border p-2 text-xs">
                  <div className="font-mono text-muted-foreground">{s.phone}</div>
                  <div className="mt-1 whitespace-pre-wrap">{s.message}</div>
                </div>
              ))}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setBlastOpen(false)}>Cancel</Button>
            <Button
              onClick={() => blastMut.mutate()}
              disabled={blastMut.isPending || !(blastPreview.data && "total" in blastPreview.data && blastPreview.data.total > 0)}
            >
              {blastMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Send now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Live pre-orders" value={String(kpis.live)} icon={Package} tone="indigo" hint="Open + advance paid + ready" />
        <Kpi label="Advance collected" value={fmtBDT(kpis.advance)} icon={Wallet} tone="emerald" hint="Cash already received" />
        <Kpi label="Due to collect" value={fmtBDT(kpis.due)} icon={TrendingUp} tone="sky" hint="Delivery-তে নিতে হবে" />
        <Kpi label="Overdue promise" value={String(kpis.overdue)} icon={AlertTriangle} tone="rose" hint="Promise date পার হয়েছে" />
      </div>

      {/* Toolbar */}
      <div className="sticky top-0 z-20 -mx-1 flex flex-wrap items-center gap-3 rounded-xl border bg-card/85 px-3 py-2 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/70">
        <Tabs value={tab} onValueChange={(v) => { setTab(v as TabKey); setSelected(new Set()); }}>
          <TabsList className="h-9 bg-muted/60">
            {TABS.map((t) => (
              <TabsTrigger key={t.key} value={t.key} className="gap-1.5 text-xs data-[state=active]:shadow-sm">
                {t.label}
                <span
                  className={cn(
                    "rounded-full px-1.5 text-[10px] font-bold tabular-nums transition-colors",
                    tab === t.key ? "bg-foreground text-background" : "bg-muted-foreground/15 text-muted-foreground",
                  )}
                >
                  {counts[t.key]}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative w-64 max-w-full flex-1 sm:flex-none">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-9 pr-8"
            placeholder="Invoice / name / phone"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {tab === "open" && rows.length > 0 && (
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-indigo-600"
              checked={allSelected}
              onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())}
            />
            Select all
          </label>
        )}
        <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">{rows.length} shown</span>
      </div>

      {listQuery.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl border bg-card p-4 shadow-sm">
              <div className="flex flex-wrap gap-4">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-3 w-56" />
                </div>
                <Skeleton className="h-16 w-40" />
                <Skeleton className="h-8 w-32" />
              </div>
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed bg-card/50 py-20 text-center animate-fade-in">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <CalendarClock className="h-6 w-6" />
          </span>
          <p className="mt-3 text-sm font-semibold">এই tab-এ কোনো pre-order নেই</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {search ? "Search clear করে দেখুন।" : "Order list বা Web orders থেকে “Convert to Pre-order” করলে এখানে আসবে।"}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {rows.map((r) => {
            const o = r.order;
            const meta = stageMeta(r.stage);
            const left = daysLeft(r.promise_date);
            const total = Number(o?.total || 0);
            const adv = Number(r.advance_amount || 0);
            const pct = total > 0 ? Math.min(100, Math.round((adv / total) * 100)) : 0;
            const busy = busyId === r.id;
            const overdue = left !== null && left < 0 && r.stage !== "confirmed" && r.stage !== "cancelled";
            return (
              <div
                key={r.id}
                className={cn(
                  "group relative overflow-hidden rounded-2xl border bg-card p-3.5 shadow-sm transition-all animate-fade-in",
                  "hover:-translate-y-[1px] hover:shadow-md",
                  selected.has(r.id) && "ring-2 ring-indigo-500/40",
                  busy && "opacity-60",
                )}
              >
                <span className="absolute inset-y-0 left-0 w-1" style={{ background: meta.accent }} />
                <div className="flex flex-wrap items-start gap-3 pl-2">
                  {tab === "open" && (
                    <input
                      type="checkbox"
                      className="mt-1.5 h-4 w-4 accent-indigo-600"
                      checked={selected.has(r.id)}
                      onChange={(e) => {
                        const next = new Set(selected);
                        if (e.target.checked) next.add(r.id); else next.delete(r.id);
                        setSelected(next);
                      }}
                    />
                  )}
                  <div className="min-w-[240px] flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={cn("rounded-full border-0 px-2 py-0.5 text-[10px] font-bold", meta.className)}>
                        {meta.label}
                      </Badge>
                      <Link
                        to="/erp/orders/$orderId"
                        params={{ orderId: r.order_id }}
                        className="inline-flex items-center gap-1 text-sm font-semibold hover:underline"
                      >
                        {invoiceDisplay(o ?? EMPTY_ORDER)} <ExternalLink className="h-3 w-3 opacity-60" />
                      </Link>
                      {o?.source && (
                        <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{o.source}</span>
                      )}
                      {overdue && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                          <AlertTriangle className="h-3 w-3" /> Overdue
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-sm font-medium">{customerName(o ?? EMPTY_ORDER)}</div>
                    <div className="text-[11px] text-muted-foreground tabular-nums">{customerPhone(o ?? EMPTY_ORDER)}</div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {(o?.items ?? []).slice(0, 4).map((it) => (
                        <span
                          key={it.id}
                          className="inline-flex items-center gap-1.5 rounded-lg border bg-muted/40 py-0.5 pl-0.5 pr-2 text-[10px]"
                          title={`${it.name ?? ""}${it.variant_label ? ` · ${it.variant_label}` : ""}`}
                        >
                          {it.image ? (
                            <img src={it.image} alt={it.name ?? "product"} loading="lazy" className="h-6 w-6 rounded-md object-cover" />
                          ) : (
                            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-muted">
                              <Package className="h-3 w-3 text-muted-foreground" />
                            </span>
                          )}
                          <span className="max-w-[150px] truncate font-medium">{it.name}</span>
                          {it.variant_label && <span className="text-muted-foreground">{it.variant_label}</span>}
                          <span className="font-bold tabular-nums">×{it.quantity}</span>
                        </span>
                      ))}
                      {(o?.items?.length ?? 0) > 4 && (
                        <span className="text-[10px] text-muted-foreground">+{(o?.items?.length ?? 0) - 4} more</span>
                      )}
                    </div>
                  </div>

                  <div className="min-w-[168px] space-y-1 rounded-xl bg-muted/40 p-2 text-[11px]">
                    <Detail label="Promise" value={fmtDate(r.promise_date)} />
                    <Detail
                      label="Time left"
                      value={left === null ? "—" : left < 0 ? `${Math.abs(left)}d overdue` : `${left}d left`}
                      className={left !== null && left < 0 ? "font-bold text-rose-600" : left !== null && left <= 3 ? "font-semibold text-amber-600" : ""}
                    />
                    <Detail label="Placed" value={fmtDate(o?.created_at)} />
                  </div>

                  <div className="min-w-[200px] space-y-1 rounded-xl bg-muted/40 p-2 text-[11px]">
                    <Detail label="Order total" value={fmtBDT(total)} className="font-semibold" />
                    <Detail
                      label="Advance"
                      value={`${fmtBDT(adv)}${r.advance_method ? ` · ${r.advance_method}` : ""}`}
                      className={adv > 0 ? "font-semibold text-emerald-700 dark:text-emerald-400" : ""}
                    />
                    {r.advance_txn_id && <Detail label="Txn" value={r.advance_txn_id} />}
                    <Detail label="Due" value={`${fmtBDT(Number(r.due_amount || 0))} · ${r.due_collect_method ?? "—"}`} />
                    <div className="pt-0.5">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted-foreground/15">
                        <div
                          className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="mt-0.5 text-[10px] text-muted-foreground">{pct}% prepaid</div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 self-center">
                    {(r.stage === "open" || r.stage === "advance_paid") && (
                      <>
                        <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled={busy} onClick={() => setAdvanceRow(r)}>
                          <Wallet className="h-3.5 w-3.5" /> Advance
                        </Button>
                        <Button size="sm" className="h-8 gap-1.5" disabled={busy} onClick={() => { setBusyId(r.id); readyMut.mutate([r]); }}>
                          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PackageCheck className="h-3.5 w-3.5" />} Stock arrived
                        </Button>
                      </>
                    )}
                    {r.stage === "ready" && (
                      <Button size="sm" className="h-8 gap-1.5" disabled={busy} onClick={() => { setBusyId(r.id); calledMut.mutate(r); }}>
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PhoneCall className="h-3.5 w-3.5" />} Called
                      </Button>
                    )}
                    {(r.stage === "ready" || r.stage === "called") && (
                      <Button
                        size="sm"
                        className="h-8 gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                        onClick={() => { setBusyId(r.id); confirmMut.mutate(r); }}
                        disabled={busy}
                      >
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Confirm order
                      </Button>
                    )}
                    {r.stage !== "cancelled" && r.stage !== "confirmed" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 gap-1.5 text-rose-600 hover:bg-rose-500/10 hover:text-rose-700"
                        disabled={busy}
                        onClick={() => setCancelRow(r)}
                      >
                        <X className="h-3.5 w-3.5" /> Cancel
                      </Button>
                    )}
                  </div>
                </div>
                <StageTrack stage={r.stage} />
                {r.notes && (
                  <div className="mt-2 ml-2 rounded-lg bg-muted/50 px-2 py-1 text-[11px] text-muted-foreground">{r.notes}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <AdvanceDialog row={advanceRow} onClose={() => setAdvanceRow(null)} onSaved={refresh} />
      <CancelDialog row={cancelRow} onClose={() => setCancelRow(null)} onSaved={refresh} />

      {tab === "open" && selectedRows.length > 0 && (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
          <div className="flex items-center gap-3 rounded-full border bg-card/95 px-4 py-2 shadow-lg backdrop-blur animate-fade-in">
            <span className="text-xs font-semibold tabular-nums">{selectedRows.length} selected</span>
            <Button size="sm" className="h-8 gap-1.5 rounded-full" onClick={() => readyMut.mutate(selectedRows)} disabled={readyMut.isPending}>
              {readyMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PackageCheck className="h-3.5 w-3.5" />}
              Mark stock arrived
            </Button>
            <Button size="sm" variant="ghost" className="h-8 rounded-full" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

const KPI_TONE: Record<string, { chip: string; glow: string }> = {
  indigo: { chip: "bg-indigo-500/10 text-indigo-600 ring-indigo-500/20", glow: "bg-indigo-500/10" },
  emerald: { chip: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20", glow: "bg-emerald-500/10" },
  sky: { chip: "bg-sky-500/10 text-sky-600 ring-sky-500/20", glow: "bg-sky-500/10" },
  rose: { chip: "bg-rose-500/10 text-rose-600 ring-rose-500/20", glow: "bg-rose-500/10" },
};

function Kpi({ label, value, icon: Icon, tone, hint }: {
  label: string; value: string; icon: React.ElementType; tone: keyof typeof KPI_TONE; hint?: string;
}) {
  const t = KPI_TONE[tone] ?? KPI_TONE.indigo;
  return (
    <div className="relative overflow-hidden rounded-2xl border bg-card p-3.5 shadow-sm transition-shadow hover:shadow-md">
      <div className={cn("pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full blur-2xl", t.glow)} />
      <div className="relative flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
          {hint && <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{hint}</div>}
        </div>
        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset", t.chip)}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}

const TRACK: { key: PreorderStage; label: string }[] = [
  { key: "open", label: "Placed" },
  { key: "advance_paid", label: "Advance" },
  { key: "ready", label: "Stock" },
  { key: "called", label: "Called" },
  { key: "confirmed", label: "Confirmed" },
];

function StageTrack({ stage }: { stage: PreorderStage }) {
  if (stage === "cancelled") return null;
  const idx = TRACK.findIndex((s) => s.key === stage);
  return (
    <div className="mt-2.5 ml-2 flex items-center gap-1.5">
      {TRACK.map((s, i) => {
        const done = i <= idx;
        return (
          <div key={s.key} className="flex items-center gap-1.5">
            <span className="flex items-center gap-1">
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full transition-colors",
                  done ? "bg-indigo-500" : "bg-muted-foreground/25",
                )}
              />
              <span className={cn("text-[10px]", done ? "font-semibold text-foreground" : "text-muted-foreground")}>
                {s.label}
              </span>
            </span>
            {i < TRACK.length - 1 && (
              <span className={cn("h-px w-5 rounded-full", i < idx ? "bg-indigo-500/50" : "bg-muted-foreground/20")} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function Detail({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("truncate tabular-nums", className)}>{value}</span>
    </div>
  );
}

function CancelDialog({ row, onClose, onSaved }: { row: Row | null; onClose: () => void; onSaved: () => void }) {
  const [reason, setReason] = useState("");
  const save = useMutation({
    mutationFn: async () => { if (row) await cancelPreorder(row, reason || null); },
    onSuccess: () => { toast.success("Pre-order cancelled"); setReason(""); onClose(); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={!!row} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-rose-600">
            <AlertTriangle className="h-4 w-4" /> Cancel pre-order
          </DialogTitle>
          <DialogDescription>Order-টি cancel হয়ে যাবে। কারণ লিখে রাখলে পরে track করা সহজ হবে।</DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label className="text-[11px]">Reason (optional)</Label>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Customer আর নিতে চায় না…" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Back</Button>
          <Button variant="destructive" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Cancel pre-order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdvanceDialog({ row, onClose, onSaved }: { row: Row | null; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("bKash");
  const [source, setSource] = useState("bKash");
  const [txnId, setTxnId] = useState("");

  useEffect(() => {
    if (!row) return;
    setAmount(Number(row.advance_amount) > 0 ? String(row.advance_amount) : "");
    setMethod(row.advance_method ?? "bKash");
    setSource(row.advance_source ?? "bKash");
    setTxnId(row.advance_txn_id ?? "");
  }, [row]);

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