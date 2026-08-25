import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { fmtBdt } from "@/lib/erp/finance";
import { Panel, EmptyState, ExportMenu, REPORT_QUERY_OPTS } from "@/components/erp/reports/report-kit";
import type { RpcArgs } from "@/components/erp/reports/customers-tab";
import type { PnlV2 } from "@/components/erp/reports/finance-tab";

type FlowRow = { label: string; amount: number; txns: number };
type CashFlow = {
  opening: number; cash_in: number; cash_out: number; closing: number;
  in_rows: FlowRow[]; out_rows: FlowRow[];
  accounts: { id: string; name: string; type: string; balance: number }[];
  live_balance: number;
};

/** Cash In → Cash Out → Closing cash. Transaction-date basis, transfers excluded. */
export function CashFlowPanel({ args, enabled }: { args: RpcArgs; enabled: boolean }) {
  const base = { _brand_ids: args._brand_ids, _from: args._from, _to: args._to };
  const q = useQuery({
    queryKey: ["rpt-cash-flow", JSON.stringify(base)],
    enabled,
    ...REPORT_QUERY_OPTS,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpt_cash_flow", base as never);
      if (error) throw error;
      return data as unknown as CashFlow;
    },
  });

  const f = q.data;
  const aoa = () => [
    ["Section", "Line", "Amount (BDT)"],
    ["", "Opening cash", f?.opening ?? 0],
    ...(f?.in_rows ?? []).map((r) => ["Cash in", r.label, r.amount]),
    ["", "Total cash in", f?.cash_in ?? 0],
    ...(f?.out_rows ?? []).map((r) => ["Cash out", r.label, r.amount]),
    ["", "Total cash out", f?.cash_out ?? 0],
    ["", "Closing cash", f?.closing ?? 0],
  ];

  return (
    <Panel
      title="Cash flow statement"
      subtitle="Opening + cash in − cash out = closing · transaction date · internal transfers excluded"
      action={
        <ExportMenu
          aoa={aoa}
          filename={`cash-flow-${base._from}-to-${base._to}`}
          title="Cash flow"
          rangeLabel={`${base._from} → ${base._to}`}
          disabled={!f}
        />
      }
    >
      {q.isLoading ? (
        <Skeleton className="h-[320px] rounded-lg" />
      ) : !f ? (
        <EmptyState text="No cash movement in this range." />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-[var(--rpt-gap)] sm:grid-cols-2 lg:grid-cols-4">
            {[
              { l: "Opening cash", v: f.opening },
              { l: "Cash in", v: f.cash_in, good: true },
              { l: "Cash out", v: -f.cash_out, bad: true },
              { l: "Closing cash", v: f.closing },
            ].map((c) => (
              <div key={c.l} className="rpt-surface px-4 py-3">
                <p className="rpt-eyebrow">{c.l}</p>
                <p className={cn("rpt-metric mt-1", c.good && "text-[var(--rpt-good)]", c.bad && "text-[var(--rpt-bad)]")}>
                  {fmtBdt(c.v)}
                </p>
              </div>
            ))}
          </div>

          {Math.abs(f.closing - f.live_balance) > 1 && (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
              Closing cash ({fmtBdt(f.closing)}) vs live account balance ({fmtBdt(f.live_balance)}) —
              গ্যাপ {fmtBdt(f.live_balance - f.closing)}. Opening balance বা date-range এর বাইরের entry দেখুন।
            </p>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            {([
              { title: "Cash in", rows: f.in_rows, tone: "good" as const },
              { title: "Cash out", rows: f.out_rows, tone: "bad" as const },
            ]).filter((s) => s.rows.length > 0).map((s) => (
              <div key={s.title} className="rounded-lg border">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead>{s.title}</TableHead>
                      <TableHead className="text-right">Txns</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {s.rows.map((r) => (
                      <TableRow key={r.label}>
                        <TableCell className="max-w-[220px] truncate">{r.label}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{r.txns}</TableCell>
                        <TableCell
                          className={cn(
                            "text-right tabular-nums",
                            s.tone === "good" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
                          )}
                        >
                          {fmtBdt(r.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ))}
          </div>

          {f.accounts.length > 0 && (
            <div className="rounded-lg border">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Live balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {f.accounts.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>{a.name}</TableCell>
                      <TableCell className="text-muted-foreground">{a.type}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{fmtBdt(a.balance)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

type BrandPnl = { brand_id: string; brand: string; pnl: PnlV2 };

/** Every brand side by side — sales, COGS, marketing, opex, net profit. */
export function BrandPnlPanel({ args, enabled }: { args: RpcArgs; enabled: boolean }) {
  const base = { _brand_ids: args._brand_ids, _from: args._from, _to: args._to };
  const q = useQuery({
    queryKey: ["rpt-pnl-by-brand", JSON.stringify(base)],
    enabled,
    ...REPORT_QUERY_OPTS,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpt_pnl_by_brand", base as never);
      if (error) throw error;
      return (data ?? []) as unknown as BrandPnl[];
    },
  });

  const rows = (q.data ?? []).filter((b) => b.pnl && (b.pnl.total_revenue || b.pnl.net_profit));
  if (!q.isLoading && rows.length < 2) return null;

  const LINES: { label: string; get: (p: PnlV2) => number; strong?: boolean }[] = [
    { label: "Net revenue", get: (p) => p.net_revenue },
    { label: "Total revenue", get: (p) => p.total_revenue ?? p.net_revenue, strong: true },
    { label: "COGS", get: (p) => -p.cogs },
    { label: "Gross profit", get: (p) => p.gross_profit, strong: true },
    { label: "Courier + packaging", get: (p) => -(p.courier_cost + p.packaging_cost) },
    { label: "Return loss", get: (p) => -p.return_loss },
    { label: "Contribution profit", get: (p) => p.contribution_profit, strong: true },
    { label: "Ad spend", get: (p) => -p.ad_spend },
    { label: "Operating expenses", get: (p) => -p.opex_total },
    { label: "Net profit", get: (p) => p.net_profit, strong: true },
  ];

  const total = (get: (p: PnlV2) => number) => rows.reduce((a, b) => a + Number(get(b.pnl) || 0), 0);

  return (
    <Panel
      title="Brand-wise profit & loss"
      subtitle="প্রতিটা brand আলাদা, শেষ column-এ company total"
      action={
        <ExportMenu
          aoa={() => [
            ["Line", ...rows.map((r) => r.brand), "Total"],
            ...LINES.map((l) => [l.label, ...rows.map((r) => l.get(r.pnl)), total(l.get)]),
          ]}
          filename={`brand-pnl-${base._from}-to-${base._to}`}
          title="Brand P&L"
          disabled={rows.length === 0}
        />
      }
    >
      {q.isLoading ? (
        <Skeleton className="h-[380px] rounded-lg" />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Line</TableHead>
                {rows.map((r) => (
                  <TableHead key={r.brand_id} className="text-right">{r.brand}</TableHead>
                ))}
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {LINES.map((l) => (
                <TableRow key={l.label} className={cn(l.strong && "bg-muted/30 font-semibold")}>
                  <TableCell>{l.label}</TableCell>
                  {rows.map((r) => {
                    const v = Number(l.get(r.pnl) || 0);
                    return (
                      <TableCell key={r.brand_id} className={cn("text-right tabular-nums", v < 0 && "text-rose-600 dark:text-rose-400")}>
                        {fmtBdt(v)}
                      </TableCell>
                    );
                  })}
                  <TableCell className={cn("text-right tabular-nums font-semibold", total(l.get) < 0 && "text-rose-600 dark:text-rose-400")}>
                    {fmtBdt(total(l.get))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Panel>
  );
}
