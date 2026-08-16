import { useQuery } from "@tanstack/react-query";
import { Users, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

const BDT = (n: number) => "৳" + Math.round(n).toLocaleString("en-IN");

/** Owner-only: monthly payroll commitment snapshot. */
export function TeamCostCard({ brandIds, enabled }: { brandIds: string[]; enabled: boolean }) {
  const { data, isLoading } = useQuery({
    queryKey: ["dash-team-cost", brandIds.join(",")],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      let q = supabase
        .from("hr_employees")
        .select("id, monthly_salary, status, employment_type, brand_id")
        .eq("status", "active");
      if (brandIds.length > 0) q = q.or(`brand_id.is.null,brand_id.in.(${brandIds.join(",")})`);
      const { data: rows } = await q;
      const list = (rows ?? []) as Array<{ monthly_salary: number | null; employment_type: string }>;
      const total = list.reduce((s, r) => s + Number(r.monthly_salary ?? 0), 0);
      const byType = new Map<string, number>();
      for (const r of list) byType.set(r.employment_type, (byType.get(r.employment_type) ?? 0) + 1);
      return {
        headcount: list.length,
        total,
        avg: list.length ? total / list.length : 0,
        byType: Array.from(byType.entries()).sort((a, b) => b[1] - a[1]),
      };
    },
  });

  return (
    <div className="rounded-lg border border-border/60 bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">
            Team Cost
          </div>
          <div className="text-sm font-semibold mt-0.5" style={{ fontFamily: "Sora, ui-sans-serif" }}>
            Monthly payroll commitment
          </div>
        </div>
        <Wallet className="size-4 text-muted-foreground" />
      </div>
      <div className="p-4">
        {isLoading ? (
          <Skeleton className="h-10 w-40" />
        ) : (
          <div className="flex items-baseline gap-3">
            <span
              className="text-3xl font-bold tabular-nums leading-none"
              style={{ fontFamily: "Sora, ui-sans-serif", letterSpacing: "-0.02em" }}
            >
              {BDT(data?.total ?? 0)}
            </span>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Users className="size-3.5" /> {data?.headcount ?? 0} active
            </span>
          </div>
        )}
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-md border border-border/60 bg-muted/30 p-2">
            <div className="text-[10px] uppercase text-muted-foreground">Avg / head</div>
            <div className="font-bold tabular-nums">{BDT(data?.avg ?? 0)}</div>
          </div>
          <div className="rounded-md border border-border/60 bg-muted/30 p-2">
            <div className="text-[10px] uppercase text-muted-foreground">Mix</div>
            <div className="font-medium truncate">
              {(data?.byType ?? []).map(([t, n]) => `${t} ${n}`).join(" · ") || "—"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}