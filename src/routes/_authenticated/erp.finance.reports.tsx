import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer, FileSpreadsheet, Target, Wallet, Scale, TrendingUp } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useBrandPicker } from "@/components/erp/brand-picker-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { fmtBdt } from "@/lib/erp/finance";
import { getCashflowStatement, getFinanceOverview, type CashflowStatement, type FinanceOverview } from "@/lib/erp/finance-overview.functions";
import { exportAoaXlsx } from "@/lib/erp/utils/excel";

export const Route = createFileRoute("/_authenticated/erp/finance/reports")({
  head: () => ({ meta: [{ title: "Financial Reports — ERP" }] }),
  component: ReportsPage,
});

function ReportsPage() {
  const { brandId, effectiveBrand, picker } = useBrandPicker();
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const [fromRaw, setFrom] = useState(monthStart);
  const [toRaw, setTo] = useState(today);
  // Auto-swap if user picked from > to so queries still return data.
  const [from, to] = fromRaw > toRaw ? [toRaw, fromRaw] : [fromRaw, toRaw];

  return (
    <div className="p-4 md:p-6 space-y-4">
      <header className="flex flex-wrap justify-between items-end gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Financial Reports</h1>
          <p className="text-sm text-muted-foreground">
            {effectiveBrand?.name} ·{" "}
            <a href="/erp/reports?tab=finance" className="underline underline-offset-2">
              New canonical P&amp;L in Reports Hub
            </a>
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-end">
          {picker}
          <div><Label className="text-xs">From</Label><Input type="date" value={fromRaw} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><Label className="text-xs">To / As of</Label><Input type="date" value={toRaw} onChange={(e) => setTo(e.target.value)} /></div>
          <Button variant="outline" size="icon" onClick={() => window.print()}><Printer className="h-4 w-4" /></Button>
        </div>
      </header>

      <div className="flex flex-wrap gap-2 print:hidden">
        <Button asChild variant="outline" size="sm"><Link to="/erp/finance/accounts"><Wallet className="h-3.5 w-3.5 mr-1.5" />Accounts &amp; Wallets</Link></Button>
        <Button asChild variant="outline" size="sm"><Link to="/erp/finance/budgets"><Target className="h-3.5 w-3.5 mr-1.5" />Budgets</Link></Button>
        <Button asChild variant="outline" size="sm"><Link to="/erp/finance/taxes"><Scale className="h-3.5 w-3.5 mr-1.5" />Taxes</Link></Button>
        <Button asChild variant="outline" size="sm"><Link to="/erp/finance/product-profitability"><TrendingUp className="h-3.5 w-3.5 mr-1.5" />Profitability</Link></Button>
      </div>

      <Tabs defaultValue="pl">
        <TabsList className="print:hidden">
          <TabsTrigger value="pl">P&amp;L</TabsTrigger>
          <TabsTrigger value="bs">Balance Sheet</TabsTrigger>
          <TabsTrigger value="cf">Cash Flow</TabsTrigger>
          <TabsTrigger value="bva">Budget vs Actual</TabsTrigger>
          <TabsTrigger value="tb">Trial Balance</TabsTrigger>
          <TabsTrigger value="gl">General Ledger</TabsTrigger>
        </TabsList>
        <TabsContent value="pl" className="mt-3"><PLReport brandId={brandId} from={from} to={to} /></TabsContent>
        <TabsContent value="bs" className="mt-3"><BalanceSheetReport brandId={brandId} asOf={to} /></TabsContent>
        <TabsContent value="cf" className="mt-3"><CashflowReport brandId={brandId} from={from} to={to} /></TabsContent>
        <TabsContent value="bva" className="mt-3"><BudgetVsActualReport brandId={brandId} asOf={to} /></TabsContent>
        <TabsContent value="tb" className="mt-3"><TrialBalanceReport brandId={brandId} asOf={to} /></TabsContent>
        <TabsContent value="gl" className="mt-3"><GeneralLedgerReport brandId={brandId} from={from} to={to} /></TabsContent>
      </Tabs>
    </div>
  );
}

type PL = {
  income_accounts: Array<{ code: string; name: string; amount: number }>;
  expense_accounts: Array<{ code: string; name: string; amount: number }>;
  total_income: number;
  total_expense: number;
  net_profit: number;
  capital_outflow: number;
  cogs_missing_units: number;
};

