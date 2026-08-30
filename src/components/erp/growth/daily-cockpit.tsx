import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight, Repeat } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useBrand } from "@/contexts/brand-context";
import { getGrowthDailyPulse } from "@/lib/erp/growth/daily.functions";

const bdt = (n: number) => "৳" + Math.round(n).toLocaleString("en-IN");

function Delta({ now, prev }: { now: number; prev: number }) {
  if (!prev) return null;
  const d = ((now - prev) / prev) * 100;
  return (
    <span
      className={cn(
        "text-[10px] font-medium tabular-nums",
        d >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
      )}
    >
      {d >= 0 ? "▲" : "▼"} {Math.abs(d).toFixed(0)}% vs kal
    </span>
  );
}

function Tile({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
  tone?: "default" | "good" | "bad";
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-card px-3 py-2.5 shadow-sm">
      <p className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 text-lg font-semibold tabular-nums",
          tone === "good" && "text-emerald-600 dark:text-emerald-400",
          tone === "bad" && "text-rose-600 dark:text-rose-400",
        )}
      >
        {value}
      </p>
      {sub && <div className="mt-0.5 truncate">{sub}</div>}
    </div>
  );
}

/** Today-first sales & ads cockpit (Asia/Dhaka). Hidden when there is no data. */
export function DailyCockpit() {
  const { brandIds } = useBrand();
  const fetchPulse = useServerFn(getGrowthDailyPulse);
  const q = useQuery({
    queryKey: ["growth-daily-pulse", brandIds],
    enabled: brandIds.length > 0,
    refetchInterval: 5 * 60_000,
    queryFn: () => fetchPulse({ data: { brandIds } }),
  });

  if (q.isLoading) return <Skeleton className="h-28 w-full rounded-xl" />;
  const d = q.data;
  if (!d) return null;

  const t = d.windows.today;
  const y = d.windows.yesterday;
  const mtd = d.windows.mtd;
  const hasAny = t.orders || t.spend_bdt || mtd.orders || mtd.spend_bdt;
  if (!hasAny) return null;

  const runRateOrders = mtd.orders / Math.max(1, d.month.dayOfMonth);
  const projOrders = Math.round(runRateOrders * d.month.daysInMonth);
  const brokenAccounts = d.adAccounts.filter((a) => a.status === "error");
  const spendStale = d.lastSpendDate ? d.lastSpendDate < d.today : false;

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
        <Tile
          label="Aaj order"
          value={t.orders.toLocaleString()}
          sub={<Delta now={t.orders} prev={y.orders} />}
        />
        <Tile
          label="Aaj booked revenue"
          value={bdt(t.booked_revenue)}
          sub={<Delta now={t.booked_revenue} prev={y.booked_revenue} />}
        />
        <Tile
          label="Aaj ad spend"
          value={bdt(t.spend_bdt)}
          sub={<Delta now={t.spend_bdt} prev={y.spend_bdt} />}
        />
        <Tile
          label="Aaj ROAS"
          value={t.roas == null ? "—" : `${t.roas.toFixed(2)}x`}
          tone={(t.roas ?? 0) >= 2 ? "good" : t.spend_bdt > 0 ? "bad" : "default"}
          sub={<span className="text-[10px] text-muted-foreground">booked ÷ spend</span>}
        />
        <Tile
          label="MTD contribution"
          value={bdt(mtd.contribution_profit)}
          tone={mtd.contribution_profit >= 0 ? "good" : "bad"}
          sub={
            <span className="text-[10px] text-muted-foreground">
              {bdt(mtd.delivered_revenue)} delivered
            </span>
          }
        />
        <Tile
          label="Month pace"
          value={`${mtd.orders.toLocaleString()} order`}
          sub={
            <span className="text-[10px] text-muted-foreground">
              ~{projOrders.toLocaleString()} projected · {d.month.daysLeft}d baki
            </span>
          }
        />
      </div>

      {(brokenAccounts.length > 0 || spendStale) && (
        <Card className="border-amber-500/40 bg-amber-500/[0.06]">
          <CardContent className="flex flex-wrap items-center justify-between gap-2 p-3 text-xs">
            <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5" />
              {brokenAccounts.length > 0
                ? `${brokenAccounts.length} ad account-e error — spend data miss hote pare`
                : `Ad spend shesh sync: ${d.lastSpendDate ?? "—"} (aajker data ashe ni)`}
            </span>
            <Button asChild size="sm" variant="outline" className="h-7 text-xs">
              <Link to="/erp/marketing/settings">
                Settings <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
          <Link to="/erp/growth/retention">
            <Repeat className="mr-1.5 h-3.5 w-3.5" /> Retention & upsell
          </Link>
        </Button>
      </div>
    </div>
  );
}
