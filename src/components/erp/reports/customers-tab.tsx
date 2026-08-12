import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { fmtBdt } from "@/lib/erp/finance";
import { Panel, KpiStrip, EmptyState, ExportMenu, REPORT_QUERY_OPTS, type Kpi } from "@/components/erp/reports/report-kit";

export type RpcArgs = { _brand_ids: string[]; _from: string; _to: string; _basis: string };

type CustSummary = {
  customers: number; new_customers: number; returning_customers: number; repeat_customers: number;
  repeat_rate: number; orders_per_customer: number; avg_ltv: number; avg_profit_per_customer: number;
  total_revenue: number; total_profit: number; orders: number;
};

type CustRow = {
  customer_phone: string; customer_name: string | null; orders: number; delivered_orders: number;
  returned_orders: number; units: number; net_revenue: number; gross_profit: number;
  contribution_profit: number; aov: number; first_order: string | null; last_order: string | null;
  return_rate: number; is_new: boolean;
  total_count?: number | null;
};

type SegRow = { segment: string; customers: number; orders: number; revenue: number; avg_recency_days: number };

const SEG_COLOR: Record<string, string> = {
  Champions: "hsl(160 60% 45%)",
  Loyal: "hsl(210 80% 55%)",
  New: "hsl(45 90% 55%)",
  "At risk": "hsl(25 85% 55%)",
  Lost: "hsl(0 70% 55%)",
};

type Sort = "net_revenue" | "gross_profit" | "orders" | "units" | "return_rate";
const SORTS: { key: Sort; label: string }[] = [
  { key: "net_revenue", label: "Revenue" },
  { key: "gross_profit", label: "Profit" },
  { key: "orders", label: "Orders" },
  { key: "units", label: "Units" },
  { key: "return_rate", label: "Return %" },
];

const PAGE = 200;