/** Canonical P&L — same source as the Finance Overview dashboard:
 *  delivered revenue, canonical COGS, capital outflows excluded from opex. */
function toPL(o: FinanceOverview): PL {
  const { pnl, payables } = o;
  const income_accounts = [{ code: "4000", name: "Sales Revenue (delivered)", amount: pnl.revenue }];
  if (pnl.otherIncome) income_accounts.push({ code: "4100", name: "Other Income", amount: pnl.otherIncome });

  const expense_accounts: PL["expense_accounts"] = [];
  if (pnl.cogs) expense_accounts.push({ code: "5000", name: "Cost of Goods Sold", amount: pnl.cogs });
  payables.expenseCats.forEach((c, i) =>
    expense_accounts.push({ code: `6${String(i + 1).padStart(3, "0")}`, name: c.name, amount: c.amount }),
  );
  if (pnl.refundLoss) expense_accounts.push({ code: "6900", name: "Refund / return loss", amount: pnl.refundLoss });

  return {
    income_accounts,
    expense_accounts,
    total_income: income_accounts.reduce((s, r) => s + r.amount, 0),
    total_expense: expense_accounts.reduce((s, r) => s + r.amount, 0),
    net_profit: pnl.net,
    capital_outflow: pnl.capitalOutflow,
    cogs_missing_units: pnl.cogsMissingUnits,
  };
}

