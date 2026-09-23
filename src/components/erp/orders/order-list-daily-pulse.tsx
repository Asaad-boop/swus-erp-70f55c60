import { Boxes, RotateCcw, ShoppingBag, Sparkles, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { OrderListDailyPulse as DailyPulse } from "@/hooks/erp/use-orders-query";

function Metric({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 border-r border-border/70 px-3 last:border-r-0">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</div>
        <div className="mt-0.5 flex items-baseline gap-1.5">
          <span className="text-lg font-bold leading-none tabular-nums text-foreground">{value}</span>
          {hint ? <span className="truncate text-[10px] text-muted-foreground">{hint}</span> : null}
        </div>
      </div>
    </div>
  );
}

export function OrderListDailyPulse({ data, loading }: { data?: DailyPulse; loading: boolean }) {
  if (loading && !data) {
    return <Skeleton className="h-[68px] w-full rounded-lg" />;
  }
  if (!data) return null;

  const repeatRate = data.unique_customers > 0
    ? Math.round((data.repeat_customers / data.unique_customers) * 100)
    : 0;
  const topProducts = data.top_products.filter((product) => product.qty > 0);

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card" aria-label="Today's order summary">
      <div className={topProducts.length > 0
        ? "grid min-h-[66px] grid-cols-2 divide-y divide-border/70 sm:grid-cols-4 sm:divide-y-0 xl:grid-cols-[0.8fr_0.8fr_1fr_1fr_2.2fr]"
        : "grid min-h-[66px] grid-cols-2 divide-y divide-border/70 sm:grid-cols-4 sm:divide-y-0"
      }>
        <Metric icon={<ShoppingBag className="h-4 w-4" />} label="Today's orders" value={data.orders.toLocaleString()} />
        <Metric icon={<Boxes className="h-4 w-4" />} label="Pieces" value={data.pieces.toLocaleString()} />
        <Metric icon={<Users className="h-4 w-4" />} label="Customers" value={data.unique_customers.toLocaleString()} hint="unique" />
        <Metric icon={<RotateCcw className="h-4 w-4" />} label="Repeat" value={data.repeat_customers.toLocaleString()} hint={`${repeatRate}%`} />
        {topProducts.length > 0 ? (
          <div className="col-span-2 flex min-w-0 items-center gap-2.5 px-3 py-2 sm:col-span-4 xl:col-span-1">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary"><Sparkles className="h-4 w-4" /></span>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold uppercase text-muted-foreground">Top moving today</div>
              <div className="mt-1 flex min-w-0 items-center gap-3 overflow-hidden">
                {topProducts.map((product, index) => (
                  <div key={`${product.name}-${index}`} className="flex min-w-0 items-center gap-1.5">
                    <span className="max-w-[150px] truncate text-[11.5px] font-medium text-foreground">{product.name}</span>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-foreground">{product.qty} pcs</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}