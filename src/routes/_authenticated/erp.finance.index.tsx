import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Wallet, Package, TrendingUp, TrendingDown, Banknote, Smartphone, Truck, Users,
  Receipt, AlertTriangle, FileText, ArrowRight, RotateCcw, Calendar, Building2,
  PiggyBank, Activity, ArrowDownRight, ArrowUpRight, Landmark, Plus, ArrowRightLeft, BookOpen,
} from "lucide-react";
import {
  AreaChart, Area, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, PieChart, Pie, Cell, Legend, Line, ComposedChart,
} from "recharts";
import { useBrand } from "@/contexts/brand-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fmtBdt } from "@/lib/erp/finance";
import { getFinanceOverview, type FinanceOverview } from "@/lib/erp/finance-overview.functions";
import { FinanceDrilldownSheet } from "@/components/erp/finance/finance-drilldown-sheet";
import { BdWalletsWidget } from "@/components/erp/finance/bd-wallets-widget";
import { DateRangePicker, buildPreset, type MktRangeValue } from "@/components/erp/marketing/date-range-picker";
import { useErpQuickActions } from "@/contexts/erp-quick-actions";
import { AccountForm } from "@/components/erp/finance/account-form";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/erp/finance/")({
  head: () => ({ meta: [{ title: "Finance Dashboard — ERP" }] }),
  component: OverviewPage,
});

const PROVIDER_LABEL: Record<string, string> = {
  pathao: "Pathao", steadfast: "SteadFast", redx: "RedX",
  paperfly: "Paperfly", ecourier: "eCourier", no_shipment: "No shipment", unknown: "Other",
};

const DONUT_COLORS = ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#06b6d4", "#8b5cf6", "#ef4444", "#84cc16"];
const CHART_TOOLTIP = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
  boxShadow: "0 8px 24px -12px rgb(0 0 0 / 0.18)",
} as const;