function PLReport({ brandId, from, to }: { brandId: string; from: string; to: string }) {
  const fetchOverview = useServerFn(getFinanceOverview);
  const [mode, setMode] = useState<"single" | "compare">("single");
  // Default Period B = previous period of same length
  const defaultB = (() => {
    const f = new Date(from);
    const t = new Date(to);
    const ms = t.getTime() - f.getTime();
    const bTo = new Date(f.getTime() - 86400000);
    const bFrom = new Date(bTo.getTime() - ms);
    return { from: bFrom.toISOString().slice(0, 10), to: bTo.toISOString().slice(0, 10) };
  })();
  const [bFrom, setBFrom] = useState(defaultB.from);
  const [bTo, setBTo] = useState(defaultB.to);

  const q = useQuery({
    queryKey: ["pl_canonical", brandId, from, to],
    enabled: !!brandId,
    queryFn: async () => toPL(await fetchOverview({ data: { brandIds: [brandId], from, to } })),
  });
  const qB = useQuery({
    queryKey: ["pl_canonical", brandId, bFrom, bTo],
    enabled: mode === "compare" && !!brandId,
    queryFn: async () => toPL(await fetchOverview({ data: { brandIds: [brandId], from: bFrom, to: bTo } })),
  });

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Calculating…</p>;
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  if (!q.data) return null;
  const d = q.data;


  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>Profit &amp; Loss · {from} → {to}</CardTitle>
          <Tabs value={mode} onValueChange={(v) => setMode(v as "single" | "compare")} className="print:hidden">
            <TabsList>
              <TabsTrigger value="single">Single</TabsTrigger>
              <TabsTrigger value="compare">Comparative</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        {mode === "compare" && (
          <div className="flex flex-wrap gap-2 items-end print:hidden border rounded-md p-2 bg-muted/30">
            <span className="text-xs font-medium text-muted-foreground self-center">Compare against (Period B):</span>
            <div><Label className="text-xs">From</Label><Input type="date" value={bFrom} onChange={(e) => setBFrom(e.target.value)} className="h-8" /></div>
            <div><Label className="text-xs">To</Label><Input type="date" value={bTo} onChange={(e) => setBTo(e.target.value)} className="h-8" /></div>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {mode === "single" ? (
          <>
            <Section title="Income" rows={d.income_accounts} total={d.total_income} totalLabel="Total Income" color="text-emerald-600" />
            <Section title="Expenses" rows={d.expense_accounts} total={d.total_expense} totalLabel="Total Expense" color="text-red-600" />
            <div className="flex justify-between items-center mt-4 pt-3 border-t-2 border-foreground">
              <span className="text-lg font-bold">Net Profit</span>
              <span className={`text-2xl font-bold font-mono ${d.net_profit >= 0 ? "text-emerald-600" : "text-red-600"}`}>{fmtBdt(d.net_profit)}</span>
            </div>
            {(d.capital_outflow > 0 || d.cogs_missing_units > 0) && (
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {d.capital_outflow > 0 && (
                  <Badge variant="outline" className="font-normal">
                    Capital out {fmtBdt(d.capital_outflow)} · stock purchase &amp; ad-wallet top-ups (not an expense)
                  </Badge>
                )}
                {d.cogs_missing_units > 0 && (
                  <Badge variant="outline" className="font-normal text-amber-600 border-amber-500/40">
                    {d.cogs_missing_units} units without cost — COGS understated
                  </Badge>
                )}
              </div>
            )}
          </>

        ) : qB.isLoading || !qB.data ? (
          <p className="text-sm text-muted-foreground">Loading Period B…</p>
        ) : (
          <ComparativePL a={d} b={qB.data} aLabel={`${from} → ${to}`} bLabel={`${bFrom} → ${bTo}`} />
        )}
      </CardContent>
    </Card>
  );
}

function ComparativePL({
  a, b, aLabel, bLabel,
}: {
  a: { income_accounts: Array<{ code: string; name: string; amount: number }>; expense_accounts: Array<{ code: string; name: string; amount: number }>; total_income: number; total_expense: number; net_profit: number };
  b: { income_accounts: Array<{ code: string; name: string; amount: number }>; expense_accounts: Array<{ code: string; name: string; amount: number }>; total_income: number; total_expense: number; net_profit: number };
  aLabel: string; bLabel: string;
}) {
  const merge = (la: Array<{ code: string; name: string; amount: number }>, lb: Array<{ code: string; name: string; amount: number }>) => {
    const map = new Map<string, { code: string; name: string; a: number; b: number }>();
    for (const r of la) map.set(r.code, { code: r.code, name: r.name, a: Number(r.amount || 0), b: 0 });
    for (const r of lb) {
      const ex = map.get(r.code);
      if (ex) ex.b = Number(r.amount || 0);
      else map.set(r.code, { code: r.code, name: r.name, a: 0, b: Number(r.amount || 0) });
    }
    return Array.from(map.values()).sort((x, y) => x.code.localeCompare(y.code));
  };
  const income = merge(a.income_accounts, b.income_accounts);
  const expense = merge(a.expense_accounts, b.expense_accounts);

  return (
    <div className="space-y-6">
      <CompareSection title="Income" rows={income} aTotal={a.total_income} bTotal={b.total_income} totalLabel="Total Income" positiveGood aLabel={aLabel} bLabel={bLabel} />
      <CompareSection title="Expenses" rows={expense} aTotal={a.total_expense} bTotal={b.total_expense} totalLabel="Total Expense" positiveGood={false} aLabel={aLabel} bLabel={bLabel} />
      <div className="grid grid-cols-[1fr,140px,140px,140px,80px] gap-2 items-center pt-3 mt-2 border-t-2 border-foreground font-bold text-lg">
        <span>Net Profit</span>
        <span className={`text-right font-mono ${a.net_profit >= 0 ? "text-emerald-600" : "text-red-600"}`}>{fmtBdt(a.net_profit)}</span>
        <span className={`text-right font-mono ${b.net_profit >= 0 ? "text-emerald-600" : "text-red-600"}`}>{fmtBdt(b.net_profit)}</span>
        <VarianceCell a={a.net_profit} b={b.net_profit} positiveGood />
        <PctCell a={a.net_profit} b={b.net_profit} positiveGood />
      </div>
    </div>
  );
}

function CompareSection({
  title, rows, aTotal, bTotal, totalLabel, positiveGood, aLabel, bLabel,
}: {
  title: string;
  rows: Array<{ code: string; name: string; a: number; b: number }>;
  aTotal: number; bTotal: number; totalLabel: string; positiveGood: boolean;
  aLabel: string; bLabel: string;
}) {
  return (
    <div>
      <h3 className="font-semibold mb-2">{title}</h3>
      <div className="grid grid-cols-[1fr,140px,140px,140px,80px] gap-2 text-xs uppercase tracking-wider text-muted-foreground border-b pb-1 mb-1">
        <span>Account</span>
        <span className="text-right">{aLabel}</span>
        <span className="text-right">{bLabel}</span>
        <span className="text-right">Variance</span>
        <span className="text-right">%</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground pl-2 py-2">No activity.</p>
      ) : rows.map((r) => (
        <div key={r.code} className="grid grid-cols-[1fr,140px,140px,140px,80px] gap-2 text-sm py-0.5">
          <span><span className="text-muted-foreground font-mono text-xs mr-2">{r.code}</span>{r.name}</span>
          <span className="text-right font-mono">{fmtBdt(r.a)}</span>
          <span className="text-right font-mono">{fmtBdt(r.b)}</span>
          <VarianceCell a={r.a} b={r.b} positiveGood={positiveGood} />
          <PctCell a={r.a} b={r.b} positiveGood={positiveGood} />
        </div>
      ))}
      <div className="grid grid-cols-[1fr,140px,140px,140px,80px] gap-2 pt-2 mt-2 border-t font-semibold">
        <span>{totalLabel}</span>
        <span className="text-right font-mono">{fmtBdt(aTotal)}</span>
        <span className="text-right font-mono">{fmtBdt(bTotal)}</span>
        <VarianceCell a={aTotal} b={bTotal} positiveGood={positiveGood} />
        <PctCell a={aTotal} b={bTotal} positiveGood={positiveGood} />
      </div>
    </div>
  );
}

