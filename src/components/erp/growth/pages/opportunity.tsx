import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useBrand } from "@/contexts/brand-context";
import { InsufficientData } from "@/components/erp/growth/growth-filters";
import { getMarketOpportunity } from "@/lib/erp/growth/market.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { MktRangeValue } from "@/components/erp/marketing/date-range-picker";

const bdt = (n: number) => `৳${Math.round(n).toLocaleString("en-BD")}`;

function tone(score: number | null) {
  if (score === null) return "border-border text-muted-foreground";
  if (score >= 70) return "border-emerald-500/40 text-emerald-600 dark:text-emerald-400";
  if (score >= 45) return "border-amber-500/40 text-amber-600 dark:text-amber-400";
  return "border-destructive/40 text-destructive";
}

export function OpportunityPanel({ range }: { range: MktRangeValue }) {
  const { brandIds, isLoading } = useBrand();
  const fetchOpp = useServerFn(getMarketOpportunity);
  const from = range.from;
  const to = range.to;

  const q = useQuery({
    queryKey: ["growth-opportunity", brandIds, from, to],
    enabled: !isLoading && brandIds.length > 0,
    queryFn: () => fetchOpp({ data: { brandIds, from, to } }),
  });

  if (q.isLoading) {
    return <div className="space-y-2 p-4 md:p-6">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;
  }
  const rows = q.data?.rows ?? [];

  return (
    <div className="space-y-3 p-4 md:p-6">
      <div>
        <h2 className="text-sm font-semibold">Product opportunity score</h2>
        <p className="text-xs text-muted-foreground">
          Demand + margin canonical <code>get_sku_profit</code> theke.{" "}
          {q.data && q.data.rivalsTracked > 0
            ? `Competition: ${q.data.rivalsTracked} tracked rival${q.data.rivalsTracked > 1 ? "s" : ""}.`
            : "Competition score nei — kono rival track kora nei."}
        </p>
      </div>
      {rows.length === 0 ? (
        <InsufficientData note="Ei window e kono delivered sale nei." />
      ) : (
        <Card className="shadow-none">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Product</th>
                    <th className="px-3 py-2 text-right font-medium">Units</th>
                    <th className="px-3 py-2 text-right font-medium">Revenue</th>
                    <th className="px-3 py-2 text-right font-medium">Margin</th>
                    <th className="px-3 py-2 text-right font-medium">Stock</th>
                    <th className="px-3 py-2 text-right font-medium">Score</th>
                    <th className="px-3 py-2 text-left font-medium">Recommendation</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.product_id} className="border-b border-border/60 last:border-0">
                      <td className="px-3 py-2">
                        <p className="font-medium">{r.title}</p>
                        {r.sku && <p className="text-[11px] text-muted-foreground">{r.sku}</p>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.delivered_units}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{bdt(r.delivered_revenue)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {r.margin_pct === null ? "—" : `${r.margin_pct.toFixed(1)}%`}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.stock}</td>
                      <td className="px-3 py-2 text-right">
                        <Badge variant="outline" className={tone(r.score)}>{r.score ?? "—"}</Badge>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{r.recommendation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
