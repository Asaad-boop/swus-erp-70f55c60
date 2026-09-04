import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useBrand } from "@/contexts/brand-context";
import {
  GrowthHeader,
  GrowthTabs,
  InsufficientData,
  useGrowthRange,
} from "@/components/erp/growth/growth-filters";
import { getCommandCenter, type CommandCenter } from "@/lib/erp/growth/command.functions";
import { MediaPlansPage } from "@/components/erp/growth/pages/media-plans";

const Search = z.object({ tab: z.enum(["performance", "plans"]).catch("performance") });

export const Route = createFileRoute("/_authenticated/erp/growth/media")({
  validateSearch: Search,
  component: MediaCenterPage,
});

const bdt = (n: number) => `৳${Math.round(n).toLocaleString("en-BD")}`;

function MediaCenterPage() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate();
  const { brandIds, isLoading } = useBrand();
  const { range, setRange } = useGrowthRange();
  const fetchCC = useServerFn(getCommandCenter);

  const cc = useQuery<CommandCenter>({
    queryKey: ["growth-command", brandIds, range.from, range.to],
    enabled: !isLoading && brandIds.length > 0 && tab === "performance",
    queryFn: () => fetchCC({ data: { brandIds, from: range.from, to: range.to } }),
  });

  const rows = (cc.data?.campaigns ?? []).filter((c) => c.spend > 0 || c.delivered_orders > 0);

  return (
    <div className="pb-16">
      <GrowthTabs
        tabs={[
          { key: "performance", label: "Performance" },
          { key: "plans", label: "Media Plans & Budget" },
        ]}
        value={tab}
        onChange={(k) => navigate({ to: "/erp/growth/media", search: { tab: k as "performance" } })}
      />
      {tab === "plans" ? (
        <MediaPlansPage />
      ) : (
        <>
          <GrowthHeader
            title="Media Center"
            subtitle="Profitability first — a campaign is good only when its CPA is below break-even"
            range={range}
            onRangeChange={setRange}
            actions={
              <Button asChild size="sm" variant="outline">
                <Link to="/erp/marketing/truth">Open Marketing</Link>
              </Button>
            }
          />
          <div className="mx-auto max-w-[1500px] px-4 py-5 md:px-6">
            {cc.isLoading ? (
              <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading campaign economics…
              </div>
            ) : rows.length === 0 ? (
              <InsufficientData note="No ad spend or attributed delivered order in this period." />
            ) : (
              <Card className="shadow-none">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Campaign profitability</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto p-0">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-4 py-2 font-medium">Campaign</th>
                        <th className="px-4 py-2 text-right font-medium">Spend</th>
                        <th className="px-4 py-2 text-right font-medium">Delivered orders</th>
                        <th className="px-4 py-2 text-right font-medium">CPA</th>
                        <th className="px-4 py-2 text-right font-medium">Break-even CPA</th>
                        <th className="px-4 py-2 text-right font-medium">Profit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((c) => {
                        const cpa = c.delivered_orders > 0 ? c.spend / c.delivered_orders : null;
                        const profitPerOrder = c.delivered_orders > 0 ? c.gross_profit / c.delivered_orders : null;
                        const breakEven = cpa !== null && profitPerOrder !== null ? cpa + profitPerOrder : null;
                        const healthy = cpa !== null && breakEven !== null && cpa < breakEven;
                        return (
                          <tr key={c.campaign_id} className="border-b border-border/60 last:border-0">
                            <td className="max-w-[280px] truncate px-4 py-2 font-medium">{c.name}</td>
                            <td className="px-4 py-2 text-right tabular-nums">{bdt(c.spend)}</td>
                            <td className="px-4 py-2 text-right tabular-nums">{c.delivered_orders}</td>
                            <td className="px-4 py-2 text-right tabular-nums">{cpa === null ? "—" : bdt(cpa)}</td>
                            <td className="px-4 py-2 text-right tabular-nums">
                              {breakEven === null ? "—" : bdt(breakEven)}
                            </td>
                            <td
                              className={`px-4 py-2 text-right tabular-nums font-medium ${
                                healthy ? "text-emerald-600" : c.gross_profit < 0 ? "text-rose-600" : ""
                              }`}
                            >
                              {bdt(c.gross_profit)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}
