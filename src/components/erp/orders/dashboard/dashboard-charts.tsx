import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ComposedChart,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { statusBadge } from "@/lib/erp/orders";
import type { OrderDashboardSummary } from "@/lib/erp/orders-dashboard.functions";
import { money } from "./dashboard-kpis";

const PIE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4", "#eab308", "#71717a"];

export function DashboardCharts({ summary }: { summary: OrderDashboardSummary }) {
  const daily = summary.daily ?? [];
  const sources = (summary.sources ?? []).slice(0, 8);
  const statuses = (summary.statuses ?? []).slice().sort((a, b) => b.orders - a.orders);
  const cities = summary.cities ?? [];
  const products = summary.products ?? [];
  const confirmers = summary.confirmers ?? [];

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {daily.length > 0 && (
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Daily orders & revenue</CardTitle>
          </CardHeader>
          <CardContent className="h-[260px] pt-0">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={daily} margin={{ left: 4, right: 4, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                <XAxis dataKey="d" tick={{ fontSize: 11 }} tickMargin={6} minTickGap={16} />
                <YAxis yAxisId="l" tick={{ fontSize: 11 }} width={40} />
                <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11 }} width={56} />
                <Tooltip
                  formatter={(v: number, n: string) => (n === "value" ? money(v) : v)}
                  contentStyle={{ fontSize: 12 }}
                />
                <Bar yAxisId="l" dataKey="orders" name="Orders" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                <Bar yAxisId="l" dataKey="delivered" name="Delivered" fill="#10b981" radius={[3, 3, 0, 0]} />
                <Line yAxisId="r" type="monotone" dataKey="value" name="Revenue" stroke="#f59e0b" dot={false} strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {statuses.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Status breakdown</CardTitle>
          </CardHeader>
          <CardContent className="h-[260px] pt-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statuses.map((s) => ({ ...s, label: statusBadge(s.status).label }))} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="label" width={110} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v: number, n: string) => (n === "value" ? money(v) : v)} />
                <Bar dataKey="orders" name="Orders" fill="#6366f1" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {sources.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Order sources</CardTitle>
          </CardHeader>
          <CardContent className="h-[260px] pt-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={sources} dataKey="orders" nameKey="source" innerRadius={50} outerRadius={90} paddingAngle={2}>
                  {sources.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="-mt-6 flex flex-wrap justify-center gap-2 text-[11px]">
              {sources.map((s, i) => (
                <span key={s.source} className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                  {s.source} ({s.orders})
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {cities.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Top cities</CardTitle>
          </CardHeader>
          <CardContent className="h-[260px] overflow-auto pt-0 text-sm">
            <table className="w-full">
              <tbody>
                {cities.map((c) => (
                  <tr key={c.city} className="border-b last:border-0">
                    <td className="py-1.5">{c.city}</td>
                    <td className="py-1.5 text-right tabular-nums">{c.orders}</td>
                    <td className="py-1.5 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                      {c.orders ? `${((c.delivered / c.orders) * 100).toFixed(0)}%` : "—"}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-muted-foreground">{money(c.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {products.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Top products</CardTitle>
          </CardHeader>
          <CardContent className="h-[260px] overflow-auto pt-0 text-sm">
            <table className="w-full">
              <tbody>
                {products.map((p) => (
                  <tr key={p.name ?? "—"} className="border-b last:border-0">
                    <td className="max-w-[240px] truncate py-1.5">{p.name ?? "—"}</td>
                    <td className="py-1.5 text-right tabular-nums">{p.qty} pcs</td>
                    <td className="py-1.5 text-right tabular-nums text-muted-foreground">{money(p.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {confirmers.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Confirmed by (staff)</CardTitle>
          </CardHeader>
          <CardContent className="h-[260px] overflow-auto pt-0 text-sm">
            <table className="w-full">
              <tbody>
                {confirmers.map((c) => (
                  <tr key={c.user_id} className="border-b last:border-0">
                    <td className="py-1.5">{c.name}</td>
                    <td className="py-1.5 text-right tabular-nums">{c.orders} orders</td>
                    <td className="py-1.5 text-right tabular-nums text-muted-foreground">{money(c.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** Small sparkline used above the table when charts are collapsed. */
export function MiniTrend({ data }: { data: { d: string; orders: number }[] }) {
  if (!data.length) return null;
  return (
    <div className="h-10 w-40">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <Area type="monotone" dataKey="orders" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} strokeWidth={1.5} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}