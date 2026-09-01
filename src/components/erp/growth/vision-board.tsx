import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ComposedChart,
} from "recharts";
import { CalendarDays, Flame, PhoneCall, Trophy, Sun, CalendarRange } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useBrand } from "@/contexts/brand-context";
import { getGrowthVision, type TeamScoreRow } from "@/lib/erp/growth/vision.functions";

const bdt = (n: number) => "৳" + Math.round(n).toLocaleString("en-IN");
const short = (n: number) =>
  n >= 1e7
    ? `৳${(n / 1e7).toFixed(2)}Cr`
    : n >= 1e5
      ? `৳${(n / 1e5).toFixed(2)}L`
      : n >= 1000
        ? `৳${(n / 1000).toFixed(1)}k`
        : `৳${Math.round(n)}`;
const int = (n: number) => Math.round(n).toLocaleString("en-IN");

function Ring({ pct, tone }: { pct: number; tone: string }) {
  const p = Math.max(0, Math.min(100, pct));
  return (
    <div
      className="relative h-14 w-14 shrink-0 rounded-full"
      style={{
        background: `conic-gradient(currentColor ${p * 3.6}deg, hsl(var(--muted)) 0deg)`,
      }}
      // tone drives currentColor
      data-pct={p}
    >
      <div className={cn("absolute inset-0 rounded-full", tone)} style={{ opacity: 0 }} />
      <div className="absolute inset-[5px] flex items-center justify-center rounded-full bg-card text-[11px] font-semibold tabular-nums text-foreground">
        {Math.round(pct)}%
      </div>
    </div>
  );
}

