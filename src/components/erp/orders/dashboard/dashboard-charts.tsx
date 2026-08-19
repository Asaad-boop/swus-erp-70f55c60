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
import { TopProducts } from "./top-products";

const PIE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4", "#eab308", "#71717a"];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function DashboardCharts({ summary }: { summary: OrderDashboardSummary }) {
  const daily = summary.daily ?? [];
  const sources = (summary.sources ?? []).slice(0, 8);
  const statuses = (summary.statuses ?? []).slice().sort((a, b) => b.orders - a.orders);
  const cities = summary.cities ?? [];
  const products = summary.products ?? [];
  const confirmers = summary.confirmers ?? [];
  const couriers = summary.couriers ?? [];
  const payments = summary.payments ?? [];

  // Cumulative revenue + 7-day moving average of orders
  let run = 0;
  const cumulative = daily.map((d, i) => {
    run += Number(d.value) || 0;
    const win = daily.slice(Math.max(0, i - 6), i + 1);
    return {
      d: d.d,
      cum: run,
      ma7: win.reduce((s, x) => s + (Number(x.orders) || 0), 0) / win.length,
      orders: d.orders,
    };
  });

  const weekday = WEEKDAYS.map((label, idx) => {
    const rows = daily.filter((r) => new Date(`${r.d}T00:00:00`).getDay() === idx);
    const orders = rows.reduce((s, r) => s + (Number(r.orders) || 0), 0);
    const value = rows.reduce((s, r) => s + (Number(r.value) || 0), 0);
    return { label, orders, value, avg: rows.length ? orders / rows.length : 0 };
  }).filter((w) => w.orders > 0);

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

      {cumulative.length > 1 && (
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Cumulative revenue & 7-day order trend</CardTitle>
          </CardHeader>
          <CardContent className="h-[220px] pt-0">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={cumulative} margin={{ left: 4, right: 4, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                <XAxis dataKey="d" tick={{ fontSize: 11 }} tickMargin={6} minTickGap={16} />
                <YAxis yAxisId="l" tick={{ fontSize: 11 }} width={64} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
                <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11 }} width={40} />
                <Tooltip
                  contentStyle={{ fontSize: 12 }}
                  formatter={(v: number, n: string) => (n === "Cumulative revenue" ? money(v) : Number(v).toFixed(1))}
                />
                <Area yAxisId="l" type="monotone" dataKey="cum" name="Cumulative revenue" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.15} strokeWidth={2} />
                <Line yAxisId="r" type="monotone" dataKey="ma7" name="Orders (7d avg)" stroke="#3b82f6" dot={false} strokeWidth={2} />
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
                <span key={`${s.source ?? "none"}-${i}`} className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                  {s.source || "—"} ({s.orders})
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
                {cities.map((c, i) => (
                  <tr key={`${c.city ?? "unknown"}-${i}`} className="border-b last:border-0">
                    <td className="py-1.5">{c.city || "—"}</td>
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

      <TopProducts products={products} />

      {confirmers.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Confirmed by (staff)</CardTitle>
          </CardHeader>
          <CardContent className="h-[260px] overflow-auto pt-0 text-sm">
            <table className="w-full">
              <tbody>
                {confirmers.map((c, i) => (
                  <tr key={`${c.user_id ?? "none"}-${i}`} className="border-b last:border-0">
                    <td className="py-1.5">{c.name || "—"}</td>
                    <td className="py-1.5 text-right tabular-nums">{c.orders} orders</td>
                    <td className="py-1.5 text-right tabular-nums text-muted-foreground">{money(c.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {couriers.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Courier performance</CardTitle>
          </CardHeader>
          <CardContent className="h-[260px] overflow-auto pt-0 text-sm">
            <table className="w-full">
              <thead className="text-[11px] uppercase text-muted-foreground">
                <tr>
                  <th className="text-left font-medium">Courier</th>
                  <th className="text-right font-medium">Orders</th>
                  <th className="text-right font-medium">Delivered</th>
                  <th className="text-right font-medium">Return</th>
                </tr>
              </thead>
              <tbody>
                {couriers.map((c, i) => {
                  const dr = c.orders ? (c.delivered / c.orders) * 100 : 0;
                  const rr = c.orders ? (c.returned / c.orders) * 100 : 0;
                  return (
                    <tr key={`${c.courier ?? "none"}-${i}`} className="border-b last:border-0">
                      <td className="py-1.5 capitalize">{c.courier || "—"}</td>
                      <td className="py-1.5 text-right tabular-nums">{c.orders}</td>
                      <td className="py-1.5 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                        {dr.toFixed(0)}%
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-red-600 dark:text-red-400">
                        {rr.toFixed(0)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {payments.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Payment mix</CardTitle>
          </CardHeader>
          <CardContent className="h-[260px] pt-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={payments} margin={{ left: 4, right: 4, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                <XAxis dataKey="payment_status" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={40} />
                <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v: number, n: string) => (n === "Value" ? money(v) : v)} />
                <Bar dataKey="orders" name="Orders" fill="#06b6d4" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {weekday.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Weekday pattern</CardTitle>
          </CardHeader>
          <CardContent className="h-[260px] pt-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekday} margin={{ left: 4, right: 4, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={40} />
                <Tooltip
                  contentStyle={{ fontSize: 12 }}
                  formatter={(v: number, n: string) => (n === "Avg/day" ? Number(v).toFixed(1) : v)}
                />
                <Bar dataKey="orders" name="Orders" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                <Bar dataKey="avg" name="Avg/day" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
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