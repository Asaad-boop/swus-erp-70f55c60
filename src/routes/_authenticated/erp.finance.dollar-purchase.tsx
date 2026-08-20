import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Plus, DollarSign, Wallet, TrendingUp, Receipt, CheckCircle2, XCircle,
  Loader2, Edit2, AlertCircle, ArrowUpRight, ArrowDownRight,
} from "lucide-react";

import { useBrand } from "@/contexts/brand-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

import {
  listDollarPurchases,
  listDollarPurchaseFormOptions,
  createDollarPurchase,
  updateDollarPurchase,
  confirmDollarPurchase,
  cancelDollarPurchase,
  adjustDollarPurchase,
  listAdAccountWallets,
} from "@/lib/erp/marketing/dollar-purchase.functions";
import { useUsdBdtRate } from "@/hooks/erp/use-fx-rate";

export const Route = createFileRoute("/_authenticated/erp/finance/dollar-purchase")({
  head: () => ({ meta: [{ title: "Meta Dollar Purchase — Finance" }] }),
  component: DollarPurchasePage,
});

type PurchaseRow = {
  id: string;
  purchase_date: string;
  usd_amount: number;
  usd_rate: number;
  fee_bdt: number;
  bdt_amount: number;
  total_bdt: number;
  effective_rate: number;
  status: "draft" | "confirmed" | "cancelled";
  payment_method: string | null;
  reference: string | null;
  supplier_name: string | null;
  note: string | null;
  attachment_url: string | null;
  brand_id: string | null;
  ad_account_id: string;
  paid_from_account_id: string;
  brands: { name: string } | null;
  mkt_ad_accounts: { id: string; name: string; external_id: string } | null;
  erp_accounts: { id: string; name: string; account_type: string } | null;
};

const fmtBDT = (n: number) =>
  new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(n || 0);
const fmtUSD = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n || 0);

function statusPill(status: PurchaseRow["status"]) {
  if (status === "confirmed")
    return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-0">Confirmed</Badge>;
  if (status === "cancelled")
    return <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-100 border-0">Cancelled</Badge>;
  return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-0">Draft</Badge>;
}

