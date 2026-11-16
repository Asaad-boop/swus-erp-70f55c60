import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Clock, ArrowRight, ListChecks,
  Activity, ShoppingCart, CheckCircle2, Truck, PackageCheck, Flame, ScanLine,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useCurrentRole } from "@/hooks/use-current-role";
import { RolePanels } from "@/components/erp/dashboard/staff/role-panels";
import { PunchCard } from "@/components/erp/hr/punch-card";
import { packStats } from "@/lib/erp/packing/api";
import { useMyAllowedPages } from "@/hooks/use-my-allowed-pages";
import { resolveAccess } from "@/lib/erp/access";
import { NAV_PAGES } from "@/lib/erp/nav";
import { useBrand } from "@/contexts/brand-context";
import { applyBrandScope } from "@/lib/erp/apply-brand-scope";
import { getMyDaySummary } from "@/lib/erp/staff/my-day.functions";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

const clock = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString("en-GB", {
        hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dhaka",
      })
    : "—";

const STATUS_LABEL: Record<string, string> = {
  confirmed: "Confirmed", packaging: "Packaging", packed: "Packed",
  ready_to_ship: "Ready to ship", shipped: "Shipped", in_transit: "In transit",
  delivered: "Delivered", returned: "Returned", cancelled: "Cancelled",
  on_hold: "On hold", fake: "Fake", exchange: "Exchange",
};
const label = (s: string) => STATUS_LABEL[s] ?? s.replace(/_/g, " ");

