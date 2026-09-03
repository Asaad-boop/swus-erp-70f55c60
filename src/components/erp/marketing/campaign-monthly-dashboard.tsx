import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getCampaignMonthlyComparison,
  type CampaignMonthRow,
} from "@/lib/erp/marketing/campaigns.functions";

const bdt = (n: number) => "৳" + Math.round(n).toLocaleString("en-IN");
const signedBdt = (n: number) =>
  (n >= 0 ? "+" : "−") + "৳" + Math.abs(Math.round(n)).toLocaleString("en-IN");
const num = (n: number) => n.toLocaleString("en-IN");

function MoMDelta({ cur, prev }: { cur: number | null; prev: number | null }) {
  if (cur === null || prev === null || Math.abs(prev) < 1) {
    return <span className="text-muted-foreground">—</span>;
  }
  const d = ((cur - prev) / Math.abs(prev)) * 100;
  if (Math.abs(d) < 0.05) return <Minus className="inline h-3 w-3 text-muted-foreground" />;
  const up = d >= 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 tabular-nums ${up ? "text-emerald-600" : "text-rose-600"}`}
    >
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {Math.abs(d).toFixed(1)}%
    </span>
  );
}

export function CampaignMonthlyDashboard({ brandIds }: { brandIds: string[] }) {
  const [months, setMonths] = useState(6);
  const fetchMonthly = useServerFn(getCampaignMonthlyComparison);
  const q = useQuery({
    queryKey: ["mkt-campaign-monthly", brandIds.slice().sort().join(","), months],
    queryFn: () => fetchMonthly({ data: { brandIds, months } }),
    enabled: brandIds.length > 0,
    staleTime: 120_000,
    refetchOnWindowFocus: false,
  });

  const rows: CampaignMonthRow[] = useMemo(() => q.data ?? [], [q.data]);
  const hasData = rows.some((r) => r.spend > 0 || r.orders > 0);
  const latest = rows.length ? rows[rows.length - 1] : null;
  const prev = rows.length > 1 ? rows[rows.length - 2] : null;
  const best = useMemo(() => {
    let b: CampaignMonthRow | null = null;
    for (const r of rows) {
      if (r.realized_profit === null) continue;
      if (!b || (b.realized_profit ?? 0) < r.realized_profit) b = r;
    }
    return b;
  }, [rows]);

  if (q.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (!hasData) {
    return (
      <div className="rounded-xl border bg-card p-12 text-center text-sm text-muted-foreground">
      এই brand-এ monthly comparison-এর জন্য data নেই।
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls + summary strip */}
      <section className="rounded-xl border bg-card">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              {latest?.label ?? "—"} realized profit{latest?.is_current ? " (month to date)" : ""}
            </div>
            <div className="flex items-baseline gap-2">
              <span
                className={`text-xl font-semibold tabular-nums ${
                  latest?.realized_profit === null || latest === null
                    ? "text-muted-foreground"
                    : latest.realized_profit >= 0
                      ? "text-emerald-600"
                      : "text-rose-600"
                }`}
              >
                {latest?.realized_profit === null || latest === null
                  ? "Pending"
                  : signedBdt(latest.realized_profit)}
              </span>
              {latest && prev && (
                <span className="text-[11px]">
                  <MoMDelta cur={latest.realized_profit} prev={prev.realized_profit} />
                  <span className="ml-1 text-muted-foreground">vs {prev.label}</span>
                </span>
              )}
            </div>
          </div>
          {latest && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px]">
              <MiniStat label="Spend" value={bdt(latest.spend)} />
              <MiniStat
                label="Orders"
                value={`${num(latest.orders)} · ${num(latest.delivered_orders)} del.`}
              />
              <MiniStat
                label="Collected"
                value={latest.collected_amount === null ? "Pending" : bdt(latest.collected_amount)}
              />
              <MiniStat label="COGS (settled)" value={bdt(latest.cogs_applied)} />
              {best && (
                <MiniStat
                  label="Best month"
                  value={`${best.label} · ${signedBdt(best.realized_profit ?? 0)}`}
                />
              )}
            </div>
          )}
          <div className="ml-auto inline-flex rounded-lg border p-0.5">
            {[3, 6, 12].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMonths(m)}
                className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                  months === m
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {m}M
              </button>
            ))}
          </div>
        </div>
        <div className="border-t px-4 py-1.5 text-[10px] text-muted-foreground">
          Month boundaries Asia/Dhaka · Realized = collected cash − settled COGS − settled opex −
          return charge − ad spend · Current month is month-to-date
        </div>
      </section>

      {/* Chart */}
      <section className="rounded-xl border bg-card p-4">
        <div className="mb-2 text-sm font-semibold">Spend vs collected vs realized profit</div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                width={52}
                tickFormatter={(v: number) =>
                  Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(v)
                }
              />
              <YAxis yAxisId="r" orientation="right" hide />
              <Tooltip
                contentStyle={{ fontSize: 12, padding: "6px 8px", borderRadius: 6 }}
                formatter={(v: any, n: any) =>
                  n === "Realized profit"
                    ? [v === null || v === undefined ? "Pending" : signedBdt(Number(v)), n]
                    : [bdt(Number(v)), n]
                }
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar name="Ad spend" dataKey="spend" fill="var(--primary)" radius={[3, 3, 0, 0]} />
              <Bar
                name="Collected"
                dataKey="collected_amount"
                fill="var(--muted-foreground)"
                opacity={0.35}
                radius={[3, 3, 0, 0]}
              />
              <Line
                name="Realized profit"
                yAxisId="r"
                type="monotone"
                dataKey="realized_profit"
                stroke="hsl(var(--chart-2, 160 60% 45%))"
                strokeWidth={2}
                dot={{ r: 2.5 }}
                connectNulls={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Month table */}
      <section className="overflow-hidden rounded-xl border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-sm">
            <thead className="border-b bg-muted/30 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Month</th>
                <th className="px-4 py-3 text-right font-medium">Campaigns</th>
                <th className="px-4 py-3 text-right font-medium">Spend</th>
                <th className="px-4 py-3 text-right font-medium">Orders</th>
                <th className="px-4 py-3 text-right font-medium">Collected</th>
                <th className="px-4 py-3 text-right font-medium">COGS</th>
                <th className="px-4 py-3 text-right font-medium">Opex</th>
                <th className="px-4 py-3 text-right font-medium">Return charge</th>
                <th className="px-4 py-3 text-right font-medium">Realized profit</th>
                <th className="px-4 py-3 text-right font-medium">Profit ROAS</th>
                <th className="px-4 py-3 text-right font-medium">MoM</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows
                .slice()
                .reverse()
                .map((r, i, arr) => {
                  const prevRow = arr[i + 1] ?? null;
                  const empty = r.spend <= 0 && r.orders <= 0;
                  return (
                    <tr key={r.month} className={empty ? "opacity-50" : ""}>
                      <td className="px-4 py-3">
                        <div className="font-medium">{r.label}</div>
                        <div className="text-[10px] tabular-nums text-muted-foreground">
                          {r.from} → {r.to}
                          {r.is_current ? " · MTD" : ""}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{num(r.campaigns)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{bdt(r.spend)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {num(r.orders)}
                        <span className="block text-[10px] text-muted-foreground">
                          {num(r.delivered_orders)} delivered
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {r.collected_amount === null ? (
                          <span className="text-[11px] text-amber-700">Pending</span>
                        ) : (
                          bdt(r.collected_amount)
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{bdt(r.cogs_applied)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {bdt(r.operating_cost_applied)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{bdt(r.return_charge)}</td>
                      <td
                        className={`px-4 py-3 text-right font-semibold tabular-nums ${
                          r.realized_profit === null
                            ? "text-muted-foreground"
                            : r.realized_profit >= 0
                              ? "text-emerald-600"
                              : "text-rose-600"
                        }`}
                      >
                        {r.realized_profit === null ? "Pending" : signedBdt(r.realized_profit)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {r.realized_roas === null ? "—" : `${r.realized_roas.toFixed(2)}x`}
                      </td>
                      <td className="px-4 py-3 text-right text-[11px]">
                        <MoMDelta cur={r.realized_profit} prev={prevRow?.realized_profit ?? null} />
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="leading-tight">
      <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
      <div className="text-xs font-medium tabular-nums">{value}</div>
    </div>
  );
}
