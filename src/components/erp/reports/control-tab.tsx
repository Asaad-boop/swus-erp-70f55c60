import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, AlertTriangle, XCircle, Clock, Lock, Unlock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Panel, KpiStrip, EmptyState, REPORT_QUERY_OPTS, type Kpi } from "@/components/erp/reports/report-kit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { fmtBdt } from "@/lib/erp/finance";
import { metricHint } from "@/lib/erp/reports/canonical";
import { toast } from "sonner";
import type { RpcArgs } from "@/components/erp/reports/customers-tab";

type CheckStatus = "matched" | "pending" | "warning" | "mismatch";

type Check = {
  key: string; label: string; left_label: string; left: number;
  right_label: string; right: number; diff: number; status: CheckStatus; reason: string;
};

type Chain = {
  overall: CheckStatus;
  waterfall: { label: string; value: number; kind: "base" | "sub" | "total" }[];
  context: { cancelled_value: number; rto_value: number; return_value: number };
  checks: Check[];
};

type Taxonomy = {
  placed: number; shipped: number; delivered: number;
  customer_return: number; customer_return_value: number;
  partial_return: number; partial_return_value: number;
  rto: number; rto_value: number; failed_delivery: number;
  cancelled: number; cancelled_value: number;
  unpaid: number; unpaid_value: number;
  return_rate: number; rto_rate: number; cancel_rate: number; failure_rate: number;
};

type ClosedPeriod = {
  id: string; brand_id: string; period_month: string; status: string;
  revenue: number; cogs: number; gross_profit: number; expenses: number;
  net_profit: number; cash_received: number; inventory_value: number;
  closed_at: string; notes: string | null;
};