function Stat({ label: l, value, hint, icon: Icon, tone }: {
  label: string; value: string; hint?: string;
  icon?: typeof Clock; tone?: "default" | "good" | "warn";
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        {Icon && <Icon className="size-3.5" />} {l}
      </div>
      <div className={cn(
        "mt-1 text-lg font-bold tabular-nums",
        tone === "good" && "text-emerald-600",
        tone === "warn" && "text-amber-600",
      )}>{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

/** Personal, money-free workspace for non-admin staff. */
export function EmployeeDashboard() {
  const { roles, userId } = useCurrentRole();
  const { allowedPages, pageMode } = useMyAllowedPages();
  const { brandIds } = useBrand();
  const dayFn = useServerFn(getMyDaySummary);

  const { data: me } = useQuery({
    queryKey: ["my-display-name", userId],
    enabled: Boolean(userId),
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("display_name").eq("id", userId!).maybeSingle();
      return (data?.display_name as string | null) ?? null;
    },
  });

  const { data: day, isLoading: dayLoading } = useQuery({
    queryKey: ["my-day-summary", brandIds.join(",")],
    queryFn: () => dayFn({ data: { brandIds } }),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  // ---- role-scoped work queues (counts only, no money) ----
  const can = (p: string) => resolveAccess(roles, allowedPages, p, pageMode);
  const { data: queues } = useQuery({
    queryKey: ["emp-queues", brandIds.join(","), roles.join(",")],
    enabled: brandIds.length > 0,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const [toConfirm, toPack, inTransit] = await Promise.all([
        applyBrandScope(supabase.from("orders").select("id", { count: "exact", head: true }), brandIds)
          .in("status", ["new" as any, "processing" as any]),
        applyBrandScope(supabase.from("orders").select("id", { count: "exact", head: true }), brandIds)
          .in("status", ["confirmed" as any, "packaging" as any]),
        applyBrandScope(supabase.from("orders").select("id", { count: "exact", head: true }), brandIds)
          .in("status", ["shipped" as any, "in_transit" as any]),
      ]);
      return {
        toConfirm: toConfirm.count ?? 0,
        toPack: toPack.count ?? 0,
        inTransit: inTransit.count ?? 0,
      };
    },
  });

  const tasks = [
    { label: "Orders to confirm", v: queues?.toConfirm ?? 0, to: "/erp/orders/list", show: can("/erp/orders/list") },
    { label: "Ready to pack", v: queues?.toPack ?? 0, to: "/erp/orders/list", search: { tab: "packing" }, show: can("/erp/orders/list") },
    { label: "In transit", v: queues?.inTransit ?? 0, to: "/erp/courier", show: can("/erp/courier") },
  ].filter((t) => t.show);

  const quickLinks = useMemo(
    () =>
      NAV_PAGES.filter((p) => p.path !== "/erp" && resolveAccess(roles, allowedPages, p.path, pageMode)).slice(0, 12),
    [roles, allowedPages, pageMode],
  );

  const trend = day?.trend ?? [];
  const trendMax = Math.max(1, ...trend.map((t) => t.count));
  const byStatus = Object.entries(day?.byStatus ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 6);

  return (
    <div className="min-h-screen bg-muted/20">
      <div className="border-b border-border/60 bg-background/90 sticky top-0 z-20 backdrop-blur">
        <div className="px-4 md:px-6 py-3 max-w-[1200px] mx-auto flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[15px] font-semibold tracking-tight truncate">
              {greeting()}, {me ?? "there"}
            </h1>
            <p className="text-[12px] text-muted-foreground">
              {new Date().toLocaleDateString("en-GB", { weekday: "long", month: "short", day: "numeric" })}
            </p>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-6 py-4 max-w-[1200px] mx-auto space-y-4">
        {/* ATTENDANCE — check in / break / check out */}
        <PunchCard />

        {/* PACKING STATION shortcut for packers / warehouse */}
        {can("/erp/packing") && <PackingShortcut brandIds={brandIds} />}


        {/* TODAY'S BOOKINGS */}
        <section className="space-y-2">
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">
            Today's orders
          </div>
          {dayLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="New bookings" value={String(day?.bookings.placed ?? 0)} icon={ShoppingCart} />
              <Stat label="Confirmed" value={String(day?.bookings.confirmed ?? 0)} icon={CheckCircle2} tone="good" />
              <Stat label="Shipped" value={String(day?.bookings.shipped ?? 0)} icon={Truck} />
              <Stat label="Delivered" value={String(day?.bookings.delivered ?? 0)} icon={PackageCheck} tone="good" />
            </div>
          )}
        </section>

        {/* MY PERFORMANCE */}
        <section className="space-y-2">
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">
            My performance
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="My actions today" value={String(day?.myActionsToday ?? 0)} icon={Activity} tone="good" />
            <Stat label="Last 7 days" value={String(day?.myActionsWeek ?? 0)} icon={Flame} />
          </div>

          {trend.length > 0 && (
            <div className="rounded-2xl border border-border/60 bg-card p-4">
              <div className="flex items-end gap-2 h-24">
                {trend.map((t) => (
                  <div key={t.day} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex-1 flex items-end">
                      <div
                        className="w-full rounded-t bg-emerald-500/70"
                        style={{ height: `${Math.max(4, (t.count / trendMax) * 100)}%` }}
                        title={`${t.count} action${t.count === 1 ? "" : "s"}`}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(`${t.day}T00:00:00+06:00`).toLocaleDateString("en-GB", {
                        weekday: "short", timeZone: "Asia/Dhaka",
                      })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {byStatus.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {byStatus.map(([s, n]) => (
                <span key={s} className="rounded-full border border-border/60 bg-card px-3 py-1 text-xs">
                  {label(s)} <span className="font-semibold tabular-nums">{n}</span>
                </span>
              ))}
            </div>
          )}
        </section>

        {/* WHAT I DID TODAY */}
        {(day?.recent?.length ?? 0) > 0 && (
          <section className="rounded-2xl border border-border/60 bg-card overflow-hidden">
            <div className="px-5 py-3 border-b border-border/60 flex items-center gap-2">
              <Activity className="size-4 text-muted-foreground" />
              <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">
                What I did today
              </span>
            </div>
            <ul className="divide-y divide-border/60">
              {day!.recent.map((a) => (
                <li key={a.id} className="px-5 py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm truncate">
                      <span className="font-medium">{a.invoiceNo ?? "Order"}</span>
                      {a.customer && <span className="text-muted-foreground"> · {a.customer}</span>}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {a.fromStatus ? `${label(a.fromStatus)} → ` : ""}{label(a.toStatus)}
                    </div>
                  </div>
                  <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">{clock(a.at)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {tasks.length > 0 && (
          <section className="rounded-2xl border border-border/60 bg-card overflow-hidden">
            <div className="px-5 py-3 border-b border-border/60 flex items-center gap-2">
              <ListChecks className="size-4 text-muted-foreground" />
              <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">
                My work queue
              </span>
            </div>
            <ul className="divide-y divide-border/60">
              {tasks.map((t) => (
                <li key={t.label}>
                  <Link
                    to={t.to as any}
                    search={("search" in t ? t.search : undefined) as any}
                    className="flex items-center justify-between px-5 py-3 hover:bg-muted/40 transition-colors"
                  >
                    <span className="text-sm">{t.label}</span>
                    <span className="flex items-center gap-2">
                      <span className="font-bold tabular-nums">{t.v}</span>
                      <ArrowRight className="size-3.5 text-muted-foreground" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ROLE-SPECIFIC WORK PANELS */}
        <RolePanels roles={roles} brandIds={brandIds} userId={userId} />

        {/* QUICK LINKS */}
        <section className="rounded-2xl border border-border/60 bg-card p-5">
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold mb-3">
            আমার access — যে পেজগুলো খুলতে পারবেন
          </div>
          <div className="flex flex-wrap gap-2">
            {quickLinks.map((p) => (
              <Link
                key={p.path}
                to={p.path as any}
                className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs font-medium hover:bg-muted transition-colors"
              >
                {p.label}
              </Link>
            ))}
            {quickLinks.length === 0 && (
              <p className="text-sm text-muted-foreground">Kono page assign kora nei.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function PackingShortcut({ brandIds }: { brandIds: string[] }) {
  const scope = brandIds.length ? brandIds : null;
  const { data } = useQuery({
    queryKey: ["packing", "stats", scope],
    queryFn: () => packStats(scope),
    refetchInterval: 60_000,
  });
  return (
    <Link
      to={"/erp/packing" as never}
      className="flex items-center justify-between gap-4 rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-indigo-500/10 to-card p-5 transition-shadow hover:shadow-md"
    >
      <div className="flex items-center gap-3">
        <span className="grid size-12 place-items-center rounded-xl bg-indigo-600 text-white">
          <ScanLine className="size-6" />
        </span>
        <div>
          <div className="text-base font-semibold">Packing Station</div>
          <div className="text-xs text-muted-foreground">
            {data ? `${data.to_pack} to pack · ${data.packing} packing · আজ আপনি ${data.my_packed_today} packed` : "Scan করে order pack করুন"}
          </div>
        </div>
      </div>
      <ArrowRight className="size-5 text-indigo-600" />
    </Link>
  );
}