function DollarPurchasePage() {
  const { brandIds } = useBrand();
  const qc = useQueryClient();
  const listFn = useServerFn(listDollarPurchases);
  const optsFn = useServerFn(listDollarPurchaseFormOptions);
  const createFn = useServerFn(createDollarPurchase);
  const updateFn = useServerFn(updateDollarPurchase);
  const confirmFn = useServerFn(confirmDollarPurchase);
  const cancelFn = useServerFn(cancelDollarPurchase);
  const adjustFn = useServerFn(adjustDollarPurchase);
  const walletsFn = useServerFn(listAdAccountWallets);

  const wallets = useQuery({
    queryKey: ["mdp-wallets", brandIds.join(",")],
    queryFn: () => walletsFn({ data: { brandIds } }) as Promise<any[]>,
  });
  const { data: marketRate } = useUsdBdtRate(brandIds);

  const [filters, setFilters] = useState<{
    status?: string; from?: string; to?: string; adAccountId?: string; paidFrom?: string;
  }>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PurchaseRow | null>(null);
  const [cancelTarget, setCancelTarget] = useState<PurchaseRow | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const opts = useQuery({
    queryKey: ["mdp-opts", brandIds.join(",")],
    queryFn: () => optsFn({ data: { brandIds } }),
  });

  const list = useQuery({
    queryKey: ["mdp-list", brandIds.join(","), filters],
    queryFn: () =>
      listFn({
        data: {
          brandIds,
          status: filters.status || undefined,
          from: filters.from || undefined,
          to: filters.to || undefined,
          adAccountId: filters.adAccountId || undefined,
          paidFrom: filters.paidFrom || undefined,
        },
      }) as Promise<PurchaseRow[]>,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["mdp-list"] });
    qc.invalidateQueries({ queryKey: ["mdp-wallet"] });
  };

  const confirmMut = useMutation({
    mutationFn: (id: string) => confirmFn({ data: { id } }),
    onSuccess: () => { toast.success("Purchase confirmed — ledger updated"); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to confirm"),
  });
  const cancelMut = useMutation({
    mutationFn: (v: { id: string; reason?: string }) => cancelFn({ data: v }),
    onSuccess: () => {
      toast.success("Cancelled");
      setCancelTarget(null); setCancelReason("");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to cancel"),
  });
  const adjustMut = useMutation({
    mutationFn: (v: { id: string; reason?: string }) => adjustFn({ data: v }) as Promise<any>,
    onSuccess: (res: any) => {
      const refund = Number(res?.refund_bdt ?? 0);
      toast.success(refund > 0 ? `Adjusted — ৳${refund.toLocaleString()} refunded to account` : "Adjusted");
      setCancelTarget(null); setCancelReason("");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to adjust"),
  });

  // KPI computations
  const kpis = useMemo(() => {
    const rows = list.data ?? [];
    const confirmed = rows.filter((r) => r.status === "confirmed");
    const usdTotal = confirmed.reduce((a, r) => a + Number(r.usd_amount || 0), 0);
    const bdtTotal = confirmed.reduce((a, r) => a + Number(r.total_bdt || 0), 0);
    const feeTotal = confirmed.reduce((a, r) => a + Number(r.fee_bdt || 0), 0);
    const avgRate = usdTotal > 0 ? bdtTotal / usdTotal : 0;
    const monthStart = new Date(); monthStart.setDate(1);
    const thisMonthFee = confirmed
      .filter((r) => new Date(r.purchase_date) >= monthStart)
      .reduce((a, r) => a + Number(r.fee_bdt || 0), 0);
    return { usdTotal, bdtTotal, feeTotal, avgRate, thisMonthFee };
  }, [list.data]);

  return (
    <div className="p-4 md:p-6 space-y-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Meta Dollar Purchase</h1>
          <p className="text-sm text-muted-foreground">USD funding for Meta ad accounts — FIFO costed.</p>
        </div>
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="gap-1.5">
          <Plus className="h-4 w-4" /> New Purchase
        </Button>
      </header>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard icon={DollarSign} label="Total USD Purchased" value={fmtUSD(kpis.usdTotal)} tint="emerald" />
        <KpiCard icon={Wallet} label="Total BDT Paid" value={fmtBDT(kpis.bdtTotal)} tint="blue" />
        <KpiCard icon={TrendingUp} label="Avg Effective Rate" value={kpis.avgRate ? kpis.avgRate.toFixed(4) : "—"} suffix="৳/$" tint="violet" />
        <KpiCard icon={Receipt} label="Total Fees" value={fmtBDT(kpis.feeTotal)} tint="amber" />
        <KpiCard icon={Receipt} label="This Month Fees" value={fmtBDT(kpis.thisMonthFee)} tint="rose" />
      </div>

      <FxWalletPanel wallets={wallets.data ?? []} marketRate={marketRate ?? null} />

      {/* Filters */}
      <Card className="p-3 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Status</Label>
          <Select value={filters.status ?? "all"} onValueChange={(v) => setFilters((f) => ({ ...f, status: v === "all" ? undefined : v }))}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Ad Account</Label>
          <Select value={filters.adAccountId ?? "all"} onValueChange={(v) => setFilters((f) => ({ ...f, adAccountId: v === "all" ? undefined : v }))}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All ad accounts</SelectItem>
              {opts.data?.adAccounts.map((a: any) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Paid From</Label>
          <Select value={filters.paidFrom ?? "all"} onValueChange={(v) => setFilters((f) => ({ ...f, paidFrom: v === "all" ? undefined : v }))}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All accounts</SelectItem>
              {opts.data?.accounts.map((a: any) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">From</Label>
          <Input type="date" value={filters.from ?? ""} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value || undefined }))} className="w-40" />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">To</Label>
          <Input type="date" value={filters.to ?? ""} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value || undefined }))} className="w-40" />
        </div>
        {Object.values(filters).some(Boolean) && (
          <Button variant="ghost" size="sm" onClick={() => setFilters({})}>Clear</Button>
        )}
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Ad Account</TableHead>
              <TableHead>Brand</TableHead>
              <TableHead className="text-right">USD</TableHead>
              <TableHead className="text-right">Rate</TableHead>
              <TableHead className="text-right">Fee</TableHead>
              <TableHead className="text-right">Total BDT</TableHead>
              <TableHead>Paid From</TableHead>
              <TableHead className="text-right">Eff. Rate</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.isLoading && (
              <TableRow><TableCell colSpan={11} className="text-center py-10"><Loader2 className="h-5 w-5 animate-spin inline" /></TableCell></TableRow>
            )}
            {!list.isLoading && (list.data?.length ?? 0) === 0 && (
              <TableRow>
                <TableCell colSpan={11} className="text-center py-12 text-muted-foreground">
                  <DollarSign className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  No dollar purchases yet. Click <span className="font-medium">New Purchase</span> to add one.
                </TableCell>
              </TableRow>
            )}
            {list.data?.map((r) => (
              <TableRow key={r.id} className="hover:bg-muted/30">
                <TableCell className="font-medium tabular-nums">{format(new Date(r.purchase_date), "dd MMM")}</TableCell>
                <TableCell>
                  <div className="font-medium">{r.mkt_ad_accounts?.name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{r.mkt_ad_accounts?.external_id}</div>
                </TableCell>
                <TableCell className="text-sm">
                  {r.brands?.name ?? (
                    <Badge variant="outline" className="text-[10px] border-violet-200 text-violet-700 bg-violet-50">
                      🌐 Shared
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium">{fmtUSD(r.usd_amount)}</TableCell>
                <TableCell className="text-right tabular-nums">{Number(r.usd_rate).toFixed(2)}</TableCell>
                <TableCell className="text-right tabular-nums text-amber-700">{r.fee_bdt > 0 ? fmtBDT(r.fee_bdt) : "—"}</TableCell>
                <TableCell className="text-right tabular-nums font-semibold">{fmtBDT(r.total_bdt)}</TableCell>
                <TableCell className="text-sm">{r.erp_accounts?.name ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums text-violet-700">{Number(r.effective_rate).toFixed(4)}</TableCell>
                <TableCell>{statusPill(r.status)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {r.status === "draft" && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => { setEditing(r); setDialogOpen(true); }}>
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm" variant="default" className="bg-emerald-600 hover:bg-emerald-700 h-7 gap-1"
                          disabled={confirmMut.isPending}
                          onClick={() => confirmMut.mutate(r.id)}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> Confirm
                        </Button>
                      </>
                    )}
                    {r.status !== "cancelled" && (
                      <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => setCancelTarget(r)}>
                        <XCircle className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <PurchaseDialog
        open={dialogOpen}
        onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditing(null); }}
        editing={editing}
        opts={opts.data}
        onSave={async (payload) => {
          try {
            if (editing) {
              await updateFn({ data: { id: editing.id, ...payload } });
              toast.success("Updated");
            } else {
              const created: any = await createFn({ data: payload });
              try {
                await confirmFn({ data: { id: created.id } });
                toast.success("Purchase posted to ledger.");
              } catch (err: any) {
                toast.error(`Saved as draft — auto-confirm failed: ${err?.message ?? "unknown"}`);
              }
            }
            setDialogOpen(false); setEditing(null);
            refresh();
          } catch (e: any) {
            toast.error(e?.message ?? "Save failed");
          }
        }}
      />

      <Dialog open={!!cancelTarget} onOpenChange={(v) => !v && setCancelTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel purchase?</DialogTitle>
            <DialogDescription>
              {cancelTarget?.status === "confirmed"
                ? "Full cancel reverses the whole posting — only works if none of the USD has been spent yet. If some USD is already consumed by Meta spend, use Adjust instead: it refunds only the unspent portion and writes off the rest."
                : "This draft will be marked cancelled."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Reason</Label>
            <Textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCancelTarget(null)}>Back</Button>
            {cancelTarget?.status === "confirmed" && (
              <Button
                variant="outline"
                disabled={adjustMut.isPending}
                onClick={() => cancelTarget && adjustMut.mutate({ id: cancelTarget.id, reason: cancelReason || undefined })}
              >
                {adjustMut.isPending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Adjusting…</> : "Adjust (refund unspent)"}
              </Button>
            )}
            <Button
              variant="destructive"
              disabled={cancelMut.isPending}
              onClick={() => cancelTarget && cancelMut.mutate({ id: cancelTarget.id, reason: cancelReason || undefined })}
            >
              Cancel Purchase
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KpiCard({
  icon: Icon, label, value, suffix, tint,
}: { icon: any; label: string; value: string; suffix?: string; tint: "emerald" | "blue" | "violet" | "amber" | "rose" }) {
  const map: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-700",
    blue: "bg-blue-50 text-blue-700",
    violet: "bg-violet-50 text-violet-700",
    amber: "bg-amber-50 text-amber-700",
    rose: "bg-rose-50 text-rose-700",
  };
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={cn("h-7 w-7 rounded-md grid place-items-center", map[tint])}>
          <Icon className="h-4 w-4" />
        </div>
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
      </div>
      <div className="text-xl font-semibold tabular-nums">
        {value} {suffix && <span className="text-sm text-muted-foreground font-normal">{suffix}</span>}
      </div>
    </Card>
  );
}

function FxWalletPanel({
  wallets, marketRate,
}: { wallets: any[]; marketRate: number | null }) {
  const rows = (wallets ?? []).filter((w) => Number(w.remaining_usd) > 0.01);
  const totals = rows.reduce(
    (a, w) => {
      const rem = Number(w.remaining_usd || 0);
      const avg = Number(w.avg_effective_rate || 0);
      a.usd += rem;
      a.cost += rem * avg;
      return a;
    },
    { usd: 0, cost: 0 },
  );
  const marketValue = marketRate ? totals.usd * marketRate : 0;
  const unrealized = marketRate ? marketValue - totals.cost : 0;
  const gain = unrealized >= 0;

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <div>
          <div className="text-sm font-semibold flex items-center gap-2">
            <Wallet className="h-4 w-4 text-violet-600" /> USD Ad-Wallets · FX P&amp;L
          </div>
          <div className="text-xs text-muted-foreground">
            Prottek ad account er baki USD balance, avg cost, r ajker market rate e unrealized gain/loss.
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="text-right">
            <div className="text-[10px] uppercase text-muted-foreground">On Hand</div>
            <div className="font-semibold tabular-nums">{fmtUSD(totals.usd)}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase text-muted-foreground">Book Cost</div>
            <div className="font-semibold tabular-nums">{fmtBDT(totals.cost)}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase text-muted-foreground">Market Rate</div>
            <div className="font-semibold tabular-nums">{marketRate ? marketRate.toFixed(2) : "—"} <span className="text-xs text-muted-foreground">৳/$</span></div>
          </div>
          <div className={cn(
            "text-right px-3 py-1.5 rounded-md",
            !marketRate ? "bg-muted text-muted-foreground" : gain ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700",
          )}>
            <div className="text-[10px] uppercase flex items-center gap-1 justify-end">
              {marketRate && (gain ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />)}
              Unrealized FX
            </div>
            <div className="font-semibold tabular-nums">
              {marketRate ? `${gain ? "+" : ""}${fmtBDT(unrealized)}` : "Set FX rate"}
            </div>
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="text-xs text-muted-foreground text-center py-4">Kono ad account e baki USD nei.</div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ad Account</TableHead>
                <TableHead className="text-right">USD On Hand</TableHead>
                <TableHead className="text-right">Avg Cost</TableHead>
                <TableHead className="text-right">Book Value</TableHead>
                <TableHead className="text-right">Market Value</TableHead>
                <TableHead className="text-right">Unrealized</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((w) => {
                const rem = Number(w.remaining_usd || 0);
                const avg = Number(w.avg_effective_rate || 0);
                const book = rem * avg;
                const mv = marketRate ? rem * marketRate : 0;
                const un = marketRate ? mv - book : 0;
                const g = un >= 0;
                return (
                  <TableRow key={w.ad_account_id}>
                    <TableCell className="font-medium">{w.ad_account_name}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtUSD(rem)}</TableCell>
                    <TableCell className="text-right tabular-nums text-violet-700">{avg ? avg.toFixed(4) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtBDT(book)}</TableCell>
                    <TableCell className="text-right tabular-nums">{marketRate ? fmtBDT(mv) : "—"}</TableCell>
                    <TableCell className={cn("text-right tabular-nums font-medium", !marketRate ? "text-muted-foreground" : g ? "text-emerald-700" : "text-rose-700")}>
                      {marketRate ? `${g ? "+" : ""}${fmtBDT(un)}` : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}

function PurchaseDialog({
  open, onOpenChange, editing, opts, onSave,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  editing: PurchaseRow | null;
  opts?: { accounts: any[]; adAccounts: any[]; brands: any[]; latestUsdRate: number | null };
  onSave: (p: any) => Promise<void>;
}) {
  const [form, setForm] = useState(() => initial(editing, opts?.latestUsdRate));
  const [saving, setSaving] = useState(false);
  // Reset when editing changes
  useMemo(() => { setForm(initial(editing, opts?.latestUsdRate)); }, [editing?.id, opts?.latestUsdRate]);

  const bdt = (form.usdAmount || 0) * (form.usdRate || 0);
  const total = bdt + (form.feeBdt || 0);
  const effective = form.usdAmount > 0 ? total / form.usdAmount : 0;

  const selectedAcc = opts?.accounts.find((a) => a.id === form.paidFromAccountId);
  const insufficient = selectedAcc && Number(selectedAcc.current_balance) < total;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit dollar purchase" : "New dollar purchase"}</DialogTitle>
          <DialogDescription>
            USD will be added to the selected Meta ad account as <span className="font-medium">Prepaid Meta Balance</span>.
            Actual marketing expense is recognised when Meta spend is recorded (FIFO).
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Purchase Date" required>
            <Input type="date" value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} />
          </Field>
          <Field label="Brand Allocation" hint="FIFO ay spend hobei brand-wise attribute">
            <Select value={form.brandId ?? "shared"} onValueChange={(v) => setForm({ ...form, brandId: v === "shared" ? null : v })}>
              <SelectTrigger>
                <SelectValue>
                  {form.brandId
                    ? opts?.brands.find((b) => b.id === form.brandId)?.name ?? "—"
                    : "🌐 Shared (multi-brand) — recommended"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="shared">
                  <div className="flex flex-col">
                    <span className="font-medium">🌐 Shared (multi-brand)</span>
                    <span className="text-xs text-muted-foreground">Ad account er sob brand-e FIFO consume hobe</span>
                  </div>
                </SelectItem>
                {opts?.brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name} <span className="text-muted-foreground">(single brand tag)</span></SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Meta Ad Account" required className="col-span-2">
            <Select value={form.adAccountId} onValueChange={(v) => setForm({ ...form, adAccountId: v })}>
              <SelectTrigger><SelectValue placeholder="Select ad account" /></SelectTrigger>
              <SelectContent>
                {opts?.adAccounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name} <span className="text-muted-foreground">— {a.external_id}</span>
                    {a.mkt_ad_account_brands && a.mkt_ad_account_brands.length > 1 && (
                      <span className="ml-2 text-[10px] text-violet-700 font-medium">
                        · {a.mkt_ad_account_brands.length} brands
                      </span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(() => {
              const acc = opts?.adAccounts.find((a: any) => a.id === form.adAccountId);
              const linked = acc?.mkt_ad_account_brands ?? [];
              if (linked.length > 1) {
                const names = linked
                  .map((l: any) => opts?.brands.find((b) => b.id === l.brand_id)?.name)
                  .filter(Boolean)
                  .join(", ");
                return (
                  <div className="text-xs text-violet-700 mt-1 flex items-start gap-1">
                    <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                    <span>Ei ad account <b>{linked.length}</b> brand-er sathe linked ({names}). Shared allocation e rakhle FIFO automatic prottek brand-e cost attribute korbe.</span>
                  </div>
                );
              }
              return null;
            })()}
          </Field>
          <Field label="USD Amount" required>
            <Input type="number" step="0.01" min={0} value={form.usdAmount || ""} onChange={(e) => setForm({ ...form, usdAmount: parseFloat(e.target.value) || 0 })} />
          </Field>
          <Field label="USD Rate (BDT)" required hint={opts?.latestUsdRate ? `Latest FX: ${opts.latestUsdRate}` : undefined}>
            <Input type="number" step="0.01" min={0} value={form.usdRate || ""} onChange={(e) => setForm({ ...form, usdRate: parseFloat(e.target.value) || 0 })} />
          </Field>
          <Field label="Transaction Fee (BDT)">
            <Input type="number" step="0.01" min={0} value={form.feeBdt || ""} onChange={(e) => setForm({ ...form, feeBdt: parseFloat(e.target.value) || 0 })} />
          </Field>
          <Field label="Total Paid (BDT)">
            <div className="h-10 px-3 rounded-md border bg-muted/50 flex items-center justify-between font-semibold tabular-nums">
              {fmtBDT(total)}
              {effective > 0 && <span className="text-xs text-violet-700 font-normal">eff {effective.toFixed(4)}</span>}
            </div>
          </Field>
          <Field label="Paid From Account" required className="col-span-2">
            <AccountCombobox
              accounts={(opts?.accounts ?? []) as any}
              value={form.paidFromAccountId}
              onChange={(v) => setForm({ ...form, paidFromAccountId: v })}
              requiredAmount={total}
              brandNames={Object.fromEntries((opts?.brands ?? []).map((b: any) => [b.id, b.name]))}
              placeholder="Cash / Bank / bKash / Card"
            />
            {insufficient && (
              <div className="text-xs text-amber-700 flex items-center gap-1 mt-1">
                <AlertCircle className="h-3 w-3" /> Account balance is below total. Confirm will fail unless negative balance is allowed in settings.
              </div>
            )}
          </Field>

          <Field label="Payment Method">
            <Input value={form.paymentMethod ?? ""} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })} placeholder="e.g. Card / bKash send" />
          </Field>
          <Field label="Reference / Txn ID">
            <Input value={form.reference ?? ""} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
          </Field>
          <Field label="Supplier / Exchanger" className="col-span-2">
            <Input value={form.supplierName ?? ""} onChange={(e) => setForm({ ...form, supplierName: e.target.value })} placeholder="e.g. Wise / Money exchanger name" />
          </Field>
          <Field label="Attachment URL" className="col-span-2">
            <Input value={form.attachmentUrl ?? ""} onChange={(e) => setForm({ ...form, attachmentUrl: e.target.value })} placeholder="Receipt / screenshot URL" />
          </Field>
          <Field label="Note" className="col-span-2">
            <Textarea rows={2} value={form.note ?? ""} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={saving || !form.adAccountId || !form.paidFromAccountId || form.usdAmount <= 0 || form.usdRate <= 0}
            onClick={async () => {
              if (saving) return;
              setSaving(true);
              try { await onSave(form); } finally { setSaving(false); }
            }}
          >
            {saving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Saving…</> : (editing ? "Save changes" : "Save draft")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function initial(editing: PurchaseRow | null, latestRate: number | null | undefined) {
  return {
    brandId: editing?.brand_id ?? null,
    adAccountId: editing?.ad_account_id ?? "",
    paidFromAccountId: editing?.paid_from_account_id ?? "",
    purchaseDate: editing?.purchase_date ?? format(new Date(), "yyyy-MM-dd"),
    usdAmount: editing ? Number(editing.usd_amount) : 0,
    usdRate: editing ? Number(editing.usd_rate) : Number(latestRate || 0),
    feeBdt: editing ? Number(editing.fee_bdt) : 0,
    paymentMethod: editing?.payment_method ?? "",
    reference: editing?.reference ?? "",
    supplierName: editing?.supplier_name ?? "",
    note: editing?.note ?? "",
    attachmentUrl: editing?.attachment_url ?? "",
  };
}

function Field({ label, required, hint, className, children }: { label: string; required?: boolean; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-xs flex items-center gap-1">
        {label} {required && <span className="text-rose-600">*</span>}
        {hint && <span className="ml-auto text-muted-foreground font-normal">{hint}</span>}
      </Label>
      {children}
    </div>
  );
}