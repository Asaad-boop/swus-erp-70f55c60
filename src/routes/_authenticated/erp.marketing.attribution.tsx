import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { LayoutDashboard, RefreshCcw, Download, Check, X, Filter, GitBranch as PageIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useBrand } from "@/contexts/brand-context";
import {
  DateRangePicker,
  buildPreset,
  type MktRangeValue,
} from "@/components/erp/marketing/date-range-picker";
import {
  getUtmBreakdown,
  getFunnel,
  getAttributionQueue,
  resolveCandidate,
  type MktUtmRow,
} from "@/lib/erp/marketing/attribution.functions";

export const Route = createFileRoute("/_authenticated/erp/marketing/attribution")({
  head: () => ({
    meta: [
      { title: "Attribution & Funnel — Marketing ERP" },
      {
        name: "description",
        content:
          "UTM source, medium, campaign and landing page performance with a full impressions-to-delivered funnel.",
      },
      { property: "og:title", content: "Attribution & Funnel — Marketing ERP" },
      {
        property: "og:description",
        content: "Track every UTM dimension, funnel drop-off and pending attribution candidate.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AttributionPage,
});

const bdt = (n: number) => "৳" + Math.round(Number(n) || 0).toLocaleString("en-IN");
const num = (n: number) => Number(n || 0).toLocaleString("en-IN");
const pct = (a: number, b: number) => (b > 0 ? ((a / b) * 100).toFixed(2) + "%" : "—");

const DIMS = [
  { key: "source", label: "Source" },
  { key: "medium", label: "Medium" },
  { key: "campaign", label: "Campaign" },
  { key: "content", label: "Content" },
  { key: "term", label: "Term" },
  { key: "landing", label: "Landing page" },
] as const;
type Dim = (typeof DIMS)[number]["key"];

function AttributionPage() {
  const { brands, isLoading: brandsLoading } = useBrand();
  const [brandKey, setBrandKey] = useState("all");
  const [range, setRange] = useState<MktRangeValue>(() => buildPreset("30d"));
  const [dim, setDim] = useState<Dim>("source");
  const qc = useQueryClient();

  const brandIds = useMemo(() => {
    if (brandKey === "all") return brands.map((b) => b.id);
    const b = brands.find((x) => x.slug === brandKey || x.id === brandKey);
    return b ? [b.id] : brands.map((x) => x.id);
  }, [brandKey, brands]);

  const key = brandIds.slice().sort().join(",");
  const fetchUtm = useServerFn(getUtmBreakdown);
  const fetchFunnel = useServerFn(getFunnel);
  const fetchQueue = useServerFn(getAttributionQueue);
  const resolveFn = useServerFn(resolveCandidate);

  const enabled = brandIds.length > 0;
  const utmQ = useQuery({
    queryKey: ["mkt-utm", key, range.from, range.to, dim],
    queryFn: () => fetchUtm({ data: { brandIds, from: range.from, to: range.to, dim } }),
    enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const funnelQ = useQuery({
    queryKey: ["mkt-funnel", key, range.from, range.to],
    queryFn: () => fetchFunnel({ data: { brandIds, from: range.from, to: range.to } }),
    enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const queueQ = useQuery({
    queryKey: ["mkt-attr-queue", key],
    queryFn: () => fetchQueue({ data: { brandIds, limit: 100 } }),
    enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const resolveMut = useMutation({
    mutationFn: (v: { candidateId: string; action: "approve" | "reject" }) => resolveFn({ data: v }),
    onSuccess: (_d, v) => {
      toast.success(v.action === "approve" ? "Attribution approved" : "Candidate rejected");
      qc.invalidateQueries({ queryKey: ["mkt-attr-queue"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = utmQ.data ?? [];
  const totals = rows.reduce(
    (a, r) => ({
      orders: a.orders + Number(r.orders),
      delivered: a.delivered + Number(r.delivered_orders),
      booked: a.booked + Number(r.booked_revenue),
      deliveredRev: a.deliveredRev + Number(r.delivered_revenue),
      sessions: a.sessions + Number(r.sessions),
    }),
    { orders: 0, delivered: 0, booked: 0, deliveredRev: 0, sessions: 0 },
  );

  function exportCsv() {
    const head = [
      DIMS.find((d) => d.key === dim)!.label,
      "Sessions",
      "Orders",
      "Confirmed",
      "Delivered",
      "Cancelled",
      "Returned",
      "Booked revenue",
      "Delivered revenue",
      "AOV",
      "Delivery rate %",
    ];
    const body = rows.map((r: MktUtmRow) => [
      r.dim_value,
      r.sessions,
      r.orders,
      r.confirmed_orders,
      r.delivered_orders,
      r.cancelled_orders,
      r.returned_orders,
      r.booked_revenue,
      r.delivered_revenue,
      r.aov,
      r.delivery_rate,
    ]);
    const csv = [head, ...body]
      .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `utm-${dim}-${range.from}_${range.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const f = funnelQ.data;
  const steps = f
    ? [
        { label: "Impressions", value: Number(f.impressions) },
        { label: "Reach", value: Number(f.reach) },
        { label: "Clicks", value: Number(f.clicks) },
        { label: "Sessions", value: Number(f.sessions) },
        { label: "Orders", value: Number(f.orders) },
        { label: "Confirmed", value: Number(f.confirmed_orders) },
        { label: "Shipped", value: Number(f.shipped_orders) },
        { label: "Delivered", value: Number(f.delivered_orders) },
      ]
    : [];
  const top = steps.length ? Math.max(steps[0].value, 1) : 1;

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <PageIcon className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-xl font-bold tracking-tight">Attribution &amp; Funnel</h1>
          <p className="text-xs text-muted-foreground">
            UTM dimensions, landing pages, full funnel drop-off and pending attribution candidates.
          </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={brandKey}
            onChange={(e) => setBrandKey(e.target.value)}
            disabled={brandsLoading}
          >
            <option value="all">All brands</option>
            {brands.map((b) => (
              <option key={b.id} value={b.slug ?? b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <DateRangePicker value={range} onChange={setRange} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              utmQ.refetch();
              funnelQ.refetch();
              queueQ.refetch();
            }}
          >
            <RefreshCcw className="mr-1.5 h-4 w-4" /> Refresh
          </Button>
        </div>
      </div>

      {/* Funnel */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Funnel — impressions to delivered</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {funnelQ.isLoading ? (
            <Skeleton className="h-56 rounded-lg" />
          ) : !f ? (
            <p className="text-sm text-muted-foreground">No funnel data in this range.</p>
          ) : (
            <>
              {steps.map((s, i) => {
                const prev = i > 0 ? steps[i - 1].value : null;
                const width = Math.max((s.value / top) * 100, s.value > 0 ? 2 : 0);
                return (
                  <div key={s.label} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{s.label}</span>
                      <span className="tabular-nums">
                        {num(s.value)}
                        {prev !== null && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {pct(s.value, prev)} of prev
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="h-2.5 w-full rounded-full bg-muted">
                      <div
                        className="h-2.5 rounded-full bg-primary transition-all"
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              <div className="grid grid-cols-2 gap-3 pt-3 text-sm sm:grid-cols-4">
                <Metric label="Ad spend" value={bdt(f.spend)} />
                <Metric label="Delivered revenue" value={bdt(f.delivered_revenue)} />
                <Metric label="Returned" value={num(f.returned_orders)} />
                <Metric label="Cancelled" value={num(f.cancelled_orders)} />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* UTM explorer */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
          <CardTitle className="text-base">UTM explorer</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            {DIMS.map((d) => (
              <Button
                key={d.key}
                size="sm"
                variant={dim === d.key ? "default" : "outline"}
                className="h-7 text-xs"
                onClick={() => setDim(d.key)}
              >
                {d.label}
              </Button>
            ))}
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={exportCsv} disabled={!rows.length}>
              <Download className="mr-1 h-3.5 w-3.5" /> CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {utmQ.isLoading ? (
            <Skeleton className="h-64 rounded-lg" />
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No attributed traffic or orders in this range.</p>
          ) : (
            <div className="max-h-[560px] overflow-auto rounded-lg border">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
                  <TableRow>
                    <TableHead>{DIMS.find((d) => d.key === dim)!.label}</TableHead>
                    <TableHead className="text-right">Sessions</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead className="text-right">Confirmed</TableHead>
                    <TableHead className="text-right">Delivered</TableHead>
                    <TableHead className="text-right">Booked rev</TableHead>
                    <TableHead className="text-right">Delivered rev</TableHead>
                    <TableHead className="text-right">AOV</TableHead>
                    <TableHead className="text-right">Delivery %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.dim_value}>
                      <TableCell className="max-w-[320px] truncate font-medium">{r.dim_value}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{num(r.sessions)}</TableCell>
                      <TableCell className="text-right tabular-nums">{num(r.orders)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{num(r.confirmed_orders)}</TableCell>
                      <TableCell className="text-right tabular-nums">{num(r.delivered_orders)}</TableCell>
                      <TableCell className="text-right tabular-nums">{bdt(r.booked_revenue)}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{bdt(r.delivered_revenue)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{bdt(r.aov)}</TableCell>
                      <TableCell className="text-right tabular-nums">{Number(r.delivery_rate).toFixed(1)}%</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/40 font-medium">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right tabular-nums">{num(totals.sessions)}</TableCell>
                    <TableCell className="text-right tabular-nums">{num(totals.orders)}</TableCell>
                    <TableCell />
                    <TableCell className="text-right tabular-nums">{num(totals.delivered)}</TableCell>
                    <TableCell className="text-right tabular-nums">{bdt(totals.booked)}</TableCell>
                    <TableCell className="text-right tabular-nums">{bdt(totals.deliveredRev)}</TableCell>
                    <TableCell />
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Candidate queue */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Pending attribution candidates
            {queueQ.data?.length ? (
              <Badge variant="secondary" className="ml-2">{queueQ.data.length}</Badge>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {queueQ.isLoading ? (
            <Skeleton className="h-40 rounded-lg" />
          ) : (queueQ.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Queue clear — every order is attributed.</p>
          ) : (
            <div className="max-h-[420px] overflow-auto rounded-lg border">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Suggested campaign</TableHead>
                    <TableHead>Signal</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Confidence</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(queueQ.data ?? []).map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <Link
                          to="/erp/orders/$orderId"
                          params={{ orderId: c.order_id }}
                          className="font-medium text-primary hover:underline"
                        >
                          {c.invoice_no ?? c.order_id.slice(0, 8)}
                        </Link>
                        <div className="text-[11px] text-muted-foreground">
                          {c.customer_name ?? "—"} · {c.order_status}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[260px] truncate">
                        {c.suggested_campaign_name ?? <span className="text-muted-foreground">None</span>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{c.source ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{bdt(c.order_total)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {c.confidence != null ? Number(c.confidence).toFixed(2) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2"
                            disabled={!c.suggested_campaign_id || resolveMut.isPending}
                            onClick={() => resolveMut.mutate({ candidateId: c.id, action: "approve" })}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2"
                            disabled={resolveMut.isPending}
                            onClick={() => resolveMut.mutate({ candidateId: c.id, action: "reject" })}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-base font-semibold tabular-nums">{value}</div>
    </div>
  );
}