function VarianceCell({ a, b, positiveGood }: { a: number; b: number; positiveGood: boolean }) {
  const diff = a - b;
  const good = positiveGood ? diff >= 0 : diff <= 0;
  const color = Math.abs(diff) < 0.01 ? "text-muted-foreground" : good ? "text-emerald-600" : "text-red-600";
  return <span className={`text-right font-mono ${color}`}>{diff >= 0 ? "+" : ""}{fmtBdt(diff)}</span>;
}

function PctCell({ a, b, positiveGood }: { a: number; b: number; positiveGood: boolean }) {
  if (Math.abs(b) < 0.01) return <span className="text-right font-mono text-muted-foreground">—</span>;
  const pct = ((a - b) / Math.abs(b)) * 100;
  const good = positiveGood ? pct >= 0 : pct <= 0;
  const color = Math.abs(pct) < 0.1 ? "text-muted-foreground" : good ? "text-emerald-600" : "text-red-600";
  return <span className={`text-right font-mono text-xs ${color}`}>{pct >= 0 ? "+" : ""}{pct.toFixed(1)}%</span>;
}

/* ---------------- Budget vs Actual ---------------- */
function BudgetVsActualReport({ brandId, asOf }: { brandId: string; asOf: string }) {
  // Use the month of asOf
  const monthDate = asOf.slice(0, 7) + "-01";
  const monthEnd = new Date(new Date(monthDate).getFullYear(), new Date(monthDate).getMonth() + 1, 0).toISOString().slice(0, 10);

  const budgetsQ = useQuery({
    queryKey: ["bva_budgets", brandId, monthDate],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase.from("erp_budgets" as never)
        .select("account_id, amount").eq("brand_id", brandId).eq("month", monthDate);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{ account_id: string; amount: number }>;
    },
  });

  const coaQ = useQuery({
    queryKey: ["bva_coa", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase.from("erp_chart_accounts")
        .select("id, code, name, account_type").eq("brand_id", brandId)
        .eq("is_archived", false).in("account_type", ["expense", "income"]).order("code");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; code: string; name: string; account_type: string }>;
    },
  });

  const actualsQ = useQuery({
    queryKey: ["bva_actuals", brandId, monthDate, monthEnd],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase.from("erp_journal_lines")
        .select("account_id, debit, credit, erp_journal_entries!inner(brand_id, entry_date, status)")
        .eq("brand_id", brandId)
        .gte("erp_journal_entries.entry_date", monthDate)
        .lte("erp_journal_entries.entry_date", monthEnd)
        .eq("erp_journal_entries.status", "posted")
        .limit(10000);
      if (error) throw error;
      const map = new Map<string, number>();
      (data ?? []).forEach((l) => {
        map.set(l.account_id, (map.get(l.account_id) ?? 0) + Number(l.debit) - Number(l.credit));
      });
      return map;
    },
  });

  const loading = budgetsQ.isLoading || coaQ.isLoading || actualsQ.isLoading;

  const rows = (() => {
    if (!coaQ.data || !budgetsQ.data || !actualsQ.data) return [];
    const bmap = new Map(budgetsQ.data.map((b) => [b.account_id, Number(b.amount)]));
    const amap = actualsQ.data;
    return coaQ.data
      .map((a) => {
        const budget = bmap.get(a.id) ?? 0;
        const rawActual = amap.get(a.id) ?? 0;
        const actual = a.account_type === "income" ? -rawActual : rawActual;
        const variance = budget - actual;
        const pct = budget > 0 ? (actual / budget) * 100 : 0;
        return { ...a, budget, actual, variance, pct };
      })
      .filter((r) => r.budget !== 0 || r.actual !== 0);
  })();

  const totalBudget = rows.reduce((s, r) => s + r.budget, 0);
  const totalActual = rows.reduce((s, r) => s + r.actual, 0);
  const overCount = rows.filter((r) => r.budget > 0 && r.actual > r.budget).length;

  const handleExport = () => {
    const aoa: (string | number)[][] = [
      [`Budget vs Actual · ${monthDate} → ${monthEnd}`],
      [],
      ["Code", "Account", "Type", "Budget", "Actual", "Variance", "Used %", "Status"],
      ...rows.map((r) => [
        r.code, r.name, r.account_type, r.budget, r.actual, r.variance,
        r.budget > 0 ? Math.round(r.pct) : 0,
        r.budget > 0 && r.actual > r.budget ? "Over" : r.pct > 80 ? "Near Limit" : "On Track",
      ]),
      [],
      ["TOTAL", "", "", totalBudget, totalActual, totalBudget - totalActual, "", ""],
    ];
    exportAoaXlsx(aoa, "Budget vs Actual", `budget_vs_actual_${monthDate}.xlsx`);
  };

  if (loading) return <p className="text-sm text-muted-foreground">Calculating…</p>;

  if (!budgetsQ.data || budgetsQ.data.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 flex flex-col items-center text-center gap-3">
          <Target className="h-10 w-10 text-muted-foreground" />
          <h3 className="font-semibold">No budgets set for {monthDate.slice(0, 7)}</h3>
          <p className="text-sm text-muted-foreground max-w-md">Set monthly budgets per account to track spending against plan.</p>
          <Button asChild size="sm"><Link to="/erp/finance/budgets">Set Budgets</Link></Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Budget vs Actual · {monthDate.slice(0, 7)}</CardTitle>
        <Button variant="outline" size="sm" onClick={handleExport} className="print:hidden">
          <FileSpreadsheet className="h-4 w-4 mr-1" /> Export Excel
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryTile label="Total Budget" value={fmtBdt(totalBudget)} />
          <SummaryTile label="Total Actual" value={fmtBdt(totalActual)} />
          <SummaryTile label="Variance" value={fmtBdt(totalBudget - totalActual)} accent={totalBudget - totalActual >= 0 ? "text-emerald-600" : "text-red-600"} />
          <SummaryTile label="Over Budget" value={`${overCount} account${overCount === 1 ? "" : "s"}`} accent={overCount > 0 ? "text-red-600" : "text-emerald-600"} />
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Account</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Budget</TableHead>
              <TableHead className="text-right">Actual</TableHead>
              <TableHead className="w-[200px]">Used</TableHead>
              <TableHead className="text-right">Variance</TableHead>
              <TableHead>Status</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">No activity</TableCell></TableRow>
              ) : rows.map((r) => {
                const over = r.budget > 0 && r.actual > r.budget;
                const near = !over && r.pct > 80;
                return (
                  <TableRow key={r.id}>
                    <TableCell><span className="text-muted-foreground font-mono text-xs mr-2">{r.code}</span>{r.name}</TableCell>
                    <TableCell className="text-xs uppercase tracking-wider text-muted-foreground">{r.account_type}</TableCell>
                    <TableCell className="text-right font-mono">{fmtBdt(r.budget)}</TableCell>
                    <TableCell className="text-right font-mono">{fmtBdt(r.actual)}</TableCell>
                    <TableCell>
                      {r.budget > 0 ? (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div className={`h-full ${over ? "bg-red-500" : near ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, r.pct)}%` }} />
                          </div>
                          <span className={`text-xs font-mono ${over ? "text-red-600 font-semibold" : ""}`}>{Math.round(r.pct)}%</span>
                        </div>
                      ) : <span className="text-xs text-muted-foreground">No budget</span>}
                    </TableCell>
                    <TableCell className={`text-right font-mono ${r.variance < 0 ? "text-red-600" : "text-emerald-600"}`}>
                      {r.budget > 0 ? fmtBdt(r.variance) : "—"}
                    </TableCell>
                    <TableCell>
                      {r.budget === 0 ? (
                        <Badge variant="outline">No budget</Badge>
                      ) : over ? (
                        <Badge variant="destructive">Over</Badge>
                      ) : near ? (
                        <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">Near limit</Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">On track</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryTile({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-lg font-bold font-mono mt-1 ${accent ?? ""}`}>{value}</div>
    </div>
  );
}

function Section({ title, rows, total, totalLabel, color }: { title: string; rows: Array<{ code: string; name: string; amount: number }>; total: number; totalLabel: string; color: string }) {
  return (
    <div className="mb-4">
      <h3 className="font-semibold mb-2">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground pl-4">No activity.</p>
      ) : (
        <div className="space-y-1 pl-4">
          {rows.map((r) => (
            <div key={r.code} className="flex justify-between text-sm">
              <span><span className="text-muted-foreground font-mono text-xs mr-2">{r.code}</span>{r.name}</span>
              <span className="font-mono">{fmtBdt(r.amount)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="flex justify-between pt-2 mt-2 border-t font-semibold">
        <span>{totalLabel}</span>
        <span className={`font-mono ${color}`}>{fmtBdt(total)}</span>
      </div>
    </div>
  );
}

function BalanceSheetReport({ brandId, asOf }: { brandId: string; asOf: string }) {
  const q = useQuery({
    queryKey: ["bs", brandId, asOf],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_balance_sheet", { _brand_id: brandId, _as_of: asOf });
      if (error) throw error;
      return data as { assets: Array<{ code: string; name: string; amount: number }>; liabilities: Array<{ code: string; name: string; amount: number }>; equity: Array<{ code: string; name: string; amount: number }>; total_assets: number; total_liabilities: number; total_equity: number; retained_earnings: number; balanced: boolean };
    },
  });
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Calculating…</p>;
  if (!q.data) return null;
  const d = q.data;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Balance Sheet · as of {asOf}
          <Badge variant={d.balanced ? "default" : "destructive"}>{d.balanced ? "Balanced" : "Out of balance"}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <Section title="Assets" rows={d.assets} total={d.total_assets} totalLabel="Total Assets" color="text-blue-600" />
        </div>
        <div>
          <Section title="Liabilities" rows={d.liabilities} total={d.total_liabilities} totalLabel="Total Liabilities" color="text-orange-600" />
          <Section title="Equity (incl. retained earnings)" rows={d.equity} total={d.total_equity} totalLabel="Total Equity" color="text-purple-600" />
          <div className="flex justify-between pt-2 mt-2 border-t-2 border-foreground font-bold">
            <span>Liabilities + Equity</span>
            <span className="font-mono">{fmtBdt(d.total_liabilities + d.total_equity)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TrialBalanceReport({ brandId, asOf }: { brandId: string; asOf: string }) {
  const q = useQuery({
    queryKey: ["tb", brandId, asOf],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_trial_balance", { _brand_id: brandId, _as_of: asOf });
      if (error) throw error;
      return (data ?? []) as Array<{ account_id: string; code: string; name: string; account_type: string; normal_balance: string; total_debit: number; total_credit: number; balance: number }>;
    },
  });
  const rows = q.data ?? [];
  const td = rows.reduce((s, r) => s + Number(r.total_debit || 0), 0);
  const tc = rows.reduce((s, r) => s + Number(r.total_credit || 0), 0);
  return (
    <Card>
      <CardHeader><CardTitle>Trial Balance · as of {asOf}</CardTitle></CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Code</TableHead><TableHead>Account</TableHead><TableHead>Type</TableHead>
              <TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead>
              <TableHead className="text-right">Balance</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {q.isLoading && <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Loading…</TableCell></TableRow>}
              {!q.isLoading && rows.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No data</TableCell></TableRow>}
              {rows.map((r) => (
                <TableRow key={r.account_id}>
                  <TableCell className="font-mono text-xs">{r.code}</TableCell>
                  <TableCell>{r.name}</TableCell>
                  <TableCell className="text-xs uppercase tracking-wider text-muted-foreground">{r.account_type}</TableCell>
                  <TableCell className="text-right font-mono">{fmtBdt(r.total_debit)}</TableCell>
                  <TableCell className="text-right font-mono">{fmtBdt(r.total_credit)}</TableCell>
                  <TableCell className="text-right font-mono font-semibold">{fmtBdt(r.balance)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="flex justify-end gap-6 mt-3 text-sm">
          <span>Total Debit: <span className="font-mono font-bold">{fmtBdt(td)}</span></span>
          <span>Total Credit: <span className="font-mono font-bold">{fmtBdt(tc)}</span></span>
          <span className={Math.abs(td - tc) < 0.01 ? "text-emerald-600 font-bold" : "text-red-600 font-bold"}>
            {Math.abs(td - tc) < 0.01 ? "✓ Books balanced" : `Diff: ${fmtBdt(Math.abs(td - tc))}`}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function GeneralLedgerReport({ brandId, from, to }: { brandId: string; from: string; to: string }) {
  const [accountId, setAccountId] = useState<string>("");
  const coaQ = useQuery({
    queryKey: ["coa_simple", brandId],
    queryFn: async () => {
      const { data, error } = await supabase.from("erp_chart_accounts").select("id, code, name")
        .eq("brand_id", brandId).eq("is_archived", false).order("code");
      if (error) throw error;
      return data ?? [];
    },
  });
  const glQ = useQuery({
    queryKey: ["gl", brandId, accountId, from, to],
    enabled: !!accountId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_general_ledger", { _brand_id: brandId, _account_id: accountId, _from: from, _to: to });
      if (error) throw error;
      return (data ?? []) as Array<{ entry_date: string; entry_no: string; description: string | null; debit: number; credit: number; running_balance: number }>;
    },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-3">
          <span>General Ledger</span>
          <div className="min-w-[280px]">
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger className="h-8"><SelectValue placeholder="Choose account…" /></SelectTrigger>
              <SelectContent>
                {(coaQ.data ?? []).map((a) => <SelectItem key={a.id} value={a.id}>{a.code} · {a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!accountId ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Choose an account to view ledger.</p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Date</TableHead><TableHead>Entry No</TableHead><TableHead>Description</TableHead>
                <TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {glQ.isLoading && <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Loading…</TableCell></TableRow>}
                {!glQ.isLoading && (glQ.data ?? []).length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No entries in this range</TableCell></TableRow>}
                {(glQ.data ?? []).map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs whitespace-nowrap">{r.entry_date}</TableCell>
                    <TableCell className="font-mono text-xs">{r.entry_no}</TableCell>
                    <TableCell className="text-sm">{r.description ?? ""}</TableCell>
                    <TableCell className="text-right font-mono">{r.debit ? fmtBdt(r.debit) : ""}</TableCell>
                    <TableCell className="text-right font-mono">{r.credit ? fmtBdt(r.credit) : ""}</TableCell>
                    <TableCell className="text-right font-mono font-semibold">{fmtBdt(r.running_balance)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------- Cash Flow Statement ---------------- */
function CashflowReport({ brandId, from, to }: { brandId: string; from: string; to: string }) {
  const fetcher = useServerFn(getCashflowStatement);
  const q = useQuery({
    queryKey: ["cashflow", brandId, from, to],
    enabled: !!brandId,
    queryFn: () => fetcher({ data: { brandId, from, to } }),
  });

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Calculating…</p>;
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  if (!q.data) return null;

  const d: CashflowStatement = q.data;

  const handleExport = () => {
    const aoa: (string | number)[][] = [
      [`Cash Flow Statement · ${from} → ${to}`],
      [],
      ["OPERATING ACTIVITIES"],
      ["Net Profit", d.operating.netProfit],
      ...d.operating.adjustments.map((l) => [l.name, l.amount] as (string | number)[]),
      ...d.operating.workingCapital.map((l) => [l.name, l.amount] as (string | number)[]),
      ["Net Cash from Operating Activities", d.operating.total],
      [],
      ["INVESTING ACTIVITIES"],
      ...d.investing.lines.map((l) => [l.name, l.amount] as (string | number)[]),
      ["Net Cash from Investing Activities", d.investing.total],
      [],
      ["FINANCING ACTIVITIES"],
      ...d.financing.lines.map((l) => [l.name, l.amount] as (string | number)[]),
      ["Net Cash from Financing Activities", d.financing.total],
      [],
      ["SUMMARY"],
      ["Opening Cash Balance", d.openingCash],
      ["Net Change in Cash", d.netChange],
      ["Closing Cash Balance (computed)", d.closingCash],
      ["Wallet Balance (actual)", d.walletBalance],
    ];
    exportAoaXlsx(aoa, "Cash Flow", `cashflow_${from}_${to}.xlsx`);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          Cash Flow Statement · {from} → {to}
          <Badge variant={d.balanced ? "default" : "secondary"}>
            {d.balanced ? "Reconciled with ledger" : "Approximate (indirect)"}
          </Badge>
        </CardTitle>
        <Button variant="outline" size="sm" onClick={handleExport} className="print:hidden">
          <FileSpreadsheet className="h-4 w-4 mr-1" /> Export Excel
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        <CashflowSection
          title="Operating Activities"
          color="text-emerald-600"
          rows={[
            { name: "Net Profit", amount: d.operating.netProfit, emphasis: true },
            ...d.operating.adjustments,
            ...d.operating.workingCapital,
          ]}
          total={d.operating.total}
          totalLabel="Net Cash from Operating Activities"
        />
        <CashflowSection
          title="Investing Activities"
          color="text-sky-600"
          rows={d.investing.lines}
          total={d.investing.total}
          totalLabel="Net Cash from Investing Activities"
          empty="No investing activity in this period."
        />
        <CashflowSection
          title="Financing Activities"
          color="text-purple-600"
          rows={d.financing.lines}
          total={d.financing.total}
          totalLabel="Net Cash from Financing Activities"
          empty="No financing activity in this period."
        />

        <div className="pt-4 border-t-2 border-foreground space-y-2">
          <SummaryRow label="Opening Cash Balance" value={d.openingCash} />
          <SummaryRow label="+ Net Cash from Operating" value={d.operating.total} />
          <SummaryRow label="+ Net Cash from Investing" value={d.investing.total} />
          <SummaryRow label="+ Net Cash from Financing" value={d.financing.total} />
          <div className="flex justify-between items-center pt-2 mt-2 border-t font-bold text-lg">
            <span>Closing Cash Balance</span>
            <span className={`font-mono ${d.closingCash >= 0 ? "text-emerald-600" : "text-red-600"}`}>{fmtBdt(d.closingCash)}</span>
          </div>
          {Math.abs(d.walletBalance - d.closingCash) > 1 && (
            <p className="text-xs text-muted-foreground pt-1">
              Current wallet balance: <span className="font-mono">{fmtBdt(d.walletBalance)}</span>
              {" · "}Difference: <span className="font-mono">{fmtBdt(d.walletBalance - d.closingCash)}</span>
              {" "}(may indicate non-cash entries or pre-existing balances outside the journal).
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function CashflowSection({ title, color, rows, total, totalLabel, empty }: {
  title: string; color: string;
  rows: Array<{ name: string; amount: number; emphasis?: boolean }>;
  total: number; totalLabel: string; empty?: string;
}) {
  return (
    <div>
      <h3 className={`font-semibold mb-2 ${color}`}>{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground pl-4 italic">{empty ?? "No activity."}</p>
      ) : (
        <div className="space-y-1 pl-4">
          {rows.map((r, i) => (
            <div key={i} className="flex justify-between text-sm">
              <span className={r.emphasis ? "font-medium" : ""}>{r.name}</span>
              <span className={`font-mono ${r.amount < 0 ? "text-red-600" : ""}`}>
                {r.amount < 0 ? `(${fmtBdt(Math.abs(r.amount))})` : fmtBdt(r.amount)}
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="flex justify-between pt-2 mt-2 border-t font-semibold">
        <span>{totalLabel}</span>
        <span className={`font-mono ${total < 0 ? "text-red-600" : color}`}>
          {total < 0 ? `(${fmtBdt(Math.abs(total))})` : fmtBdt(total)}
        </span>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono ${value < 0 ? "text-red-600" : ""}`}>
        {value < 0 ? `(${fmtBdt(Math.abs(value))})` : fmtBdt(value)}
      </span>
    </div>
  );
}