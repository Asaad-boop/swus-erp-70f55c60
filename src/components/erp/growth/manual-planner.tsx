import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Trash2, Copy, Calculator, Download, Search, ArrowUp, ArrowDown,
  Package, Sparkles, Wand2, TrendingUp, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { fmtValue, shiftMonth, monthLabel } from "@/lib/erp/hub/hub-data";
import { cn } from "@/lib/utils";

export type PlanScenarioRow = {
  id: string;
  brand_id: string | null;
  month: string;
  product_id: string | null;
  product_name: string;
  qty: number;
  sell_price: number;
  discount_pct: number;
  cost_price: number;
  marketing_cost: number;
  packaging_cost: number;
  courier_cost: number;
  return_pct: number;
  return_cost: number;
  lead_time_days: number;
  sell_days: number;
  is_active: boolean;
  note: string | null;
  position: number;
};

type NumField =
  | "qty" | "sell_price" | "discount_pct" | "cost_price" | "marketing_cost"
  | "packaging_cost" | "courier_cost" | "return_pct" | "return_cost" | "lead_time_days"
  | "sell_days";

const bdt = (n: number) => fmtValue(n, "bdt");
const num = (n: number) => Math.round(n).toLocaleString("en-BD");
const pct = (n: number) => `${n.toFixed(1)}%`;

async function fetchScenarioRows(brandId: string | null, month: string) {
  let q = supabase.from("hub_plan_scenarios").select("*").eq("month", month).order("position").order("created_at");
  q = brandId ? q.eq("brand_id", brandId) : q.is("brand_id", null);
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as unknown as PlanScenarioRow[]).map((r) => ({
    ...r,
    qty: Number(r.qty ?? 0),
    sell_price: Number(r.sell_price ?? 0),
    discount_pct: Number(r.discount_pct ?? 0),
    cost_price: Number(r.cost_price ?? 0),
    marketing_cost: Number(r.marketing_cost ?? 0),
    packaging_cost: Number(r.packaging_cost ?? 0),
    courier_cost: Number(r.courier_cost ?? 0),
    return_pct: Number(r.return_pct ?? 0),
    return_cost: Number(r.return_cost ?? 0),
    lead_time_days: Number(r.lead_time_days ?? 0),
    sell_days: Number(r.sell_days ?? 30) || 30,
    is_active: r.is_active !== false,
  }));
}

/**
 * Unit economics for one planned product.
 * Returned units are assumed restockable — COGS counts delivered units only,
 * while ads / packaging / courier are paid on every dispatched piece.
 */
export function rowMath(r: PlanScenarioRow) {
  const netPrice = r.sell_price * (1 - r.discount_pct / 100);
  const returnUnits = (r.qty * r.return_pct) / 100;
  const delivered = Math.max(0, r.qty - returnUnits);
  const revenue = delivered * netPrice;
  const cogs = delivered * r.cost_price;
  const marketing = r.qty * r.marketing_cost;
  const packaging = r.qty * r.packaging_cost;
  const courier = delivered * r.courier_cost;
  const returns = returnUnits * r.return_cost;
  const cost = cogs + marketing + packaging + courier + returns;
  const profit = revenue - cost;
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
  const perUnit = r.qty > 0 ? profit / r.qty : 0;
  const cmPerUnit = netPrice - r.cost_price - r.packaging_cost - r.courier_cost;
  const fixedish = marketing + returns;
  const breakEvenUnits = cmPerUnit > 0 ? fixedish / cmPerUnit : Infinity;
  const roas = marketing > 0 ? revenue / marketing : Infinity;
  const capital = cogs + packaging;
  const maxCac = cmPerUnit; // ad spend/unit ceiling before losing money
  // কত দিনে বিক্রি করতে চাই → per-day pace
  const days = Math.max(1, Number(r.sell_days) || 30);
  const unitsPerDay = r.qty / days;
  const revenuePerDay = revenue / days;
  const adPerDay = marketing / days;
  const profitPerDay = profit / days;
  return {
    netPrice, returnUnits, delivered, revenue, cogs, marketing, packaging, courier,
    returns, cost, profit, margin, perUnit, cmPerUnit, breakEvenUnits, roas, capital, maxCac,
    days, unitsPerDay, revenuePerDay, adPerDay, profitPerDay,
  };
}

