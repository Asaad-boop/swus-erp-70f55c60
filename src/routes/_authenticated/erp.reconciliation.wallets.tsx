import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Wallet, RefreshCw, AlertTriangle, CheckCircle2, Scale, ArrowDownUp, CircleDashed,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BrandBadge } from "@/components/erp/brand-badge";
import { fmtBdt } from "@/lib/erp/finance";
import { cn } from "@/lib/utils";
import {
  getWalletReconciliation,
  settleMissingInstapayPostings,
  type RunSettlementRow,
} from "@/lib/erp/wallet-recon.functions";
import { resyncInstapayAmountsFn } from "@/lib/erp/pathao-autosync.functions";

export const Route = createFileRoute("/_authenticated/erp/reconciliation/wallets")({
  head: () => ({ meta: [{ title: "Wallet Reconciliation — ERP" }] }),
  component: WalletReconPage,
});

const FILTERS = [
  { key: "all", label: "All" },
  { key: "missing", label: "Missing" },
  { key: "partial", label: "Partial" },
  { key: "zero_payout", label: "Zero payout" },
  { key: "settled", label: "Settled" },
] as const;

const STATE_META: Record<RunSettlementRow["state"], { label: string; cls: string }> = {
  settled: { label: "Settled", cls: "border-emerald-500/40 text-emerald-700 dark:text-emerald-300 bg-emerald-500/10" },
  missing: { label: "Not posted", cls: "border-red-500/40 text-red-700 dark:text-red-300 bg-red-500/10" },
  partial: { label: "Partial", cls: "border-amber-500/40 text-amber-700 dark:text-amber-300 bg-amber-500/10" },
  over: { label: "Over-posted", cls: "border-amber-500/40 text-amber-700 dark:text-amber-300 bg-amber-500/10" },
  zero_payout: { label: "Awaiting amount", cls: "border-sky-500/40 text-sky-700 dark:text-sky-300 bg-sky-500/10" },
  reverted: { label: "Reverted", cls: "border-border text-muted-foreground bg-muted/40" },
};

function WalletReconPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");

  const loadFn = useServerFn(getWalletReconciliation);
  const settleFn = useServerFn(settleMissingInstapayPostings);
  const resyncFn = useServerFn(resyncInstapayAmountsFn);

  const q = useQuery({
    queryKey: ["wallet-reconciliation"],
    queryFn: () => loadFn({ data: { limit: 200 } }),
  });

  const data = q.data;
  const t = data?.totals;

  const invalidate = () => qc.invalidateQueries({ queryKey: ["wallet-reconciliation"] });

  const settleMut = useMutation({
    mutationFn: () => settleFn({ data: undefined as never }),
    onSuccess: (r: { posted: number }) => {
      toast.success(r.posted ? `${r.posted} run settled to wallet` : "Kono missing posting nei");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resyncMut = useMutation({
    mutationFn: () => resyncFn({ data: {} }),
    onSuccess: (r: { fixed: number; settled: number }) => {
      toast.success(`Re-synced: ${r.fixed} amount fixed · ${r.settled} settled`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = useMemo(() => {
    const all = data?.runs ?? [];
    if (filter === "all") return all;
    if (filter === "partial") return all.filter((r) => r.state === "partial" || r.state === "over");
    return all.filter((r) => r.state === filter);
  }, [data, filter]);

  const busy = settleMut.isPending || resyncMut.isPending;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Wallet Reconciliation</h1>
          <p className="text-sm text-muted-foreground">
            Pathao / InstaPay wallet balance bonam invoice run payout — missing posting ar per-run settlement status.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => q.refetch()} disabled={q.isFetching}>
            <RefreshCw className={cn("h-4 w-4 mr-1.5", q.isFetching && "animate-spin")} /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => resyncMut.mutate()} disabled={busy}>
            <ArrowDownUp className="h-4 w-4 mr-1.5" /> Re-sync amounts
          </Button>
          <Button size="sm" onClick={() => settleMut.mutate()} disabled={busy}>
            <Wallet className="h-4 w-4 mr-1.5" /> Post missing settlements
          </Button>
        </div>
      </header>

      {/* KPI strip */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi title="Wallet balance" value={fmtBdt(t?.walletBalance ?? 0)} icon={<Wallet className="h-4 w-4" />} loading={q.isLoading} />
        <Kpi title="Ledger balance" value={fmtBdt(t?.ledgerBalance ?? 0)} icon={<Scale className="h-4 w-4" />} loading={q.isLoading} />
        <Kpi title="Invoice payout" value={fmtBdt(t?.expectedPayout ?? 0)} sub="applied runs" icon={<ArrowDownUp className="h-4 w-4" />} loading={q.isLoading} />
        <Kpi
          title="Posted to wallet"
          value={fmtBdt(t?.postedPayout ?? 0)}
          sub={`gap ${fmtBdt(t?.gap ?? 0)}`}
          icon={<CheckCircle2 className="h-4 w-4" />}
          loading={q.isLoading}
          tone={Math.abs(t?.gap ?? 0) > 1 ? "warn" : "good"}
        />
        <Kpi
          title="Missing postings"
          value={String(t?.missingCount ?? 0)}
          sub={`${t?.partialCount ?? 0} partial · ${t?.zeroPayoutCount ?? 0} no amount`}
          icon={<AlertTriangle className="h-4 w-4" />}
          loading={q.isLoading}
          tone={(t?.missingCount ?? 0) > 0 ? "bad" : "good"}
        />
      </div>

      {/* Accounts */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Wallet accounts</h2>
        {q.isLoading ? (
          <Card><CardContent className="py-6 text-center text-sm text-muted-foreground">Loading…</CardContent></Card>
        ) : (data?.accounts.length ?? 0) === 0 ? (
          <Card><CardContent className="py-6 text-center text-sm text-muted-foreground">Kono Pathao/InstaPay wallet nei.</CardContent></Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data!.accounts.map((a) => {
              const drift = Math.abs(a.drift) > 1;
              return (
                <Card key={a.id} className={cn(drift && "border-amber-500/40 bg-amber-500/5")}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">{a.name}</div>
                        {a.brandId && <BrandBadge brandId={a.brandId} variant="compact" />}
                      </div>
                      <span className="text-muted-foreground"><Wallet className="h-4 w-4" /></span>
                    </div>
                    <div className="text-xl font-bold tabular-nums">{fmtBdt(a.currentBalance)}</div>
                    <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                      <div>Ledger<div className="tabular-nums text-foreground">{fmtBdt(a.ledgerBalance)}</div></div>
                      <div>
                        Drift
                        <div className={cn("tabular-nums", drift ? "text-amber-600 font-semibold" : "text-foreground")}>
                          {fmtBdt(a.drift)}
                        </div>
                      </div>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      InstaPay posted: <span className="tabular-nums text-foreground">{fmtBdt(a.instapayPosted)}</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Runs */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Per-run settlement status</h2>
          <div className="flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <Button
                key={f.key}
                size="sm"
                variant={filter === f.key ? "default" : "outline"}
                className="h-7 px-2.5 text-xs"
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </Button>
            ))}
          </div>
        </div>

        {q.isLoading ? (
          <Card><CardContent className="py-6 text-center text-sm text-muted-foreground">Loading…</CardContent></Card>
        ) : rows.length === 0 ? (
          <Card className="border-emerald-500/30 bg-emerald-500/5">
            <CardContent className="py-6 text-center text-sm text-emerald-700 dark:text-emerald-300 flex items-center justify-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> Ei filter-e kono run nei.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left font-medium px-3 py-2">Invoice</th>
                    <th className="text-left font-medium px-3 py-2">Brand</th>
                    <th className="text-right font-medium px-3 py-2">Rows</th>
                    <th className="text-right font-medium px-3 py-2">Payout</th>
                    <th className="text-right font-medium px-3 py-2">Posted</th>
                    <th className="text-right font-medium px-3 py-2">Gap</th>
                    <th className="text-left font-medium px-3 py-2">Status</th>
                    <th className="text-left font-medium px-3 py-2">Applied</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((r) => {
                    const meta = STATE_META[r.state];
                    return (
                      <tr key={r.runId} className="hover:bg-muted/30">
                        <td className="px-3 py-2 font-mono text-xs">{r.invoiceId ?? "—"}</td>
                        <td className="px-3 py-2">{r.brandId ? <BrandBadge brandId={r.brandId} variant="compact" /> : "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.totalRows}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtBdt(r.payout)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtBdt(r.posted)}</td>
                        <td className={cn(
                          "px-3 py-2 text-right tabular-nums",
                          Math.abs(r.gap) > 0.5 && "text-red-600 font-semibold",
                        )}>
                          {fmtBdt(r.gap)}
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className={cn("text-[10px]", meta.cls)}>
                            {r.state === "zero_payout" && <CircleDashed className="h-3 w-3 mr-1" />}
                            {meta.label}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                          {(r.appliedAt ?? r.createdAt).slice(0, 10)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}

function Kpi({
  title, value, sub, icon, loading, tone,
}: {
  title: string; value: string; sub?: string; icon: React.ReactNode; loading?: boolean;
  tone?: "good" | "warn" | "bad";
}) {
  const toneCard = tone === "warn" ? "border-amber-500/40 bg-amber-500/5"
    : tone === "bad" ? "border-red-500/40 bg-red-500/5"
    : tone === "good" ? "border-emerald-500/30"
    : "";
  const toneText = tone === "warn" ? "text-amber-700 dark:text-amber-300"
    : tone === "bad" ? "text-red-700 dark:text-red-300"
    : tone === "good" ? "text-emerald-700 dark:text-emerald-300"
    : "";
  return (
    <Card className={toneCard}>
      <CardContent className="p-4 space-y-1">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{title}</div>
          <span className={cn("text-muted-foreground", toneText)}>{icon}</span>
        </div>
        <div className={cn("text-xl font-bold tabular-nums", toneText)}>{loading ? "…" : value}</div>
        {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}
