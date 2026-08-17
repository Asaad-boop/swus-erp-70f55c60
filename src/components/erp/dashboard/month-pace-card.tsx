import { useQuery } from "@tanstack/react-query";
import { CalendarRange, TrendingDown, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { applyBrandScope } from "@/lib/erp/apply-brand-scope";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const BDT = (n: number) => "৳" + Math.round(n).toLocaleString("en-IN");

const EXCLUDED = new Set(["cancelled", "returned"]);

/**
 * Owner-only: month-to-date revenue pace vs the same day of last month,
 * plus a straight-line projection for the full month.
 */
export function MonthPaceCard({ brandIds, enabled }: { brandIds: string[]; enabled: boolean }) {
  const { data, isLoading } = useQuery({
    queryKey: ["dash-month-pace", brandIds.join(",")],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const now = new Date();
      const dayOfMonth = now.getDate();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevSameDayEnd = new Date(now.getFullYear(), now.getMonth() - 1, dayOfMonth, 23, 59, 59, 999);

      const sum = async (from: Date, to: Date) => {
        const { data: rows } = await applyBrandScope(
          supabase.from("orders").select("total,status"),
          brandIds,
        )
          .gte("created_at", from.toISOString())
          .lte("created_at", to.toISOString());
        return (rows ?? []).reduce(
          (s: number, r: any) => (EXCLUDED.has(String(r.status ?? "")) ? s : s + Number(r.total ?? 0)),
          0,
        );
      };

      const [mtd, prevMtd] = await Promise.all([sum(monthStart, now), sum(prevStart, prevSameDayEnd)]);
      const projected = dayOfMonth > 0 ? (mtd / dayOfMonth) * daysInMonth : 0;
      const delta = prevMtd > 0 ? ((mtd - prevMtd) / prevMtd) * 100 : null;
      return { mtd, prevMtd, projected, delta, dayOfMonth, daysInMonth };
    },
  });

  const pct = data ? Math.min(100, (data.dayOfMonth / data.daysInMonth) * 100) : 0;
  const up = (data?.delta ?? 0) >= 0;

  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-semibold">Month pace</div>
          <div className="text-sm font-semibold mt-0.5">
            {new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
          </div>
        </div>
        <CalendarRange className="size-4 text-slate-400" />
      </div>
      <div className="p-4">
        {isLoading || !data ? (
          <Skeleton className="h-20 w-full" />
        ) : (
          <>
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-3xl font-bold tabular-nums leading-none tracking-tight">{BDT(data.mtd)}</span>
              <span className="text-xs text-slate-500">month to date</span>
              {data.delta !== null && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    up ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700",
                  )}
                >
                  {up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                  {Math.abs(data.delta).toFixed(1)}% vs last month
                </span>
              )}
            </div>
            <div className="mt-3 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full rounded-full bg-slate-900" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              Day {data.dayOfMonth} of {data.daysInMonth}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                <div className="text-[10px] uppercase text-slate-500">Projected full month</div>
                <div className="font-bold tabular-nums">{BDT(data.projected)}</div>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                <div className="text-[10px] uppercase text-slate-500">Last month, same day</div>
                <div className="font-bold tabular-nums">{BDT(data.prevMtd)}</div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}