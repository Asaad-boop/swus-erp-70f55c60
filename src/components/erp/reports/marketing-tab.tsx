import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ComposedChart, Bar, Line, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { FileSpreadsheet, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { fmtBdt } from "@/lib/erp/finance";
import { exportAoaXlsx } from "@/lib/erp/utils/excel";
import { Panel, KpiStrip, EmptyState, type Kpi } from "@/components/erp/reports/report-kit";
import type { RpcArgs } from "@/components/erp/reports/customers-tab";

type MktSummary = {
  ad_spend: number; manual_spend: number; total_spend: number; impressions: number; clicks: number;
  ctr: number; cpc: number; cpm: number; orders: number; delivered_orders: number;
  attributed_orders: number; revenue: number; gross_profit: number; net_profit: number;
  roas: number; cac: number; spend_pct_revenue: number;
};

type MktDay = {
  day: string; spend: number; manual_spend: number; total_spend: number; impressions: number;
  clicks: number; orders: number; delivered_orders: number; revenue: number; gross_profit: number; roas: number;
};

type CampRow = {
  campaign_id: string; campaign_name: string; status: string; spend: number; impressions: number;
  clicks: number; ctr: number; cpc: number; orders: number; delivered_orders: number;
  revenue: number; cogs: number; gross_profit: number; net_profit: number; roas: number; cac: number;
};

export function MarketingTab({ args, enabled }: { args: RpcArgs; enabled: boolean }) {
  const [search, setSearch] = useState("");
  const base = { _brand_ids: args._brand_ids, _from: args._from, _to: args._to };
  const key = JSON.stringify(base);

  const sumQ = useQuery({
    queryKey: ["rpt-mkt-sum", key],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpt_marketing_summary", base as never);
      if (error) throw error;
      return data as unknown as MktSummary;
    },
  });

  const dayQ = useQuery({
    queryKey: ["rpt-mkt-day", key],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpt_marketing_daily", base as never);
      if (error) throw error;
      return (data ?? []) as unknown as MktDay[];
    },
  });

  const campQ = useQuery({
    queryKey: ["rpt-mkt-camp", key],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpt_marketing_campaigns", base as never);
      if (error) throw error;
      return (data ?? []) as unknown as CampRow[];
    },
  });

  const s = sumQ.data;
  const kpis: Kpi[] = s
    ? [
        { label: "Total spend", value: Number(s.total_spend), hint: `Ads ${fmtBdt(s.ad_spend)} · Manual ${fmtBdt(s.manual_spend)}` },
        { label: "Delivered revenue", value: Number(s.revenue), hint: `${Number(s.delivered_orders).toLocaleString()} delivered orders` },
        { label: "ROAS", value: Number(s.roas || 0), kind: "number", tone: Number(s.roas) >= 2 ? "good" : "bad", hint: "revenue ÷ total spend" },
        { label: "Net profit after ads", value: Number(s.net_profit), tone: Number(s.net_profit) >= 0 ? "good" : "bad" },
        { label: "CAC", value: Number(s.cac || 0), hint: "spend per delivered order" },
        { label: "Spend % of revenue", value: Number(s.spend_pct_revenue || 0), kind: "percent", tone: Number(s.spend_pct_revenue) > 35 ? "bad" : "good" },
        { label: "Clicks", value: Number(s.clicks), kind: "number", hint: `CTR ${Number(s.ctr || 0).toFixed(2)}% · CPC ${fmtBdt(s.cpc || 0)}` },
        { label: "Attributed orders", value: Number(s.attributed_orders), kind: "number", hint: "orders linked to a campaign" },
      ]
    : [];

  const chart = useMemo(
    () =>
      (dayQ.data ?? []).map((d) => ({
        day: d.day?.slice(5),
        spend: Number(d.total_spend),
        revenue: Number(d.revenue),
        roas: Number(d.roas ?? 0),
      })),
    [dayQ.data],
  );

  const camps = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (campQ.data ?? []).filter((c) => !term || (c.campaign_name ?? "").toLowerCase().includes(term));
  }, [campQ.data, search]);

  return (
    <>
      <KpiStrip items={kpis} loading={sumQ.isLoading} />

      <Panel title="Spend vs revenue" subtitle="Daily marketing spend (BDT) against delivered revenue, with ROAS line">
        {dayQ.isLoading ? (
          <Skeleton className="h-[300px] rounded-lg" />
        ) : chart.length === 0 ? (
          <EmptyState text="No marketing data in this range." />
        ) : (
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chart} margin={{ left: 4, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="l" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                <Tooltip
                  formatter={(v: number, n: string) => (n === "roas" ? [Number(v).toFixed(2) + "x", "ROAS"] : [fmtBdt(v), n === "spend" ? "Spend" : "Revenue"])}
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 10, fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar yAxisId="l" dataKey="revenue" name="Revenue" fill="hsl(210 80% 55%)" radius={[5, 5, 0, 0]} />
                <Bar yAxisId="l" dataKey="spend" name="Spend" fill="hsl(25 85% 55%)" radius={[5, 5, 0, 0]} />
                <Line yAxisId="r" type="monotone" dataKey="roas" name="ROAS" stroke="hsl(160 60% 45%)" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>

      <Panel
        title="Campaign performance"
        subtitle={`${camps.length} campaigns · profit uses delivered revenue minus product cost and spend`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Campaign" className="h-7 w-[180px] pl-7 text-xs" />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                exportAoaXlsx(
                  [["Campaign", "Status", "Spend", "Impressions", "Clicks", "CTR %", "CPC", "Orders", "Delivered", "Revenue", "COGS", "Gross profit", "Net profit", "ROAS", "CAC"],
                   ...camps.map((c) => [c.campaign_name, c.status, c.spend, c.impressions, c.clicks, c.ctr, c.cpc, c.orders, c.delivered_orders, c.revenue, c.cogs, c.gross_profit, c.net_profit, c.roas, c.cac])],
                  "Campaigns", "marketing-campaigns",
                )
              }
            >
              <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />Excel
            </Button>
          </div>
        }
      >
        {campQ.isLoading ? (
          <Skeleton className="h-[320px] rounded-lg" />
        ) : camps.length === 0 ? (
          <EmptyState text="No campaign spend in this range." />
        ) : (
          <div className="max-h-[560px] overflow-auto rounded-lg border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead className="text-right">Spend</TableHead>
                  <TableHead className="text-right">Clicks</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right">Delivered</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Net profit</TableHead>
                  <TableHead className="text-right">ROAS</TableHead>
                  <TableHead className="text-right">CAC</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {camps.map((c) => (
                  <TableRow key={c.campaign_id}>
                    <TableCell>
                      <div className="max-w-[280px] truncate font-medium">{c.campaign_name}</div>
                      <Badge variant="outline" className="mt-0.5 text-[10px] uppercase">{c.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmtBdt(c.spend)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{Number(c.clicks).toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{Number(c.orders).toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{Number(c.delivered_orders).toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtBdt(c.revenue)}</TableCell>
                    <TableCell className={`text-right tabular-nums ${Number(c.net_profit) < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>{fmtBdt(c.net_profit)}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.roas == null ? "—" : `${Number(c.roas).toFixed(2)}x`}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{c.cac == null ? "—" : fmtBdt(c.cac)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Panel>
    </>
  );
}