const STATUS_UI: Record<CheckStatus, { icon: typeof CheckCircle2; cls: string; label: string }> = {
  matched: { icon: CheckCircle2, cls: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400", label: "Matched" },
  pending: { icon: Clock, cls: "border-sky-500/40 text-sky-600 dark:text-sky-400", label: "Pending" },
  warning: { icon: AlertTriangle, cls: "border-amber-500/40 text-amber-600 dark:text-amber-400", label: "Warning" },
  mismatch: { icon: XCircle, cls: "border-rose-500/40 text-rose-600 dark:text-rose-400", label: "Mismatch" },
};

function StatusBadge({ status }: { status: CheckStatus }) {
  const ui = STATUS_UI[status] ?? STATUS_UI.warning;
  const Icon = ui.icon;
  return (
    <Badge variant="outline" className={`gap-1 font-normal ${ui.cls}`}>
      <Icon className="h-3 w-3" /> {ui.label}
    </Badge>
  );
}

export function ControlTab({ args, enabled }: { args: RpcArgs; enabled: boolean }) {
  const qc = useQueryClient();
  const base = { _brand_ids: args._brand_ids, _from: args._from, _to: args._to };

  const chainQ = useQuery({
    queryKey: ["rpt-chain", JSON.stringify(base)],
    enabled,
    ...REPORT_QUERY_OPTS,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpt_reconcile_chain", base as never);
      if (error) throw error;
      return data as unknown as Chain;
    },
  });

  const taxQ = useQuery({
    queryKey: ["rpt-taxonomy", JSON.stringify(base)],
    enabled,
    ...REPORT_QUERY_OPTS,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpt_return_taxonomy", { ...base, _basis: "created" } as never);
      if (error) throw error;
      return data as unknown as Taxonomy;
    },
  });

  const closedQ = useQuery({
    queryKey: ["rpt-period-close", args._brand_ids.join(",")],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rpt_period_close")
        .select("*")
        .in("brand_id", args._brand_ids)
        .order("period_month", { ascending: false })
        .limit(24);
      if (error) throw error;
      return (data ?? []) as unknown as ClosedPeriod[];
    },
  });

  const lastMonth = useMemo(() => {
    const d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
  }, []);
  const [month, setMonth] = useState(lastMonth.slice(0, 7));
  const singleBrand = args._brand_ids.length === 1 ? args._brand_ids[0] : null;

  const previewQ = useQuery({
    queryKey: ["rpt-period-preview", args._brand_ids.join(","), month],
    enabled: enabled && !!month,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpt_period_snapshot", {
        _brand_ids: args._brand_ids, _month: `${month}-01`,
      } as never);
      if (error) throw error;
      return data as unknown as Record<string, number>;
    },
  });

  const closeM = useMutation({
    mutationFn: async () => {
      if (!singleBrand) throw new Error("Pick exactly one brand to close a period.");
      const { error } = await supabase.rpc("rpt_close_period", {
        _brand_id: singleBrand, _month: `${month}-01`, _notes: null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => { toast.success(`${month} closed and frozen`); qc.invalidateQueries({ queryKey: ["rpt-period-close"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const reopenM = useMutation({
    mutationFn: async (p: ClosedPeriod) => {
      const reason = window.prompt("Reason for reopening this closed month?") ?? "";
      if (reason.trim().length < 3) throw new Error("A reason is required.");
      const { error } = await supabase.rpc("rpt_reopen_period", {
        _brand_id: p.brand_id, _month: p.period_month, _reason: reason,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Period reopened"); qc.invalidateQueries({ queryKey: ["rpt-period-close"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const t = taxQ.data;
  const taxKpis: Kpi[] = t
    ? [
        { label: "Customer return", value: t.customer_return_value, goodWhen: "down", hint: `${t.customer_return} orders · ${t.return_rate}% of delivered+returned` },
        { label: "Partial return", value: t.partial_return_value, goodWhen: "down", hint: `${t.partial_return} orders` },
        { label: "RTO", value: t.rto_value, goodWhen: "down", hint: `${t.rto} orders · ${t.rto_rate}% of shipped` },
        { label: "Cancelled", value: t.cancelled_value, goodWhen: "down", hint: `${t.cancelled} orders · ${t.cancel_rate}% of placed` },
        { label: "Failed delivery", value: t.failed_delivery, kind: "number", goodWhen: "down", hint: `${t.failure_rate}% of shipped` },
        { label: "Delivered but unpaid", value: t.unpaid_value, goodWhen: "down", tone: t.unpaid_value > 0 ? "bad" : "default", hint: `${t.unpaid} orders — goods delivered, cash missing` },
      ]
    : [];

  const chain = chainQ.data;

  return (
    <div className="space-y-4">
      <Panel
        title="Sales → Cash reconciliation chain"
        subtitle="Every number checked against the next link in the chain"
        action={chain ? <StatusBadge status={chain.overall} /> : null}
      >
        {chainQ.isLoading ? (
          <Skeleton className="h-56 rounded-lg" />
        ) : !chain ? (
          <EmptyState text="No data in this range." />
        ) : (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
            <div className="space-y-1.5">
              {chain.waterfall.map((w) => {
                const isTotal = w.kind === "total";
                return (
                  <div
                    key={w.label}
                    className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                      isTotal ? "bg-muted/60 font-semibold" : "bg-muted/25"
                    }`}
                  >
                    <span className={isTotal ? "" : "text-muted-foreground"}>{w.label}</span>
                    <span className={`tabular-nums ${Number(w.value) < 0 ? "text-rose-600 dark:text-rose-400" : ""}`}>
                      {fmtBdt(Number(w.value))}
                    </span>
                  </div>
                );
              })}
              <p className="pt-1 text-[11px] text-muted-foreground">
                {metricHint("total_revenue")}
              </p>
            </div>

            <div className="space-y-2">
              {chain.checks.map((c) => (
                <div key={c.key} className="rounded-lg border border-border/60 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium">{c.label}</span>
                    <StatusBadge status={c.status} />
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="text-muted-foreground">{c.left_label}</p>
                      <p className="tabular-nums font-medium">{fmtBdt(Number(c.left))}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">{c.right_label}</p>
                      <p className="tabular-nums font-medium">{fmtBdt(Number(c.right))}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Difference</p>
                      <p className={`tabular-nums font-medium ${Math.abs(Number(c.diff)) > 1 ? "text-amber-600 dark:text-amber-400" : ""}`}>
                        {fmtBdt(Number(c.diff))}
                      </p>
                    </div>
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">{c.reason}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </Panel>

      <Panel
        title="Failure taxonomy"
        subtitle="Return ≠ RTO ≠ Unpaid ≠ Cancelled — never merged into one number"
      >
        <KpiStrip items={taxKpis} loading={taxQ.isLoading} />
      </Panel>

      <Panel
        title="Period close"
        subtitle="Closing a month freezes its numbers and blocks any back-dated financial entry"
      >
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="text-xs text-muted-foreground">Month</label>
            <Input
              type="month"
              value={month}
              max={lastMonth.slice(0, 7)}
              onChange={(e) => setMonth(e.target.value)}
              className="h-9 w-[170px] text-xs"
            />
          </div>
          <Button
            size="sm"
            className="h-9"
            disabled={!singleBrand || closeM.isPending}
            onClick={() => closeM.mutate()}
            title={singleBrand ? "Close and freeze this month" : "Select exactly one brand"}
          >
            <Lock className="mr-1.5 h-3.5 w-3.5" />
            {closeM.isPending ? "Closing…" : "Close month"}
          </Button>
          {!singleBrand && (
            <span className="text-xs text-muted-foreground">Select exactly one brand to close a period.</span>
          )}
        </div>

        {previewQ.data && (
          <div className="mt-3 grid gap-2 rounded-lg bg-muted/30 p-3 text-xs sm:grid-cols-3 lg:grid-cols-6">
            {([
              ["Revenue", "revenue"], ["COGS", "cogs"], ["Gross profit", "gross_profit"],
              ["Expenses", "expenses"], ["Net profit", "net_profit"], ["Cash received", "cash_received"],
            ] as const).map(([label, k]) => (
              <div key={k}>
                <p className="text-muted-foreground">{label}</p>
                <p className="tabular-nums font-semibold">{fmtBdt(Number(previewQ.data[k] ?? 0))}</p>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 overflow-x-auto">
          {closedQ.isLoading ? (
            <Skeleton className="h-28 rounded-lg" />
          ) : (closedQ.data ?? []).length === 0 ? (
            <EmptyState text="No period has been closed yet." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">COGS</TableHead>
                  <TableHead className="text-right">Net profit</TableHead>
                  <TableHead className="text-right">Cash received</TableHead>
                  <TableHead className="text-right">Inventory</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(closedQ.data ?? []).map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.period_month.slice(0, 7)}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={p.status === "closed"
                          ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
                          : "border-amber-500/40 text-amber-600 dark:text-amber-400"}
                      >
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmtBdt(Number(p.revenue))}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtBdt(Number(p.cogs))}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtBdt(Number(p.net_profit))}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtBdt(Number(p.cash_received))}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtBdt(Number(p.inventory_value))}</TableCell>
                    <TableCell className="text-right">
                      {p.status === "closed" && (
                        <Button variant="ghost" size="sm" className="h-8" onClick={() => reopenM.mutate(p)}>
                          <Unlock className="mr-1.5 h-3.5 w-3.5" /> Reopen
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </Panel>
    </div>
  );
}
