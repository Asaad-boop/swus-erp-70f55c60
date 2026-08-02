import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Banknote, Download, Loader2, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fmtBdt } from "@/lib/erp/finance";
import { cn } from "@/lib/utils";

type Row = {
  txn_date: string;
  account_id: string | null;
  account_name: string | null;
  wallet_type: string | null;
  brand_id: string | null;
  brand_name: string | null;
  income: number | string | null;
  expense: number | string | null;
  net: number | string | null;
  txn_count: number | string | null;
};

const n = (v: number | string | null | undefined) => Number(v ?? 0);

export function ReceivedSummary({ from, to }: { from: string; to: string }) {
  const q = useQuery({
    queryKey: ["recon-received-summary", from, to],
    staleTime: 60_000,
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase.rpc("recon_received_summary", { _from: from, _to: to });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const rows = q.data ?? [];

  const totals = useMemo(() => {
    return rows.reduce(
      (a, r) => ({
        income: a.income + n(r.income),
        expense: a.expense + n(r.expense),
        net: a.net + n(r.net),
        txns: a.txns + n(r.txn_count),
      }),
      { income: 0, expense: 0, net: 0, txns: 0 },
    );
  }, [rows]);

  const byAccount = useMemo(() => {
    const m = new Map<
      string,
      { name: string; walletType: string | null; income: number; expense: number; net: number; txns: number; brands: Map<string, number> }
    >();
    for (const r of rows) {
      const key = r.account_id ?? "unassigned";
      const cur =
        m.get(key) ??
        { name: r.account_name ?? "Unassigned account", walletType: r.wallet_type, income: 0, expense: 0, net: 0, txns: 0, brands: new Map<string, number>() };
      cur.income += n(r.income);
      cur.expense += n(r.expense);
      cur.net += n(r.net);
      cur.txns += n(r.txn_count);
      const b = r.brand_name ?? "—";
      cur.brands.set(b, (cur.brands.get(b) ?? 0) + n(r.net));
      m.set(key, cur);
    }
    return [...m.values()].sort((a, b) => b.net - a.net);
  }, [rows]);

  const byDay = useMemo(() => {
    const m = new Map<string, { date: string; income: number; expense: number; net: number; txns: number; accounts: Map<string, number> }>();
    for (const r of rows) {
      const cur = m.get(r.txn_date) ?? { date: r.txn_date, income: 0, expense: 0, net: 0, txns: 0, accounts: new Map<string, number>() };
      cur.income += n(r.income);
      cur.expense += n(r.expense);
      cur.net += n(r.net);
      cur.txns += n(r.txn_count);
      const a = r.account_name ?? "Unassigned";
      cur.accounts.set(a, (cur.accounts.get(a) ?? 0) + n(r.net));
      m.set(r.txn_date, cur);
    }
    return [...m.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [rows]);

  const maxDayNet = Math.max(1, ...byDay.map((d) => Math.abs(d.net)));

  function exportCsv() {
    const lines: string[] = [];
    lines.push("Received summary");
    lines.push(`Range,${from} to ${to}`);
    lines.push("");
    lines.push("Per account");
    lines.push("Account,Wallet type,Received,Deduction,Net,Txns");
    for (const a of byAccount)
      lines.push([a.name, a.walletType ?? "", a.income.toFixed(2), a.expense.toFixed(2), a.net.toFixed(2), a.txns].join(","));
    lines.push("");
    lines.push("Per day");
    lines.push("Date,Received,Deduction,Net,Txns,Accounts");
    for (const d of byDay)
      lines.push(
        [
          d.date,
          d.income.toFixed(2),
          d.expense.toFixed(2),
          d.net.toFixed(2),
          d.txns,
          `"${[...d.accounts.entries()].map(([k, v]) => `${k}: ${v.toFixed(0)}`).join(" | ")}"`,
        ].join(","),
      );
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const el = document.createElement("a");
    el.href = url;
    el.download = `received-summary-${from}_${to}.csv`;
    el.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-3 py-2.5">
        <Banknote className="h-4 w-4 text-emerald-600" />
        <span className="text-sm font-semibold">Received breakdown</span>
        <span className="text-[11px] text-muted-foreground">
          {from} → {to} · reconciliation theke kon account e koto taka dhukeche
        </span>
        <div className="ml-auto flex items-center gap-2">
          {q.isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={exportCsv} disabled={!rows.length}>
            <Download className="h-3 w-3" /> CSV
          </Button>
        </div>
      </div>

      {q.isLoading ? (
        <div className="space-y-2 p-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded bg-muted" />
          ))}
        </div>
      ) : q.error ? (
        <div className="px-3 py-6 text-center text-xs text-destructive">{(q.error as Error).message}</div>
      ) : !rows.length ? (
        <div className="px-3 py-8 text-center text-xs text-muted-foreground">
          Ei range e apply kora kono reconciliation payout nei
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-px bg-border md:grid-cols-4">
            {[
              { label: "Total received", value: fmtBdt(totals.income), tone: "text-emerald-700", icon: TrendingUp },
              { label: "Courier deduction", value: fmtBdt(totals.expense), tone: "text-amber-700", icon: TrendingDown },
              { label: "Net in wallet", value: fmtBdt(totals.net), tone: "", icon: Wallet },
              { label: "Days / entries", value: `${byDay.length} din · ${totals.txns}`, tone: "text-muted-foreground", icon: Banknote },
            ].map((s) => (
              <div key={s.label} className="bg-background px-3 py-2.5">
                <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <s.icon className="h-3 w-3" /> {s.label}
                </div>
                <div className={cn("text-base font-semibold tabular-nums", s.tone)}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Per account */}
          <div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3">
            {byAccount.map((a) => (
              <div key={a.name} className="rounded-md border p-2.5">
                <div className="flex items-center gap-2">
                  <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="truncate text-xs font-medium">{a.name}</span>
                  {a.walletType && (
                    <Badge variant="secondary" className="ml-auto text-[10px]">
                      {a.walletType}
                    </Badge>
                  )}
                </div>
                <div className="mt-1.5 text-lg font-semibold tabular-nums text-emerald-700">{fmtBdt(a.net)}</div>
                <div className="text-[11px] tabular-nums text-muted-foreground">
                  in {fmtBdt(a.income)} · deduct {fmtBdt(a.expense)} · {a.txns} entry
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {[...a.brands.entries()]
                    .sort((x, y) => y[1] - x[1])
                    .map(([b, v]) => (
                      <Badge key={b} variant="outline" className="text-[10px] tabular-nums">
                        {b}: {fmtBdt(v)}
                      </Badge>
                    ))}
                </div>
              </div>
            ))}
          </div>

          {/* Per day */}
          <div className="max-h-[420px] overflow-auto border-t">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 text-right font-medium">Received</th>
                  <th className="px-3 py-2 text-right font-medium">Deduction</th>
                  <th className="px-3 py-2 text-right font-medium">Net</th>
                  <th className="hidden px-3 py-2 font-medium md:table-cell">Accounts</th>
                </tr>
              </thead>
              <tbody>
                {byDay.map((d) => (
                  <tr key={d.date} className="border-t transition-colors hover:bg-muted/40">
                    <td className="px-3 py-1.5 font-mono">{d.date}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-emerald-700">{fmtBdt(d.income)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-amber-700">
                      {d.expense ? `−${fmtBdt(d.expense)}` : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-right font-medium tabular-nums">{fmtBdt(d.net)}</td>
                    <td className="hidden px-3 py-1.5 md:table-cell">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-emerald-500"
                            style={{ width: `${Math.round((Math.abs(d.net) / maxDayNet) * 100)}%` }}
                          />
                        </div>
                        <span className="truncate text-[11px] text-muted-foreground">
                          {[...d.accounts.entries()].map(([k, v]) => `${k} ${fmtBdt(v)}`).join(" · ")}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 bg-muted/60 backdrop-blur">
                <tr className="border-t font-medium">
                  <td className="px-3 py-2">Total</td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{fmtBdt(totals.income)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-amber-700">−{fmtBdt(totals.expense)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtBdt(totals.net)}</td>
                  <td className="hidden md:table-cell" />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}