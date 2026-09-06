import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { PackageCheck, Truck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { applyBrandScope } from "@/lib/erp/apply-brand-scope";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Dhaka-day boundaries as ISO timestamps. */
function bdDayBounds() {
  const ymd = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });
  const [y, m, d] = ymd.split("-").map(Number);
  const from = Date.UTC(y!, (m ?? 1) - 1, d ?? 1) - 6 * 3600e3;
  return { fromISO: new Date(from).toISOString(), toISO: new Date(from + 86400e3 - 1).toISOString() };
}

const countOf = async (
  brandIds: string[],
  build: (q: any) => any,
): Promise<number> => {
  const base = applyBrandScope(
    supabase.from("orders").select("id", { count: "exact", head: true }) as any,
    brandIds,
  );
  const { count } = await build(base);
  return count ?? 0;
};

/** Today's order intake and where every order currently sits. */
export function OrderFlowTodayCard({ brandIds, enabled }: { brandIds: string[]; enabled: boolean }) {
  const q = useQuery({
    queryKey: ["dash-order-flow-today", brandIds.join(",")],
    enabled,
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: async () => {
      const { fromISO, toISO } = bdDayBounds();
      const today = (qq: any) => qq.gte("created_at", fromISO).lte("created_at", toISO);
      const [placed, web, confirmed, pending, cancelled, packing, readyToShip] = await Promise.all([
        countOf(brandIds, today),
        countOf(brandIds, (qq: any) => today(qq).in("source", ["website", "shopify"])),
        countOf(brandIds, (qq: any) =>
          qq.gte("confirmed_at", fromISO).lte("confirmed_at", toISO),
        ),
        countOf(brandIds, (qq: any) => qq.in("status", ["new", "incomplete", "on_hold"])),
        countOf(brandIds, (qq: any) => today(qq).in("status", ["cancelled", "fake"])),
        countOf(brandIds, (qq: any) => qq.in("status", ["confirmed", "packaging", "ready_to_pack"])),
        countOf(brandIds, (qq: any) => qq.in("status", ["packed", "ready_to_ship"])),
      ]);
      return { placed, web, manual: Math.max(0, placed - web), confirmed, pending, cancelled, packing, readyToShip };
    },
  });

  return (
    <Card className="border-border/60 shadow-none">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-1.5 text-[13px] font-semibold">
          <PackageCheck className="size-3.5 text-indigo-600" /> Order flow today
        </CardTitle>
        <Link to="/erp/orders/list" className="text-[11px] text-indigo-600 hover:underline">
          Open orders
        </Link>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Metric label="Orders today" value={q.data?.placed ?? 0} />
            <Metric label="From website" value={q.data?.web ?? 0} />
            <Metric label="Manual" value={q.data?.manual ?? 0} />
            <Metric label="Confirmed today" value={q.data?.confirmed ?? 0} tone="emerald" />
            <Metric label="Pending action" value={q.data?.pending ?? 0} tone="amber" />
            <Metric label="Cancel / fake" value={q.data?.cancelled ?? 0} tone="rose" />
            <Metric label="In packing" value={q.data?.packing ?? 0} />
            <Metric label="Ready to ship" value={q.data?.readyToShip ?? 0} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Today's dispatch, delivery and return movement. */
export function CourierReturnTodayCard({ brandIds, enabled }: { brandIds: string[]; enabled: boolean }) {
  const q = useQuery({
    queryKey: ["dash-courier-return-today", brandIds.join(",")],
    enabled,
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: async () => {
      const { fromISO, toISO } = bdDayBounds();
      const [shipped, inTransit, delivered, returnedToday, pendingReturn] = await Promise.all([
        countOf(brandIds, (qq: any) => qq.gte("shipped_at", fromISO).lte("shipped_at", toISO)),
        countOf(brandIds, (qq: any) => qq.in("status", ["shipped", "in_transit"])),
        countOf(brandIds, (qq: any) => qq.gte("delivered_at", fromISO).lte("delivered_at", toISO)),
        countOf(brandIds, (qq: any) =>
          qq.gte("return_received_at", fromISO).lte("return_received_at", toISO),
        ),
        countOf(brandIds, (qq: any) =>
          qq.in("status", ["pending_return", "return_in_transit", "unpaid_return", "paid_return"]),
        ),
      ]);
      return { shipped, inTransit, delivered, returnedToday, pendingReturn };
    },
  });

  return (
    <Card className="border-border/60 shadow-none">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-1.5 text-[13px] font-semibold">
          <Truck className="size-3.5 text-indigo-600" /> Courier & returns today
        </CardTitle>
        <Link to="/erp/courier" className="text-[11px] text-indigo-600 hover:underline">
          Courier
        </Link>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            <Metric label="Handed to courier" value={q.data?.shipped ?? 0} />
            <Metric label="In transit now" value={q.data?.inTransit ?? 0} />
            <Metric label="Delivered today" value={q.data?.delivered ?? 0} tone="emerald" />
            <Metric label="Return received" value={q.data?.returnedToday ?? 0} tone="rose" />
            <Metric label="Return pending" value={q.data?.pendingReturn ?? 0} tone="amber" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "emerald" | "amber" | "rose";
}) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/40 p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div
        className={cn(
          "text-lg font-bold tabular-nums",
          tone === "emerald" && "text-emerald-600",
          tone === "amber" && "text-amber-600",
          tone === "rose" && "text-rose-600",
        )}
      >
        {value}
      </div>
    </div>
  );
}
