import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCcw, TrendingUp, TrendingDown, AlertTriangle, Clock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  getCampaignTruth,
  getMetaSpendSummary,
  type CampaignTruthRow,
} from "@/lib/erp/marketing/campaigns.functions";

const bdt = (n: number) => "৳" + Math.round(n).toLocaleString("en-IN");
const num = (n: number) => n.toLocaleString("en-IN");

/** YYYY-MM-DD for "today" in Asia/Dhaka, offset by `dayDelta` days. */
function dhakaDate(dayDelta = 0): string {
  const now = new Date(Date.now() + dayDelta * 86400000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function dhakaClock(): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

function agoLabel(iso: string | null): { text: string; stale: boolean } | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  const stale = mins > 180;
  if (mins < 1) return { text: "এইমাত্র", stale };
  if (mins < 60) return { text: `${mins} মিনিট আগে`, stale };
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return { text: `${hrs} ঘণ্টা আগে`, stale };
  return { text: `${Math.floor(hrs / 24)} দিন আগে`, stale };
}

function pctDelta(now: number, before: number): number | null {
  if (!Number.isFinite(before) || before <= 0) return null;
  return ((now - before) / before) * 100;
}

function Delta({ value, invert }: { value: number | null; invert?: boolean }) {
  if (value === null) return null;
  const good = invert ? value <= 0 : value >= 0;
  const Icon = value >= 0 ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[11px] tabular-nums",
        good ? "text-emerald-600" : "text-rose-600",
      )}
      title="গতকালের একই মেট্রিকের তুলনায়"
    >
      <Icon className="h-3 w-3" />
      {Math.abs(value).toFixed(0)}%
    </span>
  );
}

function Tile({
  label,
  value,
  sub,
  delta,
  invertDelta,
  tone,
  loading,
}: {
  label: string;
  value: string;
  sub?: string;
  delta?: number | null;
  invertDelta?: boolean;
  tone?: "good" | "bad" | "muted";
  loading?: boolean;
}) {
  return (
    <div className="min-w-[128px] flex-1 border-l border-border/70 px-3 py-2 first:border-l-0 first:pl-0">
      <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
      {loading ? (
        <Skeleton className="mt-1.5 h-5 w-20" />
      ) : (
        <div className="mt-0.5 flex items-baseline gap-1.5">
          <span
            className={cn(
              "text-base font-semibold tabular-nums",
              tone === "good" && "text-emerald-600",
              tone === "bad" && "text-rose-600",
              tone === "muted" && "text-muted-foreground",
            )}
          >
            {value}
          </span>
          <Delta value={delta ?? null} invert={invertDelta} />
        </div>
      )}
      {sub && !loading && (
        <div className="mt-0.5 truncate text-[11px] tabular-nums text-muted-foreground">{sub}</div>
      )}
    </div>
  );
}

type Totals = {
  spend: number;
  spendUsd: number;
  orders: number;
  confirmed: number;
  bookedValue: number;
  clicks: number;
  metaPurchases: number;
  live: number;
};

function sum(rows: CampaignTruthRow[]): Totals {
  const t: Totals = {
    spend: 0,
    spendUsd: 0,
    orders: 0,
    confirmed: 0,
    bookedValue: 0,
    clicks: 0,
    metaPurchases: 0,
    live: 0,
  };
  for (const r of rows) {
    t.spend += r.spend || 0;
    t.spendUsd += r.spend_usd || 0;
    t.orders += r.booked_order_count || r.orders || 0;
    t.confirmed += r.confirmed_count || 0;
    t.bookedValue += r.booked_value || 0;
    t.clicks += r.clicks || 0;
    t.metaPurchases += r.meta_purchases || 0;
    if (r.is_live) t.live += 1;
  }
  return t;
}

/**
 * "আজকের অবস্থা" — one glance board so the team never has to open Ads Manager
 * for a same-day read. Always Asia/Dhaka today, independent of the page range.
 */