function PaceCard({
  icon: Icon,
  label,
  scope,
  actual,
  target,
  fmt,
  extra,
}: {
  icon: typeof Sun;
  label: string;
  scope: string;
  actual: number;
  target: number | null;
  fmt: (n: number) => string;
  extra?: React.ReactNode;
}) {
  const pct = target && target > 0 ? (actual / target) * 100 : null;
  const gap = target ? Math.max(0, target - actual) : 0;
  const tone =
    pct == null
      ? "text-muted-foreground"
      : pct >= 100
        ? "text-emerald-500"
        : pct >= 70
          ? "text-amber-500"
          : "text-rose-500";
  return (
    <Card className="overflow-hidden">
      <CardContent className="flex items-center gap-3 p-4">
        {pct == null ? (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-muted">
            <Icon className="h-5 w-5 text-muted-foreground" />
          </div>
        ) : (
          <div className={tone}>
            <Ring pct={pct} tone={tone} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {label} · {scope}
          </p>
          <p className="text-xl font-semibold tabular-nums">{fmt(actual)}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {target && target > 0
              ? gap > 0
                ? `target ${fmt(target)} · আরও ${fmt(gap)} লাগবে`
                : `target ${fmt(target)} · ✅ পূরণ হয়েছে`
              : "target সেট করা নেই"}
          </p>
          {extra}
        </div>
      </CardContent>
    </Card>
  );
}

function Delta({ now, prev, label }: { now: number; prev: number; label: string }) {
  if (!prev) return null;
  const d = ((now - prev) / prev) * 100;
  return (
    <p
      className={cn(
        "mt-0.5 text-[11px] font-medium tabular-nums",
        d >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
      )}
    >
      {d >= 0 ? "▲" : "▼"} {Math.abs(d).toFixed(0)}% {label}
    </p>
  );
}

const TABS = [
  { key: "today", label: "আজ" },
  { key: "week", label: "এই সপ্তাহ" },
  { key: "month", label: "এই মাস" },
] as const;

function TeamBoard({ team }: { team: Record<string, TeamScoreRow[]> }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("today");
  const rows = team[tab] ?? [];
  const max = Math.max(1, ...rows.map((r) => r.confirmed_orders));
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold">
            <Trophy className="h-4 w-4 text-amber-500" /> কে কতগুলো order confirm করলো
          </h3>
          <div className="flex rounded-lg border border-border/70 p-0.5">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  tab === t.key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            এই সময়ে কেউ order confirm করেনি।
          </p>
        ) : (
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={r.user_id} className="flex items-center gap-3">
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                    i === 0
                      ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-medium">{r.name}</p>
                    <p className="shrink-0 text-sm font-semibold tabular-nums">
                      {int(r.confirmed_orders)}
                    </p>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${(r.confirmed_orders / max) * 100}%` }}
                    />
                  </div>
                  <p className="mt-1 truncate text-[11px] text-muted-foreground">
                    {short(r.confirmed_value)} value · {int(r.delivered_orders)} delivered ·{" "}
                    <PhoneCall className="inline h-3 w-3" /> {int(r.calls)} call
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Vision cockpit: daily / weekly / monthly targets, pace and team scoreboard. */
export function VisionBoard() {
  const { brandIds } = useBrand();
  const fetchVision = useServerFn(getGrowthVision);
  const q = useQuery({
    queryKey: ["growth-vision", brandIds],
    enabled: brandIds.length > 0,
    refetchInterval: 5 * 60_000,
    queryFn: () => fetchVision({ data: { brandIds } }),
  });

  const d = q.data;

  const derived = useMemo(() => {
    if (!d) return null;
    const { targets, month, week, windows } = d;
    const perDayOrders = targets.orders ? targets.orders / month.daysInMonth : 0;
    const perDayRevenue = targets.delivered_revenue
      ? targets.delivered_revenue / month.daysInMonth
      : 0;
    // remaining-based requirement (more actionable than flat average)
    const needOrdersToday = targets.orders
      ? Math.max(0, (targets.orders - windows.mtd.orders) / month.daysLeft)
      : 0;
    const needRevenueToday = targets.delivered_revenue
      ? Math.max(0, (targets.delivered_revenue - windows.mtd.delivered_revenue) / month.daysLeft)
      : 0;
    const weekTargetOrders = perDayOrders * 7;
    const weekTargetRevenue = perDayRevenue * 7;
    const runRate = windows.mtd.orders / Math.max(1, month.dayOfMonth);
    return {
      needOrdersToday,
      needRevenueToday,
      weekTargetOrders,
      weekTargetRevenue,
      weekDays: week.dayIndex,
      projectedOrders: Math.round(runRate * month.daysInMonth),
      projectedRevenue: Math.round(
        (windows.mtd.delivered_revenue / Math.max(1, month.dayOfMonth)) * month.daysInMonth,
      ),
    };
  }, [d]);

  if (q.isLoading) return <Skeleton className="h-64 w-full rounded-xl" />;
  if (!d || !derived) return null;

  const hasTargets =
    d.targets.orders > 0 || d.targets.delivered_revenue > 0 || d.targets.delivered_orders > 0;
  const hasActivity = d.windows.mtd.orders > 0 || d.windows.mtd.booked_revenue > 0;
  if (!hasTargets && !hasActivity) return null;

  return (
    <div className="space-y-3">
      {/* Today */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <PaceCard
          icon={Sun}
          label="Order"
          scope="আজ"
          actual={d.windows.today.orders}
          target={derived.needOrdersToday || null}
          fmt={int}
          extra={<Delta now={d.windows.today.orders} prev={d.windows.yesterday.orders} label="vs কাল" />}
        />
        <PaceCard
          icon={Flame}
          label="Delivered revenue"
          scope="আজ"
          actual={d.windows.today.delivered_revenue}
          target={derived.needRevenueToday || null}
          fmt={short}
          extra={
            <Delta
              now={d.windows.today.delivered_revenue}
              prev={d.windows.yesterday.delivered_revenue}
              label="vs কাল"
            />
          }
        />
        <PaceCard
          icon={CalendarRange}
          label="Order"
          scope={`সপ্তাহ (${derived.weekDays}/7 দিন)`}
          actual={d.windows.week.orders}
          target={derived.weekTargetOrders || null}
          fmt={int}
          extra={<Delta now={d.windows.week.orders} prev={d.windows.prevWeek.orders} label="vs গত সপ্তাহ" />}
        />
        <PaceCard
          icon={CalendarDays}
          label="Order"
          scope={`মাস (${d.month.daysLeft} দিন বাকি)`}
          actual={d.windows.mtd.orders}
          target={d.targets.orders || null}
          fmt={int}
          extra={
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              ~{int(derived.projectedOrders)} projected
            </p>
          }
        />
      </div>

      {/* Month money strip */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <PaceCard
          icon={CalendarDays}
          label="Delivered revenue"
          scope="মাস"
          actual={d.windows.mtd.delivered_revenue}
          target={d.targets.delivered_revenue || null}
          fmt={short}
          extra={
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              ~{short(derived.projectedRevenue)} projected
            </p>
          }
        />
        <PaceCard
          icon={CalendarDays}
          label="Delivered order"
          scope="মাস"
          actual={d.windows.mtd.delivered_orders}
          target={d.targets.delivered_orders || null}
          fmt={int}
        />
        <PaceCard
          icon={CalendarDays}
          label="Ad spend"
          scope="মাস"
          actual={d.windows.mtd.spend_bdt}
          target={d.targets.ad_spend || null}
          fmt={short}
          extra={
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              ROAS {d.windows.mtd.roas == null ? "—" : `${d.windows.mtd.roas.toFixed(2)}x`}
            </p>
          }
        />
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              গত মাস (full)
            </p>
            <p className="text-xl font-semibold tabular-nums">{int(d.windows.prevMonth.orders)}</p>
            <p className="text-[11px] text-muted-foreground">
              {bdt(d.windows.prevMonth.delivered_revenue)} delivered
            </p>
            <Badge variant="outline" className="mt-2 text-[10px]">
              MTD {int(d.windows.mtd.orders)} order
            </Badge>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.3fr_1fr]">
        {d.trend.length > 1 && (
          <Card>
            <CardContent className="p-4">
              <h3 className="mb-2 text-sm font-semibold">এই মাসের দৈনিক pace</h3>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={d.trend} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(v: string) => v.slice(8)}
                      tick={{ fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={34} />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                      formatter={(v: number, n: string) =>
                        n === "orders" ? [int(v), "Order"] : [short(v), "Delivered revenue"]
                      }
                    />
                    <Bar dataKey="orders" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                    {derived.needOrdersToday > 0 && (
                      <Line
                        type="monotone"
                        dataKey={() => Math.round(d.targets.orders / d.month.daysInMonth)}
                        stroke="hsl(var(--muted-foreground))"
                        strokeDasharray="4 4"
                        dot={false}
                        name="target/day"
                      />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        <TeamBoard team={d.team as unknown as Record<string, TeamScoreRow[]>} />
      </div>
    </div>
  );
}

// keep BarChart import used for tree-shaking clarity
export type { TeamScoreRow };
void BarChart;
