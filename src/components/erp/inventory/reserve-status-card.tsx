import { useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ClipboardList, CheckCircle2, PackageOpen, PackageCheck, Truck, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

type ReserveBucket = { key: string; orders: number; units: number; reserved: boolean };
type ReserveStatus = {
  buckets: ReserveBucket[];
  total_reserved_units: number;
  total_reserved_orders: number;
};

export const getReserveStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => (d ?? {}) as { brandId?: string | null })
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("inv_reserve_status", {
      _brand_id: data?.brandId ?? null,
    });
    if (error) throw error;
    return result as ReserveStatus;
  });

const BUCKET_META: Record<string, { label: string; sub: string; icon: typeof PackageOpen; accent: string }> = {
  pending: {
    label: "Pending",
    sub: "Reserve হয়নি",
    icon: ClipboardList,
    accent: "text-muted-foreground",
  },
  confirmed: {
    label: "Confirmed",
    sub: "Reserve হয়নি",
    icon: CheckCircle2,
    accent: "text-blue-500",
  },
  packing: {
    label: "Packing",
    sub: "Reserved",
    icon: PackageOpen,
    accent: "text-amber-500",
  },
  packed: {
    label: "Packed",
    sub: "Reserved",
    icon: PackageCheck,
    accent: "text-violet-500",
  },
  shipped: {
    label: "Shipped",
    sub: "Stock কেটে গেছে",
    icon: Truck,
    accent: "text-emerald-500",
  },
};

export function ReserveStatusCard({ brandId }: { brandId?: string | null }) {
  const query = useQuery({
    queryKey: ["reserve-status", brandId ?? "all"],
    queryFn: () => getReserveStatus({ data: { brandId: brandId ?? null } }),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const buckets = query.data?.buckets ?? [];
  const totalReserved = query.data?.total_reserved_units ?? 0;
  const totalReservedOrders = query.data?.total_reserved_orders ?? 0;

  if (!query.isLoading && buckets.every((b) => b.orders === 0)) return null;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-amber-500" />
          <h2 className="text-sm font-semibold tracking-tight">Order Reserve Pipeline</h2>
          <span className="text-xs text-muted-foreground">
            Packing-এ গেলেই stock reserve হয় — pending/confirmed আটকায় না
          </span>
        </div>
        <div className="text-xs text-muted-foreground">
          মোট reserved:{" "}
          <span className="font-semibold tabular-nums text-foreground">
            {totalReserved.toLocaleString()} units
          </span>
          <span className="mx-1 text-border">·</span>
          <span className="tabular-nums">{totalReservedOrders.toLocaleString()} orders</span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-px rounded-2xl border border-border/70 bg-border/60 overflow-hidden">
        {buckets.map((b) => {
          const meta = BUCKET_META[b.key] ?? BUCKET_META.pending;
          const Icon = meta.icon;
          return (
            <div key={b.key} className={cn("bg-card p-4 space-y-2", b.reserved && "bg-amber-500/[0.04]")}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {meta.label}
                </span>
                <Icon className={cn("h-4 w-4", meta.accent)} />
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-semibold tabular-nums tracking-tight">
                  {b.orders.toLocaleString()}
                </span>
                <span className="text-xs text-muted-foreground">orders</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="tabular-nums text-muted-foreground">
                  {b.units.toLocaleString()} units
                </span>
                {b.reserved ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                    <Lock className="h-2.5 w-2.5" /> Reserved
                  </span>
                ) : (
                  <span className="text-[10px] text-muted-foreground/70">{meta.sub}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