function OverviewPage() {
  const { activeBrand, brands, brandIds, isAllBrands } = useBrand();
  const [range, setRange] = useState<MktRangeValue>(() => buildPreset("this_month"));
  const { from, to } = range;

  const fetchOverview = useServerFn(getFinanceOverview);
  const { openTxn, openTransfer } = useErpQuickActions();
  const [addAccountOpen, setAddAccountOpen] = useState(false);

  const q = useQuery({
    queryKey: ["finance_overview", brandIds.join(","), from, to],
    enabled: brandIds.length > 0,
    queryFn: () => fetchOverview({ data: { brandIds, from, to } }),
  });

  const [drill, setDrill] = useState<null | {
    title: string;
    subtitle?: string;
    type?: "revenue" | "expense" | "income" | "all";
    accountIds?: string[];
  }>(null);

  if (brandIds.length === 0) {
    return <div className="p-6 text-muted-foreground">Loading brands…</div>;
  }

  const d = q.data;

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* ── Compact header ─────────────────────────────── */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="rounded-lg p-2 bg-primary/10 text-primary"><Landmark className="h-4 w-4" /></span>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight leading-tight">Finance & Accounting</h1>
            <div className="text-[11px] text-muted-foreground flex items-center gap-2 mt-0.5">
              <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" />{isAllBrands ? `All brands · ${brands.length}` : activeBrand?.name ?? "—"}</span>
              <span className="opacity-50">·</span>
              <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{from} → {to}</span>
            </div>
          </div>
        </div>
        <DateRangePicker value={range} onChange={setRange} />
      </header>

      {/* ── Quick actions — always one click away ─────── */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Button
          variant="outline"
          className="h-auto py-3 justify-start gap-2 border-emerald-500/40 hover:bg-emerald-500/10 hover:border-emerald-500/60"
          onClick={() => openTxn("income")}
        >
          <span className="rounded-md p-1.5 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"><ArrowDownRight className="size-4" /></span>
          <span className="text-left">
            <span className="block text-sm font-semibold">Add Income</span>
            <span className="block text-[10px] text-muted-foreground font-normal">Deposit / receipt</span>
          </span>
        </Button>
        <Button
          variant="outline"
          className="h-auto py-3 justify-start gap-2 border-rose-500/40 hover:bg-rose-500/10 hover:border-rose-500/60"
          onClick={() => openTxn("expense")}
        >
          <span className="rounded-md p-1.5 bg-rose-500/15 text-rose-600 dark:text-rose-400"><ArrowUpRight className="size-4" /></span>
          <span className="text-left">
            <span className="block text-sm font-semibold">Add Expense</span>
            <span className="block text-[10px] text-muted-foreground font-normal">Withdrawal / payment</span>
          </span>
        </Button>
        <Button
          variant="outline"
          className="h-auto py-3 justify-start gap-2 border-sky-500/40 hover:bg-sky-500/10 hover:border-sky-500/60"
          onClick={() => openTransfer()}
        >
          <span className="rounded-md p-1.5 bg-sky-500/15 text-sky-600 dark:text-sky-400"><ArrowRightLeft className="size-4" /></span>
          <span className="text-left">
            <span className="block text-sm font-semibold">Transfer</span>
            <span className="block text-[10px] text-muted-foreground font-normal">Between wallets</span>
          </span>
        </Button>
        <Button
          variant="outline"
          className="h-auto py-3 justify-start gap-2 border-sky-500/40 hover:bg-sky-500/10 hover:border-sky-500/60"
          asChild
        >
          <Link to="/erp/finance/accounts">
            <span className="rounded-md p-1.5 bg-sky-500/15 text-sky-600 dark:text-sky-400"><BookOpen className="size-4" /></span>
            <span className="text-left">
              <span className="block text-sm font-semibold">Manage Accounts</span>
              <span className="block text-[10px] text-muted-foreground font-normal">Add / edit wallets</span>
            </span>
          </Link>
        </Button>
      </section>

      {q.isLoading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 rounded-xl border bg-muted/30 animate-pulse" />
          ))}
        </div>
      )}
      {q.error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {(q.error as Error).message}
        </div>
      )}

      {d && (
        <>
          <CapitalStrip data={d} onDrill={setDrill} />
          <BdWalletsWidget />
          <PnlStrip data={d} onDrill={setDrill} />
          <MoneyMap data={d} />
          <TrendsRow data={d} />
          <QuickLinks />
          <RecentTxns data={d} />
        </>
      )}
      <FinanceDrilldownSheet
        open={!!drill}
        onOpenChange={(o) => { if (!o) setDrill(null); }}
        title={drill?.title ?? ""}
        subtitle={drill?.subtitle}
        brandIds={brandIds}
        from={from}
        to={to}
        type={drill?.type}
        accountIds={drill?.accountIds}
      />
      <AccountForm
        open={addAccountOpen}
        onClose={() => setAddAccountOpen(false)}
        brandId={isAllBrands ? null : activeBrand?.id ?? null}
        brands={brands}
      />
    </div>
  );
}

/* ---------------- Zone 1: Capital ---------------- */
function CapitalStrip({ data, onDrill }: {
  data: FinanceOverview;
  onDrill: (d: { title: string; subtitle?: string; type?: "revenue" | "expense" | "income" | "all"; accountIds?: string[] }) => void;
}) {
  const { capital } = data;
  const cashAccountIds = data.accounts
    .filter((a) => ["cash", "bank", "bkash", "nagad", "rocket", "mfs"].includes(a.type))
    .map((a) => a.id);
  return (
    <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <HeroKpi
        icon={<PiggyBank className="size-5" />}
        label="Total Capital"
        value={capital.total}
        tone="primary"
        hint="Liquid + Inventory + Receivables − Payables"
        onClick={() => onDrill({ title: "All transactions", type: "all" })}
      />
      <HeroKpi
        icon={<Wallet className="size-5" />}
        label="Liquid Cash"
        value={capital.liquid}
        tone="emerald"
        hint={`Cash ${fmtBdt(capital.breakdown.cash)} · Bank ${fmtBdt(capital.breakdown.bank)} · MFS ${fmtBdt(capital.breakdown.mfs)}`}
        onClick={() => onDrill({ title: "Liquid cash movements", subtitle: "Cash + Bank + MFS accounts", type: "all", accountIds: cashAccountIds })}
      />
      <HeroKpi
        icon={<Package className="size-5" />}
        label="Inventory Value"
        value={capital.inventory}
        tone="amber"
        hint={capital.productsMissingCost > 0 ? `${capital.productsMissingCost} product(s) missing cost` : "All stock costed"}
        warn={capital.productsMissingCost > 0}
      />
      <HeroKpi
        icon={capital.receivableNet >= 0 ? <ArrowDownRight className="size-5" /> : <ArrowUpRight className="size-5" />}
        label={capital.receivableNet >= 0 ? "Net Receivable" : "Net Payable"}
        value={Math.abs(capital.receivableNet)}
        tone={capital.receivableNet >= 0 ? "sky" : "rose"}
        hint={`COD ${fmtBdt(capital.breakdown.codReceivable)} + AR ${fmtBdt(capital.breakdown.arDue)} − Pay ${fmtBdt(capital.breakdown.supplierPayable + capital.breakdown.importsDue)}`}
      />
    </section>
  );
}