export function TodayPulse({ brandIds }: { brandIds: string[] }) {
  const today = dhakaDate(0);
  const yesterday = dhakaDate(-1);

  const fetchTruth = useServerFn(getCampaignTruth);
  const fetchSpend = useServerFn(getMetaSpendSummary);
  const brandKey = brandIds.slice().sort().join(",");

  const todayQ = useQuery({
    queryKey: ["mkt-today-pulse", brandKey, today],
    queryFn: () => fetchTruth({ data: { brandIds, from: today, to: today } }),
    enabled: brandIds.length > 0,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
  });

  const ydayQ = useQuery({
    queryKey: ["mkt-today-pulse-prev", brandKey, yesterday],
    queryFn: () => fetchTruth({ data: { brandIds, from: yesterday, to: yesterday } }),
    enabled: brandIds.length > 0,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const syncQ = useQuery({
    queryKey: ["mkt-today-sync", brandKey, today],
    queryFn: () => fetchSpend({ data: { brandIds, from: today, to: today } }),
    enabled: brandIds.length > 0,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
  });

  const rows = useMemo(
    () =>
      (todayQ.data ?? [])
        .filter((r) => (r.spend || 0) > 0 || (r.booked_order_count || r.orders || 0) > 0)
        .slice()
        .sort((a, b) => (b.spend || 0) - (a.spend || 0)),
    [todayQ.data],
  );

  const t = useMemo(() => sum(rows), [rows]);
  const y = useMemo(() => sum(ydayQ.data ?? []), [ydayQ.data]);

  const loading = todayQ.isLoading;
  const cpa = t.orders > 0 ? t.spend / t.orders : null;
  const yCpa = y.orders > 0 ? y.spend / y.orders : 0;
  const roas = t.spend > 0 ? t.bookedValue / t.spend : null;
  const yRoas = y.spend > 0 ? y.bookedValue / y.spend : 0;

  const sync = agoLabel(syncQ.data?.last_sync_at ?? syncQ.data?.last_insight_at ?? null);
  const noData = !loading && rows.length === 0;

  return (
    <section className="rounded-xl border bg-card">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2.5">
        <h2 className="text-sm font-semibold tracking-tight">আজকের পারফরম্যান্স</h2>
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <Clock className="h-3 w-3" />
          {dhakaClock()} (Dhaka)
        </span>
        {sync && (
          <span
            className={cn(
              "rounded border px-1.5 py-0.5 text-[10px]",
              sync.stale
                ? "border-amber-500/30 bg-amber-500/10 text-amber-700"
                : "border-border text-muted-foreground",
            )}
            title="সর্বশেষ Meta sync"
          >
            Meta sync · {sync.text}
          </span>
        )}
        {t.live > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            {t.live} live
          </span>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-7"
          onClick={() => {
            void todayQ.refetch();
            void syncQ.refetch();
          }}
          disabled={todayQ.isFetching}
        >
          <RefreshCcw className={cn("mr-1.5 h-3.5 w-3.5", todayQ.isFetching && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {noData ? (
        <div className="px-4 py-4 text-xs text-muted-foreground">
          আজকের কোনো spend বা order এখনো আসেনি
          {sync?.stale ? " — Meta sync পুরোনো, sync হলে আপডেট হবে।" : "।"}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-y-1 px-4 py-2">
            <Tile
              label="Ad spend"
              value={bdt(t.spend)}
              sub={t.spendUsd > 0 ? `$${t.spendUsd.toFixed(2)} pocket` : undefined}
              delta={pctDelta(t.spend, y.spend)}
              loading={loading}
            />
            <Tile
              label="Orders"
              value={num(t.orders)}
              sub={`${num(t.confirmed)} confirmed`}
              delta={pctDelta(t.orders, y.orders)}
              loading={loading}
            />
            <Tile
              label="Booked value"
              value={bdt(t.bookedValue)}
              delta={pctDelta(t.bookedValue, y.bookedValue)}
              loading={loading}
            />
            <Tile
              label="CPA"
              value={cpa !== null ? bdt(cpa) : "—"}
              delta={cpa !== null ? pctDelta(cpa, yCpa) : null}
              invertDelta
              loading={loading}
            />
            <Tile
              label="Booked ROAS"
              value={roas !== null ? roas.toFixed(2) + "x" : "—"}
              sub="cash নয় — pipeline"
              delta={roas !== null ? pctDelta(roas, yRoas) : null}
              tone={roas !== null && roas < 1 ? "bad" : undefined}
              loading={loading}
            />
            <Tile
              label="Meta purchases"
              value={num(t.metaPurchases)}
              sub={t.clicks > 0 ? `${num(t.clicks)} clicks` : undefined}
              loading={loading}
            />
          </div>

          <div className="border-t">
            <div className="max-h-[280px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10 bg-muted/40 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                  <tr>
                    <th className="px-4 py-1.5 text-left font-medium">Campaign</th>
                    <th className="px-2 py-1.5 text-right font-medium">Spend</th>
                    <th className="px-2 py-1.5 text-right font-medium">Orders</th>
                    <th className="px-2 py-1.5 text-right font-medium">CPA</th>
                    <th className="px-2 py-1.5 text-right font-medium">Booked</th>
                    <th className="px-4 py-1.5 text-right font-medium">ROAS</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const orders = r.booked_order_count || r.orders || 0;
                    const rCpa = orders > 0 ? r.spend / orders : null;
                    const rRoas = r.spend > 0 ? (r.booked_value || 0) / r.spend : null;
                    const noOrderBurn = r.spend > 0 && orders === 0;
                    return (
                      <tr key={r.id} className="border-t border-border/60">
                        <td className="max-w-[320px] px-4 py-1.5">
                          <div className="flex items-center gap-1.5">
                            {r.is_live ? (
                              <span
                                className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-emerald-500"
                                title="Live on Meta"
                              />
                            ) : (
                              <span
                                className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40"
                                title={r.status}
                              />
                            )}
                            <span className="truncate font-medium">{r.name}</span>
                            {noOrderBurn && (
                              <span
                                className="inline-flex shrink-0 items-center gap-0.5 rounded border border-amber-500/30 bg-amber-500/10 px-1 py-px text-[10px] text-amber-700"
                                title="আজ spend হচ্ছে কিন্তু কোনো order আসেনি"
                              >
                                <AlertTriangle className="h-2.5 w-2.5" />0 order
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {bdt(r.spend)}
                          {r.spend_usd > 0 && (
                            <div className="text-[10px] text-muted-foreground">
                              ${r.spend_usd.toFixed(2)}
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{num(orders)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {rCpa !== null ? bdt(rCpa) : "—"}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {bdt(r.booked_value || 0)}
                        </td>
                        <td
                          className={cn(
                            "px-4 py-1.5 text-right font-medium tabular-nums",
                            rRoas !== null && rRoas < 1 && "text-rose-600",
                            rRoas !== null && rRoas >= 2 && "text-emerald-600",
                          )}
                        >
                          {rRoas !== null ? rRoas.toFixed(2) + "x" : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="border-t px-4 py-1.5 text-[10px] text-muted-foreground">
              আজকের সংখ্যা booked (order placed) ভিত্তিক — delivery/cash settle হওয়ার পর নিচের
              realized profit বদলাবে।
            </p>
          </div>
        </>
      )}
    </section>
  );
}
