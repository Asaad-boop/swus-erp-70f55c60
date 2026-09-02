import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle } from "lucide-react";
import { useBrand } from "@/contexts/brand-context";
import { InsufficientData } from "@/components/erp/growth/growth-filters";
import { getGrowthFunnel } from "@/lib/erp/growth/analytics.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { MktRangeValue } from "@/components/erp/marketing/date-range-picker";

export function FunnelPanel({ range }: { range: MktRangeValue }) {
  const { brandIds, isLoading } = useBrand();
  const fetchFunnel = useServerFn(getGrowthFunnel);
  const from = range.from;
  const to = range.to;

  const q = useQuery({
    queryKey: ["growth-funnel", brandIds, from, to],
    enabled: !isLoading && brandIds.length > 0,
    queryFn: () => fetchFunnel({ data: { brandIds, from, to } }),
  });

  if (q.isLoading) {
    return <div className="space-y-2 p-4 md:p-6">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  }

  const steps = q.data?.steps ?? [];
  const top = steps.find((s) => s.value !== null && s.value > 0)?.value ?? 0;
  const hasAny = steps.some((s) => s.value !== null && s.value > 0);

  return (
    <div className="space-y-3 p-4 md:p-6">
      <div>
        <h2 className="text-sm font-semibold">Conversion funnel</h2>
        <p className="text-xs text-muted-foreground">
          Impression → Click → Order → Confirmed → Delivered. Source: <code>mkt_dashboard_kpis</code>.
        </p>
      </div>
      {!hasAny ? (
        <InsufficientData note="Ei window e kono funnel data nei." />
      ) : (
        <Card className="shadow-none">
          <CardContent className="space-y-2 p-4">
            {steps.map((s) => {
              const pct = s.value !== null && top > 0 ? Math.max(2, (s.value / top) * 100) : 0;
              const worst = q.data?.biggestDropKey === s.key;
              return (
                <div key={s.key} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">{s.label}</span>
                    <span className="flex items-center gap-2 tabular-nums text-muted-foreground">
                      {s.cvr !== null && (
                        <span className={cn(worst && "text-destructive")}>{s.cvr.toFixed(2)}%</span>
                      )}
                      {worst && (
                        <span className="flex items-center gap-1 text-destructive">
                          <AlertTriangle className="h-3 w-3" /> biggest drop
                        </span>
                      )}
                      <span className="text-foreground">
                        {s.value === null ? "Insufficient data" : s.value.toLocaleString("en-BD")}
                      </span>
                    </span>
                  </div>
                  <div className="h-2.5 w-full rounded-sm border border-border bg-muted/40">
                    <div
                      className={cn("h-full rounded-sm", worst ? "bg-destructive/70" : "bg-primary/70")}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
