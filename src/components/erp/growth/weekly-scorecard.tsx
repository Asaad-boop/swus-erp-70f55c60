import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Clapperboard,
  Eye,
  ShoppingCart,
  Wallet,
  CheckCircle2,
  Trophy,
  Package,
  Download,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/brand-context";
import {
  bdt,
  fetchItems,
  fetchCreators,
  fetchProductsLite,
  type ContentItem,
} from "@/lib/erp/content/content-data";
import { downloadCsv } from "@/components/erp/content/content-ui";
import { cn } from "@/lib/utils";

const DAY = 86400000;

/** Asia/Dhaka calendar date for a timestamp. */
function dhakaDate(ts: number) {
  return new Date(ts + 6 * 3600000).toISOString().slice(0, 10);
}

type Win = { from: string; to: string; fromTs: number; toTs: number };

function windows(weeks = 1): { cur: Win; prev: Win } {
  const now = Date.now();
  const span = 7 * weeks * DAY;
  const mk = (a: number, b: number): Win => ({
    from: dhakaDate(a),
    to: dhakaDate(b),
    fromTs: a,
    toTs: b,
  });
  return { cur: mk(now - span, now), prev: mk(now - 2 * span, now - span) };
}

const inWin = (iso: string | null | undefined, w: Win) => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= w.fromTs && t < w.toTs;
};

type OrderRow = { id: string; created_at: string; delivered_at: string | null; status: string; total: number | null };

async function fetchScorecardOrders(brandIds: string[], sinceIso: string) {
  let q = supabase
    .from("orders")
    .select("id,created_at,delivered_at,status,total")
    .gte("created_at", sinceIso)
    .limit(20000);
  if (brandIds.length) q = q.in("brand_id", brandIds);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as OrderRow[];
}

async function fetchDoneTasks(brandIds: string[], sinceIso: string) {
  let q = supabase
    .from("hub_tasks")
    .select("id,completed_at,title")
    .gte("completed_at", sinceIso)
    .limit(5000);
  if (brandIds.length) q = q.in("brand_id", brandIds);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as { id: string; completed_at: string; title: string }[];
}

function Delta({ cur, prev, invert }: { cur: number; prev: number; invert?: boolean }) {
  if (!prev && !cur) return <span className="text-[11px] text-muted-foreground">— no prior data</span>;
  if (!prev) return <span className="text-[11px] text-emerald-600 dark:text-emerald-400">new this week</span>;
  const pct = ((cur - prev) / Math.abs(prev)) * 100;
  const up = pct > 0.5;
  const down = pct < -0.5;
  const good = invert ? down : up;
  const Icon = up ? TrendingUp : down ? TrendingDown : Minus;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[11px] font-medium",
        up || down
          ? good
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-destructive"
          : "text-muted-foreground",
      )}
    >
      <Icon className="h-3 w-3" />
      {pct > 0 ? "+" : ""}
      {pct.toFixed(0)}% vs আগের সপ্তাহ
    </span>
  );
}

