import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useBrand } from "@/contexts/brand-context";
import {
  GrowthHeader,
  GrowthTabs,
  InsufficientData,
  useGrowthRange,
} from "@/components/erp/growth/growth-filters";
import { getCommandCenter, type CommandCenter } from "@/lib/erp/growth/command.functions";
import { ProductPipelinePage } from "@/components/erp/growth/pages/products";

const Search = z.object({ tab: z.enum(["performance", "pipeline"]).catch("performance") });

export const Route = createFileRoute("/_authenticated/erp/growth/products")({
  validateSearch: Search,
  component: ProductLabPage,
});

const bdt = (n: number) => `৳${Math.round(n).toLocaleString("en-BD")}`;

function ProductLabPage() {
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

  const rows = cc.data?.products ?? [];
  const days = cc.data?.period.days ?? 1;

  return (
    <div className="pb-16">
      <GrowthTabs
        tabs={[
          { key: "performance", label: "Live performance" },
          { key: "pipeline", label: "Idea → Winner pipeline" },
        ]}
        value={tab}
        onChange={(k) => navigate({ to: "/erp/growth/products", search: { tab: k as "performance" } })}
      />
      {tab === "pipeline" ? (
        <ProductPipelinePage />
      ) : (
        <>
          <GrowthHeader
            title="Product Lab"
            subtitle="Canonical unit economics per SKU — profit, velocity and stock cover"
            range={range}
            onRangeChange={setRange}
          />
          <div className="mx-auto max-w-[1500px] px-4 py-5 md:px-6">
            {cc.isLoading ? (
              <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading product economics…
              </div>
            ) : rows.length === 0 ? (
              <InsufficientData note="No delivered units for the selected brand and period." />
            ) : (
              <Card className="shadow-none">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Product performance ({rows.length})</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto p-0">
                  <table className="w-full min-w-[820px] text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-4 py-2 font-medium">Product</th>
                        <th className="px-4 py-2 text-right font-medium">Units</th>
                        <th className="px-4 py-2 text-right font-medium">Revenue</th>
                        <th className="px-4 py-2 text-right font-medium">Profit</th>
                        <th className="px-4 py-2 text-right font-medium">Margin</th>
                        <th className="px-4 py-2 text-right font-medium">Stock</th>
                        <th className="px-4 py-2 text-right font-medium">Days cover</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((p) => {
                        const margin = p.delivered_revenue > 0 ? (p.gross_profit / p.delivered_revenue) * 100 : null;
                        const daily = p.delivered_units / Math.max(1, days);
                        const cover = daily > 0 ? p.stock / daily : null;
                        return (
                          <tr key={p.product_id} className="border-b border-border/60 last:border-0">
                            <td className="max-w-[300px] px-4 py-2">
                              <p className="truncate font-medium">{p.title || "Untitled"}</p>
                              {p.sku && <p className="text-[11px] text-muted-foreground">{p.sku}</p>}
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums">{p.delivered_units}</td>
                            <td className="px-4 py-2 text-right tabular-nums">{bdt(p.delivered_revenue)}</td>
                            <td
                              className={`px-4 py-2 text-right font-medium tabular-nums ${
                                p.gross_profit < 0 ? "text-rose-600" : "text-emerald-600"
                              }`}
                            >
                              {bdt(p.gross_profit)}
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums">
                              {margin === null ? "—" : `${margin.toFixed(1)}%`}
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums">{p.stock}</td>
                            <td
                              className={`px-4 py-2 text-right tabular-nums ${
                                cover !== null && cover <= 7 ? "font-medium text-rose-600" : ""
                              }`}
                            >
                              {cover === null ? "—" : `${Math.floor(cover)}d`}
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