function HeroKpi({ icon, label, value, hint, tone, warn, onClick }: {
  icon: React.ReactNode; label: string; value: number; hint?: string;
  tone: "primary" | "emerald" | "amber" | "sky" | "rose"; warn?: boolean; onClick?: () => void;
}) {
  const TONES = {
    primary: { icon: "bg-primary/10 text-primary",                                         bar: "bg-primary" },
    emerald: { icon: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",           bar: "bg-emerald-500" },
    amber:   { icon: "bg-amber-500/10 text-amber-600 dark:text-amber-400",                 bar: "bg-amber-500" },
    sky:     { icon: "bg-sky-500/10 text-sky-600 dark:text-sky-400",                       bar: "bg-sky-500" },
    rose:    { icon: "bg-rose-500/10 text-rose-600 dark:text-rose-400",                    bar: "bg-rose-500" },
  }[tone];
  return (
    <Card
      className={cn(
        "relative overflow-hidden border-border/60 bg-card transition-all duration-200",
        onClick && "cursor-pointer hover:border-foreground/20 hover:shadow-sm",
      )}
    >
      <div className={cn("absolute left-0 top-0 h-full w-1", TONES.bar)} aria-hidden />
      <CardContent className="relative p-5 pl-6" onClick={onClick} role={onClick ? "button" : undefined}>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground truncate">{label}</span>
          <span className={cn("rounded-md p-1.5 shrink-0", TONES.icon)}>{icon}</span>
        </div>
        <div className="mt-3 text-[28px] leading-none font-bold tabular-nums tracking-tight text-foreground">
          {fmtBdt(value)}
        </div>
        {hint && (
          <div
            className={cn(
              "mt-3 text-[11px] truncate",
              warn ? "text-amber-600 dark:text-amber-400 flex items-center gap-1" : "text-muted-foreground",
            )}
            title={hint}
          >
            {warn && <AlertTriangle className="size-3 shrink-0" />}
            {hint}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------- Zone 2: P&L ---------------- */
function PnlStrip({ data, onDrill }: {
  data: FinanceOverview;
  onDrill: (d: { title: string; subtitle?: string; type?: "revenue" | "expense" | "income" | "all"; accountIds?: string[] }) => void;
}) {
  const { pnl } = data;
  const items: Array<{
    label: string; value: number; color: string; icon: React.ReactNode;
    drill?: { title: string; type?: "revenue" | "expense" | "income" | "all" };
  }> = [
    { label: "Revenue", value: pnl.revenue, color: "text-foreground", icon: <Banknote className="size-4" />, drill: { title: "Revenue (orders & income)", type: "income" } },
    { label: "COGS", value: pnl.cogs, color: "text-muted-foreground", icon: <Package className="size-4" /> },
    { label: "Gross", value: pnl.gross, color: "text-foreground", icon: <TrendingUp className="size-4" /> },
    { label: "Operating Exp.", value: pnl.expense, color: "text-rose-600 dark:text-rose-400", icon: <Receipt className="size-4" />, drill: { title: "Operating expenses", type: "expense" } },
    { label: "Refund Loss", value: pnl.refundLoss, color: "text-amber-600 dark:text-amber-400", icon: <RotateCcw className="size-4" /> },
  ];
  const positive = pnl.net >= 0;
  return (
    <Card className="overflow-hidden border-border/60">
      <CardContent className="p-0">
        <div className="grid grid-cols-1 md:grid-cols-12">
          <div
            className={cn(
              "relative md:col-span-4 p-5 border-r border-border/60 cursor-pointer transition overflow-hidden",
              positive ? "bg-emerald-500/5 hover:bg-emerald-500/10" : "bg-rose-500/5 hover:bg-rose-500/10",
            )}
            onClick={() => onDrill({ title: "Net profit — all transactions", type: "all" })}
            role="button"
          >
            <div className={cn("absolute left-0 top-0 h-full w-1", positive ? "bg-emerald-500" : "bg-rose-500")} aria-hidden />
            <div className="relative flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                <Activity className="size-3.5" /> Net Profit
              </div>
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px] font-semibold border-0",
                  positive ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-rose-500/10 text-rose-700 dark:text-rose-400",
                )}
              >
                {pnl.margin.toFixed(1)}% margin
              </Badge>
            </div>
            <div className={cn("relative mt-3 text-[32px] leading-none font-bold tabular-nums tracking-tight", positive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
              {positive ? "+" : ""}{fmtBdt(pnl.net)}
            </div>
            <div className="relative text-[11px] text-muted-foreground mt-1.5 flex items-center gap-2">
              <span>{data.range.from} → {data.range.to}</span>
              {pnl.otherIncome > 0 && <span>· Other income {fmtBdt(pnl.otherIncome)}</span>}
              {pnl.capitalOutflow > 0 && <span>· Capital out (stock/ads wallet) {fmtBdt(pnl.capitalOutflow)}</span>}
              {pnl.cogsMissingUnits > 0 && <span className="text-amber-600 dark:text-amber-400">· {pnl.cogsMissingUnits} units without cost</span>}
            </div>
            <div className="relative mt-3 h-16">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={pnl.dailySeries.map(d => ({ ...d, net: d.net }))}>
                  <defs>
                    <linearGradient id="netGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={positive ? "#10b981" : "#f43f5e"} stopOpacity={0.55}/>
                      <stop offset="100%" stopColor={positive ? "#10b981" : "#f43f5e"} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="net" stroke={positive ? "#10b981" : "#f43f5e"} fill="url(#netGrad)" strokeWidth={1.75} />
                  <Tooltip formatter={(v: number) => fmtBdt(v)} labelFormatter={(l) => `Day ${l}`} contentStyle={CHART_TOOLTIP} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="md:col-span-8 grid grid-cols-2 md:grid-cols-5 divide-x divide-border/60">
            {items.map((it) => (
              <div
                key={it.label}
                className={cn("relative p-5 group", it.drill && "cursor-pointer hover:bg-muted/40 transition")}
                onClick={it.drill ? () => onDrill(it.drill!) : undefined}
                role={it.drill ? "button" : undefined}
              >
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{it.icon}{it.label}</div>
                <div className={cn("mt-2.5 text-xl font-bold tabular-nums tracking-tight", it.color)}>{fmtBdt(it.value)}</div>
                {it.drill && (
                  <ArrowRight className="absolute right-3 top-3 size-3 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition" />
                )}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------------- Zone 3: Money Map ---------------- */
function MoneyMap({ data }: { data: FinanceOverview }) {
  return (
    <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <WhereMoneyIs data={data} />
      <MoneyComingIn data={data} />
      <MoneyGoingOut data={data} />
    </section>
  );
}

function WhereMoneyIs({ data }: { data: FinanceOverview }) {
  const grouped = useMemo(() => {
    const groups: Record<string, { name: string; balance: number; icon: React.ReactNode; items: typeof data.accounts }> = {
      cash: { name: "Cash", balance: 0, icon: <Banknote className="size-4" />, items: [] },
      bank: { name: "Bank", balance: 0, icon: <Building2 className="size-4" />, items: [] },
      mfs: { name: "Mobile Wallet", balance: 0, icon: <Smartphone className="size-4" />, items: [] },
      other: { name: "Other", balance: 0, icon: <Wallet className="size-4" />, items: [] },
    };
    for (const a of data.accounts) {
      const key = a.type === "cash" ? "cash" : a.type === "bank" ? "bank" : ["bkash","nagad","rocket","mfs"].includes(a.type) ? "mfs" : "other";
      groups[key].balance += a.balance;
      groups[key].items.push(a);
    }
    return groups;
  }, [data.accounts]);

  return (
    <Card className="border-border/60 overflow-hidden">
      <div className="h-1 bg-sky-500" aria-hidden />
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <span className="rounded-md p-1 bg-sky-500/10 text-sky-600 dark:text-sky-400"><Wallet className="size-3.5" /></span>
          Where my money is
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {Object.entries(grouped).filter(([,g]) => g.items.length > 0).map(([k, g]) => (
          <div key={k}>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 font-medium">{g.icon}{g.name}</span>
              <span className="tabular-nums font-bold">{fmtBdt(g.balance)}</span>
            </div>
            <div className="mt-1 space-y-0.5 pl-5">
              {g.items.slice(0, 5).map(a => (
                <div key={a.id} className="flex justify-between text-[11px] text-muted-foreground">
                  <span className="truncate">{a.name}</span>
                  <span className="tabular-nums">{fmtBdt(a.balance)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
        {data.inventoryByBrand.length > 0 && (
          <div className="pt-2 border-t border-border/60">
            <div className="text-sm font-medium flex items-center gap-1.5 mb-1"><Package className="size-4" /> Inventory by brand</div>
            {data.inventoryByBrand.slice(0, 6).map(b => (
              <div key={b.brand_id} className="flex justify-between text-[11px]">
                <span className="truncate text-muted-foreground">{b.brand} · {b.units} units</span>
                <span className="tabular-nums">{fmtBdt(b.value)}</span>
              </div>
            ))}
          </div>
        )}
        <Link to="/erp/finance/accounts" className="text-[11px] font-medium text-primary inline-flex items-center gap-1 pt-1 hover:gap-2 transition-all">View all accounts <ArrowRight className="size-3" /></Link>
      </CardContent>
    </Card>
  );
}

function MoneyComingIn({ data }: { data: FinanceOverview }) {
  const { receivables, capital, pnl } = data;
  return (
    <Card className="border-border/60 overflow-hidden">
      <div className="h-1 bg-emerald-500" aria-hidden />
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
          <span className="rounded-md p-1 bg-emerald-500/10"><ArrowDownRight className="size-3.5" /></span>
          Money coming in
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Section title="COD from courier" total={capital.breakdown.codReceivable} icon={<Truck className="size-4" />}>
          {receivables.codByCourier.length === 0
            ? <Empty>No shipped orders</Empty>
            : receivables.codByCourier.map(c => (
              <Row key={c.provider} label={`${PROVIDER_LABEL[c.provider] ?? c.provider} · ${c.orders}`} value={c.amount} />
            ))}
        </Section>
        {receivables.arTop.length > 0 && (
          <Section title="AR — top customers" total={capital.breakdown.arDue} icon={<Users className="size-4" />}>
            {receivables.arTop.map(c => (
              <Row key={c.phone ?? c.name} label={`${c.name} · ${c.orders}`} value={c.amount} sub={c.phone ?? undefined} />
            ))}
          </Section>
        )}
        {receivables.importsAdvanceTop.length > 0 && (
          <Section title="Imports advance" total={capital.breakdown.importsAdvance} icon={<Package className="size-4" />}>
            {receivables.importsAdvanceTop.map(p => (
              <Row key={p.po} label={`${p.po} · ${p.supplier}`} value={p.amount} />
            ))}
          </Section>
        )}
        {pnl.otherIncome > 0 && (
          <div className="flex justify-between text-sm pt-2 border-t border-border/60">
            <span className="text-muted-foreground">Other income (range)</span>
            <span className="tabular-nums font-medium">{fmtBdt(pnl.otherIncome)}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MoneyGoingOut({ data }: { data: FinanceOverview }) {
  const { payables, capital } = data;
  return (
    <Card className="border-border/60 overflow-hidden">
      <div className="h-1 bg-rose-500" aria-hidden />
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 text-rose-700 dark:text-rose-400">
          <span className="rounded-md p-1 bg-rose-500/10"><ArrowUpRight className="size-3.5" /></span>
          Money going out
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Section title="Supplier payable" total={capital.breakdown.supplierPayable} icon={<Receipt className="size-4" />}
          rightBadge={payables.overdueBills > 0 ? <Badge variant="destructive" className="text-[10px]">{fmtBdt(payables.overdueBills)} overdue</Badge> : undefined}>
          {payables.supplierTop.length === 0
            ? <Empty>No open bills</Empty>
            : payables.supplierTop.map(s => <Row key={s.name} label={s.name} value={s.due} />)}
        </Section>
        {payables.importsDueTop.length > 0 && (
          <Section title="Imports due" total={capital.breakdown.importsDue} icon={<Package className="size-4" />}>
            {payables.importsDueTop.map(p => (
              <Row key={p.po} label={`${p.po} · ${p.supplier}`} value={p.due} sub={p.status} />
            ))}
          </Section>
        )}
        {payables.upcomingRecurring.length > 0 && (
          <Section title="Upcoming recurring (30d)" total={payables.upcomingRecurring.reduce((s, r) => s + r.amount, 0)} icon={<Calendar className="size-4" />}>
            {payables.upcomingRecurring.slice(0, 6).map(r => (
              <Row key={r.id} label={r.name} value={r.amount} sub={new Date(r.next_run).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} />
            ))}
          </Section>
        )}
        {payables.topExpenseCats.length > 0 && (
          <Section title="Top expense categories" icon={<Activity className="size-4" />}>
            {payables.topExpenseCats.map(c => <Row key={c.name} label={c.name} value={c.amount} />)}
          </Section>
        )}
      </CardContent>
    </Card>
  );
}

function Section({ title, total, icon, children, rightBadge }: {
  title: string; total?: number; icon?: React.ReactNode; children: React.ReactNode; rightBadge?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg bg-muted/30 p-2.5">
      <div className="flex items-center justify-between text-sm font-medium">
        <span className="flex items-center gap-1.5">{icon}{title}</span>
        <span className="flex items-center gap-2">
          {rightBadge}
          {total != null && <span className="tabular-nums font-bold">{fmtBdt(total)}</span>}
        </span>
      </div>
      <div className="mt-1.5 space-y-0.5 pl-5">{children}</div>
    </div>
  );
}
function Row({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="flex justify-between text-xs gap-2">
      <span className="truncate text-muted-foreground">
        {label}{sub && <span className="opacity-70"> · {sub}</span>}
      </span>
      <span className="tabular-nums shrink-0">{fmtBdt(value)}</span>
    </div>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-xs text-muted-foreground italic">{children}</div>;
}

/* ---------------- Zone 4: Trends ---------------- */
function TrendsRow({ data }: { data: FinanceOverview }) {
  const monthly = data.monthlySeries.map(m => ({
    month: m.month.slice(5),
    Revenue: m.revenue, Expense: m.expense, Net: m.net,
  }));
  const donut = data.payables.topExpenseCats.map(c => ({ name: c.name, value: c.amount }));

  return (
    <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="lg:col-span-2 border-border/60 overflow-hidden">
        <div className="h-1 bg-primary" aria-hidden />
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <span className="rounded-md p-1 bg-primary/10 text-primary"><TrendingUp className="size-3.5" /></span>
            12 months · Revenue vs Expense vs Net
          </CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={monthly} margin={{ left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
              <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" tickFormatter={(v) => v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`} />
              <Tooltip formatter={(v: number) => fmtBdt(v)} contentStyle={CHART_TOOLTIP} />
              <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
              <Bar dataKey="Revenue" fill="#6366f1" radius={[6,6,0,0]} maxBarSize={28} />
              <Bar dataKey="Expense" fill="#f43f5e" radius={[6,6,0,0]} maxBarSize={28} />
              <Line type="monotone" dataKey="Net" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3, fill: "#10b981", strokeWidth: 0 }} activeDot={{ r: 5 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <Card className="border-border/60 overflow-hidden">
        <div className="h-1 bg-violet-500" aria-hidden />
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <span className="rounded-md p-1 bg-violet-500/10 text-violet-600 dark:text-violet-400"><Receipt className="size-3.5" /></span>
            Expense breakdown
          </CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          {donut.length === 0 ? <div className="text-sm text-muted-foreground text-center pt-12">No expenses in range</div> : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={donut} dataKey="value" nameKey="name" innerRadius={48} outerRadius={84} paddingAngle={3} stroke="var(--card)" strokeWidth={2}>
                  {donut.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => fmtBdt(v)} contentStyle={CHART_TOOLTIP} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

/* ---------------- Quick Links ---------------- */
function QuickLinks() {
  const links: { to: string; label: string; icon: React.ReactNode; tone: string }[] = [
    { to: "/erp/finance/accounts", label: "Accounts", icon: <Wallet className="size-4" />, tone: "bg-muted text-foreground/70" },
    { to: "/erp/finance/receivables", label: "Receivables", icon: <ArrowDownRight className="size-4" />, tone: "bg-muted text-foreground/70" },
    { to: "/erp/finance/journal", label: "Journal", icon: <FileText className="size-4" />, tone: "bg-muted text-foreground/70" },
    { to: "/erp/finance/dollar-purchase", label: "Dollar Purchase", icon: <ArrowUpRight className="size-4" />, tone: "bg-muted text-foreground/70" },
    { to: "/erp/finance/reports", label: "Reports", icon: <Activity className="size-4" />, tone: "bg-muted text-foreground/70" },
    { to: "/erp/finance/budgets", label: "Budgets", icon: <TrendingUp className="size-4" />, tone: "bg-muted text-foreground/70" },
    { to: "/erp/finance/taxes", label: "Taxes", icon: <TrendingDown className="size-4" />, tone: "bg-muted text-foreground/70" },
  ];
  return (
    <section className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-2">
      {links.map(l => (
        <Link
          key={l.to}
          to={l.to}
          className="group rounded-xl border border-border/60 bg-card hover:bg-muted/40 hover:-translate-y-0.5 hover:shadow-sm transition-all px-3 py-2.5 text-xs flex items-center gap-2"
        >
          <span className={cn("rounded-md p-1.5 transition group-hover:scale-110", l.tone)}>{l.icon}</span>
          <span className="font-medium truncate">{l.label}</span>
        </Link>
      ))}
    </section>
  );
}

/* ---------------- Recent Transactions ---------------- */
function RecentTxns({ data }: { data: FinanceOverview }) {
  if (data.recentTxns.length === 0) return null;
  return (
    <Card className="border-border/60 overflow-hidden">
      <div className="h-1 bg-slate-500" aria-hidden />
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm flex items-center gap-2">
          <span className="rounded-md p-1 bg-slate-500/10 text-slate-600 dark:text-slate-300"><Activity className="size-3.5" /></span>
          Recent transactions
        </CardTitle>
        <Link to="/erp/finance/journal" className="text-[11px] font-medium text-primary inline-flex items-center gap-1 hover:gap-2 transition-all">View journal <ArrowRight className="size-3" /></Link>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border/60">
          {data.recentTxns.map(t => (
            <div key={t.id} className="group relative flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/40 transition">
              <span
                className={cn(
                  "absolute left-0 top-0 h-full w-0.5",
                  t.type === "income" ? "bg-emerald-500" : t.type === "expense" ? "bg-rose-500" : "bg-slate-400",
                )}
                aria-hidden
              />
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px] capitalize border-0 font-semibold",
                  t.type === "income" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                  t.type === "expense" && "bg-rose-500/10 text-rose-700 dark:text-rose-400",
                  t.type !== "income" && t.type !== "expense" && "bg-muted text-muted-foreground",
                )}
              >
                {t.type}
              </Badge>
              <div className="flex-1 min-w-0">
                <div className="truncate font-medium">{t.description || <span className="text-muted-foreground font-normal">—</span>}</div>
                <div className="text-[11px] text-muted-foreground">
                  {t.date}{t.account && ` · ${t.account}`}{t.category && ` · ${t.category}`}
                </div>
              </div>
              <div className={cn(
                "tabular-nums font-bold",
                t.type === "income" && "text-emerald-600 dark:text-emerald-400",
                t.type === "expense" && "text-rose-600 dark:text-rose-400",
              )}>
                {t.type === "expense" ? "-" : t.type === "income" ? "+" : ""}{fmtBdt(t.amount)}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
