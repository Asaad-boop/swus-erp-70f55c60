import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import {
  ArrowLeft,
  ShoppingCart,
  TrendingUp,
  DollarSign,
  AlertTriangle,
  MessageCircle,
  CheckCircle2,
  Percent,
  Loader2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DateRangePicker,
  buildPreset,
  type MktRangeValue,
} from "@/components/erp/marketing/date-range-picker";
import { useBrand } from "@/contexts/brand-context";
import { incompleteReportsFn } from "@/lib/erp/abandoned-carts.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/erp/orders/incomplete-reports")({
  head: () => ({ meta: [{ title: "Incomplete Reports — ERP" }] }),
  component: IncompleteReportsPage,
});

function parseYmd(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

function IncompleteReportsPage() {
  const { activeBrand, brandIds, isAllBrands } = useBrand();
  const navigate = useNavigate();
  const reportsFn = useServerFn(incompleteReportsFn);

  // Plain YYYY-MM-DD business days; the server converts them to Asia/Dhaka
  // day boundaries (+06:00), so no timezone drift.
  const [range, setRange] = useState<MktRangeValue>(() => buildPreset("30d"));
  const dateFrom = range.from;
  const dateTo = range.to;

  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      "incomplete-reports",
      activeBrand?.id ?? null,
      (brandIds ?? []).join(","),
      isAllBrands,
      dateFrom,
      dateTo,
    ],
    queryFn: () =>
      reportsFn({
        data: {
          brandId: activeBrand?.id ?? null,
          brandIds: isAllBrands ? brandIds : activeBrand ? [activeBrand.id] : undefined,
          dateFrom,
          dateTo,
        },
      }),
  });

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild className="h-8 gap-1.5">
            <Link to="/erp/orders/web" search={{ tab: "incomplete" } as any}>
              <ArrowLeft className="h-4 w-4" /> Back to Incomplete
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Incomplete Reports</h1>
            <p className="text-sm text-muted-foreground">
              {format(parseYmd(dateFrom), "dd MMM yyyy")} – {format(parseYmd(dateTo), "dd MMM yyyy")}
              {isFetching && <span className="ml-2 text-xs">· syncing</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <DateRangePicker value={range} onChange={setRange} />
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : !data ? (
        <Card className="p-8 text-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
          Loading…
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi
              icon={<ShoppingCart className="h-4 w-4" />}
              label="Total Incomplete"
              value={data.totalCarts.toLocaleString()}
              tone="amber"
              sub={`${(data.byLastStep ?? []).length} distinct steps`}
            />
            <Kpi
              icon={<CheckCircle2 className="h-4 w-4" />}
              label="Recovered"
              value={data.convertedCarts.toLocaleString()}
              tone="emerald"
              sub="Contacted → converted"
            />
            <Kpi
              icon={<AlertTriangle className="h-4 w-4" />}
              label="Lost Revenue"
              value={`৳${Math.round(data.lostRevenue).toLocaleString()}`}
              tone="rose"
              sub="Unconverted carts"
            />
            <Kpi
              icon={<DollarSign className="h-4 w-4" />}
              label="Recovered Revenue"
              value={`৳${Math.round(data.convertedRevenue).toLocaleString()}`}
              tone="emerald"
              sub={`of ৳${Math.round(data.totalRevenue).toLocaleString()} total`}
            />
            <Kpi
              icon={<TrendingUp className="h-4 w-4" />}
              label="Avg Cart Value"
              value={`৳${Math.round(data.avgCartValue).toLocaleString()}`}
              tone="blue"
            />
            <Kpi
              icon={<MessageCircle className="h-4 w-4" />}
              label="Contacted"
              value={data.contactedCount.toLocaleString()}
              tone="blue"
              sub={`${data.messagesSent} msg${data.messagesSent === 1 ? "" : "s"} sent`}
            />
            <Kpi
              icon={<Percent className="h-4 w-4" />}
              label="Response Rate"
              value={`${data.responseRate.toFixed(1)}%`}
              tone="purple"
              sub="Contacted → converted"
            />
            <Kpi
              icon={<Percent className="h-4 w-4" />}
              label="Recovery Rate"
              value={`${data.recoveryRate.toFixed(1)}%`}
              tone="emerald"
              sub={`${data.convertedCarts} of ${data.contactedCount} contacted`}
            />
          </div>

          {data.byLastStep.length > 0 && (
            <Card className="p-4">
              <div className="text-sm font-semibold mb-3">Drop-off by last step</div>
              <div className="space-y-2">
                {data.byLastStep.map((s) => {
                  const pct = data.totalCarts > 0 ? (s.count / data.totalCarts) * 100 : 0;
                  return (
                    <div key={s.step} className="text-xs">
                      <div className="flex justify-between mb-1">
                        <span className="capitalize font-medium">{s.step}</span>
                        <span className="text-muted-foreground tabular-nums">
                          {s.count} · {pct.toFixed(1)}%
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone: "amber" | "emerald" | "rose" | "blue" | "purple";
}) {
  const toneMap: Record<string, string> = {
    amber: "text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-950/40",
    emerald: "text-emerald-700 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-950/40",
    rose: "text-rose-700 bg-rose-100 dark:text-rose-300 dark:bg-rose-950/40",
    blue: "text-blue-700 bg-blue-100 dark:text-blue-300 dark:bg-blue-950/40",
    purple: "text-purple-700 bg-purple-100 dark:text-purple-300 dark:bg-purple-950/40",
  };
  return (
    <Card className="p-4 space-y-2">
      <div className="flex items-center gap-2">
        <div className={cn("h-7 w-7 rounded-md flex items-center justify-center", toneMap[tone])}>
          {icon}
        </div>
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </Card>
  );
}