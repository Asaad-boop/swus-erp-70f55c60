import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Wallet, Banknote, TrendingUp, TrendingDown, AlertTriangle, Truck,
  Landmark, Smartphone, Coins, PiggyBank, Clock, Repeat, Target, DollarSign,
  ChevronDown, ChevronUp, ShoppingCart, Zap, ArrowRight, Info,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { applyBrandScope } from "@/lib/erp/apply-brand-scope";
import { fetchAllRows } from "@/lib/erp/fetch-all";
import { useUsdBdtRate } from "@/hooks/erp/use-fx-rate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const BDT = (n: number) => "৳" + Math.round(n).toLocaleString("en-IN");
const USD = (n: number) => "$" + n.toLocaleString("en-US", { maximumFractionDigits: 2 });

type Range = { from: Date; to: Date; days: number };

// Daily-partitioned tables (mkt_insights_daily.date, remittance_date,
// invoice_date, …) store the local calendar day. Deriving the filter from
// toISOString().slice(0,10) shifts to the previous UTC day for BDT (UTC+6)
// timestamps like "today 00:00 BDT", so range.from ends up one day earlier
// and the widget double-counts yesterday. Always use local components.
const toLocalDate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

function EmptyLine({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground py-4 text-center">{text}</p>;
}

/* ============================================================
   NET PROFIT — real breakdown with honest empty states
============================================================ */
export function NetProfitCard({
  brandIds, enabled, range,
}: { brandIds: string[]; enabled: boolean; range: Range }) {
  const [open, setOpen] = useState(true);
  const [drill, setDrill] = useState(false);
  const { data: fx } = useUsdBdtRate(brandIds);
  const { data, isLoading } = useQuery({
    queryKey: ["dash-net-profit", brandIds.join(","), range.from.toISOString(), range.to.toISOString(), fx ?? 0],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const fromISO = range.from.toISOString();
      const toISO = range.to.toISOString();
      const fromDate = toLocalDate(range.from);
      const toDate = toLocalDate(range.to);

      const [revRows, itemsArr, ads, returns, exch] = await Promise.all([
        fetchAllRows((f, t) =>
          applyBrandScope(
            supabase.from("orders").select("total, actual_shipping_cost"),
            brandIds,
          ).not("status", "in", "(new,cancelled,returned)")
            .gte("created_at", fromISO).lte("created_at", toISO)
            .order("created_at", { ascending: true }).order("id", { ascending: true }).range(f, t),
        ),
        fetchAllRows((f, t) =>
          applyBrandScope(
            supabase.from("order_items").select(
              "product_id, quantity, unit_cost_snapshot, courier_cost_allocated, packaging_cost_allocated, orders!inner(brand_id, status, created_at)",
            ),
            brandIds,
            "orders.brand_id" as any,
          ).not("orders.status", "in", "(new,cancelled,returned)")
            .gte("orders.created_at", fromISO).lte("orders.created_at", toISO)
            .order("id", { ascending: true }).range(f, t),
        ),
        fetchAllRows((f, t) => applyBrandScope(
          supabase.from("mkt_insights_daily").select("spend, spend_bdt_fifo"),
          brandIds,
        ).gte("date", fromDate).lte("date", toDate).order("id", { ascending: true }).range(f, t)),
        fetchAllRows((f, t) => applyBrandScope(supabase.from("erp_return_cases").select("product_cost_loss"), brandIds)
          .gte("created_at", fromISO).lte("created_at", toISO).order("id", { ascending: true }).range(f, t)),
        fetchAllRows((f, t) => applyBrandScope(supabase.from("erp_exchange_cases").select("product_cost_loss"), brandIds)
          .gte("created_at", fromISO).lte("created_at", toISO).order("id", { ascending: true }).range(f, t)),
      ]);

      const revenue = revRows.reduce((s: number, r: any) => s + Number(r.total ?? 0), 0);
      const shipFallback = revRows.reduce((s: number, r: any) => s + Number(r.actual_shipping_cost ?? 0), 0);
      const revenueMissing = revRows.length === 0;

      // Fallback: unit_cost_snapshot 0/null hole product-er WAC ba cost_price theke neya
      const missingCostPids = Array.from(new Set(
        itemsArr.filter((r) => !(Number(r.unit_cost_snapshot ?? 0) > 0) && r.product_id).map((r) => r.product_id as string)
      ));
      const fallbackCost = new Map<string, number>();
      if (missingCostPids.length > 0) {
        const { data: prods } = await supabase
          .from("products")
          .select("id, weighted_avg_cost, cost_price")
          .in("id", missingCostPids);
        for (const p of (prods ?? []) as any[]) {
          const c = Number(p.weighted_avg_cost ?? 0) || Number(p.cost_price ?? 0);
          if (c > 0) fallbackCost.set(p.id, c);
        }
      }

      let cogs = 0, courier = 0, pack = 0;
      let cogsSeen = false, courierSeen = false, packSeen = false;
      for (const r of itemsArr) {
        let unit = Number(r.unit_cost_snapshot ?? 0);
        if (!(unit > 0) && r.product_id) unit = fallbackCost.get(r.product_id) ?? 0;
        const qty = Number(r.quantity ?? 0);
        if (unit > 0) cogsSeen = true;
        cogs += unit * qty;
        const cc = Number(r.courier_cost_allocated ?? 0);
        if (cc > 0) { courierSeen = true; courier += cc; }
        const pc = Number(r.packaging_cost_allocated ?? 0);
        if (pc > 0) { packSeen = true; pack += pc; }
      }
      if (courier <= 0 && shipFallback > 0) { courier = shipFallback; courierSeen = true; }

      let adSpend = 0; let adSpendSeen = false;
      for (const r of ads) {
        const bdt = Number(r.spend_bdt_fifo ?? 0);
        if (bdt > 0) { adSpend += bdt; adSpendSeen = true; continue; }
        const usd = Number(r.spend ?? 0);
        if (usd > 0 && fx) { adSpend += usd * fx; adSpendSeen = true; }
      }

      const returnLoss = returns.reduce((s: number, r: any) => s + Number(r.product_cost_loss ?? 0), 0)
                       + exch.reduce((s: number, r: any) => s + Number(r.product_cost_loss ?? 0), 0);
      const returnSeen = returns.length > 0 || exch.length > 0;

      const net = revenue - cogs - courier - pack - adSpend - returnLoss;
      const margin = revenue > 0 ? (net / revenue) * 100 : 0;

      return {
        revenue, revenueMissing,
        cogs, cogsSeen,
        courier, courierSeen,
        pack, packSeen,
        adSpend, adSpendSeen, adFxMissing: !fx && ads.some((r: any) => Number(r.spend ?? 0) > 0 && !Number(r.spend_bdt_fifo ?? 0)),
        returnLoss, returnSeen,
        net, margin,
      };
    },
  });

  // Drilldown detail — fetched lazily when the sheet opens
  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ["dash-net-profit-detail", brandIds.join(","), range.from.toISOString(), range.to.toISOString(), fx ?? 0],
    enabled: enabled && drill,
    staleTime: 60_000,
    queryFn: async () => {
      const fromISO = range.from.toISOString();
      const toISO = range.to.toISOString();
      const fromDate = toLocalDate(range.from);
      const toDate = toLocalDate(range.to);

      const [items, ads] = await Promise.all([
        fetchAllRows((f, t) => applyBrandScope(
          supabase.from("order_items").select(
            "product_id, quantity, unit_cost_snapshot, orders!inner(brand_id, status, created_at)",
          ),
          brandIds,
          "orders.brand_id" as any,
        ).not("orders.status", "in", "(new,cancelled,returned)")
          .gte("orders.created_at", fromISO).lte("orders.created_at", toISO).order("id", { ascending: true }).range(f, t)),
        fetchAllRows((f, t) => applyBrandScope(
          supabase.from("mkt_insights_daily").select("campaign_id, spend, spend_bdt_fifo"),
          brandIds,
        ).gte("date", fromDate).lte("date", toDate).order("id", { ascending: true }).range(f, t)),
      ]);

      // Top products by COGS
      const itemRows = items;
      const missingPids = Array.from(new Set(
        itemRows.filter((r) => !(Number(r.unit_cost_snapshot ?? 0) > 0) && r.product_id).map((r) => r.product_id as string)
      ));
      const fallback = new Map<string, number>();
      if (missingPids.length) {
        const { data: prods } = await supabase.from("products").select("id, weighted_avg_cost, cost_price").in("id", missingPids.slice(0, 500));
        for (const p of (prods ?? []) as any[]) {
          const c = Number(p.weighted_avg_cost ?? 0) || Number(p.cost_price ?? 0);
          if (c > 0) fallback.set(p.id, c);
        }
      }
      const byProduct = new Map<string, { cost: number; qty: number }>();
      for (const r of itemRows) {
        if (!r.product_id) continue;
        let u = Number(r.unit_cost_snapshot ?? 0);
        if (!(u > 0)) u = fallback.get(r.product_id) ?? 0;
        const cur = byProduct.get(r.product_id) ?? { cost: 0, qty: 0 };
        cur.cost += u * Number(r.quantity ?? 0);
        cur.qty += Number(r.quantity ?? 0);
        byProduct.set(r.product_id, cur);
      }
      const topIds = Array.from(byProduct.entries()).sort((a, b) => b[1].cost - a[1].cost).slice(0, 5);
      const { data: names } = topIds.length
        ? await supabase.from("products").select("id, name").in("id", topIds.map(([id]) => id))
        : { data: [] as any[] };
      const nameMap = new Map(((names ?? []) as any[]).map((p) => [p.id, p.name]));
      const topProducts = topIds.map(([id, v]) => ({ name: nameMap.get(id) ?? "Unknown", ...v }));

      // Top campaigns by spend
      const byCamp = new Map<string, number>();
      for (const r of ads) {
        const v = Number(r.spend_bdt_fifo ?? 0) || (fx ? Number(r.spend ?? 0) * fx : 0);
        if (v <= 0) continue;
        const k = r.campaign_id ?? "untracked";
        byCamp.set(k, (byCamp.get(k) ?? 0) + v);
      }
      const topCampIds = Array.from(byCamp.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
      const realIds = topCampIds.map(([id]) => id).filter((id) => id !== "untracked");
      const { data: camps } = realIds.length
        ? await supabase.from("mkt_campaigns").select("id, name").in("id", realIds)
        : { data: [] as any[] };
      const campMap = new Map(((camps ?? []) as any[]).map((c) => [c.id, c.name]));
      const topCampaigns = topCampIds.map(([id, spend]) => ({
        name: id === "untracked" ? "Untracked / other" : campMap.get(id) ?? "Campaign",
        spend,
      }));

      return { topProducts, topCampaigns };
    },
  });

  const rows = [
    { k: "Revenue", v: data?.revenue ?? 0, missing: data?.revenueMissing, sign: 1, hint: "সব order-এর total (new/cancelled/returned বাদ)" },
    { k: "Product Cost", v: data?.cogs ?? 0, missing: !data?.cogsSeen, sign: -1, hint: "unit_cost_snapshot × qty; খালি হলে WAC/cost_price" },
    { k: "Courier Cost", v: data?.courier ?? 0, missing: !data?.courierSeen, sign: -1, hint: "courier_cost_allocated, না থাকলে actual_shipping_cost" },
    { k: "Packaging", v: data?.pack ?? 0, missing: !data?.packSeen, sign: -1, hint: "packaging_cost_allocated" },
    { k: "Ad Spend", v: data?.adSpend ?? 0, missing: !data?.adSpendSeen, note: data?.adFxMissing ? "FX rate missing" : undefined, sign: -1, hint: "mkt_insights_daily spend_bdt_fifo (FIFO ডলার rate)" },
    { k: "Return / Exchange Loss", v: data?.returnLoss ?? 0, missing: !data?.returnSeen, sign: -1, hint: "return/exchange case-এর product_cost_loss" },
  ];
  const days = Math.max(1, range.days);

  return (
    <>
      <Card className="owner-panel owner-profit-panel overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <PiggyBank className="size-4 text-emerald-600" /> Net Profit
          </CardTitle>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setDrill(true)}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50 transition-colors"
            >
              Breakdown <ArrowRight className="size-3" />
            </button>
            <button onClick={() => setOpen(o => !o)} className="text-muted-foreground hover:text-foreground">
              {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            </button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-10 w-40" /> : (
            <button onClick={() => setDrill(true)} className="flex items-baseline gap-3 text-left">
              <span className={cn(
                "text-3xl font-bold tabular-nums leading-none",
                (data?.net ?? 0) >= 0 ? "text-emerald-600" : "text-rose-600",
              )} style={{ fontFamily: "Sora, ui-sans-serif" }}>
                {BDT(data?.net ?? 0)}
              </span>
              <span className={cn("text-sm font-semibold tabular-nums", (data?.margin ?? 0) >= 0 ? "text-emerald-600" : "text-rose-600")}>
                {(data?.margin ?? 0).toFixed(1)}%
              </span>
            </button>
          )}
          {open && (
            <div className="mt-4 space-y-1.5 text-xs">
              {rows.map((r) => (
                <button key={r.k} onClick={() => setDrill(true)} className="w-full flex justify-between items-baseline border-b border-dashed border-border/40 pb-1 last:border-0 hover:bg-muted/40 rounded-sm px-1 -mx-1 transition-colors">
                  <span className="text-muted-foreground">{r.sign < 0 && !r.missing ? "− " : ""}{r.k}
                    {r.note && <span className="ml-1.5 text-[10px] text-amber-600">({r.note})</span>}
                  </span>
                  {r.missing ? (
                    <span className="text-[11px] italic text-muted-foreground">no data</span>
                  ) : (
                    <span className={cn("tabular-nums font-medium", r.sign < 0 && r.v !== 0 && "text-rose-600/80")}>
                      {r.sign < 0 ? "−" : ""}{BDT(r.v)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet open={drill} onOpenChange={setDrill}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <PiggyBank className="size-4 text-emerald-600" /> Net Profit — Breakdown
            </SheetTitle>
            <SheetDescription>
              {toLocalDate(range.from)} → {toLocalDate(range.to)} · {days} দিন · প্রতিটা টাকা কোথায় গেল
            </SheetDescription>
          </SheetHeader>

          <div className="mt-5 space-y-6 px-4 pb-8">
            {/* Profit ladder */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Profit ladder</p>
              <div className="space-y-2">
                {rows.map((r) => {
                  const share = data && data.revenue > 0 && !r.missing ? Math.min(100, (Math.abs(r.v) / data.revenue) * 100) : 0;
                  return (
                    <div key={r.k}>
                      <div className="flex justify-between items-baseline text-xs">
                        <span className="text-muted-foreground flex items-center gap-1.5">
                          {r.k}
                          <span className="group relative">
                            <Info className="size-3 text-muted-foreground/50" />
                            <span className="pointer-events-none absolute left-4 top-0 z-10 hidden w-52 rounded-md border bg-popover p-2 text-[10.5px] text-popover-foreground shadow-md group-hover:block">
                              {r.hint}
                            </span>
                          </span>
                        </span>
                        {r.missing ? (
                          <span className="text-[11px] italic text-muted-foreground">no data</span>
                        ) : (
                          <span className={cn("tabular-nums font-semibold", r.sign < 0 && r.v !== 0 ? "text-rose-600" : "text-foreground")}>
                            {r.sign < 0 ? "−" : ""}{BDT(r.v)}
                            <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">{share.toFixed(0)}%</span>
                          </span>
                        )}
                      </div>
                      {!r.missing && (
                        <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={cn("h-full rounded-full", r.sign > 0 ? "bg-emerald-500" : "bg-rose-400")}
                            style={{ width: `${share}%` }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
                <div className="flex justify-between items-baseline border-t pt-2 text-sm">
                  <span className="font-semibold">Net Profit</span>
                  <span className={cn("tabular-nums font-bold", (data?.net ?? 0) >= 0 ? "text-emerald-600" : "text-rose-600")}>
                    {BDT(data?.net ?? 0)} <span className="text-[11px] font-normal text-muted-foreground">({(data?.margin ?? 0).toFixed(1)}%)</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Per-day averages */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">প্রতিদিন গড়</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { k: "Revenue / দিন", v: (data?.revenue ?? 0) / days },
                  { k: "Product cost / দিন", v: (data?.cogs ?? 0) / days },
                  { k: "Courier / দিন", v: (data?.courier ?? 0) / days },
                  { k: "Ad spend / দিন", v: (data?.adSpend ?? 0) / days },
                ].map((x) => (
                  <div key={x.k} className="rounded-lg border p-2.5">
                    <p className="text-[10.5px] text-muted-foreground">{x.k}</p>
                    <p className="text-sm font-semibold tabular-nums mt-0.5">{BDT(x.v)}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Top products by cost */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Top 5 product — সবচেয়ে বেশি cost</p>
              {detailLoading ? <Skeleton className="h-24 w-full" /> : (detail?.topProducts.length ?? 0) === 0 ? (
                <EmptyLine text="এই range-এ কোনো product cost data নেই" />
              ) : (
                <div className="space-y-1.5">
                  {detail!.topProducts.map((p, i) => (
                    <div key={i} className="flex justify-between items-baseline text-xs border-b border-dashed border-border/40 pb-1 last:border-0">
                      <span className="truncate max-w-[60%] text-muted-foreground">{p.name} <span className="text-[10px]">× {p.qty}</span></span>
                      <span className="tabular-nums font-medium">{BDT(p.cost)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Top campaigns by spend */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Top 5 campaign — সবচেয়ে বেশি ad spend</p>
              {detailLoading ? <Skeleton className="h-24 w-full" /> : (detail?.topCampaigns.length ?? 0) === 0 ? (
                <EmptyLine text="এই range-এ কোনো ad spend নেই" />
              ) : (
                <div className="space-y-1.5">
                  {detail!.topCampaigns.map((c, i) => (
                    <div key={i} className="flex justify-between items-baseline text-xs border-b border-dashed border-border/40 pb-1 last:border-0">
                      <span className="truncate max-w-[60%] text-muted-foreground">{c.name}</span>
                      <span className="tabular-nums font-medium">{BDT(c.spend)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <p className="text-[10.5px] text-muted-foreground/70 leading-relaxed border-t pt-3">
              Formula: Revenue − Product Cost − Courier − Packaging − Ad Spend − Return/Exchange Loss।
              new/cancelled/returned order বাদ। Ad spend-এ FIFO ডলার rate ব্যবহার হয়।
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

/* ============================================================
   CASH POSITION
============================================================ */
export function CashPositionCard({
  brandIds, enabled,
}: { brandIds: string[]; enabled: boolean }) {
  const { data, isLoading } = useQuery({
    queryKey: ["dash-cash", brandIds.join(",")],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: rows } = await applyBrandScope(
        supabase.from("erp_accounts").select("name, current_balance, wallet_type, account_type, account_subtype"),
        brandIds, "brand_id", { includeNull: true },
      ).eq("is_active", true);
      const buckets: Record<string, { label: string; total: number; count: number }> = {
        cash: { label: "Cash", total: 0, count: 0 },
        bank: { label: "Bank", total: 0, count: 0 },
        mfs: { label: "MFS", total: 0, count: 0 },
        other: { label: "Other", total: 0, count: 0 },
      };
      for (const r of (rows ?? []) as any[]) {
        const w = String(r.wallet_type ?? "").toLowerCase();
        const t = String(r.account_type ?? "").toLowerCase();
        const sub = String(r.account_subtype ?? "").toLowerCase();
        let key = "other";
        if (w === "cash" || t === "cash") key = "cash";
        else if (w === "bank" || t === "bank") key = "bank";
        else if (w === "mfs" || ["bkash", "nagad", "rocket", "upay"].includes(t) || ["bkash","nagad","rocket","upay"].includes(sub)) key = "mfs";
        buckets[key].total += Number(r.current_balance ?? 0);
        buckets[key].count++;
      }
      const total = Object.values(buckets).reduce((s, b) => s + b.total, 0);
      return { buckets, total, isEmpty: (rows ?? []).length === 0 };
    },
  });

  const icons: Record<string, any> = { cash: Coins, bank: Landmark, mfs: Smartphone, other: Wallet };

  return (
      <Card className="owner-panel">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Wallet className="size-4 text-emerald-600" /> Cash Position
        </CardTitle>
        <Link to="/erp/finance/wallets" className="text-xs text-indigo-600 hover:underline">Wallets →</Link>
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-20" /> : data?.isEmpty ? (
          <EmptyLine text="No wallets set up yet." />
        ) : (
          <>
            <div className="text-3xl font-bold tabular-nums leading-none mb-3" style={{ fontFamily: "Sora, ui-sans-serif" }}>
              {BDT(data?.total ?? 0)}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(data?.buckets ?? {}).filter(([, b]) => b.count > 0).map(([k, b]) => {
                const Icon = icons[k];
                return (
                  <div key={k} className="rounded-md border border-border/60 bg-card p-2.5">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Icon className="size-3.5 text-muted-foreground" />
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{b.label}</span>
                    </div>
                    <div className={cn("text-sm font-bold tabular-nums", b.total < 0 && "text-rose-600")}>{BDT(b.total)}</div>
                    <div className="text-[10px] text-muted-foreground">{b.count} account{b.count > 1 ? "s" : ""}</div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ============================================================
   COD REMITTANCE PIPELINE
============================================================ */
export function CodRemittancePipelineCard({
  brandIds, enabled, range,
}: { brandIds: string[]; enabled: boolean; range: Range }) {
  const { data, isLoading } = useQuery({
    queryKey: ["dash-cod-remit", brandIds.join(","), range.from.toISOString(), range.to.toISOString()],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: rows } = await applyBrandScope(
        supabase.from("erp_cod_remittances").select("courier, status, amount, expected_amount, remittance_date"),
        brandIds,
      ).gte("remittance_date", toLocalDate(range.from))
       .lte("remittance_date", toLocalDate(range.to));
      const list = (rows ?? []) as any[];
      if (list.length === 0) return { empty: true, byCourier: {} as Record<string, any>, totals: null as any };
      const byCourier: Record<string, { pending: number; received: number; reconciled: number; expected: number }> = {};
      let totalPending = 0, totalReceived = 0, totalReconciled = 0;
      for (const r of list) {
        const c = (r.courier as string) || "other";
        byCourier[c] ??= { pending: 0, received: 0, reconciled: 0, expected: 0 };
        const amount = Number(r.amount ?? r.expected_amount ?? 0);
        byCourier[c].expected += Number(r.expected_amount ?? amount);
        const st = String(r.status ?? "pending").toLowerCase();
        if (st === "received" || st === "settled") { byCourier[c].received += amount; totalReceived += amount; }
        else if (st === "reconciled") { byCourier[c].reconciled += amount; totalReconciled += amount; }
        else { byCourier[c].pending += amount; totalPending += amount; }
      }
      return { empty: false, byCourier, totals: { totalPending, totalReceived, totalReconciled } };
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Banknote className="size-4 text-amber-600" /> COD Remittance
        </CardTitle>
        <Link to="/erp/reconciliation" className="text-xs text-indigo-600 hover:underline">Reconciliation →</Link>
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-24" /> : data?.empty ? (
          <div className="text-center py-3">
            <p className="text-sm text-muted-foreground mb-2">Not tracked yet in this range.</p>
            <Link to="/erp/reconciliation" className="inline-flex text-xs text-indigo-600 hover:underline">Log first remittance →</Link>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 mb-3 text-center">
              <div className="rounded-md border border-border/60 p-2">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Pending</div>
                <div className="text-sm font-bold tabular-nums text-amber-600">{BDT(data?.totals?.totalPending ?? 0)}</div>
              </div>
              <div className="rounded-md border border-border/60 p-2">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Received</div>
                <div className="text-sm font-bold tabular-nums text-blue-600">{BDT(data?.totals?.totalReceived ?? 0)}</div>
              </div>
              <div className="rounded-md border border-border/60 p-2">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Reconciled</div>
                <div className="text-sm font-bold tabular-nums text-emerald-600">{BDT(data?.totals?.totalReconciled ?? 0)}</div>
              </div>
            </div>
            <div className="space-y-1">
              {Object.entries(data?.byCourier ?? {}).map(([c, s]) => (
                <div key={c} className="flex items-center justify-between text-xs border-t border-border/40 pt-1.5">
                  <span className="font-semibold capitalize">{c}</span>
                  <span className="tabular-nums text-muted-foreground">
                    <span className="text-amber-600">{BDT(s.pending)}</span> · <span className="text-blue-600">{BDT(s.received)}</span> · <span className="text-emerald-600">{BDT(s.reconciled)}</span>
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ============================================================
   REAL vs META ROAS
============================================================ */
export function RoasComparisonCard({
  brandIds, enabled, range,
}: { brandIds: string[]; enabled: boolean; range: Range }) {
  const { data: fx } = useUsdBdtRate(brandIds);
  const { data, isLoading } = useQuery({
    queryKey: ["dash-roas-cmp", brandIds.join(","), range.from.toISOString(), range.to.toISOString(), fx ?? 0],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const fromDate = toLocalDate(range.from);
      const toDate = toLocalDate(range.to);
      const fromISO = range.from.toISOString();
      const toISO = range.to.toISOString();

      const [ins, attr] = await Promise.all([
        applyBrandScope(supabase.from("mkt_insights_daily").select("spend, spend_bdt_fifo, meta_purchase_value"), brandIds)
          .gte("date", fromDate).lte("date", toDate),
        applyBrandScope(supabase.from("mkt_order_attributions").select("order_id, created_at"), brandIds)
          .gte("created_at", fromISO).lte("created_at", toISO),
      ]);

      const insRows = (ins.data ?? []) as any[];
      const spendUsd = insRows.reduce((s, r) => s + Number(r.spend ?? 0), 0);
      let spendBdt = insRows.reduce((s, r) => s + Number(r.spend_bdt_fifo ?? 0), 0);
      let spendBdtSource: "fifo" | "fx" | "none" = "fifo";
      if (spendBdt === 0 && spendUsd > 0 && fx) { spendBdt = spendUsd * fx; spendBdtSource = "fx"; }
      else if (spendBdt === 0) spendBdtSource = "none";
      const metaRevUsd = insRows.reduce((s, r) => s + Number(r.meta_purchase_value ?? 0), 0);
      const metaRoas = spendUsd > 0 ? metaRevUsd / spendUsd : null;

      const orderIds = Array.from(new Set((attr.data ?? []).map((a: any) => a.order_id).filter(Boolean)));
      let realRev = 0;
      if (orderIds.length > 0) {
        const { data: ord } = await supabase
          .from("orders")
          .select("id, total, status, payment_status")
          .in("id", orderIds as any);
        for (const o of (ord ?? []) as any[]) {
          if (o.status === "delivered" || o.payment_status === "paid") realRev += Number(o.total ?? 0);
        }
      }
      const realRoas = spendBdt > 0 ? realRev / spendBdt : null;

      return {
        metaRoas, realRoas, spendUsd, spendBdt, spendBdtSource,
        realRev, attrCount: orderIds.length,
        insEmpty: insRows.length === 0,
      };
    },
  });

  const gap = data?.metaRoas != null && data?.realRoas != null
    ? ((data.realRoas - data.metaRoas) / data.metaRoas) * 100
    : null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Target className="size-4 text-pink-600" /> ROAS · Real vs Meta
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-24" /> : data?.insEmpty ? (
          <EmptyLine text="No ad spend in this range." />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border/60 p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Meta Reported</div>
                <div className="text-2xl font-bold tabular-nums mt-0.5">
                  {data?.metaRoas != null ? data.metaRoas.toFixed(2) + "x" : <span className="text-sm text-muted-foreground italic">no data</span>}
                </div>
                <div className="text-[10px] text-muted-foreground mt-1">{USD(data?.spendUsd ?? 0)} spend</div>
              </div>
              <div className="rounded-lg border border-border/60 p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Real (attributed)</div>
                <div className="text-2xl font-bold tabular-nums mt-0.5">
                  {data?.realRoas != null ? data.realRoas.toFixed(2) + "x" : <span className="text-sm text-muted-foreground italic">no attribution</span>}
                </div>
                <div className="text-[10px] text-muted-foreground mt-1">{BDT(data?.realRev ?? 0)} attributed · {data?.attrCount ?? 0} orders</div>
              </div>
            </div>
            {gap != null && (
              <div className={cn(
                "mt-3 flex items-center justify-between rounded-md px-3 py-2 text-xs font-semibold",
                gap >= 0 ? "bg-emerald-500/10 text-emerald-700" : "bg-rose-500/10 text-rose-700",
              )}>
                <span>{gap >= 0 ? <TrendingUp className="inline size-3.5 mr-1" /> : <TrendingDown className="inline size-3.5 mr-1" />}
                  Gap {gap >= 0 ? "+" : ""}{gap.toFixed(1)}%
                </span>
                <span className="text-muted-foreground font-normal">
                  Meta {data?.metaRoas != null ? "overstates" : ""} vs real
                </span>
              </div>
            )}
            {data?.spendBdtSource === "none" && (
              <p className="text-[10px] text-amber-600 mt-2">FIFO / FX rate missing — Real ROAS unavailable.</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ============================================================
   AD WALLET BALANCE
============================================================ */
export function AdWalletBalanceCard({
  brandIds, enabled,
}: { brandIds: string[]; enabled: boolean }) {
  const { data, isLoading } = useQuery({
    queryKey: ["dash-ad-wallet", brandIds.join(",")],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: accounts } = await applyBrandScope(
        supabase.from("mkt_ad_accounts").select("id, name, usd_to_bdt_rate"),
        brandIds,
      );
      const accIds = ((accounts ?? []) as any[]).map((a) => a.id);
      if (accIds.length === 0) return { empty: true, rows: [] as any[], totalUsd: 0, totalBdt: 0 };
      const { data: lots } = await supabase
        .from("meta_fifo_lots")
        .select("ad_account_id, usd_remaining, effective_rate")
        .in("ad_account_id", accIds as any)
        .eq("is_active", true);
      const accMap = new Map<string, { name: string; rate: number }>();
      for (const a of (accounts ?? []) as any[]) {
        accMap.set(a.id, { name: a.name, rate: Number(a.usd_to_bdt_rate ?? 0) });
      }
      const agg = new Map<string, { name: string; usd: number; bdt: number }>();
      for (const l of (lots ?? []) as any[]) {
        const acc = accMap.get(l.ad_account_id);
        if (!acc) continue;
        const rate = Number(l.effective_rate ?? acc.rate ?? 0);
        const usd = Number(l.usd_remaining ?? 0);
        const cur = agg.get(l.ad_account_id) ?? { name: acc.name, usd: 0, bdt: 0 };
        cur.usd += usd;
        cur.bdt += usd * rate;
        agg.set(l.ad_account_id, cur);
      }
      const rows = Array.from(agg.values()).sort((a, b) => b.usd - a.usd);
      const totalUsd = rows.reduce((s, r) => s + r.usd, 0);
      const totalBdt = rows.reduce((s, r) => s + r.bdt, 0);
      return { empty: rows.length === 0, rows, totalUsd, totalBdt };
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <DollarSign className="size-4 text-emerald-600" /> Ad Wallet Balance
        </CardTitle>
        <Link to="/erp/finance/dollar-purchase" className="text-xs text-indigo-600 hover:underline">Top-up →</Link>
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-20" /> : data?.empty ? (
          <EmptyLine text="No FIFO lots. Purchase USD first." />
        ) : (
          <>
            <div className="flex items-baseline gap-3 mb-3">
              <span className="text-2xl font-bold tabular-nums" style={{ fontFamily: "Sora, ui-sans-serif" }}>
                {USD(data?.totalUsd ?? 0)}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">≈ {BDT(data?.totalBdt ?? 0)}</span>
            </div>
            <ul className="space-y-1">
              {(data?.rows ?? []).map((r, i) => {
                const low = r.usd < 50;
                return (
                  <li key={i} className="flex items-center justify-between text-xs border-t border-border/40 pt-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {low && <AlertTriangle className="size-3 text-rose-500 shrink-0" />}
                      <span className="truncate">{r.name}</span>
                    </div>
                    <span className={cn("tabular-nums font-semibold shrink-0", low && "text-rose-600")}>
                      {USD(r.usd)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ============================================================
   STUCK ORDERS ALERT
============================================================ */
export function StuckOrdersCard({
  brandIds, enabled,
}: { brandIds: string[]; enabled: boolean }) {
  const { data, isLoading } = useQuery({
    queryKey: ["dash-stuck", brandIds.join(",")],
    enabled,
    staleTime: 60_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const cutoff = new Date(Date.now() - 24 * 3600e3).toISOString();
      const { data: rows } = await applyBrandScope(
        supabase.from("orders").select("id, order_no, status, shipping_name, total, updated_at, created_at"),
        brandIds,
      ).in("status", ["on_hold", "advance_payment_pending", "confirmed"] as any)
       .lt("updated_at", cutoff)
       .order("updated_at", { ascending: true })
       .limit(10);
      return (rows ?? []) as any[];
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Clock className="size-4 text-rose-600" /> Stuck Orders (&gt;24h)
        </CardTitle>
        {(data?.length ?? 0) > 0 && <Badge variant="destructive" className="tabular-nums">{data!.length}</Badge>}
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-24" /> : (data ?? []).length === 0 ? (
          <EmptyLine text="No stuck orders 🎉" />
        ) : (
          <ul className="divide-y divide-border/60">
            {(data ?? []).map((o) => {
              const hours = Math.floor((Date.now() - new Date(o.updated_at ?? o.created_at).getTime()) / 3600e3);
              return (
                <li key={o.id} className="flex items-center justify-between gap-2 py-2 text-xs">
                  <div className="min-w-0 flex-1">
                    <Link to="/erp/orders/$orderId" params={{ orderId: o.id }} className="font-mono text-indigo-600 hover:underline">
                      #{o.order_no ?? o.id.slice(0, 6)}
                    </Link>
                    <span className="ml-1.5 truncate text-muted-foreground">{o.shipping_name ?? "—"}</span>
                  </div>
                  <Badge variant="outline" className="capitalize text-[10px] shrink-0">{String(o.status).replace(/_/g, " ")}</Badge>
                  <span className="tabular-nums text-rose-600 font-semibold shrink-0 w-14 text-right">{hours}h</span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/* ============================================================
   RETURN / EXCHANGE RATE BY PRODUCT
============================================================ */
export function ReturnRateByProductCard({
  brandIds, enabled, range,
}: { brandIds: string[]; enabled: boolean; range: Range }) {
  const { data, isLoading } = useQuery({
    queryKey: ["dash-return-rate", brandIds.join(","), range.from.toISOString(), range.to.toISOString()],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const fromISO = range.from.toISOString();
      const toISO = range.to.toISOString();
      const [ret, exc] = await Promise.all([
        applyBrandScope(supabase.from("erp_return_cases").select("product_id, qty, refund_amount"), brandIds)
          .gte("created_at", fromISO).lte("created_at", toISO),
        applyBrandScope(supabase.from("erp_exchange_cases").select("original_product_id, replacement_qty, refund_amount"), brandIds)
          .gte("created_at", fromISO).lte("created_at", toISO),
      ]);
      const agg = new Map<string, { pid: string; count: number; qty: number; refund: number }>();
      for (const r of (ret.data ?? []) as any[]) {
        if (!r.product_id) continue;
        const cur = agg.get(r.product_id) ?? { pid: r.product_id, count: 0, qty: 0, refund: 0 };
        cur.count++; cur.qty += Number(r.qty ?? 0); cur.refund += Number(r.refund_amount ?? 0);
        agg.set(r.product_id, cur);
      }
      for (const e of (exc.data ?? []) as any[]) {
        const pid = e.original_product_id;
        if (!pid) continue;
        const cur = agg.get(pid) ?? { pid, count: 0, qty: 0, refund: 0 };
        cur.count++; cur.qty += Number(e.replacement_qty ?? 0); cur.refund += Number(e.refund_amount ?? 0);
        agg.set(pid, cur);
      }
      const ids = Array.from(agg.keys());
      if (ids.length === 0) return { empty: true, rows: [] as any[] };
      const { data: prods } = await supabase.from("products").select("id, title, image").in("id", ids as any);
      const pmap = new Map<string, { title: string; image: string | null }>();
      for (const p of (prods ?? []) as any[]) pmap.set(p.id, { title: p.title, image: p.image });
      const rows = Array.from(agg.values())
        .map((r) => ({ ...r, ...(pmap.get(r.pid) ?? { title: "Unknown", image: null }) }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 6);
      return { empty: false, rows };
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Repeat className="size-4 text-amber-600" /> Problem SKUs (Returns)
        </CardTitle>
        <Link to="/erp/returns" className="text-xs text-indigo-600 hover:underline">All returns →</Link>
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-32" /> : data?.empty ? (
          <EmptyLine text="No returns / exchanges in this range." />
        ) : (
          <ul className="divide-y divide-border/60">
            {(data?.rows ?? []).map((r: any) => (
              <li key={r.pid} className="flex items-center gap-3 py-2">
                {r.image ? (
                  <img src={r.image} alt="" className="size-8 rounded-md object-cover ring-1 ring-border" />
                ) : (
                  <div className="size-8 rounded-md bg-muted" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm truncate">{r.title}</div>
                  <div className="text-[10px] text-muted-foreground tabular-nums">Refund: {BDT(r.refund)}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-bold tabular-nums text-rose-600">{r.count}</div>
                  <div className="text-[10px] text-muted-foreground">{r.qty} unit{r.qty !== 1 ? "s" : ""}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/* ============================================================
   COURIER PERFORMANCE COMPARISON
============================================================ */
export function CourierPerformanceCard({
  brandIds, enabled, range,
}: { brandIds: string[]; enabled: boolean; range: Range }) {
  const { data, isLoading } = useQuery({
    queryKey: ["dash-courier-perf", brandIds.join(","), range.from.toISOString(), range.to.toISOString()],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const fromISO = range.from.toISOString();
      const toISO = range.to.toISOString();
      const [ships, recon] = await Promise.all([
        applyBrandScope(
          supabase.from("courier_shipments").select("provider, status, created_at, updated_at, order_id, orders!inner(delivered_at, shipped_at)"),
          brandIds,
        ).gte("created_at", fromISO).lte("created_at", toISO),
        supabase.from("erp_reconciliation_rows").select("store_name, cod_fee, collected")
          .gte("invoice_date", toLocalDate(range.from))
          .lte("invoice_date", toLocalDate(range.to)),
      ]);

      type Row = { total: number; delivered: number; timeSum: number; timeCnt: number; feeSum: number; collectedSum: number };
      const agg: Record<string, Row> = {};
      for (const s of (ships.data ?? []) as any[]) {
        const p = String(s.provider ?? "other").toLowerCase();
        agg[p] ??= { total: 0, delivered: 0, timeSum: 0, timeCnt: 0, feeSum: 0, collectedSum: 0 };
        agg[p].total++;
        if (/deliver/i.test(s.status ?? "")) {
          agg[p].delivered++;
          const ord = s.orders;
          const ship = ord?.shipped_at ? new Date(ord.shipped_at).getTime() : new Date(s.created_at).getTime();
          const deliv = ord?.delivered_at ? new Date(ord.delivered_at).getTime() : new Date(s.updated_at).getTime();
          if (deliv > ship) {
            agg[p].timeSum += (deliv - ship) / 3600e3;
            agg[p].timeCnt++;
          }
        }
      }
      for (const r of (recon.data ?? []) as any[]) {
        const p = String(r.store_name ?? "").toLowerCase();
        // best-effort match
        const key = Object.keys(agg).find((k) => p.includes(k)) ?? p;
        if (!agg[key]) continue;
        agg[key].feeSum += Number(r.cod_fee ?? 0);
        agg[key].collectedSum += Number(r.collected ?? 0);
      }
      const rows = Object.entries(agg).map(([provider, r]) => ({
        provider,
        successRate: r.total > 0 ? (r.delivered / r.total) * 100 : 0,
        avgHours: r.timeCnt > 0 ? r.timeSum / r.timeCnt : null,
        codFeePct: r.collectedSum > 0 ? (r.feeSum / r.collectedSum) * 100 : null,
        total: r.total,
      }));
      return { empty: rows.length === 0, rows };
    },
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Truck className="size-4 text-blue-600" /> Courier Performance
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-32" /> : data?.empty ? (
          <EmptyLine text="No shipments in this range." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/60">
                  <th className="text-left py-2">Courier</th>
                  <th className="text-right">Ships</th>
                  <th className="text-right">Success</th>
                  <th className="text-right">Avg Time</th>
                  <th className="text-right">COD Fee %</th>
                </tr>
              </thead>
              <tbody>
                {(data?.rows ?? []).map((r: any) => (
                  <tr key={r.provider} className="border-b border-border/40 last:border-0">
                    <td className="py-2 font-semibold capitalize">{r.provider}</td>
                    <td className="text-right tabular-nums">{r.total}</td>
                    <td className={cn("text-right tabular-nums font-semibold", r.successRate >= 90 ? "text-emerald-600" : r.successRate >= 70 ? "text-amber-600" : "text-rose-600")}>
                      {r.successRate.toFixed(0)}%
                    </td>
                    <td className="text-right tabular-nums text-muted-foreground">
                      {r.avgHours != null ? `${Math.round(r.avgHours)}h` : "—"}
                    </td>
                    <td className="text-right tabular-nums text-muted-foreground">
                      {r.codFeePct != null ? `${r.codFeePct.toFixed(1)}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ============================================================
   ABANDONED CART RECOVERY
============================================================ */
export function AbandonedCartRecoveryCard({
  brandIds, enabled,
}: { brandIds: string[]; enabled: boolean }) {
  const { data, isLoading } = useQuery({
    queryKey: ["dash-abandoned", brandIds.join(",")],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: rows } = await applyBrandScope(
        supabase.from("abandoned_carts").select("id, subtotal, followup_status"),
        brandIds,
      ).eq("is_converted", false).eq("followup_status", "pending").limit(500);
      const list = (rows ?? []) as any[];
      const total = list.reduce((s, r) => s + Number(r.subtotal ?? 0), 0);
      return { count: list.length, total };
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <ShoppingCart className="size-4 text-orange-600" /> Abandoned Cart Recovery
        </CardTitle>
        <Link to="/erp/orders/incomplete-reports" className="text-xs text-indigo-600 hover:underline">Start followup →</Link>
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-16" /> : (data?.count ?? 0) === 0 ? (
          <EmptyLine text="No pending recovery opportunities." />
        ) : (
          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-bold tabular-nums" style={{ fontFamily: "Sora, ui-sans-serif" }}>{data?.count}</span>
            <span className="text-sm text-muted-foreground">carts · <span className="font-semibold text-foreground tabular-nums">{BDT(data?.total ?? 0)}</span> value</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ============================================================
   NEW vs RETURNING CUSTOMERS
============================================================ */
export function NewVsReturningCard({
  brandIds, enabled, range,
}: { brandIds: string[]; enabled: boolean; range: Range }) {
  const { data, isLoading } = useQuery({
    queryKey: ["dash-new-ret", brandIds.join(","), range.from.toISOString(), range.to.toISOString()],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const [all, ranged] = await Promise.all([
        applyBrandScope(supabase.from("orders").select("user_id, created_at, shipping_phone"), brandIds)
          .not("status", "in", "(cancelled)"),
        applyBrandScope(supabase.from("orders").select("user_id, shipping_phone"), brandIds)
          .not("status", "in", "(cancelled)")
          .gte("created_at", range.from.toISOString()).lte("created_at", range.to.toISOString()),
      ]);
      const firstSeen = new Map<string, string>();
      for (const r of (all.data ?? []) as any[]) {
        const k = r.user_id ?? r.shipping_phone;
        if (!k) continue;
        const t = r.created_at as string;
        if (!firstSeen.has(k) || t < firstSeen.get(k)!) firstSeen.set(k, t);
      }
      const fromISO = range.from.toISOString();
      const toISO = range.to.toISOString();
      const seen = new Set<string>();
      let nu = 0, rt = 0;
      for (const r of (ranged.data ?? []) as any[]) {
        const k = r.user_id ?? r.shipping_phone;
        if (!k || seen.has(k)) continue;
        seen.add(k);
        const f = firstSeen.get(k);
        if (f && f >= fromISO && f <= toISO) nu++; else rt++;
      }
      return { nu, rt, total: nu + rt };
    },
  });

  const pct = data?.total ? (data.rt / data.total) * 100 : 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Zap className="size-4 text-violet-600" /> New vs Returning
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-20" /> : (data?.total ?? 0) === 0 ? (
          <EmptyLine text="No customers in this range." />
        ) : (
          <>
            <div className="flex items-baseline justify-between mb-2">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">New</div>
                <div className="text-2xl font-bold tabular-nums text-indigo-600">{data?.nu}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Returning</div>
                <div className="text-2xl font-bold tabular-nums text-emerald-600">{data?.rt}</div>
              </div>
            </div>
            <div className="h-2 rounded-full bg-indigo-500/20 overflow-hidden flex">
              <div className="bg-indigo-500" style={{ width: `${100 - pct}%` }} />
              <div className="bg-emerald-500" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
              <span>{(100 - pct).toFixed(0)}% new</span>
              <span>{pct.toFixed(0)}% repeat</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