/** Sell price needed on this row to hit a target margin, all costs unchanged. */
function priceForMargin(r: PlanScenarioRow, targetPct: number) {
  const m = rowMath(r);
  if (m.delivered <= 0 || targetPct >= 100) return null;
  const costTotal = m.cost;
  const neededRevenue = costTotal / (1 - targetPct / 100);
  const neededNet = neededRevenue / m.delivered;
  return r.discount_pct >= 100 ? null : neededNet / (1 - r.discount_pct / 100);
}

export function ManualPlanner({
  brandId,
  month,
  targetRevenue = 0,
  targetProfit = 0,
  targetAdSpend = 0,
  onTotals,
}: {
  brandId: string | null;
  month: string;
  targetRevenue?: number;
  targetProfit?: number;
  targetAdSpend?: number;
  onTotals?: (t: { qty: number; revenue: number; cogs: number; marketing: number; profit: number }) => void;
}) {
  const qc = useQueryClient();
  const key = ["hub-plan-scenarios", brandId, month];
  const rowsQ = useQuery({ queryKey: key, queryFn: () => fetchScenarioRows(brandId, month) });
  const [draft, setDraft] = useState<Record<string, Partial<PlanScenarioRow>>>({});
  const [raw, setRaw] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [targetPct, setTargetPct] = useState(20);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => setDraft({}), [brandId, month]);

  const allRows = useMemo(
    () => (rowsQ.data ?? []).map((r) => ({ ...r, ...draft[r.id] }) as PlanScenarioRow),
    [rowsQ.data, draft],
  );
  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return s ? allRows.filter((r) => r.product_name.toLowerCase().includes(s)) : allRows;
  }, [allRows, search]);
  const active = useMemo(() => allRows.filter((r) => r.is_active), [allRows]);

  const invalidate = () => qc.invalidateQueries({ queryKey: key });

  const catalogQ = useQuery({
    queryKey: ["hub-plan-catalog", brandId],
    enabled: pickerOpen,
    staleTime: 300_000,
    queryFn: async () => {
      let q = supabase
        .from("products")
        .select("id,title,price,cost_price,weighted_avg_cost,sku")
        .eq("is_active", true)
        .order("title")
        .limit(400);
      if (brandId) q = q.eq("brand_id", brandId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const addRow = useMutation({
    mutationFn: async (seed?: Partial<PlanScenarioRow>) => {
      const { error } = await supabase.from("hub_plan_scenarios").insert({
        brand_id: brandId,
        month,
        product_name: "",
        position: allRows.length,
        ...seed,
      } as never);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const saveRow = useMutation({
    mutationFn: async (r: PlanScenarioRow) => {
      const { error } = await supabase
        .from("hub_plan_scenarios")
        .update({
          product_name: r.product_name,
          product_id: r.product_id,
          qty: r.qty,
          sell_price: r.sell_price,
          discount_pct: r.discount_pct,
          cost_price: r.cost_price,
          marketing_cost: r.marketing_cost,
          packaging_cost: r.packaging_cost,
          courier_cost: r.courier_cost,
          return_pct: r.return_pct,
          return_cost: r.return_cost,
          lead_time_days: r.lead_time_days,
          sell_days: r.sell_days,
          is_active: r.is_active,
        } as never)
        .eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: (_d, r) => {
      setDraft((d) => {
        const n = { ...d };
        delete n[r.id];
        return n;
      });
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delRow = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hub_plan_scenarios").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const dupRow = useMutation({
    mutationFn: async (r: PlanScenarioRow) => {
      const { id: _id, ...rest } = r;
      const { error } = await supabase.from("hub_plan_scenarios").insert({
        ...rest,
        product_name: `${r.product_name} (copy)`,
        position: allRows.length,
      } as never);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const move = useMutation({
    mutationFn: async ({ r, dir }: { r: PlanScenarioRow; dir: -1 | 1 }) => {
      const idx = allRows.findIndex((x) => x.id === r.id);
      const other = allRows[idx + dir];
      if (!other) return;
      await supabase.from("hub_plan_scenarios").update({ position: other.position } as never).eq("id", r.id);
      await supabase.from("hub_plan_scenarios").update({ position: r.position } as never).eq("id", other.id);
    },
    onSuccess: invalidate,
  });

  const bulkApply = useMutation({
    mutationFn: async (patchAll: Partial<PlanScenarioRow>) => {
      const ids = allRows.map((r) => r.id);
      if (ids.length === 0) throw new Error("কোনো row নেই");
      const { error } = await supabase.from("hub_plan_scenarios").update(patchAll as never).in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("সব row-এ প্রয়োগ হয়েছে");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const applyTargetPrices = useMutation({
    mutationFn: async () => {
      const updates = active
        .map((r) => ({ r, p: priceForMargin(r, targetPct) }))
        .filter((x) => x.p && Number.isFinite(x.p));
      if (updates.length === 0) throw new Error("প্রয়োগযোগ্য row নেই");
      for (const u of updates) {
        await supabase
          .from("hub_plan_scenarios")
          .update({ sell_price: Math.ceil(u.p as number) } as never)
          .eq("id", u.r.id);
      }
      return updates.length;
    },
    onSuccess: (n) => {
      toast.success(`${n}টি product-এ ${targetPct}% margin price বসানো হয়েছে`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const copyPrev = useMutation({
    mutationFn: async () => {
      const prev = shiftMonth(month, -1);
      const src = await fetchScenarioRows(brandId, prev);
      if (src.length === 0) throw new Error(`${monthLabel(prev)}-এ কোনো row নেই`);
      const { error } = await supabase.from("hub_plan_scenarios").insert(
        src.map((r, i) => ({
          brand_id: brandId,
          month,
          product_id: r.product_id,
          product_name: r.product_name,
          qty: r.qty,
          sell_price: r.sell_price,
          discount_pct: r.discount_pct,
          cost_price: r.cost_price,
          marketing_cost: r.marketing_cost,
          packaging_cost: r.packaging_cost,
          courier_cost: r.courier_cost,
          return_pct: r.return_pct,
          return_cost: r.return_cost,
          lead_time_days: r.lead_time_days,
          sell_days: r.sell_days,
          is_active: r.is_active,
          note: r.note,
          position: allRows.length + i,
        })) as never,
      );
      if (error) throw error;
      return src.length;
    },
    onSuccess: (n) => {
      toast.success(`${n}টি row কপি হয়েছে`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totals = useMemo(
    () =>
      active.reduce(
        (a, r) => {
          const m = rowMath(r);
          return {
            qty: a.qty + r.qty,
            delivered: a.delivered + m.delivered,
            revenue: a.revenue + m.revenue,
            cogs: a.cogs + m.cogs,
            marketing: a.marketing + m.marketing,
            packaging: a.packaging + m.packaging,
            courier: a.courier + m.courier,
            returns: a.returns + m.returns,
            capital: a.capital + m.capital,
            profit: a.profit + m.profit,
            unitsPerDay: a.unitsPerDay + m.unitsPerDay,
            revenuePerDay: a.revenuePerDay + m.revenuePerDay,
            adPerDay: a.adPerDay + m.adPerDay,
            maxDays: Math.max(a.maxDays, m.days),
          };
        },
        {
          qty: 0, delivered: 0, revenue: 0, cogs: 0, marketing: 0, packaging: 0, courier: 0,
          returns: 0, capital: 0, profit: 0, unitsPerDay: 0, revenuePerDay: 0, adPerDay: 0, maxDays: 0,
        },
      ),
    [active],
  );
  const totalMargin = totals.revenue > 0 ? (totals.profit / totals.revenue) * 100 : 0;
  const totalRoas = totals.marketing > 0 ? totals.revenue / totals.marketing : 0;
  const daysInMonth = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    return new Date(y ?? 2026, m ?? 1, 0).getDate();
  }, [month]);

  useEffect(() => {
    onTotals?.({
      qty: totals.qty,
      revenue: totals.revenue,
      cogs: totals.cogs,
      marketing: totals.marketing,
      profit: totals.profit,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totals]);

  const scenarios = [10, 20, 30].map((p) => {
    const baseCost = totals.cogs + totals.marketing + totals.packaging + totals.courier + totals.returns;
    const neededRevenue = baseCost / (1 - p / 100);
    const targetP = (neededRevenue * p) / 100;
    return {
      pct: p,
      targetProfit: targetP,
      neededRevenue,
      gap: targetP - totals.profit,
      priceFactor: totals.revenue > 0 ? neededRevenue / totals.revenue : 0,
    };
  });

  const exportCsv = () => {
    const head = [
      "Active", "Product", "Qty", "Sell price", "Discount %", "Net price", "Cost price",
      "Marketing/pc", "Packaging/pc", "Courier/pc", "Return %", "Return cost/pc", "Lead days",
      "Sell days", "Units/day", "Revenue/day", "Ad spend/day",
      "Delivered units", "Revenue", "COGS", "Marketing total", "Packaging total", "Courier total",
      "Return loss", "Profit", "Profit/pc", "Margin %", "CM/pc", "Break-even units", "ROAS", "Capital",
    ];
    const body = rows.map((r) => {
      const m = rowMath(r);
      return [
        r.is_active ? "yes" : "no", r.product_name, r.qty, r.sell_price, r.discount_pct,
        m.netPrice.toFixed(2), r.cost_price, r.marketing_cost, r.packaging_cost, r.courier_cost,
        r.return_pct, r.return_cost, r.lead_time_days,
        r.sell_days, m.unitsPerDay.toFixed(1), Math.round(m.revenuePerDay), Math.round(m.adPerDay),
        Math.round(m.delivered),
        Math.round(m.revenue), Math.round(m.cogs), Math.round(m.marketing), Math.round(m.packaging),
        Math.round(m.courier), Math.round(m.returns), Math.round(m.profit), m.perUnit.toFixed(2),
        m.margin.toFixed(1), m.cmPerUnit.toFixed(2),
        Number.isFinite(m.breakEvenUnits) ? Math.ceil(m.breakEvenUnits) : "n/a",
        Number.isFinite(m.roas) ? m.roas.toFixed(2) : "n/a", Math.round(m.capital),
      ];
    });
    const csv = [head, ...body].map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `manual-plan-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const patch = (id: string, p: Partial<PlanScenarioRow>) =>
    setDraft((d) => ({ ...d, [id]: { ...d[id], ...p } }));

  const numCell = (r: PlanScenarioRow, field: NumField, width = "w-[74px]") => (
    <Input
      type="text"
      inputMode="decimal"
      className={cn("h-8 text-right tabular-nums", width)}
      value={raw[`${r.id}:${field}`] ?? String(r[field] ?? 0)}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => {
        const v = e.target.value;
        if (v !== "" && !/^\d*\.?\d*$/.test(v)) return;
        setRaw((s) => ({ ...s, [`${r.id}:${field}`]: v }));
        patch(r.id, { [field]: v === "" ? 0 : Number(v) } as Partial<PlanScenarioRow>);
      }}
      onBlur={() => {
        setRaw((s) => {
          const n = { ...s };
          delete n[`${r.id}:${field}`];
          return n;
        });
        if (draft[r.id]) saveRow.mutate(r);
      }}
    />
  );

  const revCoverage = targetRevenue > 0 ? (totals.revenue / targetRevenue) * 100 : 0;
  const profitCoverage = targetProfit > 0 ? (totals.profit / targetProfit) * 100 : 0;
  const adCoverage = targetAdSpend > 0 ? (totals.marketing / targetAdSpend) * 100 : 0;

  const risky = active.filter((r) => {
    const m = rowMath(r);
    return r.qty > 0 && (m.profit < 0 || m.margin < 5);
  });

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        <Kpi label="Plan revenue" value={bdt(totals.revenue)} sub={`${num(totals.delivered)} pcs delivered`} accent="primary" />
        <Kpi
          label="Net profit"
          value={bdt(totals.profit)}
          sub={`Margin ${pct(totalMargin)}`}
          accent={totals.profit >= 0 ? "emerald" : "destructive"}
        />
        <Kpi label="Ad budget" value={bdt(totals.marketing)} sub={totalRoas > 0 ? `ROAS ${totalRoas.toFixed(2)}x` : "—"} />
        <Kpi label="Capital lagbe" value={bdt(totals.capital)} sub="COGS + packaging" />
        <Kpi
          label="Units"
          value={num(totals.qty)}
          sub={`Sell window-এ ${totals.unitsPerDay.toFixed(1)} pcs/day`}
        />
        <Kpi
          label="Per day sales"
          value={bdt(totals.revenuePerDay)}
          sub={`Ad ${bdt(totals.adPerDay)}/day · window ${num(totals.maxDays || daysInMonth)} দিন`}
        />
      </div>

      {/* Sell window + ad pacing */}
      {active.length > 0 && (
        <Card>
          <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <MiniStat label="Sell window" value={`${num(totals.maxDays || daysInMonth)} দিন`} sub="সবচেয়ে দীর্ঘ product plan" />
            <MiniStat label="Per day units" value={`${totals.unitsPerDay.toFixed(1)} pcs`} sub={`মোট ${num(totals.qty)} pcs`} />
            <MiniStat label="Per day ad cost" value={bdt(totals.adPerDay)} sub={`মোট ads ${bdt(totals.marketing)}`} />
            <MiniStat
              label="Per day profit"
              value={bdt(totals.maxDays > 0 ? totals.profit / totals.maxDays : 0)}
              sub={`Month-এ ${num(daysInMonth)} দিন ধরলে ${bdt(totals.profit / daysInMonth)}`}
            />
          </CardContent>
        </Card>
      )}

      {/* Coverage vs month target */}
      {(targetRevenue > 0 || targetProfit > 0 || targetAdSpend > 0) && (
        <Card>
          <CardContent className="grid gap-4 p-4 sm:grid-cols-3">
            <Coverage label="Revenue target coverage" value={revCoverage} detail={`${bdt(totals.revenue)} / ${bdt(targetRevenue)}`} />
            <Coverage label="Profit target coverage" value={profitCoverage} detail={`${bdt(totals.profit)} / ${bdt(targetProfit)}`} />
            <Coverage label="Ad budget used" value={adCoverage} detail={`${bdt(totals.marketing)} / ${bdt(targetAdSpend)}`} invert />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Calculator className="h-4 w-4 text-primary" />
              <h3 className="font-display text-sm font-semibold">Manual product plan — {monthLabel(month)}</h3>
              <Badge variant="secondary">{active.length}/{allRows.length} active</Badge>
              {risky.length > 0 && (
                <Badge variant="outline" className="border-amber-500/40 text-amber-600">
                  <AlertTriangle className="mr-1 h-3 w-3" /> {risky.length} low margin
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-8 w-40 pl-7"
                  placeholder="Product খুঁজো"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <BulkApply onApply={(p) => bulkApply.mutate(p)} pending={bulkApply.isPending} />
              <div className="flex items-center gap-1 rounded-md border px-2 py-1">
                <span className="text-xs text-muted-foreground">কত দিনে বিক্রি</span>
                <Input
                  type="text"
                  inputMode="numeric"
                  className="h-7 w-14 text-right tabular-nums"
                  value={sellDaysAll}
                  onChange={(e) => /^\d*$/.test(e.target.value) && setSellDaysAll(e.target.value)}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2"
                  disabled={bulkApply.isPending || !sellDaysAll}
                  onClick={() => bulkApply.mutate({ sell_days: Math.max(1, Number(sellDaysAll) || 30) })}
                >
                  সব row-এ
                </Button>
              </div>
              <Button size="sm" variant="outline" onClick={() => copyPrev.mutate()} disabled={copyPrev.isPending}>
                <Copy className="mr-1 h-3.5 w-3.5" /> আগের মাস
              </Button>
              <Button size="sm" variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
                <Download className="mr-1 h-3.5 w-3.5" /> CSV
              </Button>
              <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger asChild>
                  <Button size="sm" variant="outline">
                    <Package className="mr-1 h-3.5 w-3.5" /> Catalog থেকে
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80 p-0">
                  <Command>
                    <CommandInput placeholder="Product search…" />
                    <CommandList>
                      {catalogQ.isLoading ? (
                        <div className="p-3"><Skeleton className="h-16 w-full" /></div>
                      ) : (
                        <>
                          <CommandEmpty>কিছু পাওয়া যায়নি</CommandEmpty>
                          <CommandGroup>
                            {(catalogQ.data ?? []).map((p: any) => (
                              <CommandItem
                                key={p.id}
                                value={`${p.title} ${p.sku ?? ""}`}
                                onSelect={() => {
                                  addRow.mutate({
                                    product_id: p.id,
                                    product_name: p.title,
                                    sell_price: Number(p.price ?? 0),
                                    cost_price: Number(p.weighted_avg_cost || p.cost_price || 0),
                                  });
                                  setPickerOpen(false);
                                }}
                              >
                                <span className="truncate">{p.title}</span>
                                <span className="ml-auto shrink-0 text-xs text-muted-foreground">{bdt(Number(p.price ?? 0))}</span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <Button size="sm" onClick={() => addRow.mutate(undefined)} disabled={addRow.isPending}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Product যোগ
              </Button>
            </div>
          </div>

          {rowsQ.isLoading ? (
            <Skeleton className="h-32 w-full rounded-lg" />
          ) : rows.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              এখনো কোনো product নেই — "Catalog থেকে" দিয়ে দাম-কস্ট অটো নাও, অথবা নিজে যোগ করে piece, sell price, cost, marketing বসাও।
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-2 py-2 text-left font-medium">On</th>
                    <th className="sticky left-0 z-10 bg-muted/50 px-3 py-2 text-left font-medium">Product</th>
                    <th className="px-2 py-2 text-right font-medium">Qty</th>
                    <th className="px-2 py-2 text-right font-medium">দিন</th>
                    <th className="px-2 py-2 text-right font-medium">Sell</th>
                    <th className="px-2 py-2 text-right font-medium">Disc %</th>
                    <th className="px-2 py-2 text-right font-medium">Cost</th>
                    <th className="px-2 py-2 text-right font-medium">Ads/pc</th>
                    <th className="px-2 py-2 text-right font-medium">Pack/pc</th>
                    <th className="px-2 py-2 text-right font-medium">Courier/pc</th>
                    <th className="px-2 py-2 text-right font-medium">Ret %</th>
                    <th className="px-2 py-2 text-right font-medium">Ret cost</th>
                    <th className="px-2 py-2 text-right font-medium">Pcs/day</th>
                    <th className="px-2 py-2 text-right font-medium">Ads/day</th>
                    <th className="px-2 py-2 text-right font-medium">Revenue</th>
                    <th className="px-2 py-2 text-right font-medium">Profit</th>
                    <th className="px-2 py-2 text-right font-medium">CM/pc</th>
                    <th className="px-2 py-2 text-right font-medium">B/E pcs</th>
                    <th className="px-2 py-2 text-right font-medium">ROAS</th>
                    <th className="px-2 py-2 text-right font-medium">Margin</th>
                    <th className="px-2 py-2 text-right font-medium">{targetPct}% price</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const m = rowMath(r);
                    const need = priceForMargin(r, targetPct);
                    return (
                      <tr key={r.id} className={cn("border-t", !r.is_active && "opacity-45")}>
                        <td className="px-2 py-1.5">
                          <Switch
                            checked={r.is_active}
                            onCheckedChange={(v) => {
                              patch(r.id, { is_active: v });
                              saveRow.mutate({ ...r, is_active: v });
                            }}
                          />
                        </td>
                        <td className="sticky left-0 z-10 bg-card px-3 py-1.5">
                          <Input
                            className="h-8 min-w-[170px]"
                            placeholder="Product নাম"
                            value={r.product_name}
                            onChange={(e) => patch(r.id, { product_name: e.target.value })}
                            onBlur={() => draft[r.id] && saveRow.mutate(r)}
                          />
                        </td>
                        <td className="px-2 py-1.5 text-right">{numCell(r, "qty", "w-[68px]")}</td>
                        <td className="px-2 py-1.5 text-right">{numCell(r, "sell_days", "w-[62px]")}</td>
                        <td className="px-2 py-1.5 text-right">{numCell(r, "sell_price")}</td>
                        <td className="px-2 py-1.5 text-right">{numCell(r, "discount_pct", "w-[62px]")}</td>
                        <td className="px-2 py-1.5 text-right">{numCell(r, "cost_price")}</td>
                        <td className="px-2 py-1.5 text-right">{numCell(r, "marketing_cost")}</td>
                        <td className="px-2 py-1.5 text-right">{numCell(r, "packaging_cost", "w-[66px]")}</td>
                        <td className="px-2 py-1.5 text-right">{numCell(r, "courier_cost", "w-[70px]")}</td>
                        <td className="px-2 py-1.5 text-right">{numCell(r, "return_pct", "w-[58px]")}</td>
                        <td className="px-2 py-1.5 text-right">{numCell(r, "return_cost", "w-[70px]")}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                          {m.unitsPerDay.toFixed(1)}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                          {bdt(m.adPerDay)}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{bdt(m.revenue)}</td>
                        <td className={cn("px-2 py-1.5 text-right font-medium tabular-nums", m.profit < 0 ? "text-destructive" : "text-emerald-600")}>
                          {bdt(m.profit)}
                        </td>
                        <td className={cn("px-2 py-1.5 text-right tabular-nums", m.cmPerUnit < 0 && "text-destructive")}>
                          {bdt(m.cmPerUnit)}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                          {Number.isFinite(m.breakEvenUnits) ? num(Math.ceil(m.breakEvenUnits)) : "—"}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                          {Number.isFinite(m.roas) ? `${m.roas.toFixed(1)}x` : "—"}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
                              m.margin < 0
                                ? "bg-destructive/15 text-destructive"
                                : m.margin < 10
                                  ? "bg-amber-500/15 text-amber-600"
                                  : "bg-emerald-500/15 text-emerald-600",
                            )}
                          >
                            {pct(m.margin)}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                          {need && Number.isFinite(need) ? bdt(Math.ceil(need)) : "—"}
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="flex items-center justify-end gap-0.5">
                            <Button size="icon" variant="ghost" className="h-7 w-7" disabled={i === 0} onClick={() => move.mutate({ r, dir: -1 })}>
                              <ArrowUp className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7" disabled={i === rows.length - 1} onClick={() => move.mutate({ r, dir: 1 })}>
                              <ArrowDown className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => dupRow.mutate(r)}>
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => delRow.mutate(r.id)}>
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t bg-muted/30 font-medium">
                  <tr>
                    <td />
                    <td className="sticky left-0 z-10 bg-muted/30 px-3 py-2">Total (active)</td>
                    <td className="px-2 py-2 text-right tabular-nums">{num(totals.qty)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                      {num(totals.maxDays)}
                    </td>
                    <td colSpan={3} />
                    <td className="px-2 py-2 text-right tabular-nums">{bdt(totals.marketing)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{bdt(totals.packaging)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{bdt(totals.courier)}</td>
                    <td className="px-2 py-2" />
                    <td className="px-2 py-2 text-right tabular-nums">{bdt(totals.returns)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{totals.unitsPerDay.toFixed(1)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{bdt(totals.adPerDay)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{bdt(totals.revenue)}</td>
                    <td className={cn("px-2 py-2 text-right tabular-nums", totals.profit < 0 ? "text-destructive" : "text-emerald-600")}>
                      {bdt(totals.profit)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{bdt(totals.qty > 0 ? totals.profit / totals.qty : 0)}</td>
                    <td colSpan={2} />
                    <td className="px-2 py-2 text-right tabular-nums">{pct(totalMargin)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Target margin engine */}
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-primary" />
              <h3 className="font-display text-sm font-semibold">Target margin engine</h3>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold tabular-nums">{targetPct}%</span>
              <Slider
                className="w-48"
                min={0}
                max={60}
                step={1}
                value={[targetPct]}
                onValueChange={(v) => setTargetPct(v[0] ?? 20)}
              />
              <Button size="sm" variant="outline" onClick={() => applyTargetPrices.mutate()} disabled={applyTargetPrices.isPending}>
                <Sparkles className="mr-1 h-3.5 w-3.5" /> Price বসাও
              </Button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {scenarios.map((s) => (
              <div key={s.pct} className="rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{s.pct}% margin হলে</span>
                  <Badge variant={totalMargin >= s.pct ? "default" : "secondary"}>
                    {totalMargin >= s.pct ? "পৌঁছেছে" : "বাকি"}
                  </Badge>
                </div>
                <p className="mt-1 font-display text-lg font-semibold tabular-nums">{bdt(s.targetProfit)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  দরকার revenue {bdt(s.neededRevenue)} · price ×{s.priceFactor ? s.priceFactor.toFixed(2) : "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  বর্তমান profit থেকে {s.gap >= 0 ? "কম" : "বেশি"} {bdt(Math.abs(s.gap))}
                </p>
              </div>
            ))}
          </div>
          {risky.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
              <p className="mb-1 flex items-center gap-1 font-medium text-amber-600">
                <TrendingUp className="h-3.5 w-3.5" /> ঝুঁকিপূর্ণ product
              </p>
              <ul className="space-y-0.5 text-muted-foreground">
                {risky.slice(0, 6).map((r) => {
                  const m = rowMath(r);
                  const need = priceForMargin(r, targetPct);
                  return (
                    <li key={r.id}>
                      <span className="font-medium text-foreground">{r.product_name || "নামহীন"}</span> — margin {pct(m.margin)}
                      {need && Number.isFinite(need) ? ` · ${targetPct}% পেতে sell price ${bdt(Math.ceil(need))}` : ""}
                      {m.cmPerUnit < 0 ? " · প্রতি পিসে লস" : ""}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({
  label, value, sub, accent = "muted",
}: { label: string; value: string; sub?: string; accent?: "primary" | "emerald" | "destructive" | "muted" }) {
  const tone: Record<string, string> = {
    primary: "text-primary",
    emerald: "text-emerald-600",
    destructive: "text-destructive",
    muted: "text-foreground",
  };
  return (
    <div className="rounded-xl border bg-card p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={cn("font-display text-lg font-bold leading-tight tabular-nums", tone[accent])}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Coverage({ label, value, detail, invert }: { label: string; value: number; detail: string; invert?: boolean }) {
  return <CoverageInner label={label} value={value} detail={detail} invert={invert} />;
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-lg font-semibold tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function CoverageInner({ label, value, detail, invert }: { label: string; value: number; detail: string; invert?: boolean }) {
  const capped = Math.max(0, Math.min(100, value));
  const good = invert ? value <= 100 : value >= 100;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn("text-sm font-semibold tabular-nums", good ? "text-emerald-600" : "text-amber-600")}>
          {value.toFixed(0)}%
        </p>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", good ? "bg-emerald-500" : "bg-amber-500")} style={{ width: `${capped}%` }} />
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{detail}</p>
    </div>
  );
}

function BulkApply({ onApply, pending }: { onApply: (p: Partial<PlanScenarioRow>) => void; pending: boolean }) {
  const [open, setOpen] = useState(false);
  const [field, setField] = useState<NumField>("marketing_cost");
  const [val, setVal] = useState("");
  const labels: Record<NumField, string> = {
    qty: "Qty", sell_price: "Sell price", discount_pct: "Discount %", cost_price: "Cost price",
    marketing_cost: "Marketing/pc", packaging_cost: "Packaging/pc", courier_cost: "Courier/pc",
    return_pct: "Return %", return_cost: "Return cost/pc", lead_time_days: "Lead days",
    sell_days: "কত দিনে বিক্রি",
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline">Bulk set</Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-2">
        <p className="text-xs font-medium">সব row-এ একই মান বসাও</p>
        <select
          className="h-8 w-full rounded-md border bg-background px-2 text-sm"
          value={field}
          onChange={(e) => setField(e.target.value as NumField)}
        >
          {(Object.keys(labels) as NumField[]).map((k) => (
            <option key={k} value={k}>{labels[k]}</option>
          ))}
        </select>
        <Input
          className="h-8"
          inputMode="decimal"
          placeholder="মান"
          value={val}
          onChange={(e) => /^\d*\.?\d*$/.test(e.target.value) && setVal(e.target.value)}
        />
        <Button
          size="sm"
          className="w-full"
          disabled={pending || val === ""}
          onClick={() => {
            onApply({ [field]: Number(val) } as Partial<PlanScenarioRow>);
            setOpen(false);
            setVal("");
          }}
        >
          প্রয়োগ করো
        </Button>
      </PopoverContent>
    </Popover>
  );
}
