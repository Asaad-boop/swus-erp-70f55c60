import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Radio, Eye, Gauge, ArrowRight, AlertTriangle, ShoppingCart,
  PackageCheck, Boxes, Truck, Banknote, TrendingDown,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { applyBrandScope } from "@/lib/erp/apply-brand-scope";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useUsdBdtRate } from "@/hooks/erp/use-fx-rate";

const BDT = (n: number) => "৳" + Math.round(n).toLocaleString("en-IN");

type Range = { from: Date; to: Date };

/* ============================================================
   1) TODAY COMMAND PANEL — action list
============================================================ */
export function TodayCommandPanel({ brandIds, enabled }: { brandIds: string[]; enabled: boolean }) {
  const { data: fx } = useUsdBdtRate(brandIds);
  const { data, isLoading } = useQuery({
    queryKey: ["dash-cmd", brandIds.join(","), fx ?? 0],
    enabled: enabled && fx != null,
    staleTime: 30_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      const [needConfirm, needPack, lowStock, courierIssue, codDue, losingCamp] = await Promise.all([
        applyBrandScope(supabase.from("orders").select("id", { count: "exact", head: true }), brandIds)
          .in("status", ["new" as any, "processing" as any]),
        applyBrandScope(supabase.from("orders").select("id", { count: "exact", head: true }), brandIds)
          .in("status", ["confirmed" as any, "packaging" as any]),
        applyBrandScope(supabase.from("low_stock_alerts").select("id", { count: "exact", head: true }), brandIds)
          .eq("is_resolved", false),
        applyBrandScope(supabase.from("courier_shipments").select("id", { count: "exact", head: true }), brandIds)
          .in("status", ["failed", "returned", "lost", "exception"]),
        applyBrandScope(supabase.from("orders").select("total, partial_amount"), brandIds)
          .eq("payment_method", "cod").neq("payment_status", "paid").neq("status", "cancelled").neq("status", "returned"),
        applyBrandScope(
          supabase.from("mkt_insights_daily").select("spend, meta_purchase_value, date"),
          brandIds,
        ).gte("date", new Date(Date.now() - 7 * 86400e3).toISOString().slice(0, 10)),
      ]);
      const codAmount = (codDue.data ?? []).reduce(
        (s: number, r: any) => s + Math.max(0, Number(r.total ?? 0) - Number(r.partial_amount ?? 0)),
        0,
      );
      // losing = days where spend > 0 and ROAS < 1
      const losingDays = (losingCamp.data ?? []).filter(
        (r: any) => Number(r.spend ?? 0) > 0 && Number(r.meta_purchase_value ?? 0) < Number(r.spend ?? 0) * (fx ?? 0),
      ).length;
      return {
        needConfirm: needConfirm.count ?? 0,
        needPack: needPack.count ?? 0,
        lowStock: lowStock.count ?? 0,
        courierIssue: courierIssue.count ?? 0,
        codAmount,
        losingDays,
      };
    },
  });

  const items = [
    { icon: ShoppingCart, label: "Need Confirmation", v: data?.needConfirm ?? 0, tone: "amber", to: "/erp/orders/web" },
    { icon: PackageCheck, label: "Need Packing", v: data?.needPack ?? 0, tone: "blue", to: "/erp/orders/list", search: { tab: "packing" } },
    { icon: Boxes, label: "Low Stock", v: data?.lowStock ?? 0, tone: "rose", to: "/erp/inventory" },
    { icon: Truck, label: "Courier Issue", v: data?.courierIssue ?? 0, tone: "rose", to: "/erp/courier" },
    { icon: Banknote, label: "COD Pending", v: data?.codAmount ?? 0, money: true, tone: "amber", to: "/erp/reconciliation" },
    { icon: TrendingDown, label: "Losing Days (7d)", v: data?.losingDays ?? 0, tone: "rose", to: "/erp/marketing" },
  ];

  return (
    <div className="rounded-lg border border-border/60 bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">Command Panel</div>
          <div className="text-sm font-semibold mt-0.5 text-foreground" style={{ fontFamily: "Sora, ui-sans-serif" }}>
            Today's Actions
          </div>
        </div>
        <Gauge className="size-4 text-muted-foreground" />
      </div>
      <ul className="divide-y divide-border/60">
        {items.map((it) => (
          <li key={it.label}>
            <Link
              to={it.to as any}
              search={("search" in it ? it.search : undefined) as any}
              className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={cn(
                    "size-7 grid place-items-center rounded-md ring-1 ring-border/60",
                    it.tone === "amber" && "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                    it.tone === "rose" && "bg-rose-500/10 text-rose-600 dark:text-rose-400",
                    it.tone === "blue" && "bg-blue-500/10 text-blue-600 dark:text-blue-400",
                  )}
                >
                  <it.icon className="size-3.5" />
                </span>
                <span className="text-sm text-foreground truncate">{it.label}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {isLoading ? (
                  <Skeleton className="h-4 w-10" />
                ) : (
                  <span
                    className={cn(
                      "tabular-nums font-bold text-sm",
                      it.v === 0 ? "text-muted-foreground" : "text-foreground",
                    )}
                  >
                    {it.money ? BDT(it.v as number) : it.v}
                  </span>
                )}
                <ArrowRight className="size-3.5 text-muted-foreground" />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ============================================================
   2) LIVE VISITORS — real-time pulse from active_sessions
============================================================ */
export function LiveVisitors() {
  const [refreshKey, setRefreshKey] = useState(0);
  const { data, isLoading } = useQuery({
    queryKey: ["dash-live-visitors", refreshKey],
    staleTime: 10_000,
    refetchInterval: 15_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data: rows } = await supabase
        .from("active_sessions")
        .select("session_id, path, country, last_seen_at, referrer")
        .gte("last_seen_at", since)
        .order("last_seen_at", { ascending: false })
        .limit(50);
      const list = (rows ?? []) as any[];
      const byPath = new Map<string, number>();
      const byCountry = new Map<string, number>();
      for (const r of list) {
        byPath.set(r.path ?? "/", (byPath.get(r.path ?? "/") ?? 0) + 1);
        if (r.country) byCountry.set(r.country, (byCountry.get(r.country) ?? 0) + 1);
      }
      return {
        active: list.length,
        topPaths: Array.from(byPath.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5),
        topCountries: Array.from(byCountry.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4),
      };
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("dash-active-sessions")
      .on("postgres_changes", { event: "*", schema: "public", table: "active_sessions" }, () =>
        setRefreshKey((k) => k + 1),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const active = data?.active ?? 0;

  return (
    <div className="rounded-lg border border-border/60 bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Eye className="size-4 text-muted-foreground" />
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">
            Live Visitors
          </div>
        </div>
        <span className="flex items-center gap-1.5 text-[11px] text-emerald-600 font-semibold">
          <Radio className="size-3 animate-pulse" /> LIVE
        </span>
      </div>
      <div className="p-4">
        <div className="flex items-baseline gap-3 mb-3">
          {isLoading ? (
            <Skeleton className="h-12 w-20" />
          ) : (
            <span
              className="text-4xl font-bold tabular-nums leading-none"
              style={{ fontFamily: "Sora, ui-sans-serif", letterSpacing: "-0.02em" }}
            >
              {active}
            </span>
          )}
          <span className="text-xs text-muted-foreground">active now · last 5 min</span>
        </div>

        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
          Top Pages
        </div>
        {(data?.topPaths ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">No active visitors</p>
        ) : (
          <ul className="space-y-1 mb-3">
            {(data?.topPaths ?? []).map(([p, n]) => (
              <li key={p} className="flex items-center justify-between text-xs">
                <span className="truncate text-foreground/80 font-mono">{p || "/"}</span>
                <span className="tabular-nums text-muted-foreground">{n}</span>
              </li>
            ))}
          </ul>
        )}

        {(data?.topCountries ?? []).length > 0 && (
          <>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
              Geo
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(data?.topCountries ?? []).map(([c, n]) => (
                <span
                  key={c}
                  className="text-[11px] px-2 py-0.5 rounded-md border border-border/60 bg-muted/40 tabular-nums"
                >
                  {c} · {n}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   3) PROFIT QUALITY SCORE
============================================================ */
export function ProfitQuality({
  brandIds, enabled, range,
}: { brandIds: string[]; enabled: boolean; range: Range }) {
  const { data: fx } = useUsdBdtRate(brandIds);
  const { data, isLoading } = useQuery({
    queryKey: ["dash-profit-q", brandIds.join(","), range.from.toISOString(), range.to.toISOString(), fx ?? 0],
    enabled: enabled && fx != null,
    staleTime: 60_000,
    queryFn: async () => {
      const fromISO = range.from.toISOString();
      const toISO = range.to.toISOString();
      const fromDate = fromISO.slice(0, 10);
      const toDate = toISO.slice(0, 10);

      const [revRows, itemRows, adSpend, returnRows] = await Promise.all([
        applyBrandScope(supabase.from("orders").select("total, actual_shipping_cost"), brandIds)
          .not("status","in","(cancelled,returned)")
          .gte("created_at", fromISO).lte("created_at", toISO),
        applyBrandScope(
          supabase.from("order_items").select(
            "quantity, cost_price, unit_cost_snapshot, courier_cost_allocated, packaging_cost_allocated, refund_amount_allocated, orders!inner(brand_id, status, created_at)",
          ),
          brandIds,
          "orders.brand_id" as any,
        )
          .not("orders.status","in","(cancelled,returned)")
          .gte("orders.created_at", fromISO).lte("orders.created_at", toISO),
        applyBrandScope(supabase.from("mkt_insights_daily").select("spend"), brandIds)
          .gte("date", fromDate).lte("date", toDate),
        applyBrandScope(supabase.from("erp_return_cases").select("refund_amount"), brandIds)
          .gte("created_at", fromISO).lte("created_at", toISO),
      ]);

      const revenue = (revRows.data ?? []).reduce((s: number, r: any) => s + Number(r.total ?? 0), 0);
      const shipCost = (revRows.data ?? []).reduce(
        (s: number, r: any) => s + Number(r.actual_shipping_cost ?? 0),
        0,
      );
      let cogs = 0, courierCost = 0, packCost = 0, returnAlloc = 0;
      for (const r of (itemRows.data ?? []) as any[]) {
        const unit = Number(r.unit_cost_snapshot ?? r.cost_price ?? 0);
        cogs += unit * Number(r.quantity ?? 0);
        courierCost += Number(r.courier_cost_allocated ?? 0);
        packCost += Number(r.packaging_cost_allocated ?? 0);
        returnAlloc += Number(r.refund_amount_allocated ?? 0);
      }
      // fallback: if no courier_cost_allocated rows, use orders.actual_shipping_cost
      if (courierCost === 0) courierCost = shipCost;
      const adSpendBdt = (adSpend.data ?? []).reduce(
        (s: number, r: any) => s + Number(r.spend ?? 0) * (fx ?? 0),
        0,
      );
      const returnLoss = (returnRows.data ?? []).reduce(
        (s: number, r: any) => s + Number(r.refund_amount ?? 0),
        0,
      ) + returnAlloc;

      const net = revenue - cogs - courierCost - packCost - adSpendBdt - returnLoss;
      const margin = revenue > 0 ? (net / revenue) * 100 : 0;
      // score: margin >= 20 = excellent (green), >=10 yellow, < 10 red
      const score = margin >= 20 ? "excellent" : margin >= 10 ? "fair" : margin >= 0 ? "poor" : "loss";
      return { revenue, cogs, courierCost, packCost, adSpendBdt, returnLoss, net, margin, score };
    },
  });

  const tone =
    data?.score === "excellent" ? "emerald" :
    data?.score === "fair" ? "amber" :
    "rose";

  const breakdown = [
    { k: "Revenue", v: data?.revenue ?? 0, sign: 1 },
    { k: "− Product Cost", v: -(data?.cogs ?? 0), sign: -1 },
    { k: "− Courier Cost", v: -(data?.courierCost ?? 0), sign: -1 },
    { k: "− Packaging", v: -(data?.packCost ?? 0), sign: -1 },
    { k: "− Ad Spend", v: -(data?.adSpendBdt ?? 0), sign: -1 },
    { k: "− Return Loss", v: -(data?.returnLoss ?? 0), sign: -1 },
  ];

  return (
    <div className="rounded-lg border border-border/60 bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">
            Profit Quality
          </div>
          <div className="text-sm font-semibold mt-0.5" style={{ fontFamily: "Sora, ui-sans-serif" }}>
            Net Margin Score
          </div>
        </div>
        <span
          className={cn(
            "text-[10px] uppercase tracking-widest font-bold px-2 py-1 rounded-md",
            tone === "emerald" && "bg-emerald-500/10 text-emerald-600",
            tone === "amber" && "bg-amber-500/10 text-amber-600",
            tone === "rose" && "bg-rose-500/10 text-rose-600",
          )}
        >
          {data?.score ?? "—"}
        </span>
      </div>
      <div className="p-4">
        {isLoading ? (
          <Skeleton className="h-10 w-32 mb-3" />
        ) : (
          <div className="flex items-baseline gap-2 mb-3">
            <span
              className={cn(
                "text-3xl font-bold tabular-nums leading-none",
                (data?.net ?? 0) >= 0 ? "text-emerald-600" : "text-rose-600",
              )}
              style={{ fontFamily: "Sora, ui-sans-serif", letterSpacing: "-0.02em" }}
            >
              {BDT(data?.net ?? 0)}
            </span>
            <span className={cn("text-sm font-semibold tabular-nums", (data?.margin ?? 0) >= 0 ? "text-emerald-600" : "text-rose-600")}>
              {(data?.margin ?? 0).toFixed(1)}%
            </span>
          </div>
        )}
        <div className="space-y-1.5 text-xs">
          {breakdown.map((row) => (
            <div key={row.k} className="flex justify-between border-b border-dashed border-border/40 pb-1 last:border-0">
              <span className="text-muted-foreground">{row.k}</span>
              <span className={cn("tabular-nums font-medium", row.sign < 0 && row.v !== 0 && "text-rose-600/80")}>
                {BDT(row.v)}
              </span>
            </div>
          ))}
        </div>
        {(data?.score === "poor" || data?.score === "loss") && (
          <div className="mt-3 flex items-start gap-2 rounded-md bg-rose-500/5 border border-rose-500/20 p-2.5">
            <AlertTriangle className="size-3.5 text-rose-500 mt-0.5 shrink-0" />
            <p className="text-[11px] text-rose-700 dark:text-rose-400 leading-snug">
              Margin kom — ad spend / courier / return loss check koro.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   4) PRODUCT DANGER ZONE
============================================================ */
export function ProductDangerZone({
  brandIds, enabled, range,
}: { brandIds: string[]; enabled: boolean; range: Range }) {
  const { data, isLoading } = useQuery({
    queryKey: ["dash-danger", brandIds.join(","), range.from.toISOString(), range.to.toISOString()],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const fromISO = range.from.toISOString();
      const toISO = range.to.toISOString();

      const { data: rows } = await applyBrandScope(
        supabase.from("order_items").select(
          "product_id, name, image, quantity, line_total, cost_price, unit_cost_snapshot, orders!inner(brand_id, status, created_at)",
        ),
        brandIds,
        "orders.brand_id" as any,
      )
        .gte("orders.created_at", fromISO)
        .lte("orders.created_at", toISO);

      type Row = { id: string; name: string; image: string | null; units: number; revenue: number; cogs: number; returned: number; delivered: number };
      const agg = new Map<string, Row>();
      for (const r of (rows ?? []) as any[]) {
        const pid = r.product_id as string | null;
        if (!pid) continue;
        const cur = agg.get(pid) ?? { id: pid, name: r.name, image: r.image, units: 0, revenue: 0, cogs: 0, returned: 0, delivered: 0 };
        const status = (r.orders?.status as string) ?? "";
        const qty = Number(r.quantity ?? 0);
        const unitCost = Number(r.unit_cost_snapshot ?? r.cost_price ?? 0);
        cur.units += qty;
        if (status === "delivered") {
          cur.delivered += qty;
          cur.revenue += Number(r.line_total ?? 0);
          cur.cogs += unitCost * qty;
        }
        if (status === "returned") cur.returned += qty;
        agg.set(pid, cur);
      }

      // join stock
      const ids = Array.from(agg.keys());
      if (ids.length === 0) return [];
      const { data: prodRows } = await supabase
        .from("products")
        .select("id, stock, low_stock_threshold")
        .in("id", ids);
      const stockMap = new Map<string, { stock: number; thr: number }>();
      for (const p of (prodRows ?? []) as any[]) {
        stockMap.set(p.id, { stock: Number(p.stock ?? 0), thr: Number(p.low_stock_threshold ?? 0) });
      }

      const list = Array.from(agg.values()).map((r) => {
        const st = stockMap.get(r.id);
        const returnRate = r.delivered + r.returned > 0 ? (r.returned / (r.delivered + r.returned)) * 100 : 0;
        const margin = r.revenue > 0 ? ((r.revenue - r.cogs) / r.revenue) * 100 : 0;
        const flags: string[] = [];
        if (st && r.units > 0 && st.stock <= (st.thr || 5)) flags.push("Low stock");
        if (returnRate >= 25) flags.push("High returns");
        if (margin < 10 && r.revenue > 0) flags.push("Low margin");
        if (r.units === 0 && st && st.stock > 0) flags.push("Dead stock");
        return { ...r, stock: st?.stock ?? 0, returnRate, margin, flags };
      }).filter((r) => r.flags.length > 0)
        .sort((a, b) => b.flags.length - a.flags.length || b.returnRate - a.returnRate)
        .slice(0, 8);
      return list;
    },
  });

  return (
    <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border/60 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-rose-500" />
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">
              Product Danger Zone
            </div>
            <div className="text-base font-bold" style={{ fontFamily: "Sora, ui-sans-serif" }}>
              Risk-flagged products
            </div>
          </div>
        </div>
        <Link to={"/erp/inventory" as any} className="text-xs text-indigo-500 hover:underline">
          Inventory →
        </Link>
      </div>
      <div className="p-3">
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground p-6 text-center">All clear — no risk-flagged products ✨</p>
        ) : (
          <ul className="divide-y divide-border/50">
            {(data ?? []).map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-2 py-3">
                {p.image ? (
                  <img src={p.image} alt="" className="size-10 rounded-md object-cover ring-1 ring-border" />
                ) : (
                  <div className="size-10 rounded-md bg-muted ring-1 ring-border" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{p.name}</div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {p.flags.map((f) => (
                      <span
                        key={f}
                        className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded font-semibold",
                          f === "High returns" && "bg-rose-500/10 text-rose-600",
                          f === "Low stock" && "bg-amber-500/10 text-amber-600",
                          f === "Low margin" && "bg-orange-500/10 text-orange-600",
                          f === "Dead stock" && "bg-zinc-500/10 text-zinc-600",
                        )}
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="text-right shrink-0 grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <div className="text-[10px] uppercase text-muted-foreground">Stock</div>
                    <div className={cn("font-bold tabular-nums", p.stock <= 5 && "text-rose-600")}>{p.stock}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-muted-foreground">Return</div>
                    <div className={cn("font-bold tabular-nums", p.returnRate >= 25 && "text-rose-600")}>
                      {p.returnRate.toFixed(0)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-muted-foreground">Margin</div>
                    <div className={cn("font-bold tabular-nums", p.margin < 10 && "text-rose-600")}>
                      {p.margin.toFixed(0)}%
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}