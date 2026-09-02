import { lazy, Suspense, useDeferredValue, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  ArrowUpDown,
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  Gauge,
  Layers,
  Lightbulb,
  Megaphone,
  PackageSearch,
  RotateCcw,
  Save,
  Search,
  SlidersHorizontal,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { useBrand } from "@/contexts/brand-context";
import { GrowthPageHeader } from "@/components/erp/growth/growth-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  clearPlanOverride,
  fetchMonthPlan,
  fetchProjection,
  fmtValue,
  monthLabel,
  monthStart,
  savePlanOverride,
  saveMonthPlan,
  shiftMonth,
  type HubMonthPlan,
} from "@/lib/erp/hub/hub-data";
import { fetchMediaPlans } from "@/lib/erp/content/content-data";
import { getProjectionActuals } from "@/lib/erp/hub/projection-actuals.functions";
import { ManualPlanner } from "@/components/erp/growth/manual-planner";
import { cn } from "@/lib/utils";

const PaceChart = lazy(() =>
  import("@/components/erp/growth/projection-charts").then((m) => ({ default: m.PaceChart })),
);
const DailyChart = lazy(() =>
  import("@/components/erp/growth/projection-charts").then((m) => ({ default: m.DailyChart })),
);

const bdt = (n: number) => fmtValue(n, "bdt");
const num = (n: number) => Math.round(n).toLocaleString("en-BD");
const pctTxt = (n: number) => `${n.toFixed(1)}%`;
const safeDiv = (a: number, b: number) => (b > 0 ? a / b : 0);

type SortKey = "title" | "proj_units" | "proj_revenue" | "proj_profit" | "margin" | "days_of_stock";

function monthEnd(month: string) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m ?? 1, 0));
  return d.toISOString().slice(0, 10);
}

