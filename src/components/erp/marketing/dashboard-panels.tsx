import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip as UiTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import { Info } from "lucide-react";
import type { MktKpis, MktTrendRow } from "@/lib/erp/marketing/dashboard.functions";

export const bdt = (n: number) => "৳" + Math.round(n).toLocaleString("en-IN");
const pct = (n: number | null) => (n === null ? "—" : `${n.toFixed(2)}%`);
const x = (n: number | null) => (n === null ? "—" : `${n.toFixed(2)}x`);

function Kpi({
  label, value, hint, tone = "neutral",
}: { label: string; value: string; hint: string; tone?: "pos" | "neg" | "neutral" }) {
  const cls = tone === "pos" ? "text-emerald-600 dark:text-emerald-400"
    : tone === "neg" ? "text-rose-600 dark:text-rose-400" : "text-foreground";
  return (
    <div className="rounded-lg border bg-card/60 px-3 py-2.5">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        <span className="truncate">{label}</span>
        <UiTooltip>
          <TooltipTrigger asChild>
            <Info className="h-3 w-3 shrink-0 opacity-60" />
          </TooltipTrigger>
          <TooltipContent className="max-w-[240px] text-xs">{hint}</TooltipContent>
        </UiTooltip>
      </div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${cls}`}>{value}</div>
    </div>
  );
}

export function KpiGrid({ loading, k }: { loading: boolean; k?: MktKpis }) {
  if (loading || !k) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-2">
        {Array.from({ length: 15 }).map((_, i) => <Skeleton key={i} className="h-[62px] rounded-lg" />)}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-2">
      <Kpi label="Ad spend" value={bdt(k.spend_bdt)} hint="Meta spend, FIFO dollar cost-e BDT (mkt_insights_daily)" />
      <Kpi label="Revenue (booked)" value={bdt(k.booked_revenue)} hint="Range-e create howa order-er total (incomplete bad)" />
      <Kpi label="Delivered revenue" value={bdt(k.delivered_revenue)} hint="Delivered order line total — canonical mkt_delivered_line_costs" />
      <Kpi label="Orders" value={k.orders.toLocaleString()} hint="Range-e create howa order (Dhaka time)" />
      <Kpi label="ROAS" value={x(k.roas)} hint="Booked revenue ÷ ad spend" tone={(k.roas ?? 0) >= 2 ? "pos" : "neg"} />
      <Kpi label="Delivered ROAS" value={x(k.delivered_roas)} hint="Delivered revenue ÷ ad spend" tone={(k.delivered_roas ?? 0) >= 1 ? "pos" : "neg"} />
      <Kpi label="MER" value={x(k.mer)} hint="Marketing Efficiency Ratio = mot revenue ÷ mot ad spend" />
      <Kpi label="CAC" value={k.cac === null ? "—" : bdt(k.cac)} hint="Ad spend ÷ notun customer (phone-vittik first order)" />
      <Kpi label="CPA" value={k.cpa === null ? "—" : bdt(k.cpa)} hint="Ad spend ÷ mot order" />
      <Kpi label="AOV" value={k.aov === null ? "—" : bdt(k.aov)} hint="Booked revenue ÷ order" />
      <Kpi label="Conversion rate" value={pct(k.conversion_rate)} hint="Order ÷ ad clicks × 100" />
      <Kpi label="Gross profit" value={bdt(k.gross_profit)} hint="Delivered revenue − COGS − operating cost (ad spend chhara)" tone={k.gross_profit >= 0 ? "pos" : "neg"} />
      <Kpi label="Contribution profit" value={bdt(k.contribution_profit)} hint="Gross profit − ad spend" tone={k.contribution_profit >= 0 ? "pos" : "neg"} />
      <Kpi label="Marketing cost %" value={pct(k.marketing_cost_pct)} hint="Ad spend ÷ booked revenue × 100" />
      <Kpi label="Return / Cancel" value={`${pct(k.return_rate)} / ${pct(k.cancel_rate)}`} hint="Return o cancel order-er haar (range-e create howa order-er upor)" />
    </div>
  );
}

export function TrendChart({
  loading, rows, grain, onGrain,
}: {
  loading: boolean;
  rows?: MktTrendRow[];
  grain: "day" | "week" | "month";
  onGrain: (g: "day" | "week" | "month") => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold">Spend vs revenue</CardTitle>
        <div className="inline-flex rounded-md border bg-background p-0.5">
          {(["day", "week", "month"] as const).map((g) => (
            <button
              key={g}
              onClick={() => onGrain(g)}
              className={`px-2.5 h-6 text-[11px] font-medium rounded capitalize transition ${
                grain === g ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {loading || !rows ? (
          <Skeleton className="h-64 w-full" />
        ) : rows.length === 0 ? (
          <div className="h-64 grid place-items-center text-sm text-muted-foreground">Ei range-e data nei.</div>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="bucket" tick={{ fontSize: 10 }} tickLine={false} axisLine={false}
                  tickFormatter={(d: string) => (d ? d.slice(5) : "")} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={52}
                  tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={34} />
                <Tooltip contentStyle={{ fontSize: 12, padding: "6px 8px", borderRadius: 6 }}
                  formatter={(v: any, n: any) => (n === "ROAS" ? [`${Number(v).toFixed(2)}x`, n] : [bdt(Number(v)), n])} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar name="Ad spend" dataKey="spend_bdt" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                <Bar name="Booked revenue" dataKey="booked_revenue" fill="hsl(var(--muted-foreground))" opacity={0.35} radius={[3, 3, 0, 0]} />
                <Line name="Delivered revenue" type="monotone" dataKey="delivered_revenue" stroke="hsl(var(--chart-2, 160 60% 45%))" strokeWidth={2} dot={false} />
                <Line name="ROAS" yAxisId="r" type="monotone" dataKey="roas" stroke="hsl(var(--destructive))" strokeWidth={1.5} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type CampRow = {
  id: string; name: string; spend: number; delivered_revenue: number;
  delivered_orders: number; gross_profit: number; roas: number | null; contribution: number;
};

export function TopCampaigns({ loading, rows }: { loading: boolean; rows?: CampRow[] }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Top campaigns (spend)</CardTitle></CardHeader>
      <CardContent className="pt-0">
        {loading ? <Skeleton className="h-48 w-full" /> : !rows?.length ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Kono campaign spend nei.</div>
        ) : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Campaign</TableHead>
              <TableHead className="text-right">Spend</TableHead>
              <TableHead className="text-right">Delivered</TableHead>
              <TableHead className="text-right">ROAS</TableHead>
              <TableHead className="text-right">Contribution</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="max-w-[220px] truncate text-xs font-medium">{r.name}</TableCell>
                  <TableCell className="text-right tabular-nums text-xs">{bdt(r.spend)}</TableCell>
                  <TableCell className="text-right tabular-nums text-xs">{bdt(r.delivered_revenue)}</TableCell>
                  <TableCell className={`text-right tabular-nums text-xs font-medium ${(r.roas ?? 0) >= 1 ? "text-emerald-600" : "text-rose-600"}`}>{x(r.roas)}</TableCell>
                  <TableCell className={`text-right tabular-nums text-xs ${r.contribution >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{bdt(r.contribution)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export function TopProducts({
  loading, rows,
}: { loading: boolean; rows?: { id: string; name: string; revenue: number; profit: number; units: number }[] }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Top products (delivered)</CardTitle></CardHeader>
      <CardContent className="pt-0">
        {loading ? <Skeleton className="h-48 w-full" /> : !rows?.length ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Ei range-e delivered product nei.</div>
        ) : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Units</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
              <TableHead className="text-right">Gross profit</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="max-w-[220px] truncate text-xs font-medium">{r.name}</TableCell>
                  <TableCell className="text-right tabular-nums text-xs">{r.units.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums text-xs">{bdt(r.revenue)}</TableCell>
                  <TableCell className={`text-right tabular-nums text-xs ${r.profit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{bdt(r.profit)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export function TopAds({
  loading, rows,
}: { loading: boolean; rows?: { id: string; name: string; campaign: string; spend: number; orders: number; revenue: number; roas: number; ctr: number }[] }) {
  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold">Top ads (spend)</CardTitle>
        <Badge variant="outline" className="text-[10px] font-normal">FIFO BDT</Badge>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? <Skeleton className="h-48 w-full" /> : !rows?.length ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Ad-level data nei.</div>
        ) : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Ad</TableHead>
              <TableHead className="text-right">Spend</TableHead>
              <TableHead className="text-right">CTR</TableHead>
              <TableHead className="text-right">Orders</TableHead>
              <TableHead className="text-right">ROAS</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="max-w-[260px]">
                    <div className="truncate text-xs font-medium">{r.name}</div>
                    <div className="truncate text-[10px] text-muted-foreground">{r.campaign}</div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-xs">{bdt(r.spend)}</TableCell>
                  <TableCell className="text-right tabular-nums text-xs text-muted-foreground">{r.ctr.toFixed(2)}%</TableCell>
                  <TableCell className="text-right tabular-nums text-xs">{r.orders.toLocaleString()}</TableCell>
                  <TableCell className={`text-right tabular-nums text-xs font-medium ${r.roas >= 1 ? "text-emerald-600" : "text-rose-600"}`}>{r.roas.toFixed(2)}x</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