export function CustomersTab({ args, enabled }: { args: RpcArgs; enabled: boolean }) {
  const [sort, setSort] = useState<Sort>("net_revenue");
  const [search, setSearch] = useState("");
  const [only, setOnly] = useState<"all" | "new" | "repeat">("all");
  const [page, setPage] = useState(0);

  useEffect(() => { setPage(0); }, [args._brand_ids.join(","), args._from, args._to, args._basis]);

  const sumQ = useQuery({
    queryKey: ["rpt-cust-sum", JSON.stringify(args)],
    enabled,
    ...REPORT_QUERY_OPTS,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpt_customer_summary", args as never);
      if (error) throw error;
      return data as unknown as CustSummary;
    },
  });

  const topQ = useQuery({
    queryKey: ["rpt-cust-top", JSON.stringify(args), page],
    enabled,
    ...REPORT_QUERY_OPTS,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpt_customer_top", {
        ...args, _limit: PAGE, _offset: page * PAGE,
      } as never);
      if (error) throw error;
      return (data ?? []) as unknown as CustRow[];
    },
    placeholderData: (prev) => prev,
  });

  const segQ = useQuery({
    queryKey: ["rpt-cust-seg", args._brand_ids.join(","), args._to],
    enabled,
    ...REPORT_QUERY_OPTS,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpt_customer_segments", {
        _brand_ids: args._brand_ids, _to: args._to,
      } as never);
      if (error) throw error;
      return (data ?? []) as unknown as SegRow[];
    },
  });

  const s = sumQ.data;
  const kpis: Kpi[] = s
    ? [
        { label: "Customers", value: Number(s.customers), kind: "number", hint: `${Number(s.orders).toLocaleString()} orders` },
        { label: "New customers", value: Number(s.new_customers), kind: "number", hint: "first ever order in range" },
        { label: "Returning", value: Number(s.returning_customers), kind: "number", hint: "bought before this range" },
        { label: "Repeat rate", value: Number(s.repeat_rate), kind: "percent", tone: Number(s.repeat_rate) >= 15 ? "good" : "default" },
        { label: "Avg LTV (range)", value: Number(s.avg_ltv) },
        { label: "Profit / customer", value: Number(s.avg_profit_per_customer), tone: Number(s.avg_profit_per_customer) >= 0 ? "good" : "bad" },
        { label: "Orders / customer", value: Number(s.orders_per_customer), kind: "number" },
        { label: "Customer revenue", value: Number(s.total_revenue) },
      ]
    : [];

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = (topQ.data ?? []).filter((r) => {
      if (only === "new" && !r.is_new) return false;
      if (only === "repeat" && Number(r.orders) < 2) return false;
      if (!term) return true;
      return (r.customer_name ?? "").toLowerCase().includes(term) || (r.customer_phone ?? "").includes(term);
    });
    return [...list].sort((a, b) => Number(b[sort] ?? 0) - Number(a[sort] ?? 0));
  }, [topQ.data, search, sort, only]);

  const segs = segQ.data ?? [];
  const total = Number(topQ.data?.[0]?.total_count ?? topQ.data?.length ?? 0);
  const pages = Math.max(1, Math.ceil(total / PAGE));

  /** Export every customer in range, not just the page on screen. */
  const fetchAllRows = async (): Promise<CustRow[]> => {
    const out: CustRow[] = [];
    for (let off = 0; off < Math.max(total, 1); off += PAGE) {
      const { data, error } = await supabase.rpc("rpt_customer_top", { ...args, _limit: PAGE, _offset: off } as never);
      if (error) throw error;
      const chunk = (data ?? []) as unknown as CustRow[];
      out.push(...chunk);
      if (chunk.length < PAGE) break;
    }
    return out;
  };
  const [allRows, setAllRows] = useState<CustRow[] | null>(null);
  useEffect(() => { setAllRows(null); }, [JSON.stringify(args)]);
  const exportAoa = () => {
    const src = allRows ?? rows;
    return [
      ["Name", "Phone", "Orders", "Delivered", "Returned", "Units", "Net revenue", "Gross profit", "Contribution", "AOV", "First order", "Last order", "Return %", "New"],
      ...src.map((r) => [r.customer_name ?? "", r.customer_phone, Number(r.orders), Number(r.delivered_orders), Number(r.returned_orders), Number(r.units), Number(r.net_revenue), Number(r.gross_profit), Number(r.contribution_profit), Number(r.aov), r.first_order ?? "", r.last_order ?? "", Number(r.return_rate), r.is_new ? "Yes" : "No"]),
    ];
  };

  return (
    <>
      <KpiStrip items={kpis} loading={sumQ.isLoading} />

      <Panel title="Customer segments (RFM, lifetime)" subtitle="Based on all-time orders per phone number, as of the range end date">
        {segQ.isLoading ? (
          <Skeleton className="h-[260px] rounded-lg" />
        ) : segs.length === 0 ? (
          <EmptyState text="No customer history yet." />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={segs.map((x) => ({ ...x, customers: Number(x.customers) }))} margin={{ left: 4, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="segment" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                  <Tooltip
                    formatter={(v: number) => [v.toLocaleString(), "Customers"]}
                    contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}
                  />
                  <Bar dataKey="customers" radius={[6, 6, 0, 0]}>
                    {segs.map((x) => <Cell key={x.segment} fill={SEG_COLOR[x.segment] ?? "var(--primary)"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="overflow-auto rounded-lg border">
              <Table>
                <TableHeader className="bg-muted/60">
                  <TableRow>
                    <TableHead>Segment</TableHead>
                    <TableHead className="text-right">Customers</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Avg recency</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {segs.map((x) => (
                    <TableRow key={x.segment}>
                      <TableCell>
                        <span className="inline-flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: SEG_COLOR[x.segment] ?? "var(--primary)" }} />
                          {x.segment}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{Number(x.customers).toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtBdt(x.revenue)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{Number(x.avg_recency_days).toFixed(0)}d</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </Panel>

      <Panel
        title="Top customers"
        subtitle={`${total.toLocaleString()} customers in range · page ${page + 1} of ${pages}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1">
              {(["all", "new", "repeat"] as const).map((k) => (
                <Button key={k} size="sm" variant={only === k ? "default" : "outline"} className="h-7 px-2.5 text-xs capitalize" onClick={() => setOnly(k)}>{k}</Button>
              ))}
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or phone" className="h-7 w-[180px] pl-7 text-xs" />
            </div>
            <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
              <SelectTrigger className="h-7 w-[120px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{SORTS.map((x) => <SelectItem key={x.key} value={x.key}>{x.label}</SelectItem>)}</SelectContent>
            </Select>
            {total > rows.length && !allRows && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-xs"
                onClick={async () => setAllRows(await fetchAllRows())}
              >
                Load all for export
              </Button>
            )}
            <ExportMenu
              title="Top customers"
              subtitle={allRows ? "All customers in range" : "Current page"}
              rangeLabel={`${args._from} → ${args._to}`}
              kpis={kpis}
              filename="customers"
              note={`${(allRows ?? rows).length} of ${total.toLocaleString()} customers`}
              aoa={exportAoa}
            />
          </div>
        }
      >
        {topQ.isLoading ? (
          <Skeleton className="h-[320px] rounded-lg" />
        ) : rows.length === 0 ? (
          <EmptyState text="No customers in this range." />
        ) : (
          <div className="max-h-[560px] overflow-auto rounded-lg border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right">Delivered</TableHead>
                  <TableHead className="text-right">Net revenue</TableHead>
                  <TableHead className="text-right">Gross profit</TableHead>
                  <TableHead className="text-right">AOV</TableHead>
                  <TableHead className="text-right">Return %</TableHead>
                  <TableHead className="text-right">Last order</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.customer_phone}>
                    <TableCell>
                      <div className="font-medium">{r.customer_name || "Unknown"}</div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="font-mono">{r.customer_phone}</span>
                        {r.is_new ? (
                          <Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-400">New</Badge>
                        ) : Number(r.orders) > 1 ? (
                          <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400">Repeat</Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{Number(r.orders).toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{Number(r.delivered_orders).toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtBdt(r.net_revenue)}</TableCell>
                    <TableCell className={`text-right tabular-nums ${Number(r.gross_profit) < 0 ? "text-rose-600 dark:text-rose-400" : ""}`}>{fmtBdt(r.gross_profit)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.aov == null ? "—" : fmtBdt(r.aov)}</TableCell>
                    <TableCell className={`text-right tabular-nums ${Number(r.return_rate) > 15 ? "text-rose-600 dark:text-rose-400" : ""}`}>{Number(r.return_rate).toFixed(1)}%</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">{r.last_order ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {pages > 1 && (
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>Showing {(page * PAGE + 1).toLocaleString()}–{Math.min((page + 1) * PAGE, total).toLocaleString()} of {total.toLocaleString()}</span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="h-7 px-2" disabled={page === 0 || topQ.isFetching} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" size="sm" className="h-7 px-2" disabled={page + 1 >= pages || topQ.isFetching} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </Panel>
    </>
  );
}
