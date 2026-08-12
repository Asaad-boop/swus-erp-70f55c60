import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { fmtBdt } from "@/lib/erp/finance";
import { Panel, EmptyState, ExportMenu, REPORT_QUERY_OPTS } from "@/components/erp/reports/report-kit";
import type { RpcArgs } from "@/components/erp/reports/customers-tab";

const IN = "oklch(0.72 0.15 155)";
const OUT = "oklch(0.64 0.19 20)";

type CashDay = { d: string; cash_in: number; cash_out: number; net: number; txns: number };
type CashAcct = {
  account_id: string; account: string; account_type: string; wallet_type: string;
  cash_in: number; cash_out: number; transfer_in: number; transfer_out: number;
  net: number; txns: number; current_balance: number;
};
type ArAp = {
  ar_courier: number; ar_courier_orders: number; ar_delivered_unpaid: number; ar_delivered_orders: number;
  ar_total: number; ap_supplier: number; ap_cargo: number; ap_bills: number; ap_bills_overdue: number;
  ap_total: number; net_position: number;
};

function base(args: RpcArgs) {
  return { _brand_ids: args._brand_ids, _from: args._from, _to: args._to };
}

export function DailyCashPanel({ args, enabled }: { args: RpcArgs; enabled: boolean }) {
  const b = base(args);
  const q = useQuery({
    queryKey: ["rpt-cash-daily", JSON.stringify(b)], enabled, ...REPORT_QUERY_OPTS,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpt_cash_daily", b as never);
      if (error) throw error;
      return (data ?? []) as unknown as CashDay[];
    },
  });
  const rows = q.data ?? [];
  const totals = useMemo(() => rows.reduce(
    (a, r) => ({ i: a.i + Number(r.cash_in), o: a.o + Number(r.cash_out), n: a.n + Number(r.net) }),
    { i: 0, o: 0, n: 0 },
  ), [rows]);

  return (
    <Panel
      title="Daily cash movement"
      subtitle="Money in vs money out per day (transfers excluded) · Asia/Dhaka"
      action={
        <ExportMenu
          disabled={rows.length === 0}
          title="Daily cash movement"
          rangeLabel={`${b._from} → ${b._to}`}
          filename={`daily-cash-${b._from}-to-${b._to}`}
          aoa={() => [
            ["Date", "Cash in", "Cash out", "Net", "Txns"],
            ...rows.map((r) => [r.d, Number(r.cash_in), Number(r.cash_out), Number(r.net), Number(r.txns)]),
            ["Total", totals.i, totals.o, totals.n, ""],
          ]}
        />
      }
    >
      {q.isLoading ? (
        <Skeleton className="h-[300px] rounded-lg" />
      ) : rows.length === 0 ? (
        <EmptyState text="No cash transactions in this range." />
      ) : (
        <div className="space-y-4">
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows.map((r) => ({ ...r, cash_in: Number(r.cash_in), cash_out: -Number(r.cash_out) }))} margin={{ left: 4, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="d" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={64} />
                <Tooltip
                  formatter={(v: number, n: string) => [fmtBdt(Math.abs(Number(v))), n === "cash_in" ? "Cash in" : "Cash out"]}
                  contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}
                />
                <Legend formatter={(v) => (v === "cash_in" ? "Cash in" : "Cash out")} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="cash_in" fill={IN} radius={[4, 4, 0, 0]} />
                <Bar dataKey="cash_out" fill={OUT} radius={[0, 0, 4, 4]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="max-h-[320px] overflow-auto rounded-lg border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Cash in</TableHead>
                  <TableHead className="text-right">Cash out</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead className="text-right">Txns</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.d}>
                    <TableCell className="font-medium">{r.d}</TableCell>
                    <TableCell className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">{fmtBdt(r.cash_in)}</TableCell>
                    <TableCell className="text-right tabular-nums text-rose-600 dark:text-rose-400">{fmtBdt(r.cash_out)}</TableCell>
                    <TableCell className={cn("text-right font-medium tabular-nums", Number(r.net) < 0 && "text-rose-600 dark:text-rose-400")}>{fmtBdt(r.net)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{Number(r.txns).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/40 font-semibold">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtBdt(totals.i)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtBdt(totals.o)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtBdt(totals.n)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </Panel>
  );
}

export function WalletAccountsPanel({ args, enabled }: { args: RpcArgs; enabled: boolean }) {
  const b = base(args);
  const q = useQuery({
    queryKey: ["rpt-cash-accounts", JSON.stringify(b)], enabled, ...REPORT_QUERY_OPTS,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpt_cash_accounts", b as never);
      if (error) throw error;
      return (data ?? []) as unknown as CashAcct[];
    },
  });
  const rows = q.data ?? [];
  if (!q.isLoading && rows.length === 0) return null;
  const balance = rows.reduce((a, r) => a + Number(r.current_balance), 0);

  return (
    <Panel
      title="Bank & MFS accounts"
      subtitle="Wallet-wise in/out for the range · balance is live (as of now)"
      action={
        <ExportMenu
          disabled={rows.length === 0}
          title="Bank & MFS accounts"
          rangeLabel={`${b._from} → ${b._to}`}
          filename={`wallet-accounts-${b._from}-to-${b._to}`}
          aoa={() => [
            ["Account", "Type", "Cash in", "Cash out", "Transfer in", "Transfer out", "Net in range", "Balance now"],
            ...rows.map((r) => [r.account, r.wallet_type || r.account_type, Number(r.cash_in), Number(r.cash_out),
              Number(r.transfer_in), Number(r.transfer_out), Number(r.net), Number(r.current_balance)]),
          ]}
        />
      }
    >
      {q.isLoading ? (
        <Skeleton className="h-[220px] rounded-lg" />
      ) : (
        <div className="max-h-[380px] overflow-auto rounded-lg border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead className="text-right">Cash in</TableHead>
                <TableHead className="text-right">Cash out</TableHead>
                <TableHead className="text-right">Transfers</TableHead>
                <TableHead className="text-right">Net in range</TableHead>
                <TableHead className="text-right">Balance now</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.account_id}>
                  <TableCell>
                    <div className="font-medium">{r.account}</div>
                    <div className="text-xs text-muted-foreground">
                      {(r.wallet_type || r.account_type || "").toString()} · {Number(r.txns).toLocaleString()} txns
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">{fmtBdt(r.cash_in)}</TableCell>
                  <TableCell className="text-right tabular-nums text-rose-600 dark:text-rose-400">{fmtBdt(r.cash_out)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    +{fmtBdt(r.transfer_in)} / −{fmtBdt(r.transfer_out)}
                  </TableCell>
                  <TableCell className={cn("text-right tabular-nums", Number(r.net) < 0 && "text-rose-600 dark:text-rose-400")}>{fmtBdt(r.net)}</TableCell>
                  <TableCell className={cn("text-right font-semibold tabular-nums", Number(r.current_balance) < 0 && "text-rose-600 dark:text-rose-400")}>{fmtBdt(r.current_balance)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/40 font-semibold">
                <TableCell colSpan={5}>Total balance</TableCell>
                <TableCell className="text-right tabular-nums">{fmtBdt(balance)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}
    </Panel>
  );
}

export function ArApPanel({ args, enabled }: { args: RpcArgs; enabled: boolean }) {
  const b = base(args);
  const q = useQuery({
    queryKey: ["rpt-ar-ap", JSON.stringify(b)], enabled, ...REPORT_QUERY_OPTS,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpt_ar_ap", b as never);
      if (error) throw error;
      return data as unknown as ArAp;
    },
  });
  const d = q.data;

  const ar = d ? [
    { label: "COD sitting with courier (shipped / in transit)", value: Number(d.ar_courier), hint: `${Number(d.ar_courier_orders).toLocaleString()} orders` },
    { label: "Delivered but payout not received", value: Number(d.ar_delivered_unpaid), hint: `${Number(d.ar_delivered_orders).toLocaleString()} orders` },
  ] : [];
  const ap = d ? [
    { label: "Import PO due (supplier / agent)", value: Number(d.ap_supplier) },
    { label: "Cargo agent balance owed", value: Number(d.ap_cargo) },
    { label: "Unpaid bills", value: Number(d.ap_bills), hint: Number(d.ap_bills_overdue) > 0 ? `${fmtBdt(d.ap_bills_overdue)} overdue` : undefined },
  ] : [];

  return (
    <Panel
      title="Receivables & payables"
      subtitle="What we are owed vs what we owe · snapshot at end of range"
      action={
        <ExportMenu
          disabled={!d}
          title="Receivables & payables"
          rangeLabel={`${b._from} → ${b._to}`}
          filename={`ar-ap-${b._from}-to-${b._to}`}
          aoa={() => [
            ["Side", "Line", "Amount (BDT)"],
            ...ar.map((x) => ["Receivable", x.label, x.value]),
            ["Receivable", "Total", Number(d?.ar_total ?? 0)],
            ...ap.map((x) => ["Payable", x.label, x.value]),
            ["Payable", "Total", Number(d?.ap_total ?? 0)],
            ["Net", "Net position", Number(d?.net_position ?? 0)],
          ]}
        />
      }
    >
      {q.isLoading ? (
        <Skeleton className="h-[220px] rounded-lg" />
      ) : !d ? (
        <EmptyState text="No data in this range." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Side title="Receivable (we will get)" tone="good" lines={ar} total={Number(d.ar_total)} />
          <Side title="Payable (we have to pay)" tone="bad" lines={ap} total={Number(d.ap_total)} />
          <div className="lg:col-span-2 rounded-lg border bg-muted/30 px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Net position (receivable − payable)</span>
              <span className={cn("font-display text-lg font-bold tabular-nums",
                Number(d.net_position) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                {fmtBdt(d.net_position)}
              </span>
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}

function Side({
  title, tone, lines, total,
}: {
  title: string; tone: "good" | "bad";
  lines: { label: string; value: number; hint?: string }[]; total: number;
}) {
  const color = tone === "good" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";
  const chart = lines.filter((l) => l.value !== 0);
  return (
    <div className="rounded-lg border">
      <div className="border-b bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
      <div className="divide-y">
        {lines.map((l) => (
          <div key={l.label} className="flex items-start justify-between gap-3 px-3 py-2">
            <div className="text-sm">
              {l.label}
              {l.hint && <div className="text-[11px] text-muted-foreground">{l.hint}</div>}
            </div>
            <div className="shrink-0 tabular-nums">{fmtBdt(l.value)}</div>
          </div>
        ))}
        <div className="flex items-center justify-between bg-muted/30 px-3 py-2 font-semibold">
          <span>Total</span>
          <span className={cn("tabular-nums", color)}>{fmtBdt(total)}</span>
        </div>
      </div>
      {chart.length > 0 && (
        <div className="h-[110px] px-2 pb-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart} layout="vertical" margin={{ left: 4, right: 8, top: 6 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="label" hide />
              <Tooltip
                formatter={(v: number) => [fmtBdt(Number(v)), ""]}
                contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}
              />
              <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                {chart.map((c) => <Cell key={c.label} fill={tone === "good" ? IN : OUT} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}