import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Scale, RefreshCcw, Download, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useBrand } from "@/contexts/brand-context";
import { BrandTabs } from "@/components/erp/marketing/marketing-shell";
import {
  DateRangePicker,
  buildPreset,
  type MktRangeValue,
} from "@/components/erp/marketing/date-range-picker";
import { getCampaignTruth, type CampaignTruthRow } from "@/lib/erp/marketing/campaigns.functions";

export const Route = createFileRoute("/_authenticated/erp/marketing/truth")({
  head: () => ({
    meta: [
      { title: "Meta vs Actual — Marketing ERP" },
      {
        name: "description",
        content:
          "Compare Meta reported purchases and ROAS against real ERP orders, delivery, returns and actual ROAS for every synced campaign.",
      },
      { property: "og:title", content: "Meta vs Actual — Marketing ERP" },
      {
        property: "og:description",
        content: "Every campaign's Meta purchases side by side with real delivered revenue and ROAS.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CampaignTruthPage,
});

const bdt = (n: number) => "৳" + Math.round(n).toLocaleString("en-IN");

function roasTone(v: number) {
  if (v >= 2) return "text-emerald-600";
  if (v >= 1) return "text-amber-600";
  return "text-rose-600";
}

type MatchStatus = CampaignTruthRow["match_status"];

function matchLabel(s: MatchStatus) {
  if (s === "linked") return "Matched";
  if (s === "partial") return "Partial";
  if (s === "utm_only") return "UTM only";
  return "No orders";
}

function matchTone(s: MatchStatus) {
  if (s === "linked") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-600";
  if (s === "partial") return "border-amber-500/40 bg-amber-500/10 text-amber-600";
  if (s === "utm_only") return "border-sky-500/40 bg-sky-500/10 text-sky-600";
  return "border-rose-500/40 bg-rose-500/10 text-rose-600";
}

function CampaignTruthPage() {
  const { brands } = useBrand();
  const [brandKey, setBrandKey] = useState("all");
  const [range, setRange] = useState<MktRangeValue>(() => buildPreset("30d"));
  const [search, setSearch] = useState("");

  const brandIds = useMemo(() => {
    if (brandKey === "all") return brands.map((b) => b.id);
    const b = brands.find((x) => x.slug === brandKey || x.id === brandKey);
    return b ? [b.id] : brands.map((x) => x.id);
  }, [brandKey, brands]);

  const fetchTruth = useServerFn(getCampaignTruth);
  const q = useQuery({
    queryKey: ["mkt-campaign-truth", brandIds.slice().sort().join(","), range.from, range.to],
    queryFn: () => fetchTruth({ data: { brandIds, from: range.from, to: range.to } }),
    enabled: brandIds.length > 0,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const rows: CampaignTruthRow[] = useMemo(() => {
    const all = q.data ?? [];
    const s = search.trim().toLowerCase();
    if (!s) return all;
    return all.filter(
      (r) => r.name.toLowerCase().includes(s) || (r.external_id ?? "").includes(s),
    );
  }, [q.data, search]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (a, r) => {
          a.spend += r.spend;
          a.metaP += r.meta_purchases;
          a.metaV += r.meta_purchase_value;
          a.orders += r.orders;
          a.delivered += r.delivered_orders;
          a.returned += r.returned_orders;
          a.rev += r.delivered_revenue;
          return a;
        },
        { spend: 0, metaP: 0, metaV: 0, orders: 0, delivered: 0, returned: 0, rev: 0 },
      ),
    [rows],
  );

  const exportCsv = () => {
    const head = [
      "Campaign",
      "Campaign ID",
      "Status",
      "Spend",
      "Meta purchases",
      "Meta value",
      "Meta ROAS",
      "Real orders",
      "Confirmed",
      "Delivered",
      "Returned",
      "Cancelled",
      "In progress",
      "Delivered revenue",
      "Actual ROAS",
      "Gap (real - meta)",
      "Delivery %",
      "CPA",
      "CAC",
    ];
    const csv = [
      head,
      ...rows.map((r) => [
        r.name,
        r.external_id ?? "",
        r.status,
        r.spend,
        r.meta_purchases,
        r.meta_purchase_value,
        r.meta_roas,
        r.orders,
        r.confirmed_orders,
        r.delivered_orders,
        r.returned_orders,
        r.cancelled_orders,
        r.in_progress_orders,
        r.delivered_revenue,
        r.actual_roas,
        r.purchase_gap,
        r.delivery_rate,
        r.cpa,
        r.cac,
      ]),
    ]
      .map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `meta-vs-actual-${range.from}-to-${range.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <Scale className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Meta vs Actual</h1>
            <p className="text-xs text-muted-foreground">
              UTM campaign id দিয়ে match হওয়া real order বনাম Meta-র reported purchase
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BrandTabs value={brandKey} onChange={setBrandKey} />
          <DateRangePicker value={range} onChange={setRange} />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => rerun.mutate()}
            disabled={rerun.isPending || brandIds.length === 0}
          >
            <Wand2 className="mr-1.5 h-3.5 w-3.5" />
            {rerun.isPending ? "Matching…" : "Re-run matching"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => q.refetch()}>
            <RefreshCcw className="mr-1.5 h-3.5 w-3.5" />
            Refresh
          </Button>

          <Button variant="outline" size="sm" onClick={exportCsv} disabled={rows.length === 0}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          { l: "Spend", v: bdt(totals.spend) },
          { l: "Meta purchases", v: totals.metaP.toLocaleString("en-IN") },
          { l: "Real orders", v: totals.orders.toLocaleString("en-IN") },
          { l: "Delivered rev", v: bdt(totals.rev) },
          {
            l: "Actual ROAS",
            v: totals.spend > 0 ? (totals.rev / totals.spend).toFixed(2) + "x" : "—",
          },
        ].map((k) => (
          <Card key={k.l}>
            <CardContent className="p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{k.l}</div>
              <div className="mt-1 text-lg font-semibold tabular-nums">{k.v}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Campaign name বা campaign id…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {q.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              এই range-এ কোনো campaign data নেই।
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="p-2 text-left">Campaign</th>
                    <th className="p-2 text-right">Spend</th>
                    <th className="p-2 text-right">Meta purch.</th>
                    <th className="p-2 text-right">Meta value</th>
                    <th className="p-2 text-right">Meta ROAS</th>
                    <th className="p-2 text-right">Real orders</th>
                    <th className="p-2 text-right">Match</th>

                    <th className="p-2 text-right">Gap</th>
                    <th className="p-2 text-right">Delivered</th>
                    <th className="p-2 text-right">Returned</th>
                    <th className="p-2 text-right">Cancelled</th>
                    <th className="p-2 text-right">Delivered rev</th>
                    <th className="p-2 text-right">Actual ROAS</th>
                    <th className="p-2 text-right">CAC</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t hover:bg-muted/30">
                      <td className="max-w-[280px] p-2">
                        <div className="truncate font-medium">{r.name}</div>
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="h-4 px-1 text-[10px]">
                            {r.status}
                          </Badge>
                          <span className="truncate font-mono text-[10px] text-muted-foreground">
                            {r.external_id ?? "—"}
                          </span>
                        </div>
                      </td>
                      <td className="p-2 text-right tabular-nums">{bdt(r.spend)}</td>
                      <td className="p-2 text-right tabular-nums">{r.meta_purchases}</td>
                      <td className="p-2 text-right tabular-nums">{bdt(r.meta_purchase_value)}</td>
                      <td className={`p-2 text-right tabular-nums ${roasTone(r.meta_roas)}`}>
                        {r.meta_roas.toFixed(2)}x
                      </td>
                      <td className="p-2 text-right font-medium tabular-nums">{r.orders}</td>
                      <td className="p-2 text-right">
                        <div className="flex flex-col items-end gap-0.5">
                          <Badge
                            variant="outline"
                            className={`h-4 px-1 text-[10px] ${matchTone(r.match_status)}`}
                          >
                            {matchLabel(r.match_status)}
                          </Badge>
                          <span className="text-[10px] tabular-nums text-muted-foreground">
                            {r.attributed_orders} linked · {r.unlinked_orders} unmatched
                          </span>
                        </div>
                      </td>

                      <td
                        className={`p-2 text-right tabular-nums ${
                          r.purchase_gap === 0
                            ? "text-muted-foreground"
                            : r.purchase_gap > 0
                              ? "text-emerald-600"
                              : "text-rose-600"
                        }`}
                      >
                        {r.purchase_gap > 0 ? "+" : ""}
                        {r.purchase_gap}
                      </td>
                      <td className="p-2 text-right tabular-nums">
                        {r.delivered_orders}
                        <span className="ml-1 text-[10px] text-muted-foreground">
                          {r.delivery_rate}%
                        </span>
                      </td>
                      <td className="p-2 text-right tabular-nums text-rose-600">
                        {r.returned_orders}
                      </td>
                      <td className="p-2 text-right tabular-nums text-muted-foreground">
                        {r.cancelled_orders}
                      </td>
                      <td className="p-2 text-right tabular-nums">{bdt(r.delivered_revenue)}</td>
                      <td
                        className={`p-2 text-right font-semibold tabular-nums ${roasTone(r.actual_roas)}`}
                      >
                        {r.actual_roas.toFixed(2)}x
                      </td>
                      <td className="p-2 text-right tabular-nums">{r.cac ? bdt(r.cac) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