export function PlanningPage() {
  const { brandIds, activeBrand } = useBrand();
  const brandId = activeBrand?.id ?? null;
  const qc = useQueryClient();
  const [month, setMonth] = useState(() => monthStart());

  const from = month;
  const end = monthEnd(month);
  const todayISO = new Date().toISOString().slice(0, 10);
  const to = end < todayISO ? end : todayISO;

  const fetchActuals = useServerFn(getProjectionActuals);

  const projQ = useQuery({
    queryKey: ["hub-projection", brandIds, month],
    queryFn: () => fetchProjection(brandIds, month),
    enabled: brandIds.length > 0,
    staleTime: 60_000,
  });
  const planQ = useQuery({
    queryKey: ["hub-month-plan", brandId, month],
    queryFn: () => fetchMonthPlan(brandId, month),
    staleTime: 60_000,
  });
  const mediaQ = useQuery({
    queryKey: ["hub-media-plans", brandIds],
    queryFn: () => fetchMediaPlans(brandIds),
    enabled: brandIds.length > 0,
    staleTime: 300_000,
  });
  const actualsQ = useQuery({
    queryKey: ["hub-projection-actuals", brandIds, from, to],
    queryFn: () => fetchActuals({ data: { brandIds, from, to } }),
    enabled: brandIds.length > 0 && to >= from,
    staleTime: 60_000,
  });

  const proj = projQ.data;
  const rows = useMemo(() => proj?.products ?? [], [proj]);
  const plan = planQ.data;

  const [qRaw, setQ] = useState("");
  const q = useDeferredValue(qRaw);
  const [sort, setSort] = useState<SortKey>("proj_revenue");
  const [desc, setDesc] = useState(true);
  const [onlyLow, setOnlyLow] = useState(false);
  const [tab, setTab] = useState("overview");
  const [unitAdj, setUnitAdj] = useState(0);
  const [priceAdj, setPriceAdj] = useState(0);
  const [spendAdj, setSpendAdj] = useState(0);
  const [extraCost, setExtraCost] = useState("");
  const [targetsOpen, setTargetsOpen] = useState(false);
  const [manualTotals, setManualTotals] = useState({
    qty: 0,
    revenue: 0,
    cogs: 0,
    marketing: 0,
    profit: 0,
  });

  const totals = useMemo(
    () =>
      rows.reduce(
        (a, r) => ({
          projRevenue: a.projRevenue + r.proj_revenue,
          projProfit: a.projProfit + r.proj_profit,
          projUnits: a.projUnits + r.proj_units,
          mtdRevenue: a.mtdRevenue + r.mtd_revenue,
          mtdProfit: a.mtdProfit + r.mtd_profit,
          mtdUnits: a.mtdUnits + r.mtd_units,
        }),
        { projRevenue: 0, projProfit: 0, projUnits: 0, mtdRevenue: 0, mtdProfit: 0, mtdUnits: 0 },
      ),
    [rows],
  );

  const savePlan = useMutation({
    mutationFn: (patch: Partial<HubMonthPlan>) => saveMonthPlan(brandId, month, patch),
    onSuccess: () => {
      toast.success("Target সেভ হয়েছে");
      setTargetsOpen(false);
      qc.invalidateQueries({ queryKey: ["hub-month-plan", brandId, month] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveOverride = useMutation({
    mutationFn: (v: {
      productId: string;
      patch: { planned_units?: number | null; planned_price?: number | null; planned_unit_cost?: number | null };
    }) => savePlanOverride(brandId, month, v.productId, v.patch),
    onSuccess: () => {
      toast.success("Override সেভ হয়েছে");
      qc.invalidateQueries({ queryKey: ["hub-projection", brandIds, month] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetOverride = useMutation({
    mutationFn: (productId: string) => clearPlanOverride(brandId, month, productId),
    onSuccess: () => {
      toast.success("Override মুছে গেছে");
      qc.invalidateQueries({ queryKey: ["hub-projection", brandIds, month] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ---- Media budget (Media Buying Hub plans overlapping this month) ----
  const media = useMemo(() => {
    const plans = (mediaQ.data ?? []).filter((p) => {
      if (p.status === "cancelled") return false;
      const s = p.start_date ?? month;
      const e = p.end_date ?? end;
      return s <= end && e >= month;
    });
    const ad = plans.reduce((a, p) => a + p.ad_budget, 0);
    const content = plans.reduce((a, p) => a + p.content_budget, 0);
    const creator = plans.reduce((a, p) => a + p.creator_budget, 0);
    return { plans, ad, content, creator, total: ad + content + creator };
  }, [mediaQ.data, month, end]);

  // ---- Economics engine -------------------------------------------------
  const eco = useMemo(() => {
    const a = actualsQ.data;
    const daysTotal = proj?.days_total ?? new Date(monthEnd(month)).getUTCDate();
    const daysDone = Math.max(1, proj?.days_done ?? 1);
    const daysLeft = Math.max(0, daysTotal - daysDone);
    const elapsed = daysDone / daysTotal;

    const mtdRevenue = a?.totals.revenue ?? totals.mtdRevenue;
    const mtdCogs = a?.totals.cogs ?? 0;
    const mtdOpexVar = a?.totals.opex ?? 0;
    const mtdOrders = a?.totals.orders ?? 0;
    const mtdUnits = a?.totals.units ?? totals.mtdUnits;
    const mtdSpend = a?.totals.spend ?? 0;

    const mtdGross = a ? mtdRevenue - mtdCogs - mtdOpexVar : totals.mtdProfit;
    const fixedOpex = plan?.opex_monthly ?? 0;
    const mtdNet = mtdGross - mtdSpend - fixedOpex * elapsed;

    const perDayRevenue = mtdRevenue / daysDone;
    const perDayOrders = mtdOrders / daysDone;
    const perDaySpend = mtdSpend / daysDone;

    const projRevenue = perDayRevenue * daysTotal;
    const projOrders = perDayOrders * daysTotal;
    const projSpend = perDaySpend * daysTotal;
    const contribRate = safeDiv(mtdGross, mtdRevenue);
    const projGross = projRevenue * contribRate;
    const projNet = projGross - projSpend - fixedOpex;

    const aov = mtdOrders > 0 ? mtdRevenue / mtdOrders : (plan?.target_aov ?? 0);
    const currentRoas = safeDiv(mtdRevenue, mtdSpend);
    const cac = mtdOrders > 0 ? mtdSpend / mtdOrders : 0;

    // Targets
    const tRevenue = plan?.target_revenue ?? 0;
    const tProfit = plan?.target_profit ?? 0;
    const tAdSpend = plan?.target_ad_spend ?? (media.ad || 0);
    const tOrders = plan?.target_orders ?? 0;
    const tAov = plan?.target_aov || aov;

    const remainRevenue = Math.max(0, tRevenue - mtdRevenue);
    const remainOrders = Math.max(0, (tOrders || (tAov > 0 ? tRevenue / tAov : 0)) - mtdOrders);
    const remainSpend = Math.max(0, tAdSpend - mtdSpend);

    const reqRevenuePerDay = daysLeft > 0 ? remainRevenue / daysLeft : remainRevenue;
    const reqOrdersPerDay = daysLeft > 0 ? remainOrders / daysLeft : remainOrders;
    const reqSpendPerDay = daysLeft > 0 ? remainSpend / daysLeft : remainSpend;
    const reqRoas = tAdSpend > 0 ? tRevenue / tAdSpend : 0;
    const reqAov = remainOrders > 0 ? remainRevenue / remainOrders : tAov;

    const onPace = tRevenue > 0 && projRevenue >= tRevenue;
    const paceIndex = tRevenue > 0 ? safeDiv(mtdRevenue, tRevenue * elapsed) * 100 : 0;

    // Break-even ad spend for the month at current contribution rate
    const breakEvenSpend = projGross - fixedOpex;
    const profitGap = tProfit > 0 ? tProfit - projNet : 0;

    return {
      daysTotal,
      daysDone,
      daysLeft,
      elapsed,
      mtdRevenue,
      mtdCogs,
      mtdOpexVar,
      mtdOrders,
      mtdUnits,
      mtdSpend,
      mtdGross,
      mtdNet,
      fixedOpex,
      perDayRevenue,
      perDayOrders,
      perDaySpend,
      projRevenue,
      projOrders,
      projSpend,
      projGross,
      projNet,
      contribRate,
      aov,
      currentRoas,
      cac,
      tRevenue,
      tProfit,
      tAdSpend,
      tOrders,
      tAov,
      remainRevenue,
      remainOrders,
      remainSpend,
      reqRevenuePerDay,
      reqOrdersPerDay,
      reqSpendPerDay,
      reqRoas,
      reqAov,
      onPace,
      paceIndex,
      breakEvenSpend,
      profitGap,
      hasActuals: !!a,
      costMissing: a?.totals.cost_missing_units ?? 0,
    };
  }, [actualsQ.data, proj, plan, totals, month, media.ad]);

  // ---- Profit levers ----------------------------------------------------
  const levers = useMemo(() => {
    const gap = eco.profitGap;
    if (!(gap > 0)) return [];
    const list: { key: string; title: string; detail: string; hint: string }[] = [];
    if (eco.contribRate > 0 && eco.projRevenue > 0) {
      const extraRevenue = gap / eco.contribRate;
      list.push({
        key: "volume",
        title: `Volume +${pctTxt(safeDiv(extraRevenue, eco.projRevenue) * 100)}`,
        detail: `আরও ${bdt(extraRevenue)} revenue`,
        hint: `≈ ${num(safeDiv(extraRevenue, Math.max(1, eco.aov)))} extra order`,
      });
    }
    if (eco.projOrders > 0) {
      const aovLift = gap / (eco.projOrders * Math.max(0.01, eco.contribRate));
      list.push({
        key: "aov",
        title: `AOV +${bdt(aovLift)}`,
        detail: `${pctTxt(safeDiv(aovLift, Math.max(1, eco.aov)) * 100)} বাড়াতে হবে`,
        hint: "Bundle / upsell / free-shipping threshold",
      });
    }
    if (eco.projRevenue > 0) {
      list.push({
        key: "margin",
        title: `Margin +${(safeDiv(gap, eco.projRevenue) * 100).toFixed(1)} pt`,
        detail: `এখন ${pctTxt(eco.contribRate * 100)} contribution`,
        hint: "Cost negotiation / price up / discount কমানো",
      });
    }
    if (eco.projSpend > 0) {
      list.push({
        key: "ads",
        title: `Ad cost −${pctTxt(Math.min(100, safeDiv(gap, eco.projSpend) * 100))}`,
        detail: `একই revenue-তে ${bdt(Math.min(eco.projSpend, gap))} কম spend`,
        hint: `ROAS ${eco.currentRoas.toFixed(2)}x → ${safeDiv(eco.projRevenue, Math.max(1, eco.projSpend - gap)).toFixed(2)}x`,
      });
    }
    if (eco.fixedOpex > 0) {
      list.push({
        key: "opex",
        title: `Opex −${pctTxt(Math.min(100, safeDiv(gap, eco.fixedOpex) * 100))}`,
        detail: `মাসিক fixed খরচ ${bdt(eco.fixedOpex)}`,
        hint: "Fixed cost ছাঁটাই",
      });
    }
    return list;
  }, [eco]);

  // ---- Chart series -----------------------------------------------------
  const series = useMemo(() => {
    const days = actualsQ.data?.days ?? [];
    const map = new Map(days.map((d) => [d.day, d]));
    const [y, m] = month.split("-").map(Number);
    const out: {
      label: string;
      revenue: number | null;
      spend: number | null;
      cum: number | null;
      pace: number | null;
      forecast: number | null;
    }[] = [];
    let cum = 0;
    for (let i = 1; i <= eco.daysTotal; i++) {
      const key = `${y}-${String(m).padStart(2, "0")}-${String(i).padStart(2, "0")}`;
      const row = map.get(key);
      const past = key <= to;
      if (row) cum += row.revenue;
      out.push({
        label: String(i),
        revenue: past ? (row?.revenue ?? 0) : null,
        spend: past ? (row?.spend ?? 0) : null,
        cum: past ? cum : null,
        pace: eco.tRevenue > 0 ? (eco.tRevenue / eco.daysTotal) * i : null,
        forecast: past ? (i === eco.daysDone ? cum : null) : eco.perDayRevenue * i,
      });
    }
    return out;
  }, [actualsQ.data, month, to, eco.daysTotal, eco.tRevenue, eco.perDayRevenue, eco.daysDone]);

  const lowStock = useMemo(
    () => rows.filter((r) => r.days_of_stock != null && r.days_of_stock < 21),
    [rows],
  );

  const margin = (r: (typeof rows)[number]) => safeDiv(r.proj_profit, r.proj_revenue) * 100;

  const visibleRows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = rows.filter(
      (r) =>
        (!term ||
          r.title.toLowerCase().includes(term) ||
          (r.sku ?? "").toLowerCase().includes(term)) &&
        (!onlyLow || (r.days_of_stock != null && r.days_of_stock < 21)),
    );
    const val = (r: (typeof rows)[number]) => {
      switch (sort) {
        case "title":
          return r.title.toLowerCase();
        case "margin":
          return margin(r);
        case "days_of_stock":
          return r.days_of_stock ?? 9999;
        default:
          return r[sort];
      }
    };
    return [...list].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      const c = typeof x === "string" ? x.localeCompare(y as string) : (x as number) - (y as number);
      return desc ? -c : c;
    });
  }, [rows, q, sort, desc, onlyLow]);

  // ---- What-if ----------------------------------------------------------
  const whatIf = useMemo(() => {
    const u = 1 + unitAdj / 100;
    const p = 1 + priceAdj / 100;
    let revenue = 0;
    let cogs = 0;
    let units = 0;
    for (const r of rows) {
      const qty = r.proj_units * u;
      units += qty;
      revenue += qty * r.proj_price * p;
      cogs += qty * r.proj_cost;
    }
    const spend = (eco.projSpend || media.ad) * (1 + spendAdj / 100);
    const extra = Number(extraCost) || 0;
    const profit = revenue - cogs - spend - eco.fixedOpex - extra;
    return {
      units,
      revenue,
      cogs,
      spend,
      profit,
      margin: safeDiv(profit, revenue) * 100,
      roas: safeDiv(revenue, spend),
      deltaRevenue: revenue - totals.projRevenue,
      deltaProfit: profit - eco.projNet,
    };
  }, [rows, unitAdj, priceAdj, spendAdj, extraCost, eco.projSpend, eco.fixedOpex, eco.projNet, media.ad, totals.projRevenue]);

  const pareto = useMemo(() => {
    const sorted = [...rows].sort((a, b) => b.proj_revenue - a.proj_revenue);
    let acc = 0;
    let n = 0;
    for (const r of sorted) {
      if (acc >= totals.projRevenue * 0.8) break;
      acc += r.proj_revenue;
      n += 1;
    }
    return { count: n, share: safeDiv(acc, totals.projRevenue) * 100 };
  }, [rows, totals.projRevenue]);

  const exportCsv = () => {
    const head = [
      "Product","SKU","3mo units","Run-rate","MTD units","Proj units","Price","Unit cost",
      "Proj revenue","Proj profit","Margin %","Stock","Days of stock",
    ];
    const lines = visibleRows.map((r) =>
      [
        r.title, r.sku ?? "", r.hist_units, r.run_rate_units.toFixed(2), r.mtd_units,
        Math.round(r.proj_units), Math.round(r.proj_price), Math.round(r.proj_cost),
        Math.round(r.proj_revenue), Math.round(r.proj_profit), margin(r).toFixed(1),
        r.stock, r.days_of_stock ?? "",
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    downloadCsv(`projection-${month}.csv`, [head.join(","), ...lines].join("\n"));
  };

  const exportDaily = () => {
    const head = ["Date","Revenue","Orders","AOV","Ad spend","ROAS","Gross profit","Cumulative"];
    let cum = 0;
    const lines = (actualsQ.data?.days ?? []).map((d) => {
      cum += d.revenue;
      const gp = d.revenue - d.cogs - d.opex;
      return [
        d.day, Math.round(d.revenue), d.orders, Math.round(safeDiv(d.revenue, d.orders)),
        Math.round(d.spend), safeDiv(d.revenue, d.spend).toFixed(2), Math.round(gp), Math.round(cum),
      ].join(",");
    });
    downloadCsv(`daily-${month}.csv`, [head.join(","), ...lines].join("\n"));
  };

  const SortTh = ({ k, label, right }: { k: SortKey; label: string; right?: boolean }) => (
    <th className={`px-3 py-2 font-medium ${right ? "text-right" : "text-left"}`}>
      <button
        type="button"
        className={`inline-flex items-center gap-1 hover:text-foreground ${sort === k ? "text-foreground" : ""}`}
        onClick={() => (sort === k ? setDesc((d) => !d) : (setSort(k), setDesc(true)))}
      >
        {label}
        <ArrowUpDown className="h-3 w-3 opacity-60" />
      </button>
    </th>
  );

  const loading = projQ.isLoading || actualsQ.isLoading;

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-3 md:p-6">
      <GrowthPageHeader
        icon={BarChart3}
        title="Monthly Projection"
        subtitle={`${activeBrand ? activeBrand.name : "All brands"} — ${monthLabel(month)} · target, pace, ad budget আর profit lever একসাথে`}
        actions={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-full border p-0.5">
              <Button size="icon" variant="ghost" className="h-7 w-7 rounded-full" onClick={() => setMonth(shiftMonth(month, -1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="px-2 text-xs font-medium">{monthLabel(month)}</span>
              <Button size="icon" variant="ghost" className="h-7 w-7 rounded-full" onClick={() => setMonth(shiftMonth(month, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <Sheet open={targetsOpen} onOpenChange={setTargetsOpen}>
              <SheetTrigger asChild>
                <Button size="sm" className="h-8">
                  <Target className="mr-1.5 h-4 w-4" /> Targets
                </Button>
              </SheetTrigger>
              <SheetContent className="w-full overflow-y-auto sm:max-w-md">
                <SheetHeader>
                  <SheetTitle>{monthLabel(month)} target</SheetTitle>
                  <SheetDescription>
                    এই মাসের target দিলে per-day requirement, ad budget pacing আর profit lever হিসাব হবে।
                  </SheetDescription>
                </SheetHeader>
                <TargetForm
                  key={`${month}-${plan?.id ?? "new"}`}
                  plan={plan}
                  saving={savePlan.isPending}
                  suggestion={{ aov: eco.aov, roas: eco.currentRoas, revenue: eco.projRevenue }}
                  onSave={(p) => savePlan.mutate(p)}
                />
              </SheetContent>
            </Sheet>
          </div>
        }
      />

      {loading && <Skeleton className="h-32 w-full rounded-xl" />}

      {/* ---- Hero KPI row ---- */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <HeroCard
          label="Revenue"
          value={bdt(eco.mtdRevenue)}
          caption={`MTD · projected ${bdt(eco.projRevenue)}`}
          target={eco.tRevenue}
          projected={eco.projRevenue}
          actual={eco.mtdRevenue}
          accent="indigo"
        />
        <HeroCard
          label="Net profit"
          value={bdt(eco.mtdNet)}
          caption={`Projected ${bdt(eco.projNet)} · margin ${pctTxt(safeDiv(eco.projNet, eco.projRevenue) * 100)}`}
          target={eco.tProfit}
          projected={eco.projNet}
          actual={eco.mtdNet}
          accent="emerald"
        />
        <HeroCard
          label="Orders"
          value={num(eco.mtdOrders)}
          caption={`Projected ${num(eco.projOrders)} · AOV ${bdt(eco.aov)}`}
          target={eco.tOrders}
          projected={eco.projOrders}
          actual={eco.mtdOrders}
          accent="sky"
        />
        <HeroCard
          label="Meta ad spend"
          value={bdt(eco.mtdSpend)}
          caption={`Projected ${bdt(eco.projSpend)} · ROAS ${eco.currentRoas ? `${eco.currentRoas.toFixed(2)}x` : "—"}`}
          target={eco.tAdSpend}
          projected={eco.projSpend}
          actual={eco.mtdSpend}
          accent="rose"
          invert
        />
      </div>

      {/* ---- Pace strip ---- */}
      <Card className={eco.tRevenue > 0 ? (eco.onPace ? "border-emerald-500/40" : "border-amber-500/40") : undefined}>
        <CardContent className="flex flex-wrap items-center gap-x-7 gap-y-3 p-4">
          <div className="flex items-center gap-2">
            <Gauge className={`h-4 w-4 ${eco.onPace ? "text-emerald-500" : "text-amber-500"}`} />
            <span className="font-display text-sm font-semibold">
              {eco.tRevenue > 0
                ? eco.onPace
                  ? "Target-এর pace-এ আছো"
                  : "Target-এর pace-এ নেই"
                : "Target সেট করা নেই"}
            </span>
            {eco.tRevenue > 0 && (
              <Badge variant="outline" className="text-[10px]">
                Pace index {Math.round(eco.paceIndex)}%
              </Badge>
            )}
          </div>
          <PaceStat label="দিন" value={`${eco.daysDone}/${eco.daysTotal}`} sub={`${eco.daysLeft} দিন বাকি`} />
          <PaceStat label="বর্তমান daily" value={bdt(eco.perDayRevenue)} sub={`${eco.perDayOrders.toFixed(1)} order/দিন`} />
          <PaceStat
            label="দরকার daily"
            value={eco.tRevenue > 0 ? bdt(eco.reqRevenuePerDay) : "—"}
            sub={eco.tRevenue > 0 ? `Target ${bdt(eco.tRevenue)}` : "target দাও"}
          />
          <PaceStat
            label="Gap"
            value={eco.tRevenue > 0 ? bdt(Math.abs(eco.tRevenue - eco.projRevenue)) : "—"}
            sub={eco.tRevenue > 0 ? (eco.onPace ? "উপরে" : "নিচে") : ""}
          />
          {eco.costMissing > 0 && (
            <Badge variant="outline" className="border-amber-500/50 text-[10px] text-amber-600 dark:text-amber-400">
              {num(eco.costMissing)} unit-এর cost data নেই
            </Badge>
          )}
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="daily">Daily plan</TabsTrigger>
          <TabsTrigger value="products">Products ({rows.length})</TabsTrigger>
          <TabsTrigger value="manual">Manual plan</TabsTrigger>
        </TabsList>

        {/* ================= OVERVIEW ================= */}
        <TabsContent value="overview" className="space-y-4">
          {/* Requirement engine */}
          <Card className="border-primary/30">
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                <h2 className="font-display text-sm font-semibold">
                  বাকি {eco.daysLeft} দিনে target ছুঁতে যা লাগবে
                </h2>
                {eco.tRevenue === 0 && (
                  <Badge variant="outline" className="text-[10px]">Target দাও</Badge>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <ReqTile
                  label="Sales / দিন"
                  value={bdt(eco.reqRevenuePerDay)}
                  now={bdt(eco.perDayRevenue)}
                  ok={eco.perDayRevenue >= eco.reqRevenuePerDay}
                />
                <ReqTile
                  label="Order / দিন"
                  value={eco.reqOrdersPerDay.toFixed(1)}
                  now={eco.perDayOrders.toFixed(1)}
                  ok={eco.perDayOrders >= eco.reqOrdersPerDay}
                />
                <ReqTile
                  label="Ad spend / দিন"
                  value={bdt(eco.reqSpendPerDay)}
                  now={bdt(eco.perDaySpend)}
                  ok={eco.perDaySpend <= eco.reqSpendPerDay || eco.reqSpendPerDay === 0}
                  invert
                />
                <ReqTile
                  label="দরকার ROAS"
                  value={eco.reqRoas > 0 ? `${eco.reqRoas.toFixed(2)}x` : "—"}
                  now={eco.currentRoas > 0 ? `${eco.currentRoas.toFixed(2)}x` : "—"}
                  ok={eco.currentRoas >= eco.reqRoas}
                />
                <ReqTile
                  label="দরকার AOV"
                  value={bdt(eco.reqAov)}
                  now={bdt(eco.aov)}
                  ok={eco.aov >= eco.reqAov}
                />
                <ReqTile
                  label="বাকি revenue"
                  value={bdt(eco.remainRevenue)}
                  now={`${num(eco.remainOrders)} order`}
                  ok={eco.remainRevenue === 0}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <MiniStat label="Contribution margin" value={pctTxt(eco.contribRate * 100)} sub={`MTD gross ${bdt(eco.mtdGross)}`} />
                <MiniStat label="CAC (per order)" value={bdt(eco.cac)} sub={`AOV ${bdt(eco.aov)}`} />
                <MiniStat
                  label="Break-even ad spend"
                  value={bdt(Math.max(0, eco.breakEvenSpend))}
                  sub={`Projected spend ${bdt(eco.projSpend)}`}
                  tone={eco.projSpend <= eco.breakEvenSpend ? "emerald" : "destructive"}
                />
                <MiniStat
                  label="Ad budget বাকি"
                  value={bdt(eco.remainSpend)}
                  sub={eco.tAdSpend > 0 ? `Budget ${bdt(eco.tAdSpend)}` : "budget সেট নেই"}
                />
              </div>
            </CardContent>
          </Card>

          {/* Charts */}
          <div className="grid gap-3 xl:grid-cols-2">
            <Card>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  <h2 className="font-display text-sm font-semibold">Cumulative pace</h2>
                </div>
                <Suspense fallback={<Skeleton className="h-[260px] w-full" />}>
                  <PaceChart data={series} />
                </Suspense>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-primary" />
                  <h2 className="font-display text-sm font-semibold">Daily revenue vs ad spend</h2>
                </div>
                <Suspense fallback={<Skeleton className="h-[220px] w-full" />}>
                  <DailyChart data={series} />
                </Suspense>
              </CardContent>
            </Card>
          </div>

          {/* Profit levers */}
          <Card className={levers.length ? "border-amber-500/40" : "border-emerald-500/40"}>
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Lightbulb className="h-4 w-4 text-amber-500" />
                <h2 className="font-display text-sm font-semibold">Profit বাড়াতে কোথায় কাজ করতে হবে</h2>
                {eco.tProfit > 0 && (
                  <Badge variant="outline" className="text-[10px]">
                    {eco.profitGap > 0 ? `Gap ${bdt(eco.profitGap)}` : "Target ছাড়িয়ে গেছে"}
                  </Badge>
                )}
              </div>
              {eco.tProfit === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Profit target দিলে এখানে lever-ভিত্তিক action দেখাবে (কোন lever কতটুকু নাড়লে gap মিটবে)।
                </p>
              ) : levers.length === 0 ? (
                <p className="text-xs text-emerald-600 dark:text-emerald-400">
                  Run-rate অনুযায়ী profit target পূরণ হচ্ছে — এখন margin ধরে রাখা আর ad efficiency-তে ফোকাস করো।
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                  {levers.map((l) => (
                    <div key={l.key} className="rounded-lg border bg-muted/20 p-3">
                      <p className="font-display text-sm font-bold">{l.title}</p>
                      <p className="text-[11px] text-muted-foreground">{l.detail}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">{l.hint}</p>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-muted-foreground">
                প্রতিটা lever আলাদাভাবে ধরা — একটাই একা gap মেটাতে কতটুকু লাগবে।
              </p>
            </CardContent>
          </Card>

          {/* Combined outlook */}
          <Card className="bg-primary/5">
            <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-2 p-4">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" />
                <span className="font-display text-sm font-semibold">Combined outlook</span>
              </div>
              <PaceStat label="Run-rate revenue" value={bdt(eco.projRevenue)} sub={`Net ${bdt(eco.projNet)}`} />
              <PaceStat label="Product model" value={bdt(totals.projRevenue)} sub={`Gross ${bdt(totals.projProfit)}`} />
              <PaceStat label="Manual plan" value={bdt(manualTotals.revenue)} sub={`Profit ${bdt(manualTotals.profit)}`} />
              <PaceStat
                label="মোট (run-rate + manual)"
                value={bdt(eco.projRevenue + manualTotals.revenue)}
                sub={`Profit ${bdt(eco.projNet + manualTotals.profit)}`}
              />
              <PaceStat label="Top drivers" value={`${pareto.count} product`} sub={`Revenue-এর ${pctTxt(pareto.share)}`} />
            </CardContent>
          </Card>

          {/* Sourcing */}
          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center gap-2">
                <PackageSearch className="h-4 w-4 text-primary" />
                <h2 className="font-display text-sm font-semibold">Sourcing target vs actual</h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <SourcingBar label="Order quantity" actual={proj?.sourcing.units ?? 0} target={plan?.target_order_qty ?? 0} fmt={num} />
                <SourcingBar label="Order value" actual={proj?.sourcing.value ?? 0} target={plan?.target_order_value ?? 0} fmt={bdt} />
                <SourcingBar label="New products" actual={proj?.new_products ?? 0} target={plan?.target_new_products ?? 0} fmt={num} />
              </div>
              <p className="text-xs text-muted-foreground">
                এই মাসে মোট {num(proj?.sourcing.po_count ?? 0)}টি purchase order (import + local) হয়েছে।
              </p>
            </CardContent>
          </Card>

          {/* Media budget */}
          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center gap-2">
                <Megaphone className="h-4 w-4 text-primary" />
                <h2 className="font-display text-sm font-semibold">Media budget (Media Buying Hub থেকে)</h2>
                <Badge variant="outline" className="text-[10px]">{media.plans.length} plan</Badge>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <MiniStat label="Ad budget (plans)" value={bdt(media.ad)} sub={`Spent ${bdt(eco.mtdSpend)}`} />
                <MiniStat label="Content budget" value={bdt(media.content)} />
                <MiniStat label="Creator budget" value={bdt(media.creator)} />
                <MiniStat
                  label="Net profit after media"
                  value={bdt(eco.projGross - Math.max(media.total, eco.projSpend) - eco.fixedOpex)}
                  tone={eco.projGross - Math.max(media.total, eco.projSpend) - eco.fixedOpex >= 0 ? "emerald" : "destructive"}
                  sub={`Total media ${bdt(media.total)}`}
                />
              </div>
              {media.plans.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  এই মাসে overlap করা কোনো media plan নেই — Media Buying Hub-এ plan যোগ করলে এখানে budget দেখাবে।
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="border-y bg-muted/40 text-muted-foreground">
                      <tr>
                        <th className="px-3 py-1.5 text-left font-medium">Plan</th>
                        <th className="px-3 py-1.5 text-right font-medium">Target qty</th>
                        <th className="px-3 py-1.5 text-right font-medium">Price</th>
                        <th className="px-3 py-1.5 text-right font-medium">Budget</th>
                        <th className="px-3 py-1.5 text-right font-medium">Break-even ROAS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {media.plans.map((p) => {
                        const budget = p.ad_budget + p.content_budget + p.creator_budget;
                        const planRevenue = p.target_qty * p.selling_price;
                        return (
                          <tr key={p.id} className="border-b last:border-0">
                            <td className="px-3 py-1.5">{p.title}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{num(p.target_qty)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{bdt(p.selling_price)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{bdt(budget)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">
                              {budget > 0 ? `${safeDiv(planRevenue, budget).toFixed(2)}x` : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {lowStock.length > 0 && (
            <Card className="border-amber-500/40">
              <CardContent className="space-y-2 p-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <h2 className="font-display text-sm font-semibold">Stock ফুরাবে শীঘ্রই</h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  {lowStock.slice(0, 12).map((r) => (
                    <Badge key={r.product_id} variant="outline" className="gap-1 text-[11px]">
                      {r.title}
                      <span className="text-amber-600 dark:text-amber-400">
                        {r.days_of_stock} দিন ({num(r.stock)} pcs)
                      </span>
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* What-if */}
          <Card>
            <CardContent className="space-y-4 p-4">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-primary" />
                <h2 className="font-display text-sm font-semibold">What-if scenario</h2>
                <Badge variant="outline" className="text-[10px]">live</Badge>
              </div>
              <div className="grid gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <Label className="text-[11px] text-muted-foreground">
                    Units {unitAdj >= 0 ? "+" : ""}{unitAdj}%
                  </Label>
                  <Slider value={[unitAdj]} min={-50} max={100} step={5} onValueChange={(v) => setUnitAdj(v[0] ?? 0)} />
                </div>
                <div className="space-y-2">
                  <Label className="text-[11px] text-muted-foreground">
                    Price {priceAdj >= 0 ? "+" : ""}{priceAdj}%
                  </Label>
                  <Slider value={[priceAdj]} min={-30} max={50} step={1} onValueChange={(v) => setPriceAdj(v[0] ?? 0)} />
                </div>
                <div className="space-y-2">
                  <Label className="text-[11px] text-muted-foreground">
                    Ad spend {spendAdj >= 0 ? "+" : ""}{spendAdj}%
                  </Label>
                  <Slider value={[spendAdj]} min={-60} max={100} step={5} onValueChange={(v) => setSpendAdj(v[0] ?? 0)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">অতিরিক্ত খরচ (BDT)</Label>
                  <Input
                    inputMode="decimal"
                    className="h-9"
                    placeholder="0"
                    value={extraCost}
                    onChange={(e) => setExtraCost(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                <MiniStat label="Units" value={num(whatIf.units)} />
                <MiniStat
                  label="Revenue"
                  value={bdt(whatIf.revenue)}
                  sub={`${whatIf.deltaRevenue >= 0 ? "+" : "−"}${bdt(Math.abs(whatIf.deltaRevenue))}`}
                />
                <MiniStat label="Ad spend" value={bdt(whatIf.spend)} />
                <MiniStat
                  label="Net profit"
                  value={bdt(whatIf.profit)}
                  tone={whatIf.profit >= 0 ? "emerald" : "destructive"}
                  sub={`${whatIf.deltaProfit >= 0 ? "+" : "−"}${bdt(Math.abs(whatIf.deltaProfit))}`}
                />
                <MiniStat label="Margin" value={pctTxt(whatIf.margin)} />
                <MiniStat label="ROAS" value={whatIf.roas > 0 ? `${whatIf.roas.toFixed(2)}x` : "—"} />
              </div>
              {(unitAdj !== 0 || priceAdj !== 0 || spendAdj !== 0 || extraCost) && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => {
                    setUnitAdj(0);
                    setPriceAdj(0);
                    setSpendAdj(0);
                    setExtraCost("");
                  }}
                >
                  <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reset
                </Button>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================= DAILY ================= */}
        <TabsContent value="daily">
          <Card>
            <CardContent className="p-0">
              <div className="flex flex-wrap items-center justify-between gap-2 p-4 pb-2">
                <h2 className="font-display text-sm font-semibold">
                  Day-by-day actual vs required
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    required {bdt(safeDiv(eco.tRevenue, eco.daysTotal))}/দিন
                  </span>
                </h2>
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={exportDaily}>
                  <Download className="mr-1 h-3.5 w-3.5" /> CSV
                </Button>
              </div>
              <DailyTable
                days={actualsQ.data?.days ?? []}
                dailyTarget={safeDiv(eco.tRevenue, eco.daysTotal)}
                loading={actualsQ.isLoading}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================= PRODUCTS ================= */}
        <TabsContent value="products">
          <Card>
            <CardContent className="p-0">
              <div className="flex flex-wrap items-center justify-between gap-2 p-4 pb-2">
                <h2 className="font-display text-sm font-semibold">
                  Product-wise projection
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {visibleRows.length}/{rows.length}
                  </span>
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={qRaw}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="Product/SKU খোঁজো"
                      className="h-8 w-48 pl-7 text-xs"
                    />
                  </div>
                  <Button
                    size="sm"
                    variant={onlyLow ? "default" : "outline"}
                    className="h-8 text-xs"
                    onClick={() => setOnlyLow((v) => !v)}
                  >
                    <AlertTriangle className="mr-1 h-3.5 w-3.5" /> Low stock
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={exportCsv}>
                    <Download className="mr-1 h-3.5 w-3.5" /> CSV
                  </Button>
                </div>
              </div>
              {rows.length === 0 && !projQ.isLoading ? (
                <p className="p-8 text-center text-sm text-muted-foreground">
                  এই মাসের জন্য কোনো sales history নেই।
                </p>
              ) : (
                <div className="max-h-[70vh] overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 border-y bg-muted text-xs text-muted-foreground">
                      <tr>
                        <SortTh k="title" label="Product" />
                        <th className="px-3 py-2 text-right font-medium">3-mo units</th>
                        <th className="px-3 py-2 text-right font-medium">Run-rate</th>
                        <th className="px-3 py-2 text-right font-medium">MTD</th>
                        <SortTh k="proj_units" label="Proj. units" right />
                        <th className="px-3 py-2 text-right font-medium">Price</th>
                        <th className="px-3 py-2 text-right font-medium">Unit cost</th>
                        <SortTh k="proj_revenue" label="Proj. revenue" right />
                        <SortTh k="proj_profit" label="Proj. profit" right />
                        <SortTh k="margin" label="Margin" right />
                        <SortTh k="days_of_stock" label="Stock" right />
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map((r) => (
                        <ProductRow
                          key={r.product_id}
                          row={r}
                          share={safeDiv(r.proj_revenue, totals.projRevenue) * 100}
                          onSave={(patch) => saveOverride.mutate({ productId: r.product_id, patch })}
                          onReset={() => resetOverride.mutate(r.product_id)}
                        />
                      ))}
                    </tbody>
                    <tfoot className="border-t bg-muted/30 text-xs font-medium">
                      <tr>
                        <td className="px-3 py-2">Total</td>
                        <td colSpan={3} />
                        <td className="px-3 py-2 text-right">{num(totals.projUnits)}</td>
                        <td colSpan={2} />
                        <td className="px-3 py-2 text-right">{bdt(totals.projRevenue)}</td>
                        <td className="px-3 py-2 text-right text-emerald-600 dark:text-emerald-400">
                          {bdt(totals.projProfit)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {totals.projRevenue > 0 ? pctTxt(safeDiv(totals.projProfit, totals.projRevenue) * 100) : "—"}
                        </td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="manual" forceMount className="data-[state=inactive]:hidden">
          <ManualPlanner
            brandId={brandId}
            month={month}
            targetRevenue={plan?.target_revenue ?? 0}
            targetProfit={plan?.target_profit ?? 0}
            targetAdSpend={plan?.target_ad_spend ?? 0}
            onTotals={setManualTotals}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function downloadCsv(name: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function DailyTable({
  days,
  dailyTarget,
  loading,
}: {
  days: { day: string; revenue: number; cogs: number; opex: number; units: number; orders: number; spend: number }[];
  dailyTarget: number;
  loading: boolean;
}) {
  if (loading) return <Skeleton className="m-4 h-64" />;
  if (days.length === 0)
    return <p className="p-8 text-center text-sm text-muted-foreground">এই মাসে এখনো delivered data নেই।</p>;
  let cum = 0;
  return (
    <div className="max-h-[70vh] overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 border-y bg-muted text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Date</th>
            <th className="px-3 py-2 text-right font-medium">Revenue</th>
            <th className="px-3 py-2 text-right font-medium">vs target/দিন</th>
            <th className="px-3 py-2 text-right font-medium">Orders</th>
            <th className="px-3 py-2 text-right font-medium">AOV</th>
            <th className="px-3 py-2 text-right font-medium">Ad spend</th>
            <th className="px-3 py-2 text-right font-medium">ROAS</th>
            <th className="px-3 py-2 text-right font-medium">Gross profit</th>
            <th className="px-3 py-2 text-right font-medium">Cumulative</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => {
            cum += d.revenue;
            const gp = d.revenue - d.cogs - d.opex - d.spend;
            const diff = dailyTarget > 0 ? d.revenue - dailyTarget : 0;
            return (
              <tr key={d.day} className="border-b last:border-0 hover:bg-muted/30">
                <td className="px-3 py-1.5 tabular-nums">
                  {new Date(`${d.day}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums font-medium">{bdt(d.revenue)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {dailyTarget > 0 ? (
                    <span className={cn("inline-flex items-center gap-1", diff >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
                      {diff >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {bdt(Math.abs(diff))}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">{num(d.orders)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{bdt(safeDiv(d.revenue, d.orders))}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{bdt(d.spend)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {d.spend > 0 ? `${safeDiv(d.revenue, d.spend).toFixed(2)}x` : "—"}
                </td>
                <td className={cn("px-3 py-1.5 text-right tabular-nums", gp >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
                  {bdt(gp)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{bdt(cum)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function HeroCard({
  label,
  value,
  caption,
  target,
  projected,
  actual,
  accent,
  invert,
}: {
  label: string;
  value: string;
  caption: string;
  target: number;
  projected: number;
  actual: number;
  accent: "indigo" | "emerald" | "sky" | "rose";
  invert?: boolean;
}) {
  const pct = target > 0 ? Math.round((actual / target) * 100) : null;
  const projPct = target > 0 ? (projected / target) * 100 : 0;
  const good = target > 0 ? (invert ? projected <= target : projPct >= 100) : true;
  const ring: Record<string, string> = {
    indigo: "before:bg-indigo-500",
    emerald: "before:bg-emerald-500",
    sky: "before:bg-sky-500",
    rose: "before:bg-rose-500",
  };
  return (
    <Card className={cn("relative overflow-hidden before:absolute before:inset-y-0 before:left-0 before:w-1", ring[accent])}>
      <CardContent className="space-y-1.5 p-4 pl-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">{label}</p>
          {target > 0 && (
            <Badge
              variant="outline"
              className={cn(
                "text-[10px]",
                good ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400" : "border-amber-500/40 text-amber-600 dark:text-amber-400",
              )}
            >
              {Math.round(projPct)}% of target
            </Badge>
          )}
        </div>
        <p className="font-display text-2xl font-bold tabular-nums leading-tight">{value}</p>
        {pct != null && <Progress value={Math.min(100, Math.max(0, pct))} className="h-1.5" />}
        <p className="text-[11px] text-muted-foreground">{caption}</p>
      </CardContent>
    </Card>
  );
}

function ReqTile({
  label,
  value,
  now,
  ok,
  invert,
}: {
  label: string;
  value: string;
  now: string;
  ok: boolean;
  invert?: boolean;
}) {
  return (
    <div className={cn("rounded-lg border p-3", ok ? "border-emerald-500/40 bg-emerald-500/5" : "border-amber-500/40 bg-amber-500/5")}>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="font-display text-lg font-bold tabular-nums leading-tight">{value}</p>
      <p className="text-[10px] text-muted-foreground">
        এখন {now} {ok ? (invert ? "· budget-এ আছে" : "· ঠিক আছে") : "· পিছিয়ে"}
      </p>
    </div>
  );
}

function PaceStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-[120px]">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="font-display text-base font-bold leading-tight">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function MiniStat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "emerald" | "destructive";
}) {
  const cls =
    tone === "emerald"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "destructive"
        ? "text-destructive"
        : "";
  return (
    <div className="rounded-lg border p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={`font-display text-lg font-bold leading-tight ${cls}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function SourcingBar({
  label,
  actual,
  target,
  fmt,
}: {
  label: string;
  actual: number;
  target: number;
  fmt: (n: number) => string;
}) {
  const pct = target > 0 ? Math.round((actual / target) * 100) : 0;
  return (
    <div className="space-y-1.5 rounded-lg border p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium">{label}</span>
        <span className="text-xs text-muted-foreground">
          {fmt(actual)} / {target > 0 ? fmt(target) : "—"}
        </span>
      </div>
      <Progress value={Math.min(100, pct)} />
    </div>
  );
}

function TargetForm({
  plan,
  saving,
  suggestion,
  onSave,
}: {
  plan: HubMonthPlan | null | undefined;
  saving: boolean;
  suggestion: { aov: number; roas: number; revenue: number };
  onSave: (p: Partial<HubMonthPlan>) => void;
}) {
  const [f, setF] = useState({
    target_revenue: String(plan?.target_revenue || ""),
    target_profit: String(plan?.target_profit || ""),
    target_ad_spend: String(plan?.target_ad_spend || ""),
    target_orders: String(plan?.target_orders || ""),
    target_aov: String(plan?.target_aov || ""),
    target_roas: String(plan?.target_roas || ""),
    opex_monthly: String(plan?.opex_monthly || ""),
    target_new_products: String(plan?.target_new_products || ""),
    target_order_qty: String(plan?.target_order_qty || ""),
    target_order_value: String(plan?.target_order_value || ""),
    notes: plan?.notes ?? "",
  });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  const revenue = Number(f.target_revenue) || 0;
  const aov = Number(f.target_aov) || suggestion.aov;
  const roas = Number(f.target_roas) || 0;
  const derivedOrders = aov > 0 ? Math.round(revenue / aov) : 0;
  const derivedSpend = roas > 0 ? Math.round(revenue / roas) : 0;

  return (
    <div className="space-y-4 py-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Revenue target" value={f.target_revenue} onChange={(v) => set("target_revenue", v)} />
        <Field label="Net profit target" value={f.target_profit} onChange={(v) => set("target_profit", v)} />
        <Field label="Ad budget (Meta)" value={f.target_ad_spend} onChange={(v) => set("target_ad_spend", v)} />
        <Field label="Target ROAS" value={f.target_roas} onChange={(v) => set("target_roas", v)} />
        <Field label="Target AOV" value={f.target_aov} onChange={(v) => set("target_aov", v)} hint={`এখন ${bdt(suggestion.aov)}`} />
        <Field label="Target orders" value={f.target_orders} onChange={(v) => set("target_orders", v)} hint={derivedOrders ? `AOV থেকে ≈ ${num(derivedOrders)}` : undefined} />
        <Field label="মাসিক fixed opex" value={f.opex_monthly} onChange={(v) => set("opex_monthly", v)} />
        <Field label="New products" value={f.target_new_products} onChange={(v) => set("target_new_products", v)} />
        <Field label="Sourcing qty" value={f.target_order_qty} onChange={(v) => set("target_order_qty", v)} />
        <Field label="Sourcing value" value={f.target_order_value} onChange={(v) => set("target_order_value", v)} />
      </div>

      <div className="rounded-lg border bg-muted/30 p-3 text-[11px] text-muted-foreground">
        <p>Run-rate projection: <b className="text-foreground">{bdt(suggestion.revenue)}</b></p>
        {derivedOrders > 0 && <p>Target-এর জন্য দরকার ≈ {num(derivedOrders)} order</p>}
        {derivedSpend > 0 && <p>ROAS {roas}x ধরলে ad budget ≈ {bdt(derivedSpend)}</p>}
      </div>

      <div className="space-y-1">
        <Label className="text-[11px] text-muted-foreground">Notes</Label>
        <Textarea rows={3} value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="এই মাসের plan / risk" />
      </div>

      <div className="flex gap-2">
        <Button
          className="flex-1"
          disabled={saving}
          onClick={() =>
            onSave({
              target_revenue: Number(f.target_revenue) || 0,
              target_profit: Number(f.target_profit) || 0,
              target_ad_spend: Number(f.target_ad_spend) || 0,
              target_orders: Number(f.target_orders) || derivedOrders,
              target_aov: Number(f.target_aov) || 0,
              target_roas: Number(f.target_roas) || 0,
              opex_monthly: Number(f.opex_monthly) || 0,
              target_new_products: Number(f.target_new_products) || 0,
              target_order_qty: Number(f.target_order_qty) || 0,
              target_order_value: Number(f.target_order_value) || 0,
              notes: f.notes || null,
            })
          }
        >
          <Save className="mr-1.5 h-4 w-4" /> Save targets
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <Input inputMode="decimal" value={value} placeholder="0" onChange={(e) => onChange(e.target.value)} />
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ProductRow({
  row,
  share,
  onSave,
  onReset,
}: {
  row: import("@/lib/erp/hub/hub-data").HubPlanProductRow;
  share: number;
  onSave: (p: { planned_units?: number | null; planned_price?: number | null; planned_unit_cost?: number | null }) => void;
  onReset: () => void;
}) {
  const [units, setUnits] = useState(row.planned_units == null ? "" : String(row.planned_units));
  const [price, setPrice] = useState(row.planned_price == null ? "" : String(row.planned_price));
  const [cost, setCost] = useState(row.planned_unit_cost == null ? "" : String(row.planned_unit_cost));
  const dirty =
    units !== (row.planned_units == null ? "" : String(row.planned_units)) ||
    price !== (row.planned_price == null ? "" : String(row.planned_price)) ||
    cost !== (row.planned_unit_cost == null ? "" : String(row.planned_unit_cost));
  const overridden = row.planned_units != null || row.planned_price != null || row.planned_unit_cost != null;

  return (
    <tr className="border-b last:border-0 hover:bg-muted/30">
      <td className="max-w-[260px] px-3 py-2">
        <div className="flex items-center gap-2">
          {row.image && (
            <img src={row.image} alt={row.title} loading="lazy" className="h-8 w-8 rounded object-cover" />
          )}
          <div className="min-w-0">
            <p className="truncate font-medium">{row.title}</p>
            {row.sku && <p className="truncate text-[11px] text-muted-foreground">{row.sku}</p>}
          </div>
        </div>
      </td>
      <td className="px-3 py-2 text-right tabular-nums">{num(row.hist_units)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{row.run_rate_units.toFixed(1)}/mo</td>
      <td className="px-3 py-2 text-right tabular-nums">{num(row.mtd_units)}</td>
      <td className="px-2 py-1.5 text-right">
        <Input
          className="h-8 w-20 text-right"
          inputMode="decimal"
          value={units}
          placeholder={num(row.proj_units)}
          onChange={(e) => setUnits(e.target.value)}
        />
      </td>
      <td className="px-2 py-1.5 text-right">
        <Input
          className="h-8 w-20 text-right"
          inputMode="decimal"
          value={price}
          placeholder={Math.round(row.proj_price).toString()}
          onChange={(e) => setPrice(e.target.value)}
        />
      </td>
      <td className="px-2 py-1.5 text-right">
        <Input
          className="h-8 w-20 text-right"
          inputMode="decimal"
          value={cost}
          placeholder={Math.round(row.proj_cost).toString()}
          onChange={(e) => setCost(e.target.value)}
        />
      </td>
      <td className="px-3 py-2 text-right tabular-nums">{bdt(row.proj_revenue)}</td>
      <td
        className={`px-3 py-2 text-right tabular-nums ${row.proj_profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}
      >
        {bdt(row.proj_profit)}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {row.proj_revenue > 0 ? pctTxt((row.proj_profit / row.proj_revenue) * 100) : "—"}
        <span className="ml-1 text-[10px] text-muted-foreground">{share.toFixed(1)}% mix</span>
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {num(row.stock)}
        {row.days_of_stock != null && (
          <span
            className={`ml-1 text-[11px] ${row.days_of_stock < 21 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}
          >
            ({row.days_of_stock}d)
          </span>
        )}
      </td>
      <td className="px-2 py-1.5">
        <div className="flex justify-end gap-1">
          {dirty && (
            <Button
              size="icon"
              variant="secondary"
              className="h-8 w-8"
              onClick={() =>
                onSave({
                  planned_units: units === "" ? null : Number(units),
                  planned_price: price === "" ? null : Number(price),
                  planned_unit_cost: cost === "" ? null : Number(cost),
                })
              }
            >
              <Save className="h-3.5 w-3.5" />
            </Button>
          )}
          {overridden && (
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onReset}>
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}
