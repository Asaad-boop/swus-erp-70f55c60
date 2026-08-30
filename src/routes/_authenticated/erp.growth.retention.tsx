import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Repeat, Users, HeartHandshake, ShoppingBasket, Phone, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useBrand } from "@/contexts/brand-context";
import {
  ContentHero,
  KpiStrip,
  Kpi,
  Pill,
  EmptyState,
  LoadingGrid,
  ExportButton,
  downloadCsv,
  Segmented,
} from "@/components/erp/content/content-ui";
import { getGrowthRetention } from "@/lib/erp/growth/retention.functions";

export const Route = createFileRoute("/_authenticated/erp/growth/retention")({
  component: RetentionPage,
  head: () => ({
    meta: [
      { title: "Retention & Upsell — Growth Studio" },
      {
        name: "description",
        content:
          "Repeat purchase rate, win-back customer list and frequently-bought-together cross-sell picks for your brands.",
      },
      { property: "og:title", content: "Retention & Upsell — Growth Studio" },
      {
        property: "og:description",
        content: "Repeat rate, LTV, win-back calls and cross-sell recommendations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const bdt = (n: number | null | undefined) =>
  n == null ? "—" : "৳" + Math.round(n).toLocaleString("en-IN");

function dhakaToday() {
  return new Date(Date.now() + 6 * 3600_000).toISOString().slice(0, 10);
}
function shift(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

const RANGES = [
  { key: "30", label: "30 din" },
  { key: "90", label: "90 din" },
  { key: "180", label: "180 din" },
  { key: "365", label: "1 bochor" },
] as const;

const GAPS = [
  { key: "30", label: "30+ din" },
  { key: "45", label: "45+ din" },
  { key: "60", label: "60+ din" },
  { key: "90", label: "90+ din" },
] as const;

function RetentionPage() {
  const { brandIds, isLoading: brandLoading } = useBrand();
  const [range, setRange] = useState<(typeof RANGES)[number]["key"]>("90");
  const [gap, setGap] = useState<(typeof GAPS)[number]["key"]>("45");

  const today = dhakaToday();
  const from = shift(today, -(Number(range) - 1));

  const fetchRetention = useServerFn(getGrowthRetention);
  const q = useQuery({
    queryKey: ["growth-retention", brandIds, from, today, gap],
    enabled: !brandLoading && brandIds.length > 0,
    queryFn: () =>
      fetchRetention({
        data: { brandIds, from, to: today, minDaysSince: Number(gap) },
      }),
  });

  const s = q.data?.summary;
  const winback = q.data?.winback ?? [];
  const pairs = q.data?.pairs ?? [];

  const upliftPct = useMemo(() => {
    if (!s?.aov_single || !s?.aov_multi) return null;
    return ((s.aov_multi - s.aov_single) / s.aov_single) * 100;
  }, [s]);

  const exportWinback = () =>
    downloadCsv(`winback-${today}.csv`, [
      ["Phone", "Name", "Orders", "Total spent", "Last order", "Days since", "Last product"],
      ...winback.map((r) => [
        r.phone,
        r.name ?? "",
        r.orders,
        r.total_spent,
        r.last_order_at.slice(0, 10),
        r.days_since,
        r.last_product ?? "",
      ]),
    ]);

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-3 sm:p-5">
      <ContentHero
        icon={Repeat}
        title="Retention & Upsell"
        subtitle="Repeat purchase, win-back call list ar cross-sell jora — delivered order-er upor hisheb."
        actions={
          <Segmented options={RANGES} value={range} onChange={setRange} />
        }
      />

      {brandIds.length === 0 ? (
        <EmptyState title="Brand select koro" description="Upor theke ek ba ekadhik brand baccho." />
      ) : q.isLoading ? (
        <LoadingGrid rows={6} />
      ) : q.isError ? (
        <EmptyState
          icon={TrendingUp}
          title="Data ana gelo na"
          description={(q.error as Error)?.message}
          action={
            <Button size="sm" variant="outline" onClick={() => q.refetch()}>
              Abar try koro
            </Button>
          }
        />
      ) : (
        <>
          {s && s.customers > 0 && (
            <KpiStrip cols={6}>
              <Kpi label="Customer" value={s.customers.toLocaleString()} icon={Users} />
              <Kpi
                label="Repeat rate"
                value={s.repeat_rate == null ? "—" : `${s.repeat_rate.toFixed(2)}%`}
                hint={`${s.repeat_customers.toLocaleString()} jon repeat`}
                icon={Repeat}
                tone={(s.repeat_rate ?? 0) >= 15 ? "good" : "warn"}
              />
              <Kpi label="Avg LTV" value={bdt(s.avg_ltv)} icon={HeartHandshake} />
              <Kpi
                label="Order / customer"
                value={s.avg_orders_per_customer?.toFixed(2) ?? "—"}
              />
              <Kpi
                label="Median gap"
                value={s.median_gap_days == null ? "—" : `${s.median_gap_days} din`}
                hint="Duita order-er majhe"
              />
              <Kpi
                label="Multi-item order"
                value={
                  s.multi_item_order_pct == null ? "—" : `${s.multi_item_order_pct.toFixed(1)}%`
                }
                hint={upliftPct == null ? undefined : `Basket +${upliftPct.toFixed(0)}%`}
                icon={ShoppingBasket}
                tone={(s.multi_item_order_pct ?? 0) >= 15 ? "good" : "warn"}
              />
            </KpiStrip>
          )}

          {s && (s.aov_single != null || s.aov_multi != null) && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Basket lift</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-4 pt-0 text-sm">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    1 item AOV
                  </p>
                  <p className="text-lg font-semibold tabular-nums">{bdt(s.aov_single)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    2+ item AOV
                  </p>
                  <p className="text-lg font-semibold tabular-nums">{bdt(s.aov_multi)}</p>
                </div>
                {upliftPct != null && (
                  <Pill tone={upliftPct >= 0 ? "good" : "bad"}>
                    Cross-sell hole basket {upliftPct >= 0 ? "+" : ""}
                    {upliftPct.toFixed(0)}%
                  </Pill>
                )}
              </CardContent>
            </Card>
          )}

          {pairs.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">
                  Cross-sell jora (frequently bought together)
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Sathe kena hoy</TableHead>
                      <TableHead className="text-right">Pair order</TableHead>
                      <TableHead className="text-right">Attach rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pairs.map((p) => (
                      <TableRow key={`${p.product_a}-${p.product_b}`}>
                        <TableCell className="max-w-[240px] truncate text-xs font-medium">
                          {p.name_a}
                        </TableCell>
                        <TableCell className="max-w-[240px] truncate text-xs">{p.name_b}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">
                          {p.pair_orders}
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums font-medium">
                          {p.attach_rate == null ? "—" : `${p.attach_rate}%`}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {winback.length > 0 && (
            <Card>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-semibold">
                  Win-back list ({winback.length})
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Segmented options={GAPS} value={gap} onChange={setGap} size="xs" />
                  <ExportButton onClick={exportWinback} />
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-right">Order</TableHead>
                      <TableHead className="text-right">Spend</TableHead>
                      <TableHead className="text-right">Shesh order</TableHead>
                      <TableHead>Shesh product</TableHead>
                      <TableHead className="text-right">Call</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {winback.map((r) => (
                      <TableRow key={r.phone}>
                        <TableCell className="text-xs">
                          <div className="font-medium">{r.name ?? "—"}</div>
                          <div className="text-[10px] text-muted-foreground">{r.phone}</div>
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{r.orders}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">
                          {bdt(r.total_spent)}
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums">
                          <Pill tone={r.days_since >= 90 ? "bad" : "warn"}>
                            {r.days_since} din age
                          </Pill>
                        </TableCell>
                        <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground">
                          {r.last_product ?? "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button asChild size="sm" variant="outline" className="h-7 gap-1 text-xs">
                            <a href={`tel:${r.phone}`}>
                              <Phone className="h-3 w-3" /> Call
                            </a>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {!s?.customers && !winback.length && !pairs.length && (
            <EmptyState
              title="Ei range-e retention data nei"
              description="Delivered order hole ekhane repeat, win-back ar cross-sell data dekhabe."
            />
          )}
        </>
      )}
    </div>
  );
}
