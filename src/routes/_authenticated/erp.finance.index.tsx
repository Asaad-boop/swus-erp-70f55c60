import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Wallet, Package, TrendingUp, TrendingDown, Banknote, Smartphone, Truck, Users,
  Receipt, AlertTriangle, FileText, ArrowRight, RotateCcw, Calendar, Building2,
  PiggyBank, Activity, ArrowDownRight, ArrowUpRight, Landmark, ArrowRightLeft, BookOpen,
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
  borderRadius: 10,
  fontSize: 12,
  boxShadow: "0 12px 32px -16px rgb(0 0 0 / 0.35)",
} as const;

type DrillArg = {
  title: string;
  subtitle?: string;
  type?: "revenue" | "expense" | "income" | "all";
  accountIds?: string[];
};

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

  const [drill, setDrill] = useState<null | DrillArg>(null);

  if (brandIds.length === 0) {
    return <div className="p-6 text-muted-foreground">Loading brands…</div>;
  }

  const d = q.data;

  return (
    <div className="pb-10">
      {/* ── Sticky command bar ───────────────────────────── */}
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
        <div className="px-4 md:px-6 py-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3 min-w-0 mr-auto">
            <span className="grid place-items-center size-9 rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
              <Landmark className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h1 className="text-[15px] font-semibold tracking-tight leading-tight">Finance &amp; Accounting</h1>
              <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                <Building2 className="h-3 w-3 shrink-0" />
                <span className="truncate">{isAllBrands ? `All brands · ${brands.length}` : activeBrand?.name ?? "—"}</span>
                <span className="opacity-40">·</span>
                <Calendar className="h-3 w-3 shrink-0" />
                <span className="tabular-nums">{from} → {to}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <DateRangePicker value={range} onChange={setRange} />
            <span className="hidden md:block h-6 w-px bg-border mx-1" aria-hidden />
            <ActionChip tone="emerald" icon={<ArrowDownRight className="size-3.5" />} label="Income" onClick={() => openTxn("income")} />
            <ActionChip tone="rose" icon={<ArrowUpRight className="size-3.5" />} label="Expense" onClick={() => openTxn("expense")} />
            <ActionChip tone="sky" icon={<ArrowRightLeft className="size-3.5" />} label="Transfer" onClick={() => openTransfer()} />
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" asChild>
              <Link to="/erp/finance/accounts"><BookOpen className="size-3.5" /> Accounts</Link>
            </Button>
          </div>
        </div>
      </header>

      <div className="px-4 md:px-6 pt-4 space-y-4">
        {q.isLoading && (
          <div className="space-y-4">
            <div className="h-56 rounded-2xl border bg-muted/30 animate-pulse" />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-24 rounded-xl border bg-muted/30 animate-pulse" />
              ))}
            </div>
          </div>
        )}
        {q.error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {(q.error as Error).message}
          </div>
        )}

        {d && (
          <>
            {/* nav pills sit right under the command bar */}
            <QuickLinks />

            {/* headline P&L + capital */}
            <ProfitHero data={d} onDrill={setDrill} />
            <CapitalStrip data={d} onDrill={setDrill} />

            {/* trends (8) + expense donut (4) */}
            <TrendsRow data={d} />

            {/* three money panels */}
            <MoneyMap data={d} />

            {/* ledger feed (8) + ad wallets (4) */}
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
              <div className="lg:col-span-8 min-w-0">
                <RecentTxns data={d} />
              </div>
              <div className="lg:col-span-4 min-w-0">
                <BdWalletsWidget />
              </div>
            </section>
          </>
        )}

      </div>

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

function ActionChip({ icon, label, tone, onClick }: {
  icon: React.ReactNode; label: string; tone: "emerald" | "rose" | "sky"; onClick: () => void;
}) {
  const TONES = {
    emerald: "border-emerald-500/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/50",
    rose: "border-rose-500/30 text-rose-700 dark:text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/50",
    sky: "border-sky-500/30 text-sky-700 dark:text-sky-400 hover:bg-sky-500/10 hover:border-sky-500/50",
  }[tone];
  return (
    <Button variant="outline" size="sm" onClick={onClick} className={cn("h-8 gap-1.5 text-xs font-semibold", TONES)}>
      {icon}{label}
    </Button>
  );
}