function ScoreCard({
  label,
  value,
  cur,
  prev,
  hint,
  icon: Icon,
  invert,
}: {
  label: string;
  value: string;
  cur: number;
  prev: number;
  hint?: string;
  icon: typeof Eye;
  invert?: boolean;
}) {
  return (
    <Card className="border-border/60 bg-card/60">
      <CardContent className="space-y-1 p-3.5">
        <p className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <Icon className="h-3.5 w-3.5" /> {label}
        </p>
        <p className="font-display text-2xl font-semibold tabular-nums">{value}</p>
        <Delta cur={cur} prev={prev} invert={invert} />
        {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

/** Auto weekly scorecard: this week vs last week, creator leaderboard, content → product attribution. */
export function WeeklyScorecard() {
  const { brandIds, activeBrand, isLoading: brandLoading } = useBrand();
  const [weeks, setWeeks] = useState(1);
  const { cur, prev } = useMemo(() => windows(weeks), [weeks]);
  const sinceIso = useMemo(() => new Date(prev.fromTs).toISOString(), [prev.fromTs]);

  const itemsQ = useQuery({
    queryKey: ["scorecard-items", brandIds],
    queryFn: () => fetchItems(brandIds),
    enabled: brandIds.length > 0,
  });
  const creatorsQ = useQuery({
    queryKey: ["scorecard-creators", brandIds],
    queryFn: () => fetchCreators(brandIds),
    enabled: brandIds.length > 0,
  });
  const productsQ = useQuery({
    queryKey: ["scorecard-products", brandIds],
    queryFn: () => fetchProductsLite(brandIds),
    enabled: brandIds.length > 0,
  });
  const ordersQ = useQuery({
    queryKey: ["scorecard-orders", brandIds, sinceIso],
    queryFn: () => fetchScorecardOrders(brandIds, sinceIso),
    enabled: brandIds.length > 0,
  });
  const tasksQ = useQuery({
    queryKey: ["scorecard-tasks", brandIds, sinceIso],
    queryFn: () => fetchDoneTasks(brandIds, sinceIso),
    enabled: brandIds.length > 0,
  });

  const loading =
    brandLoading || itemsQ.isLoading || ordersQ.isLoading || creatorsQ.isLoading || tasksQ.isLoading;

  const items = itemsQ.data ?? [];
  const orders = ordersQ.data ?? [];
  const tasks = tasksQ.data ?? [];

  const pubIn = (w: Win) =>
    items.filter((i) => (i.published_at ? inWin(i.published_at, w) : false)) as ContentItem[];

  const m = useMemo(() => {
    const pubCur = pubIn(cur);
    const pubPrev = pubIn(prev);
    const sum = (arr: ContentItem[], k: "views" | "attributed_orders" | "cost") =>
      arr.reduce((a, b) => a + Number(b[k] || 0), 0);

    const ordCur = orders.filter((o) => inWin(o.created_at, cur));
    const ordPrev = orders.filter((o) => inWin(o.created_at, prev));
    const revCur = ordCur.reduce((a, o) => a + Number(o.total || 0), 0);
    const revPrev = ordPrev.reduce((a, o) => a + Number(o.total || 0), 0);
    const delCur = orders.filter((o) => inWin(o.delivered_at, cur)).length;
    const delPrev = orders.filter((o) => inWin(o.delivered_at, prev)).length;

    return {
      pubCur,
      pubPrev,
      published: [pubCur.length, pubPrev.length] as const,
      views: [sum(pubCur, "views"), sum(pubPrev, "views")] as const,
      attributed: [sum(pubCur, "attributed_orders"), sum(pubPrev, "attributed_orders")] as const,
      contentCost: [sum(pubCur, "cost"), sum(pubPrev, "cost")] as const,
      orders: [ordCur.length, ordPrev.length] as const,
      revenue: [revCur, revPrev] as const,
      delivered: [delCur, delPrev] as const,
      tasksDone: [
        tasks.filter((t) => inWin(t.completed_at, cur)).length,
        tasks.filter((t) => inWin(t.completed_at, prev)).length,
      ] as const,
    };
  }, [items, orders, tasks, cur, prev]);

  /* ---------- Creator leaderboard (published in window) ---------- */
  const leaderboard = useMemo(() => {
    const nameOf = new Map((creatorsQ.data ?? []).map((c) => [c.id, c.name]));
    const map = new Map<string, { name: string; pieces: number; views: number; orders: number; cost: number }>();
    for (const i of m.pubCur) {
      if (!i.creator_id) continue;
      const row =
        map.get(i.creator_id) ??
        { name: nameOf.get(i.creator_id) ?? "Unknown creator", pieces: 0, views: 0, orders: 0, cost: 0 };
      row.pieces += 1;
      row.views += Number(i.views || 0);
      row.orders += Number(i.attributed_orders || 0);
      row.cost += Number(i.cost || 0);
      map.set(i.creator_id, row);
    }
    return [...map.values()]
      .map((r) => ({ ...r, cpo: r.orders ? r.cost / r.orders : null }))
      .sort((a, b) => b.orders - a.orders || b.views - a.views)
      .slice(0, 8);
  }, [m.pubCur, creatorsQ.data]);

  /* ---------- Content → product attribution ---------- */
  const byProduct = useMemo(() => {
    const nameOf = new Map((productsQ.data ?? []).map((p) => [p.id, p.title]));
    const map = new Map<string, { name: string; pieces: number; views: number; orders: number; cost: number }>();
    for (const i of m.pubCur) {
      const key = i.product_id ?? "__none__";
      const row =
        map.get(key) ??
        {
          name: i.product_id ? (nameOf.get(i.product_id) ?? "Unknown product") : "No product linked",
          pieces: 0,
          views: 0,
          orders: 0,
          cost: 0,
        };
      row.pieces += 1;
      row.views += Number(i.views || 0);
      row.orders += Number(i.attributed_orders || 0);
      row.cost += Number(i.cost || 0);
      map.set(key, row);
    }
    return [...map.values()].sort((a, b) => b.orders - a.orders || b.views - a.views).slice(0, 8);
  }, [m.pubCur, productsQ.data]);

  const exportCsv = () => {
    downloadCsv(`weekly-scorecard-${cur.from}_${cur.to}.csv`, [
      ["metric", "current", "previous"],
      ["Orders", m.orders[0], m.orders[1]],
      ["Revenue", m.revenue[0], m.revenue[1]],
      ["Delivered", m.delivered[0], m.delivered[1]],
      ["Content published", m.published[0], m.published[1]],
      ["Views", m.views[0], m.views[1]],
      ["Attributed orders", m.attributed[0], m.attributed[1]],
      ["Content cost", m.contentCost[0], m.contentCost[1]],
      ["Tasks completed", m.tasksDone[0], m.tasksDone[1]],
    ]);
  };

  if (loading) {
    return (
      <div className="grid gap-3 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }

  const hasAny =
    m.orders[0] + m.orders[1] + m.published[0] + m.published[1] + m.tasksDone[0] + m.tasksDone[1] > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-base font-semibold">Weekly Scorecard</h2>
          <p className="text-xs text-muted-foreground">
            {activeBrand?.name ?? "All brands"} · {cur.from} → {cur.to} · আগের সমান সময়ের সাথে তুলনা
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {[1, 2, 4].map((w) => (
            <Button
              key={w}
              size="sm"
              variant={weeks === w ? "default" : "outline"}
              className="h-7 px-2.5 text-xs"
              onClick={() => setWeeks(w)}
            >
              {w * 7}d
            </Button>
          ))}
          <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={exportCsv}>
            <Download className="mr-1 h-3.5 w-3.5" /> CSV
          </Button>
        </div>
      </div>

      {!hasAny ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            এই সময়ের মধ্যে কোনো order, content বা task নেই।
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
            <ScoreCard
              label="Orders"
              value={m.orders[0].toLocaleString()}
              cur={m.orders[0]}
              prev={m.orders[1]}
              icon={ShoppingCart}
            />
            <ScoreCard
              label="Revenue"
              value={bdt(m.revenue[0])}
              cur={m.revenue[0]}
              prev={m.revenue[1]}
              hint={`${m.delivered[0]} delivered`}
              icon={Wallet}
            />
            <ScoreCard
              label="Content published"
              value={String(m.published[0])}
              cur={m.published[0]}
              prev={m.published[1]}
              hint={m.contentCost[0] ? `${bdt(m.contentCost[0])} content cost` : undefined}
              icon={Clapperboard}
            />
            <ScoreCard
              label="Views"
              value={m.views[0].toLocaleString()}
              cur={m.views[0]}
              prev={m.views[1]}
              hint={m.attributed[0] ? `${m.attributed[0]} attributed orders` : undefined}
              icon={Eye}
            />
          </div>

          <div className="grid gap-2.5 md:grid-cols-3">
            <ScoreCard
              label="Delivered"
              value={String(m.delivered[0])}
              cur={m.delivered[0]}
              prev={m.delivered[1]}
              icon={Package}
            />
            <ScoreCard
              label="Attributed orders"
              value={String(m.attributed[0])}
              cur={m.attributed[0]}
              prev={m.attributed[1]}
              hint={
                m.attributed[0] && m.contentCost[0]
                  ? `${bdt(m.contentCost[0] / m.attributed[0])} cost / order`
                  : undefined
              }
              icon={TrendingUp}
            />
            <ScoreCard
              label="Tasks completed"
              value={String(m.tasksDone[0])}
              cur={m.tasksDone[0]}
              prev={m.tasksDone[1]}
              icon={CheckCircle2}
            />
          </div>

          {leaderboard.length > 0 && (
            <Card>
              <CardContent className="space-y-2 p-4">
                <h3 className="inline-flex items-center gap-1.5 font-display text-sm font-semibold">
                  <Trophy className="h-4 w-4 text-amber-500" /> Creator leaderboard · এই সময়ে publish হওয়া
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-[11px] uppercase tracking-wide text-muted-foreground">
                        <th className="py-1.5 text-left font-medium">Creator</th>
                        <th className="py-1.5 text-right font-medium">Pieces</th>
                        <th className="py-1.5 text-right font-medium">Views</th>
                        <th className="py-1.5 text-right font-medium">Orders</th>
                        <th className="py-1.5 text-right font-medium">Cost</th>
                        <th className="py-1.5 text-right font-medium">CPO</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaderboard.map((r) => (
                        <tr key={r.name} className="border-b border-border/40 last:border-0">
                          <td className="py-1.5 pr-2">{r.name}</td>
                          <td className="py-1.5 text-right tabular-nums">{r.pieces}</td>
                          <td className="py-1.5 text-right tabular-nums">{r.views.toLocaleString()}</td>
                          <td className="py-1.5 text-right tabular-nums">{r.orders}</td>
                          <td className="py-1.5 text-right tabular-nums">{bdt(r.cost)}</td>
                          <td className="py-1.5 text-right tabular-nums">{r.cpo == null ? "—" : bdt(r.cpo)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {byProduct.length > 0 && (
            <Card>
              <CardContent className="space-y-2 p-4">
                <h3 className="inline-flex items-center gap-1.5 font-display text-sm font-semibold">
                  <Package className="h-4 w-4 text-primary" /> Content → Product attribution
                </h3>
                <div className="grid gap-2 md:grid-cols-2">
                  {byProduct.map((p) => (
                    <div
                      key={p.name}
                      className="flex items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm">{p.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {p.pieces} pcs · {p.views.toLocaleString()} views
                          {p.cost ? ` · ${bdt(p.cost)}` : ""}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-display text-lg font-semibold tabular-nums">{p.orders}</p>
                        <p className="text-[10px] uppercase text-muted-foreground">orders</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
