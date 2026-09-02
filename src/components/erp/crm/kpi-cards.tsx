import { Card, CardContent } from "@/components/ui/card";
import { Users, UserPlus, Activity, Banknote, TrendingUp, ShoppingBag } from "lucide-react";
import { Area, AreaChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { SEGMENT_LABELS } from "@/lib/erp/crm/segments";
import type { CrmSegment } from "@/lib/erp/crm/types";

function formatBdt(n: number) {
  return new Intl.NumberFormat("en-BD", { maximumFractionDigits: 0 }).format(n);
}

type Kpis = {
  totalCustomers: number;
  newThisMonth: number;
  activeLast30: number;
  totalLtv: number;
  avgLtv: number;
  avgAov: number;
  segmentCounts: Record<CrmSegment, number>;
  newTrend: { date: string; count: number }[];
};

const SEGMENT_COLORS: Record<CrmSegment, string> = {
  vip: "#f59e0b",
  repeat: "#10b981",
  new: "#3b82f6",
  one_time: "#94a3b8",
  at_risk: "#f97316",
  lost: "#ef4444",
  blocked: "#27272a",
};

export function CrmKpiCards({ kpis, loading }: { kpis?: Kpis; loading?: boolean }) {
  const items = [
    { label: "Total customers", value: kpis ? kpis.totalCustomers.toLocaleString() : "—", icon: Users, tone: "text-blue-600 bg-blue-50" },
    { label: "New this month", value: kpis ? kpis.newThisMonth.toLocaleString() : "—", icon: UserPlus, tone: "text-emerald-600 bg-emerald-50" },
    { label: "Active (30d)", value: kpis ? kpis.activeLast30.toLocaleString() : "—", icon: Activity, tone: "text-amber-600 bg-amber-50" },
    { label: "Total LTV", value: kpis ? `৳${formatBdt(kpis.totalLtv)}` : "—", icon: Banknote, tone: "text-indigo-600 bg-indigo-50" },
    { label: "Avg LTV", value: kpis ? `৳${formatBdt(kpis.avgLtv)}` : "—", icon: TrendingUp, tone: "text-fuchsia-600 bg-fuchsia-50" },
    { label: "Avg order value", value: kpis ? `৳${formatBdt(kpis.avgAov)}` : "—", icon: ShoppingBag, tone: "text-rose-600 bg-rose-50" },
  ];

  const trend = kpis?.newTrend ?? [];
  const trendTotal = trend.reduce((acc, d) => acc + d.count, 0);
  const segmentData = kpis
    ? (Object.keys(kpis.segmentCounts) as CrmSegment[])
        .map((s) => ({ name: SEGMENT_LABELS[s], key: s, value: kpis.segmentCounts[s] }))
        .filter((d) => d.value > 0)
    : [];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {items.map((it) => (
          <Card key={it.label} className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs text-muted-foreground font-medium">{it.label}</div>
                <div className={`h-7 w-7 rounded-md grid place-items-center ${it.tone}`}>
                  <it.icon className="h-3.5 w-3.5" />
                </div>
              </div>
              <div className="text-xl font-bold tracking-tight">{loading ? "…" : it.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* New customers trend */}
        <Card className="lg:col-span-2 border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="text-xs text-muted-foreground font-medium">New customers · last 30 days</div>
                <div className="text-lg font-bold tracking-tight">
                  {loading ? "…" : trendTotal.toLocaleString()}
                </div>
              </div>
              <div className="h-7 w-7 rounded-md grid place-items-center text-emerald-600 bg-emerald-50">
                <UserPlus className="h-3.5 w-3.5" />
              </div>
            </div>
            <div className="h-24">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ top: 2, right: 2, left: 2, bottom: 0 }}>
                  <defs>
                    <linearGradient id="crmTrend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Tooltip
                    cursor={{ stroke: "#10b981", strokeWidth: 1, strokeDasharray: "3 3" }}
                    contentStyle={{ fontSize: 11, padding: "4px 8px", border: "1px solid var(--border)", borderRadius: 6 }}
                    labelFormatter={(l) => new Date(l as string).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                    formatter={(v: number) => [v, "new"]}
                  />
                  <Area type="monotone" dataKey="count" stroke="#10b981" strokeWidth={1.5} fill="url(#crmTrend)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Segment donut */}
        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-muted-foreground font-medium">Segment mix</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-28 w-28 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={segmentData} dataKey="value" nameKey="name" innerRadius={28} outerRadius={50} paddingAngle={1} stroke="none">
                      {segmentData.map((d) => (
                        <Cell key={d.key} fill={SEGMENT_COLORS[d.key]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ fontSize: 11, padding: "4px 8px", border: "1px solid var(--border)", borderRadius: 6 }}
                      formatter={(v: number, n) => [v, n]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 min-w-0 grid grid-cols-1 gap-0.5 text-[11px]">
                {segmentData.slice(0, 5).map((d) => (
                  <div key={d.key} className="flex items-center gap-1.5 min-w-0">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: SEGMENT_COLORS[d.key] }} />
                    <span className="truncate text-muted-foreground">{d.name}</span>
                    <span className="ml-auto font-medium tabular-nums">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}