/* ---------------- Zone 1: Profit hero (P&L waterfall) ---------------- */
function ProfitHero({ data, onDrill }: { data: FinanceOverview; onDrill: (d: DrillArg) => void }) {
  const { pnl } = data;
  const positive = pnl.net >= 0;

  const legs = useMemo(() => {
    const base = Math.max(pnl.revenue, 1);
    const pct = (v: number) => Math.min(100, Math.max(0, (Math.abs(v) / base) * 100));
    return [
      { key: "cogs", label: "COGS", value: pnl.cogs, pct: pct(pnl.cogs), bar: "bg-amber-500", text: "text-amber-600 dark:text-amber-400", icon: <Package className="size-3.5" /> },
      { key: "opex", label: "Operating", value: pnl.expense, pct: pct(pnl.expense), bar: "bg-rose-500", text: "text-rose-600 dark:text-rose-400", icon: <Receipt className="size-3.5" />, drill: { title: "Operating expenses", type: "expense" as const } },
      { key: "refund", label: "Refund loss", value: pnl.refundLoss, pct: pct(pnl.refundLoss), bar: "bg-violet-500", text: "text-violet-600 dark:text-violet-400", icon: <RotateCcw className="size-3.5" /> },
      { key: "net", label: "Net profit", value: pnl.net, pct: pct(pnl.net), bar: positive ? "bg-emerald-500" : "bg-rose-600", text: positive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400", icon: <Activity className="size-3.5" /> },
    ];
  }, [pnl, positive]);

  return (
    <Card className="overflow-hidden border-border/60 p-0">
      <CardContent className="p-0 grid grid-cols-1 lg:grid-cols-12">
        {/* Net profit panel */}
        <div
          className={cn(
            "relative lg:col-span-4 p-5 cursor-pointer transition overflow-hidden border-b lg:border-b-0 lg:border-r border-border/60",
            positive
              ? "bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent hover:from-emerald-500/15"
              : "bg-gradient-to-br from-rose-500/10 via-rose-500/5 to-transparent hover:from-rose-500/15",
          )}
          onClick={() => onDrill({ title: "Net profit — all transactions", type: "all" })}
          role="button"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-[0.14em] font-semibold text-muted-foreground">Net profit</span>
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] font-semibold border-0 tabular-nums",
                positive ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-rose-500/15 text-rose-700 dark:text-rose-400",
              )}
            >
              {pnl.margin.toFixed(1)}% margin
            </Badge>
          </div>

          <div className={cn(
            "mt-3 text-[38px] leading-none font-bold tabular-nums tracking-tighter",
            positive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
          )}>
            {positive ? "+" : ""}{fmtBdt(pnl.net)}
          </div>

          <div className="mt-1.5 text-[11px] text-muted-foreground tabular-nums">
            Revenue {fmtBdt(pnl.revenue)} · {data.range.from} → {data.range.to}
          </div>

          <div className="mt-3 h-16 -mx-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={pnl.dailySeries}>
                <defs>
                  <linearGradient id="netGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={positive ? "#10b981" : "#f43f5e"} stopOpacity={0.5} />
                    <stop offset="100%" stopColor={positive ? "#10b981" : "#f43f5e"} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="net" stroke={positive ? "#10b981" : "#f43f5e"} fill="url(#netGrad)" strokeWidth={1.75} />
                <Tooltip formatter={(v: number) => fmtBdt(v)} labelFormatter={(l) => `${l}`} contentStyle={CHART_TOOLTIP} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {(pnl.otherIncome > 0 || pnl.capitalOutflow > 0 || pnl.cogsMissingUnits > 0) && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {pnl.otherIncome > 0 && <Chip>Other income {fmtBdt(pnl.otherIncome)}</Chip>}
              {pnl.capitalOutflow > 0 && <Chip title="Stock purchase & ad-wallet top-ups — asset, not expense">Capital out {fmtBdt(pnl.capitalOutflow)}</Chip>}
              {pnl.cogsMissingUnits > 0 && <Chip warn>{pnl.cogsMissingUnits} units without cost</Chip>}
            </div>
          )}
        </div>

        {/* Waterfall */}
        <div className="lg:col-span-8 p-5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-[0.14em] font-semibold text-muted-foreground">Where revenue went</span>
            <span className="text-[11px] text-muted-foreground tabular-nums">Base · {fmtBdt(pnl.revenue)} revenue</span>
          </div>

          {/* stacked composition bar */}
          <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
            {legs.map((l) => (
              <div key={l.key} className={cn(l.bar, "h-full")} style={{ width: `${l.pct}%` }} title={`${l.label} · ${fmtBdt(l.value)}`} />
            ))}
          </div>

          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            {legs.map((l) => (
              <div
                key={l.key}
                className={cn(
                  "group rounded-xl border border-border/60 bg-muted/20 p-3 transition",
                  l.drill && "cursor-pointer hover:bg-muted/50 hover:border-foreground/15",
                )}
                onClick={l.drill ? () => onDrill(l.drill!) : undefined}
                role={l.drill ? "button" : undefined}
              >
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                  <span className={l.text}>{l.icon}</span>{l.label}
                </div>
                <div className={cn("mt-2 text-lg font-bold tabular-nums tracking-tight", l.text)}>{fmtBdt(l.value)}</div>
                <div className="mt-2 h-1 w-full rounded-full bg-muted overflow-hidden">
                  <div className={cn(l.bar, "h-full rounded-full")} style={{ width: `${l.pct}%` }} />
                </div>
                <div className="mt-1 text-[10px] text-muted-foreground tabular-nums">{l.pct.toFixed(1)}% of revenue</div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <TrendingUp className="size-3.5 text-emerald-500" /> Gross <span className="font-semibold text-foreground tabular-nums">{fmtBdt(pnl.gross)}</span>
            </span>
            <button
              className="inline-flex items-center gap-1.5 hover:text-foreground transition"
              onClick={() => onDrill({ title: "Revenue (orders & income)", type: "income" })}
            >
              <Banknote className="size-3.5" /> Revenue detail <ArrowRight className="size-3" />
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Chip({ children, warn, title }: { children: React.ReactNode; warn?: boolean; title?: string }) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium tabular-nums border",
        warn
          ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
          : "border-border/70 bg-muted/50 text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

/* ---------------- Zone 2: Capital ---------------- */
function CapitalStrip({ data, onDrill }: { data: FinanceOverview; onDrill: (d: DrillArg) => void }) {
  const { capital } = data;
  const cashAccountIds = data.accounts
    .filter((a) => ["cash", "bank", "bkash", "nagad", "rocket", "mfs"].includes(a.type))
    .map((a) => a.id);
  return (
    <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <HeroKpi
        icon={<PiggyBank className="size-4" />}
        label="Total Capital"
        value={capital.total}
        tone="primary"
        hint="Liquid + Inventory + Receivables − Payables"
        onClick={() => onDrill({ title: "All transactions", type: "all" })}
      />
      <HeroKpi
        icon={<Wallet className="size-4" />}
        label="Liquid Cash"
        value={capital.liquid}
        tone="emerald"
        hint={`Cash ${fmtBdt(capital.breakdown.cash)} · Bank ${fmtBdt(capital.breakdown.bank)} · MFS ${fmtBdt(capital.breakdown.mfs)}`}
        onClick={() => onDrill({ title: "Liquid cash movements", subtitle: "Cash + Bank + MFS accounts", type: "all", accountIds: cashAccountIds })}
      />
      <HeroKpi
        icon={<Package className="size-4" />}
        label="Inventory Value"
        value={capital.inventory}
        tone="amber"
        hint={capital.productsMissingCost > 0 ? `${capital.productsMissingCost} product(s) missing cost` : "All stock costed"}
        warn={capital.productsMissingCost > 0}
      />
      <HeroKpi
        icon={capital.receivableNet >= 0 ? <ArrowDownRight className="size-4" /> : <ArrowUpRight className="size-4" />}
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
    primary: { icon: "bg-primary/10 text-primary ring-primary/20", glow: "from-primary/10" },
    emerald: { icon: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20", glow: "from-emerald-500/10" },
    amber: { icon: "bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-500/20", glow: "from-amber-500/10" },
    sky: { icon: "bg-sky-500/10 text-sky-600 dark:text-sky-400 ring-sky-500/20", glow: "from-sky-500/10" },
    rose: { icon: "bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-rose-500/20", glow: "from-rose-500/10" },
  }[tone];
  return (
    <Card
      className={cn(
        "relative overflow-hidden border-border/60 bg-card p-0 transition-all duration-200",
        onClick && "cursor-pointer hover:border-foreground/20 hover:shadow-md hover:-translate-y-0.5",
      )}
    >
      <div className={cn("pointer-events-none absolute -right-8 -top-10 size-28 rounded-full bg-gradient-to-b to-transparent blur-2xl", TONES.glow)} aria-hidden />
      <CardContent className="relative p-4" onClick={onClick} role={onClick ? "button" : undefined}>
        <div className="flex items-center gap-2">
          <span className={cn("grid place-items-center size-7 rounded-lg ring-1 shrink-0", TONES.icon)}>{icon}</span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground truncate">{label}</span>
        </div>
        <div className="mt-3 text-[26px] leading-none font-bold tabular-nums tracking-tighter text-foreground">
          {fmtBdt(value)}
        </div>
        {hint && (
          <div
            className={cn(
              "mt-2.5 text-[10.5px] truncate",
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

/* ---------------- Zone 3: Money Map ---------------- */
function MoneyMap({ data }: { data: FinanceOverview }) {
  return (
    <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">

      <WhereMoneyIs data={data} />
      <MoneyComingIn data={data} />
      <MoneyGoingOut data={data} />
    </section>
  );
}

function PanelHeader({ icon, title, tone, action }: {
  icon: React.ReactNode; title: string; tone: "sky" | "emerald" | "rose" | "primary" | "violet" | "slate"; action?: React.ReactNode;
}) {
  const TONES = {
    sky: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    primary: "bg-primary/10 text-primary",
    violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    slate: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
  }[tone];
  return (
    <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0 border-b border-border/50">
      <CardTitle className="text-[13px] font-semibold flex items-center gap-2">
        <span className={cn("grid place-items-center size-6 rounded-md", TONES)}>{icon}</span>
        {title}
      </CardTitle>
      {action}
    </CardHeader>
  );
}

function WhereMoneyIs({ data }: { data: FinanceOverview }) {
  const grouped = useMemo(() => {
    const groups: Record<string, { name: string; balance: number; icon: React.ReactNode; items: typeof data.accounts }> = {
      cash: { name: "Cash", balance: 0, icon: <Banknote className="size-3.5" />, items: [] },
      bank: { name: "Bank", balance: 0, icon: <Building2 className="size-3.5" />, items: [] },
      mfs: { name: "Mobile Wallet", balance: 0, icon: <Smartphone className="size-3.5" />, items: [] },
      other: { name: "Other", balance: 0, icon: <Wallet className="size-3.5" />, items: [] },
    };
    for (const a of data.accounts) {
      const key = a.type === "cash" ? "cash" : a.type === "bank" ? "bank" : ["bkash", "nagad", "rocket", "mfs"].includes(a.type) ? "mfs" : "other";
      groups[key].balance += a.balance;
      groups[key].items.push(a);
    }
    return groups;
  }, [data.accounts]);

  const liquid = Math.max(data.capital.liquid, 1);

  return (
    <Card className="border-border/60 overflow-hidden p-0">
      <PanelHeader
        icon={<Wallet className="size-3.5" />}
        title="Where my money is"
        tone="sky"
        action={
          <Link to="/erp/finance/accounts" className="text-[11px] font-medium text-primary inline-flex items-center gap-1 hover:gap-2 transition-all">
            All <ArrowRight className="size-3" />
          </Link>
        }
      />
      <CardContent className="p-4 space-y-3">
        {Object.entries(grouped).filter(([, g]) => g.items.length > 0).map(([k, g]) => (
          <div key={k} className="rounded-lg border border-border/50 bg-muted/20 p-2.5">
            <div className="flex items-center justify-between text-[13px]">
              <span className="flex items-center gap-1.5 font-medium">{g.icon}{g.name}</span>
              <span className="tabular-nums font-bold">{fmtBdt(g.balance)}</span>
            </div>
            <div className="mt-1.5 h-1 w-full rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-sky-500" style={{ width: `${Math.min(100, Math.max(0, (g.balance / liquid) * 100))}%` }} />
            </div>
            <div className="mt-1.5 space-y-0.5">
              {g.items.slice(0, 5).map(a => (
                <div key={a.id} className="flex justify-between text-[11px] text-muted-foreground">
                  <span className="truncate">{a.name}</span>
                  <span className="tabular-nums">{fmtBdt(a.balance)}</span>
                </div>
              ))}
              {g.items.length > 5 && <div className="text-[10px] text-muted-foreground/70">+{g.items.length - 5} more</div>}
            </div>
          </div>
        ))}
        {data.inventoryByBrand.length > 0 && (
          <div className="pt-2 border-t border-border/60">
            <div className="text-[13px] font-medium flex items-center gap-1.5 mb-1"><Package className="size-3.5" /> Inventory by brand</div>
            {data.inventoryByBrand.slice(0, 6).map(b => (
              <div key={b.brand_id} className="flex justify-between text-[11px]">
                <span className="truncate text-muted-foreground">{b.brand} · {b.units} units</span>
                <span className="tabular-nums">{fmtBdt(b.value)}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MoneyComingIn({ data }: { data: FinanceOverview }) {
  const { receivables, capital, pnl } = data;
  return (
    <Card className="border-border/60 overflow-hidden p-0">
      <PanelHeader icon={<ArrowDownRight className="size-3.5" />} title="Money coming in" tone="emerald" />
      <CardContent className="p-4 space-y-3">
        <Section title="COD from courier" total={capital.breakdown.codReceivable} icon={<Truck className="size-3.5" />}>
          {receivables.codByCourier.length === 0
            ? <Empty>No shipped orders</Empty>
            : receivables.codByCourier.map(c => (
              <Row key={c.provider} label={`${PROVIDER_LABEL[c.provider] ?? c.provider} · ${c.orders}`} value={c.amount} />
            ))}
        </Section>
        {receivables.arTop.length > 0 && (
          <Section title="AR — top customers" total={capital.breakdown.arDue} icon={<Users className="size-3.5" />}>
            {receivables.arTop.map(c => (
              <Row key={c.phone ?? c.name} label={`${c.name} · ${c.orders}`} value={c.amount} sub={c.phone ?? undefined} />
            ))}
          </Section>
        )}
        {receivables.importsAdvanceTop.length > 0 && (
          <Section title="Imports advance" total={capital.breakdown.importsAdvance} icon={<Package className="size-3.5" />}>
            {receivables.importsAdvanceTop.map(p => (
              <Row key={p.po} label={`${p.po} · ${p.supplier}`} value={p.amount} />
            ))}
          </Section>
        )}
        {pnl.otherIncome > 0 && (
          <div className="flex justify-between text-[13px] pt-2 border-t border-border/60">
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
    <Card className="border-border/60 overflow-hidden p-0">
      <PanelHeader icon={<ArrowUpRight className="size-3.5" />} title="Money going out" tone="rose" />
      <CardContent className="p-4 space-y-3">
        <Section
          title="Supplier payable"
          total={capital.breakdown.supplierPayable}
          icon={<Receipt className="size-3.5" />}
          rightBadge={payables.overdueBills > 0 ? <Badge variant="destructive" className="text-[10px]">{fmtBdt(payables.overdueBills)} overdue</Badge> : undefined}
        >
          {payables.supplierTop.length === 0
            ? <Empty>No open bills</Empty>
            : payables.supplierTop.map(s => <Row key={s.name} label={s.name} value={s.due} />)}
        </Section>
        {payables.importsDueTop.length > 0 && (
          <Section title="Imports due" total={capital.breakdown.importsDue} icon={<Package className="size-3.5" />}>
            {payables.importsDueTop.map(p => (
              <Row key={p.po} label={`${p.po} · ${p.supplier}`} value={p.due} sub={p.status} />
            ))}
          </Section>
        )}
        {payables.upcomingRecurring.length > 0 && (
          <Section title="Upcoming recurring (30d)" total={payables.upcomingRecurring.reduce((s, r) => s + r.amount, 0)} icon={<Calendar className="size-3.5" />}>
            {payables.upcomingRecurring.slice(0, 6).map(r => (
              <Row key={r.id} label={r.name} value={r.amount} sub={new Date(r.next_run).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} />
            ))}
          </Section>
        )}
        {payables.topExpenseCats.length > 0 && (
          <Section title="Top expense categories" icon={<Activity className="size-3.5" />}>
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
    <div className="rounded-lg border border-border/50 bg-muted/20 p-2.5">
      <div className="flex items-center justify-between text-[13px] font-medium">
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
    <div className="flex justify-between text-[11.5px] gap-2">
      <span className="truncate text-muted-foreground">
        {label}{sub && <span className="opacity-70"> · {sub}</span>}
      </span>
      <span className="tabular-nums shrink-0">{fmtBdt(value)}</span>
    </div>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-[11.5px] text-muted-foreground italic">{children}</div>;
}

/* ---------------- Zone 4: Trends ---------------- */
function TrendsRow({ data }: { data: FinanceOverview }) {
  const monthly = data.monthlySeries.map(m => ({
    month: m.month.slice(5),
    Revenue: m.revenue, Expense: m.expense, Net: m.net,
  }));
  const donut = data.payables.topExpenseCats.map(c => ({ name: c.name, value: c.amount }));
  const donutTotal = donut.reduce((s, x) => s + x.value, 0);

  return (
    <section className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
      <Card className="lg:col-span-8 min-w-0 border-border/60 overflow-hidden p-0">

        <PanelHeader icon={<TrendingUp className="size-3.5" />} title="12 months · Revenue vs Expense vs Net" tone="primary" />
        <CardContent className="h-72 p-4">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={monthly} margin={{ left: -10, top: 6 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" tickLine={false} axisLine={false} tickFormatter={(v) => v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`} />
              <Tooltip formatter={(v: number) => fmtBdt(v)} contentStyle={CHART_TOOLTIP} cursor={{ fill: "var(--muted)", opacity: 0.35 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
              <Bar dataKey="Revenue" fill="#6366f1" radius={[6, 6, 0, 0]} maxBarSize={26} />
              <Bar dataKey="Expense" fill="#f43f5e" radius={[6, 6, 0, 0]} maxBarSize={26} />
              <Line type="monotone" dataKey="Net" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3, fill: "#10b981", strokeWidth: 0 }} activeDot={{ r: 5 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="lg:col-span-4 min-w-0 border-border/60 overflow-hidden p-0">

        <PanelHeader icon={<Receipt className="size-3.5" />} title="Expense breakdown" tone="violet" />
        <CardContent className="p-4">
          {donut.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-16">No expenses in range</div>
          ) : (
            <>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={donut} dataKey="value" nameKey="name" innerRadius={44} outerRadius={70} paddingAngle={3} stroke="var(--card)" strokeWidth={2}>
                      {donut.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => fmtBdt(v)} contentStyle={CHART_TOOLTIP} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 space-y-1.5">
                {donut.map((c, i) => (
                  <div key={c.name} className="flex items-center gap-2 text-[11.5px]">
                    <span className="size-2 rounded-full shrink-0" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                    <span className="truncate text-muted-foreground">{c.name}</span>
                    <span className="ml-auto tabular-nums font-medium">{fmtBdt(c.value)}</span>
                    <span className="tabular-nums text-muted-foreground w-10 text-right">
                      {donutTotal > 0 ? `${((c.value / donutTotal) * 100).toFixed(0)}%` : "—"}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

/* ---------------- Quick Links ---------------- */
function QuickLinks() {
  const links: { to: string; label: string; icon: React.ReactNode }[] = [
    { to: "/erp/finance/accounts", label: "Accounts", icon: <Wallet className="size-3.5" /> },
    { to: "/erp/finance/receivables", label: "Receivables", icon: <ArrowDownRight className="size-3.5" /> },
    { to: "/erp/finance/journal", label: "Journal", icon: <FileText className="size-3.5" /> },
    { to: "/erp/finance/dollar-purchase", label: "Dollar Purchase", icon: <ArrowUpRight className="size-3.5" /> },
    { to: "/erp/finance/reports", label: "Reports", icon: <Activity className="size-3.5" /> },
    { to: "/erp/finance/budgets", label: "Budgets", icon: <TrendingUp className="size-3.5" /> },
    { to: "/erp/finance/taxes", label: "Taxes", icon: <TrendingDown className="size-3.5" /> },
  ];
  return (
    <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {links.map(l => (
        <Link
          key={l.to}
          to={l.to}
          className="group shrink-0 rounded-full border border-border/60 bg-card hover:bg-muted/50 hover:border-foreground/20 transition-all pl-1.5 pr-3 py-1.5 text-[11.5px] flex items-center gap-1.5"
        >
          <span className="rounded-full p-1.5 bg-muted text-foreground/70 transition group-hover:bg-primary/10 group-hover:text-primary">{l.icon}</span>
          <span className="font-medium whitespace-nowrap">{l.label}</span>
        </Link>
      ))}
    </nav>
  );

}

/* ---------------- Recent Transactions ---------------- */
function RecentTxns({ data }: { data: FinanceOverview }) {
  if (data.recentTxns.length === 0) return null;
  return (
    <Card className="border-border/60 overflow-hidden p-0">
      <PanelHeader
        icon={<Activity className="size-3.5" />}
        title="Recent transactions"
        tone="slate"
        action={
          <Link to="/erp/finance/journal" className="text-[11px] font-medium text-primary inline-flex items-center gap-1 hover:gap-2 transition-all">
            View journal <ArrowRight className="size-3" />
          </Link>
        }
      />
      <CardContent className="p-0">
        <div className="divide-y divide-border/50">
          {data.recentTxns.map(t => (
            <div key={t.id} className="group relative flex items-center gap-3 px-4 py-2.5 text-[13px] hover:bg-muted/40 transition">
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
