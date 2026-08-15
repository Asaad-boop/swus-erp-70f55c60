import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  PackageSearch,
  Save,
  AlertTriangle,
  RotateCcw,
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

export const Route = createFileRoute("/_authenticated/erp/growth/planning")({
  head: () => ({
    meta: [
      { title: "Monthly Projection — Growth Studio" },
      {
        name: "description",
        content:
          "Product-wise run-rate projection for revenue, profit and sourcing targets, compared against this month's actuals.",
      },
      { property: "og:title", content: "Monthly Projection — Growth Studio" },
      {
        property: "og:description",
        content: "Plan monthly revenue, profit and purchase targets from live sales run-rate.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlanningPage,
});

const bdt = (n: number) => fmtValue(n, "bdt");
const num = (n: number) => Math.round(n).toLocaleString("en-BD");

function PlanningPage() {
  const { brandIds, activeBrand } = useBrand();
  const brandId = activeBrand?.id ?? null;
  const qc = useQueryClient();
  const [month, setMonth] = useState(() => monthStart());

  const projQ = useQuery({
    queryKey: ["hub-projection", brandIds, month],
    queryFn: () => fetchProjection(brandIds, month),
    enabled: brandIds.length > 0,
  });
  const planQ = useQuery({
    queryKey: ["hub-month-plan", brandId, month],
    queryFn: () => fetchMonthPlan(brandId, month),
  });

  const proj = projQ.data;
  const rows = proj?.products ?? [];

  const totals = useMemo(() => {
    return rows.reduce(
      (a, r) => ({
        projRevenue: a.projRevenue + r.proj_revenue,
        projProfit: a.projProfit + r.proj_profit,
        projUnits: a.projUnits + r.proj_units,
        mtdRevenue: a.mtdRevenue + r.mtd_revenue,
        mtdProfit: a.mtdProfit + r.mtd_profit,
        mtdUnits: a.mtdUnits + r.mtd_units,
      }),
      { projRevenue: 0, projProfit: 0, projUnits: 0, mtdRevenue: 0, mtdProfit: 0, mtdUnits: 0 },
    );
  }, [rows]);

  const savePlan = useMutation({
    mutationFn: (patch: Partial<HubMonthPlan>) => saveMonthPlan(brandId, month, patch),
    onSuccess: () => {
      toast.success("Plan সেভ হয়েছে");
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

  const plan = planQ.data;
  const lowStock = rows.filter((r) => r.days_of_stock != null && r.days_of_stock < 21);

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-3 md:p-6">
      <GrowthPageHeader
        icon={BarChart3}
        title="Monthly Projection"
        subtitle={`${activeBrand ? activeBrand.name : "All brands"} — গত ৩ মাসের run-rate থেকে ${monthLabel(month)}-এর projection`}
        actions={
          <div className="flex items-center gap-1 rounded-full border p-0.5">
            <Button size="icon" variant="ghost" className="h-7 w-7 rounded-full" onClick={() => setMonth(shiftMonth(month, -1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-2 text-xs font-medium">{monthLabel(month)}</span>
            <Button size="icon" variant="ghost" className="h-7 w-7 rounded-full" onClick={() => setMonth(shiftMonth(month, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        }
      />

      {projQ.isLoading && <Skeleton className="h-40 w-full rounded-xl" />}

      {/* Projection vs goal */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <GapCard
          label="Projected revenue"
          value={bdt(totals.projRevenue)}
          target={plan?.target_revenue ?? 0}
          actual={totals.projRevenue}
          sub={`MTD ${bdt(totals.mtdRevenue)}`}
        />
        <GapCard
          label="Projected profit"
          value={bdt(totals.projProfit)}
          target={plan?.target_profit ?? 0}
          actual={totals.projProfit}
          sub={`MTD ${bdt(totals.mtdProfit)}`}
        />
        <GapCard
          label="Projected units"
          value={num(totals.projUnits)}
          target={0}
          actual={0}
          sub={`MTD ${num(totals.mtdUnits)} pcs • ${proj?.days_done ?? 0}/${proj?.days_total ?? 0} দিন`}
        />
        <GapCard
          label="New products this month"
          value={num(proj?.new_products ?? 0)}
          target={plan?.target_new_products ?? 0}
          actual={proj?.new_products ?? 0}
          sub={`Target ${num(plan?.target_new_products ?? 0)}`}
        />
      </div>

      {/* Targets editor */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <h2 className="font-display text-sm font-semibold">এই মাসের target</h2>
          <TargetForm
            key={`${month}-${plan?.id ?? "new"}`}
            plan={plan}
            saving={savePlan.isPending}
            onSave={(p) => savePlan.mutate(p)}
          />
        </CardContent>
      </Card>

      {/* Sourcing target vs actual */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <PackageSearch className="h-4 w-4 text-primary" />
            <h2 className="font-display text-sm font-semibold">Sourcing target vs actual</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <SourcingBar
              label="Order quantity"
              actual={proj?.sourcing.units ?? 0}
              target={plan?.target_order_qty ?? 0}
              fmt={num}
            />
            <SourcingBar
              label="Order value"
              actual={proj?.sourcing.value ?? 0}
              target={plan?.target_order_value ?? 0}
              fmt={bdt}
            />
            <SourcingBar
              label="New products"
              actual={proj?.new_products ?? 0}
              target={plan?.target_new_products ?? 0}
              fmt={num}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            এই মাসে মোট {num(proj?.sourcing.po_count ?? 0)}টি purchase order (import + local) হয়েছে।
          </p>
        </CardContent>
      </Card>

      {/* Stock-out warnings */}
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

      {/* Product table */}
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between p-4 pb-2">
            <h2 className="font-display text-sm font-semibold">Product-wise projection</h2>
            <span className="text-xs text-muted-foreground">Best-seller অনুযায়ী sorted</span>
          </div>
          {rows.length === 0 && !projQ.isLoading ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              এই মাসের জন্য কোনো sales history নেই।
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-y bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Product</th>
                    <th className="px-3 py-2 text-right font-medium">3-mo units</th>
                    <th className="px-3 py-2 text-right font-medium">Run-rate</th>
                    <th className="px-3 py-2 text-right font-medium">MTD</th>
                    <th className="px-3 py-2 text-right font-medium">Proj. units</th>
                    <th className="px-3 py-2 text-right font-medium">Price</th>
                    <th className="px-3 py-2 text-right font-medium">Unit cost</th>
                    <th className="px-3 py-2 text-right font-medium">Proj. revenue</th>
                    <th className="px-3 py-2 text-right font-medium">Proj. profit</th>
                    <th className="px-3 py-2 text-right font-medium">Stock</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <ProductRow
                      key={r.product_id}
                      row={r}
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
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function GapCard({
  label,
  value,
  target,
  actual,
  sub,
}: {
  label: string;
  value: string;
  target: number;
  actual: number;
  sub: string;
}) {
  const pct = target > 0 ? Math.round((actual / target) * 100) : null;
  return (
    <Card>
      <CardContent className="space-y-1.5 p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-display text-2xl font-bold">{value}</p>
        {pct != null && (
          <>
            <Progress value={Math.min(100, Math.max(0, pct))} />
            <p className="text-[11px] text-muted-foreground">
              Target-এর {pct}% {pct < 100 ? `— gap ${num(target - actual)}` : "— target ছাড়িয়ে গেছে"}
            </p>
          </>
        )}
        <p className="text-[11px] text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
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
  onSave,
}: {
  plan: HubMonthPlan | null | undefined;
  saving: boolean;
  onSave: (p: Partial<HubMonthPlan>) => void;
}) {
  const [f, setF] = useState({
    target_revenue: String(plan?.target_revenue ?? ""),
    target_profit: String(plan?.target_profit ?? ""),
    target_new_products: String(plan?.target_new_products ?? ""),
    target_order_qty: String(plan?.target_order_qty ?? ""),
    target_order_value: String(plan?.target_order_value ?? ""),
    notes: plan?.notes ?? "",
  });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  return (
    <div className="grid gap-3 md:grid-cols-6">
      <Field label="Revenue target" value={f.target_revenue} onChange={(v) => set("target_revenue", v)} />
      <Field label="Profit target" value={f.target_profit} onChange={(v) => set("target_profit", v)} />
      <Field label="New products" value={f.target_new_products} onChange={(v) => set("target_new_products", v)} />
      <Field label="Order qty" value={f.target_order_qty} onChange={(v) => set("target_order_qty", v)} />
      <Field label="Order value" value={f.target_order_value} onChange={(v) => set("target_order_value", v)} />
      <div className="flex items-end">
        <Button
          className="w-full"
          disabled={saving}
          onClick={() =>
            onSave({
              target_revenue: Number(f.target_revenue) || 0,
              target_profit: Number(f.target_profit) || 0,
              target_new_products: Number(f.target_new_products) || 0,
              target_order_qty: Number(f.target_order_qty) || 0,
              target_order_value: Number(f.target_order_value) || 0,
              notes: f.notes || null,
            })
          }
        >
          <Save className="mr-1.5 h-4 w-4" /> Save
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <Input
        inputMode="decimal"
        value={value}
        placeholder="0"
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function ProductRow({
  row,
  onSave,
  onReset,
}: {
  row: import("@/lib/erp/hub/hub-data").HubPlanProductRow;
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
