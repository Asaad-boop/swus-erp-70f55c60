import { useEffect, useMemo, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Activity, Truck, Copy, RefreshCw, ExternalLink, User, ChevronDown, ChevronUp,
  Facebook, Globe, Search, Megaphone, RotateCcw, Repeat, Loader2,
  Target, Layers, Image as ImageIcon, MousePointerClick, Smartphone, Link as LinkIcon,
  History, CheckCircle2, XCircle, Clock, StickyNote,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { syncCourierStatusFn } from "@/lib/erp/courier-sync.functions";
import { cn } from "@/lib/utils";

function bdt(n: number) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n || 0);
}

function statusTone(s: string | null | undefined): string {
  const v = (s ?? "").toLowerCase();
  if (/deliver|complete|confirm|success/.test(v)) return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30";
  if (/cancel|fail|return|fraud/.test(v)) return "bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-rose-500/30";
  if (/hold|pending|review/.test(v)) return "bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-500/30";
  if (/ship|transit|pickup|out_for/.test(v)) return "bg-sky-500/10 text-sky-700 dark:text-sky-300 ring-sky-500/30";
  return "bg-slate-500/10 text-slate-700 dark:text-slate-300 ring-slate-500/30";
}

function StatusChip({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="text-muted-foreground text-[10px]">—</span>;
  return (
    <span className={cn("inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset", statusTone(status))}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Status Timeline                                                            */
/* ────────────────────────────────────────────────────────────────────────── */

export function OrderTimeline({ orderId }: { orderId: string }) {
  const STORAGE_KEY = "order-detail:timeline-open";
  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === null ? true : v === "1";
  });
  const toggle = () => {
    setOpen((v) => {
      const next = !v;
      try { window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  };
  const { data, isFetching } = useQuery({
    queryKey: ["order-timeline", orderId],
    enabled: open,
    staleTime: 30_000,
    queryFn: async () => {
      const [hist, ord] = await Promise.all([
        supabase
          .from("order_status_history")
          .select("id, from_status, to_status, reason, note, changed_by, created_at")
          .eq("order_id", orderId)
          .order("created_at", { ascending: false }),
        supabase
          .from("orders")
          .select("created_at, source, is_guest_order, user_id")
          .eq("id", orderId)
          .maybeSingle(),
      ]);
      if (hist.error) throw hist.error;
      const rows = hist.data ?? [];
      const userIds = Array.from(new Set(rows.map((r) => r.changed_by).filter(Boolean))) as string[];
      const names = new Map<string, string>();
      if (userIds.length) {
        const { data: profs } = await supabase
          .from("profiles").select("id, display_name").in("id", userIds);
        (profs ?? []).forEach((p: any) => names.set(p.id, p.display_name ?? ""));
      }
      const events = rows.map((r) => ({
        id: r.id, from_status: r.from_status, to_status: r.to_status,
        reason: r.reason, note: r.note, created_at: r.created_at,
        staff: r.changed_by ? names.get(r.changed_by) || "Staff" : "System",
      }));
      if (ord.data) {
        const by = ord.data.source === "website"
          ? (ord.data.is_guest_order ? "Guest checkout" : "Customer")
          : "Staff";
        events.push({
          id: `created-${orderId}`,
          from_status: null, to_status: "created",
          reason: null, note: null,
          created_at: ord.data.created_at,
          staff: by,
        });
      }
      return events;
    },
  });
  return (
    <section className="rounded-2xl border border-gray-100 dark:border-border bg-white dark:bg-card shadow-sm overflow-hidden">
      <button
        type="button" onClick={toggle}
        className="w-full px-5 py-3 flex items-center justify-between hover:bg-gray-50/70 dark:hover:bg-muted/30 transition-colors border-b border-gray-100 dark:border-border"
      >
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
          <Activity className="h-3.5 w-3.5 text-indigo-600" />
          <h3 className="text-[13px] font-semibold">Order Timeline</h3>
          {data?.length ? <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-gray-100 dark:bg-muted text-[10px] font-semibold text-gray-600 tabular-nums">{data.length}</span> : null}
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
      </button>
      {open && (
        <div className="p-4">
          {isFetching && <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>}
          {!isFetching && (!data || data.length === 0) && (
            <p className="text-xs text-muted-foreground text-center py-4">No status history yet</p>
          )}
          {!isFetching && data && data.length > 0 && (
            <ol className="relative pl-5 space-y-3 before:absolute before:left-1.5 before:top-1 before:bottom-1 before:w-px before:bg-border">
              {data.map((e) => (
                <li key={e.id} className="relative">
                  <span className={cn("absolute -left-[14px] top-1 h-2.5 w-2.5 rounded-full ring-2 ring-card",
                    /confirm|deliver|complete/.test((e.to_status ?? "").toLowerCase()) ? "bg-emerald-500"
                    : /cancel/.test((e.to_status ?? "").toLowerCase()) ? "bg-rose-500"
                    : /hold/.test((e.to_status ?? "").toLowerCase()) ? "bg-amber-500"
                    : "bg-slate-400")} />
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    {e.from_status && <><StatusChip status={e.from_status} /><span className="text-muted-foreground">→</span></>}
                    <StatusChip status={e.to_status} />
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                    <User className="h-3 w-3" /><span>{e.staff}</span>
                    <span>·</span><span title={format(new Date(e.created_at), "dd MMM yyyy, hh:mm a")}>{format(new Date(e.created_at), "dd MMM, hh:mm a")}</span>
                  </div>
                  {(e.reason || e.note) && (
                    <p className="text-[11px] mt-1 rounded-md bg-muted/40 px-2 py-1 whitespace-pre-wrap">{e.reason || e.note}</p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Shipment Panel                                                             */
/* ────────────────────────────────────────────────────────────────────────── */

function trackingUrl(provider: string, code: string | null) {
  if (!code) return null;
  if (provider === "pathao") return `https://merchant.pathao.com/tracking?consignment_id=${encodeURIComponent(code)}`;
  if (provider === "steadfast") return `https://steadfast.com.bd/t/${encodeURIComponent(code)}`;
  return null;
}

export function ShipmentPanel({
  orderId, brandId, onBookPathao, onBookSteadfast,
}: { orderId: string; brandId: string | null; onBookPathao: () => void; onBookSteadfast: () => void }) {
  const qc = useQueryClient();
  const syncFn = useServerFn(syncCourierStatusFn);
  const { data: shipment, isLoading } = useQuery({
    queryKey: ["order-shipment", orderId],
    queryFn: async () => {
      const { data } = await supabase
        .from("courier_shipments")
        .select("id, provider, consignment_id, tracking_code, status, delivery_fee, updated_at, created_at, rider_name, rider_phone")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false })
        .limit(1).maybeSingle();
      return data;
    },
  });
  const sync = useMutation({
    mutationFn: async () => syncFn({ data: { orderIds: [orderId], brandId: brandId ?? undefined, apply: true } }),
    onSuccess: () => { toast.success("Status synced"); qc.invalidateQueries({ queryKey: ["order-shipment", orderId] }); qc.invalidateQueries({ queryKey: ["order-detail", orderId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="rounded-2xl border border-gray-100 dark:border-border bg-white dark:bg-card shadow-sm overflow-hidden">
      <header className="px-5 py-3 border-b border-gray-100 dark:border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
          <Truck className="h-3.5 w-3.5 text-sky-600" />
          <h3 className="text-[13px] font-semibold">Shipment</h3>
        </div>
        {shipment && (
          <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" disabled={sync.isPending} onClick={() => sync.mutate()}>
            {sync.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          </Button>
        )}
      </header>
      <div className="p-4 space-y-2 text-xs">
        {isLoading ? (
          <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : !shipment ? (
          <div className="space-y-2">
            <p className="text-muted-foreground">Not booked yet</p>
            <div className="grid grid-cols-2 gap-1.5">
              <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={onBookPathao}><Truck className="h-3 w-3 mr-1" />Pathao</Button>
              <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={onBookSteadfast}><Truck className="h-3 w-3 mr-1" />Steadfast</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="capitalize">{shipment.provider}</Badge>
              <StatusChip status={shipment.status} />
            </div>
            {shipment.tracking_code && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Tracking</span>
                <div className="flex items-center gap-1">
                  <span className="font-mono text-[11px] truncate max-w-[120px]" title={shipment.tracking_code}>{shipment.tracking_code}</span>
                  <button onClick={() => { navigator.clipboard.writeText(shipment.tracking_code!); toast.success("Copied"); }} className="p-0.5 rounded hover:bg-muted">
                    <Copy className="h-3 w-3 text-muted-foreground" />
                  </button>
                </div>
              </div>
            )}
            {shipment.consignment_id && shipment.consignment_id !== shipment.tracking_code && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Consignment</span>
                <span className="font-mono text-[11px] truncate max-w-[140px]" title={shipment.consignment_id}>{shipment.consignment_id}</span>
              </div>
            )}
            {shipment.delivery_fee != null && (
              <div className="flex items-center justify-between"><span className="text-muted-foreground">Delivery Fee</span><span>৳{bdt(Number(shipment.delivery_fee))}</span></div>
            )}
            {(shipment as any).rider_name && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Rider</span>
                <span className="font-medium">{(shipment as any).rider_name}</span>
              </div>
            )}
            {(shipment as any).rider_phone && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Rider Phone</span>
                <a href={`tel:${(shipment as any).rider_phone}`} className="text-sky-600 hover:underline font-mono text-[11px]">
                  📞 {(shipment as any).rider_phone}
                </a>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Updated</span>
              <span>{formatDistanceToNow(new Date(shipment.updated_at ?? shipment.created_at), { addSuffix: true })}</span>
            </div>
            {(() => {
              const url = trackingUrl(shipment.provider, shipment.tracking_code ?? shipment.consignment_id);
              if (!url) return null;
              return (
                <a href={url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[11px] text-sky-600 hover:underline">
                  Track Package <ExternalLink className="h-3 w-3" />
                </a>
              );
            })()}
          </>
        )}
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Customer 360 Mini Panel                                                    */
/* ────────────────────────────────────────────────────────────────────────── */

export function CustomerHistoryPanel({
  brandId, phone, currentOrderId,
}: { brandId: string | null; phone: string; currentOrderId: string }) {
  const { data: brandList } = useQuery({
    queryKey: ["brands-mini"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("brands").select("id,name");
      return data ?? [];
    },
  });
  const brandNameById = useMemo(
    () => new Map((brandList ?? []).map((b: any) => [b.id, b.name] as const)),
    [brandList],
  );
  const { data, isLoading } = useQuery({
    queryKey: ["customer-history-360-all", phone],
    enabled: !!phone && phone.length >= 11,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("orders")
        .select("id, status, web_status, total, created_at, invoice_no, brand_id")
        .or(`shipping_phone.eq.${phone},guest_phone.eq.${phone}`)
        .order("created_at", { ascending: false })
        .limit(500);
      const list = rows ?? [];
      let total = 0, confirmed = 0, cancelled = 0, delivered = 0, ltv = 0;
      const brandCounts = new Map<string, number>();
      for (const r of list) {
        total++;
        if (r.brand_id) brandCounts.set(r.brand_id, (brandCounts.get(r.brand_id) ?? 0) + 1);
        const s = ((r.status ?? "") + " " + (r.web_status ?? "")).toLowerCase();
        if (/cancel|fake/.test(s)) cancelled++;
        else if (/deliver/.test(s)) { delivered++; ltv += Number(r.total ?? 0); }
        else if (/confirm|complete/.test(s)) { confirmed++; ltv += Number(r.total ?? 0); }
      }
      const avg = (delivered + confirmed) > 0 ? Math.round(ltv / (delivered + confirmed)) : 0;
      const previous = list.filter((r) => r.id !== currentOrderId).slice(0, 5);
      const { data: meta } = await supabase
        .from("crm_customer_meta")
        .select("rfm_segment, churn_risk")
        .eq("customer_key", phone)
        .maybeSingle();
      return { total, confirmed, cancelled, delivered, ltv, avg, previous, meta, brandCounts: Array.from(brandCounts.entries()) };
    },
  });

  return (
    <section className="rounded-2xl border border-gray-100 dark:border-border bg-white dark:bg-card shadow-sm overflow-hidden">
      <header className="px-5 py-3 border-b border-gray-100 dark:border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-fuchsia-500" />
          <User className="h-3.5 w-3.5 text-fuchsia-600" />
          <h3 className="text-[13px] font-semibold">Customer 360</h3>
        </div>
        {data?.meta?.rfm_segment && (
          <Badge variant="outline" className="text-[10px]">{data.meta.rfm_segment}</Badge>
        )}
      </header>
      <div className="p-4 text-xs space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : !data || data.total === 0 ? (
          <p className="text-muted-foreground text-center py-2">First time customer</p>
        ) : (
          <>
            {data.brandCounts.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {data.brandCounts.map(([bid, count]) => {
                  const isCurrent = bid === brandId;
                  return (
                    <span
                      key={bid}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ring-1 ring-inset",
                        isCurrent
                          ? "bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300 ring-fuchsia-500/30"
                          : "bg-muted/40 text-foreground ring-border",
                      )}
                      title={isCurrent ? "Current brand" : "Cross-brand customer"}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                      <span className="font-medium">{brandNameById.get(bid) ?? "Other"}</span>
                      <span className="text-muted-foreground">×{count}</span>
                    </span>
                  );
                })}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md border bg-muted/20 px-2 py-1.5"><div className="text-[10px] text-muted-foreground">Total Orders</div><div className="font-semibold">{data.total}</div></div>
              <div className="rounded-md border bg-emerald-500/5 px-2 py-1.5"><div className="text-[10px] text-muted-foreground">Delivered</div><div className="font-semibold text-emerald-600">{data.delivered}</div></div>
              <div className="rounded-md border bg-sky-500/5 px-2 py-1.5"><div className="text-[10px] text-muted-foreground">Confirmed</div><div className="font-semibold text-sky-600">{data.confirmed}</div></div>
              <div className="rounded-md border bg-rose-500/5 px-2 py-1.5"><div className="text-[10px] text-muted-foreground">Cancelled</div><div className="font-semibold text-rose-600">{data.cancelled}</div></div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Lifetime Value</span>
              <span className="font-semibold">৳{bdt(data.ltv)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Avg Order</span>
              <span>৳{bdt(data.avg)}</span>
            </div>
            {data.meta?.churn_risk && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Churn Risk</span>
                <Badge variant="outline" className={cn("text-[10px]", statusTone(data.meta.churn_risk))}>{data.meta.churn_risk}</Badge>
              </div>
            )}
            {data.previous.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Previous Orders</div>
                {data.previous.map((p) => {
                  const s = ((p.status ?? "") + " " + (p.web_status ?? "")).trim();
                  const bName = p.brand_id ? brandNameById.get(p.brand_id) : null;
                  const isOther = p.brand_id && p.brand_id !== brandId;
                  return (
                    <Link key={p.id} to="/erp/orders/$orderId" params={{ orderId: p.id }}
                      className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted/40">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-mono truncate">#{p.invoice_no ?? p.id.slice(0, 8)}</span>
                          {bName && (
                            <span className={cn(
                              "inline-flex items-center rounded-full px-1.5 py-px text-[9px] font-medium ring-1 ring-inset",
                              isOther
                                ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-500/30"
                                : "bg-muted/40 text-muted-foreground ring-border",
                            )}>{bName}</span>
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground">{format(new Date(p.created_at), "dd MMM, hh:mm a")}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[11px] font-semibold">৳{bdt(Number(p.total ?? 0))}</div>
                        <StatusChip status={s.split(" ")[0]} />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Full UTM Attribution                                                       */
/* ────────────────────────────────────────────────────────────────────────── */

function sourceIcon(src: string | null) {
  const v = (src ?? "").toLowerCase();
  if (/facebook|fb|meta|instagram|ig/.test(v)) return <Facebook className="h-3.5 w-3.5 text-[#1877F2]" />;
  if (/google|gads|adwords/.test(v)) return <Search className="h-3.5 w-3.5 text-amber-500" />;
  if (/organic|seo/.test(v)) return <Search className="h-3.5 w-3.5 text-emerald-600" />;
  if (/direct/.test(v)) return <Globe className="h-3.5 w-3.5 text-slate-500" />;
  return <Megaphone className="h-3.5 w-3.5 text-muted-foreground" />;
}

export function AttributionPanel({ orderId }: { orderId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["order-attribution", orderId],
    queryFn: async () => {
      // Prefer orders.* (populated by checkout / pixel); fall back to
      // mkt_order_attributions (post-processed matching) if needed.
      const [ordRes, attrRes] = await Promise.all([
        supabase
          .from("orders")
          .select("source, source_website, source_platform, utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, fb_campaign_id, fb_adset_id, fb_ad_id, attribution, attribution_landing_page, customer_ip, device_info, brand_id")
          .eq("id", orderId)
          .maybeSingle(),
        supabase
          .from("mkt_order_attributions")
          .select("source, utm_source, utm_medium, utm_campaign, utm_content, utm_term, campaign_id, adset_id, ad_id, confidence, fbclid")
          .eq("order_id", orderId)
          .maybeSingle(),
      ]);
      const ord = ordRes.data;
      const attr = attrRes.data;

      // Resolve human-readable campaign / adset / ad names from mkt_* when we have UUIDs.
      let campaignName: string | null = null;
      let adsetName: string | null = null;
      let adName: string | null = null;
      if (attr?.campaign_id) {
        const { data: c } = await supabase.from("mkt_campaigns").select("name").eq("id", attr.campaign_id).maybeSingle();
        campaignName = c?.name ?? null;
      }
      if (attr?.adset_id) {
        const { data: a } = await supabase.from("mkt_adsets").select("name").eq("id", attr.adset_id).maybeSingle();
        adsetName = a?.name ?? null;
      }
      if (attr?.ad_id) {
        const { data: ad } = await supabase.from("mkt_ads").select("name").eq("id", attr.ad_id).maybeSingle();
        adName = ad?.name ?? null;
      }

      // Meta Ad Account — resolve from brand → mkt_ad_account_brands → mkt_ad_accounts
      let adAccount: { name: string | null; external_id: string | null } | null = null;
      if (ord?.brand_id) {
        const { data: link } = await supabase
          .from("mkt_ad_account_brands")
          .select("ad_account_id")
          .eq("brand_id", ord.brand_id)
          .limit(1)
          .maybeSingle();
        if (link?.ad_account_id) {
          const { data: acc } = await supabase
            .from("mkt_ad_accounts")
            .select("name, external_id")
            .eq("id", link.ad_account_id)
            .maybeSingle();
          if (acc) adAccount = acc;
        }
      }
      return { ord, attr, campaignName, adsetName, adName, adAccount };
    },
  });

  const ord = data?.ord;
  const attr = data?.attr;
  const attributionJson = (ord?.attribution ?? {}) as { fbp?: string | null; fbc?: string | null; referrer?: string | null };
  const deviceInfo = (ord?.device_info ?? {}) as { device_type?: string | null; user_agent?: string | null; platform?: string | null };

  const utmSource = attr?.utm_source ?? ord?.utm_source ?? null;
  const utmMedium = attr?.utm_medium ?? ord?.utm_medium ?? null;
  const utmCampaign = attr?.utm_campaign ?? ord?.utm_campaign ?? null;
  const utmContent = attr?.utm_content ?? ord?.utm_content ?? null;
  const utmTerm = attr?.utm_term ?? ord?.utm_term ?? null;
  const fbclid = attr?.fbclid ?? ord?.fbclid ?? null;
  const fbCampaignId = ord?.fb_campaign_id ?? utmCampaign;
  const fbAdsetId = ord?.fb_adset_id ?? utmContent;
  const fbAdId = ord?.fb_ad_id ?? utmTerm;
  const landing = ord?.attribution_landing_page ?? null;
  const referrer = attributionJson.referrer ?? null;
  const deviceLabel = deviceInfo.device_type ?? deviceInfo.platform ?? null;

  const isPaid = Boolean(fbCampaignId || fbAdId || fbAdsetId || fbclid || (utmMedium && /paid|cpc|ppc|meta|fb/i.test(utmMedium)));
  const bucket: "paid" | "organic" | "direct" | null = (() => {
    if (isPaid) return "paid";
    if (utmSource || referrer) return "organic";
    if (ord) return "direct";
    return null;
  })();

  const hasAny = !!(utmSource || utmMedium || utmCampaign || utmContent || utmTerm || fbclid || landing || referrer || deviceLabel);

  return (
    <section className="rounded-2xl border border-gray-100 dark:border-border bg-white dark:bg-card shadow-sm overflow-hidden">
      <header className="px-5 py-3 border-b border-gray-100 dark:border-border flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
        <Target className="h-3.5 w-3.5 text-rose-600" />
        <div>
          <h3 className="text-[13px] font-semibold leading-tight">Attribution</h3>
          <p className="text-[10px] text-muted-foreground">Track where this order came from</p>
        </div>
        {bucket && (
          <Badge
            variant="outline"
            className={cn(
              "ml-auto text-[10px] capitalize",
              bucket === "paid" && "bg-blue-500/10 text-blue-700 border-blue-500/30 dark:text-blue-300",
              bucket === "organic" && "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300",
              bucket === "direct" && "bg-slate-500/10 text-slate-700 border-slate-500/30 dark:text-slate-300",
            )}
          >
            {bucket === "paid" ? (utmMedium || "paid") : bucket}
          </Badge>
        )}
      </header>
      <div className="p-4 text-xs space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : !hasAny ? (
          <p className="text-muted-foreground text-center py-2">No attribution data</p>
        ) : (
          <>
            {/* Meta Ad Account */}
            {data?.adAccount && (
              <div className="rounded-lg bg-sky-500/5 ring-1 ring-inset ring-sky-500/20 px-3 py-2 space-y-1">
                <div className="flex items-center gap-2 text-[11px]">
                  <Globe className="h-3.5 w-3.5 text-sky-600" />
                  <span className="font-semibold text-foreground">Meta Ad Account:</span>
                  <span className="text-foreground truncate">{data.adAccount.name ?? "—"}</span>
                </div>
                {data.adAccount.external_id && (
                  <CopyRow value={data.adAccount.external_id} mono />
                )}
              </div>
            )}

            {/* Campaign / Ad Set / Ad */}
            <AttrRow icon={<Target className="h-3.5 w-3.5 text-muted-foreground" />} label="Campaign" name={data?.campaignName} id={fbCampaignId} />
            <AttrRow icon={<Layers className="h-3.5 w-3.5 text-muted-foreground" />} label="Ad Set" name={data?.adsetName} id={fbAdsetId} />
            <AttrRow icon={<ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />} label="Ad" name={data?.adName} id={fbAdId} />

            {utmTerm && !fbAdId && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">UTM Term</span>
                <span className="truncate max-w-[180px] font-mono" title={utmTerm}>{utmTerm}</span>
              </div>
            )}

            {/* Facebook Pixel */}
            {(fbclid || attributionJson.fbp || attributionJson.fbc) && (
              <div className="pt-2 border-t border-dashed">
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground mb-1.5">
                  <MousePointerClick className="h-3.5 w-3.5 text-[#1877F2]" /> Facebook Pixel
                </div>
                {fbclid && <CopyRow label="Click ID" value={fbclid} mono />}
                {attributionJson.fbp && <CopyRow label="fbp" value={attributionJson.fbp} mono />}
                {attributionJson.fbc && <CopyRow label="fbc" value={attributionJson.fbc} mono />}
              </div>
            )}

            {/* Session Info */}
            {(deviceLabel || referrer) && (
              <div className="pt-2 border-t border-dashed">
                <div className="text-[11px] font-medium text-foreground mb-1.5">Session Info</div>
                {deviceLabel && (
                  <div className="flex items-center gap-2 text-[11px]">
                    <Smartphone className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="capitalize">{deviceLabel}</span>
                  </div>
                )}
                {referrer && (
                  <div className="flex items-center gap-2 text-[11px] mt-1">
                    <LinkIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    <a href={referrer} target="_blank" rel="noreferrer" className="text-sky-600 hover:underline truncate max-w-[220px]" title={referrer}>{referrer}</a>
                  </div>
                )}
              </div>
            )}

            {/* Entry URL */}
            {landing && (
              <div className="pt-2 border-t border-dashed">
                <div className="text-[11px] font-medium text-foreground mb-1">Entry URL</div>
                <a href={landing} target="_blank" rel="noreferrer" className="text-[10px] font-mono text-sky-600 hover:underline break-all block leading-snug">
                  {landing}
                </a>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function AttrRow({ icon, label, name, id }: { icon: React.ReactNode; label: string; name?: string | null; id?: string | null }) {
  if (!name && !id) return null;
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-2 text-[11px]">
        {icon}
        <span className="text-muted-foreground">{label}</span>
        <span className="ml-auto font-medium text-foreground truncate max-w-[180px]" title={name ?? ""}>{name ?? "—"}</span>
      </div>
      {id && <CopyRow value={String(id)} mono indent />}
    </div>
  );
}

function CopyRow({ value, label, mono, indent }: { value: string; label?: string; mono?: boolean; indent?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => { navigator.clipboard.writeText(value); toast.success("Copied"); }}
      className={cn(
        "group flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors w-full",
        indent && "pl-5",
      )}
      title="Click to copy"
    >
      {label && <span className="uppercase tracking-wider">{label}:</span>}
      <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
      <span className={cn("truncate", mono && "font-mono")}>{value}</span>
    </button>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Activity Log — realtime, staff-attributed                                  */
/* ────────────────────────────────────────────────────────────────────────── */

type ActivityEntry = {
  id: string;
  action: string;
  details: Record<string, unknown> | null;
  performed_by: string | null;
  performed_at: string;
};

function humanAction(action: string): string {
  const map: Record<string, string> = {
    ORDER_CREATED: "Order created",
    STATUS_CHANGED: "Status changed",
    WEB_STATUS_CHANGED: "Web status changed",
    ORDER_VIEWED: "Viewed order",
    NOTE_ADDED: "Note added",
    NOTE_DELETED: "Note deleted",
    ORDER_ASSIGNED: "Assigned staff",
    ORDER_UPDATED: "Order updated",
    ORDER_CONFIRMED: "Confirmed order",
    ORDER_CANCELLED: "Cancelled order",
    CALL_LOGGED: "Call logged",
    SHIPMENT_BOOKED: "Shipment booked",
  };
  return map[action] ?? action.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function actionTone(action: string) {
  if (/CANCEL|DELETE|FAIL/.test(action)) return "bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-rose-500/30";
  if (/CONFIRM|COMPLETE|CREATED|BOOKED/.test(action)) return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30";
  if (/STATUS|UPDATE|ASSIGN/.test(action)) return "bg-sky-500/10 text-sky-700 dark:text-sky-300 ring-sky-500/30";
  if (/NOTE/.test(action)) return "bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-500/30";
  return "bg-slate-500/10 text-slate-700 dark:text-slate-300 ring-slate-500/30";
}

function actionIcon(action: string) {
  if (/CANCEL|DELETE/.test(action)) return <XCircle className="h-3 w-3" />;
  if (/CONFIRM|COMPLETE|CREATED/.test(action)) return <CheckCircle2 className="h-3 w-3" />;
  if (/NOTE/.test(action)) return <StickyNote className="h-3 w-3" />;
  if (/STATUS|UPDATE|ASSIGN/.test(action)) return <Activity className="h-3 w-3" />;
  return <Clock className="h-3 w-3" />;
}

export function ActivityLogPanel({ orderId }: { orderId: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["order-activity-log", orderId],
    staleTime: 15_000,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("activity_log")
        .select("id, action, details, performed_by, performed_at")
        .eq("entity_type", "order")
        .eq("entity_id", orderId)
        .order("performed_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      const entries = (rows ?? []) as ActivityEntry[];
      const userIds = Array.from(new Set(entries.map((r) => r.performed_by).filter(Boolean))) as string[];
      const names = new Map<string, string>();
      if (userIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, display_name")
          .in("id", userIds);
        (profs ?? []).forEach((p) => names.set(p.id, p.display_name ?? "Staff"));
      }
      return { entries, names };
    },
  });

  // Live realtime subscription — refetch on any activity_log change for this order.
  useEffect(() => {
    const channel = supabase
      .channel(`activity-log-${orderId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "activity_log", filter: `entity_id=eq.${orderId}` },
        () => qc.invalidateQueries({ queryKey: ["order-activity-log", orderId] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [orderId, qc]);

  const entries = data?.entries ?? [];
  const names = data?.names ?? new Map<string, string>();

  return (
    <section className="rounded-2xl border border-gray-100 dark:border-border bg-white dark:bg-card shadow-sm overflow-hidden">
      <header className="px-5 py-3 border-b border-gray-100 dark:border-border flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" />
        <History className="h-3.5 w-3.5 text-indigo-600" />
        <h3 className="text-[13px] font-semibold">Activity Log</h3>
        <span className="ml-auto inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-emerald-600">
          <span className="h-1 w-1 rounded-full bg-emerald-500 animate-pulse" />Live
        </span>
      </header>
      <div className="p-4">
        {isLoading ? (
          <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : entries.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-2">No activity yet</p>
        ) : (
          <ol className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
            {entries.map((e) => {
              const staff = e.performed_by ? (names.get(e.performed_by) ?? "Staff") : "System";
              const d = (e.details ?? {}) as { from?: string; to?: string; status?: string; note?: string; source?: string };
              const isStatus = /STATUS/.test(e.action);
              return (
                <li key={e.id} className="rounded-lg border border-gray-100 dark:border-border bg-gray-50/60 dark:bg-muted/20 px-3 py-2 hover:border-gray-200 dark:hover:border-border/80 transition-colors">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset", actionTone(e.action))}>
                      {actionIcon(e.action)}
                      {humanAction(e.action)}
                    </span>
                    {isStatus && d.from && d.to && (
                      <span className="flex items-center gap-1 text-[10px]">
                        <StatusChip status={d.from} /><span className="text-muted-foreground">→</span><StatusChip status={d.to} />
                      </span>
                    )}
                    <span
                      className="text-[10px] text-muted-foreground ml-auto"
                      title={format(new Date(e.performed_at), "dd MMM yyyy, hh:mm:ss a")}
                    >
                      {formatDistanceToNow(new Date(e.performed_at), { addSuffix: true })}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <User className="h-3 w-3" />
                    <span className="font-medium text-foreground">{staff}</span>
                    {d.source && <><span>·</span><span className="capitalize">{d.source}</span></>}
                  </div>
                  {d.note && (
                    <p className="mt-1 text-[11px] whitespace-pre-wrap rounded bg-background/60 border px-2 py-1">{d.note}</p>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Return / Exchange Dialogs                                                  */
/* ────────────────────────────────────────────────────────────────────────── */

type ItemLite = { id: string; product_id: string; name: string; quantity: number; unit_price: number | null; price: number | null };

const RETURN_REASONS = ["Damaged on arrival", "Wrong item shipped", "Customer changed mind", "Quality issue", "Size/fit issue", "Other"];

export function ReturnDialog({
  open, onOpenChange, orderId, brandId, items,
}: { open: boolean; onOpenChange: (v: boolean) => void; orderId: string; brandId: string | null; items: ItemLite[] }) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [condition, setCondition] = useState<"sellable" | "damaged" | "missing">("sellable");
  const [note, setNote] = useState("");

  const submit = useMutation({
    mutationFn: async () => {
      const rows = items.filter((it) => (selected[it.id] ?? 0) > 0);
      if (rows.length === 0) throw new Error("Select at least one item");
      if (!reason) throw new Error("Select a reason");
      if (!brandId) throw new Error("Brand not set on order");
      const payload = rows.map((it) => ({
        brand_id: brandId!, order_id: orderId, order_item_id: it.id, product_id: it.product_id,
        qty: selected[it.id], refund_amount: Number(it.unit_price ?? it.price ?? 0) * selected[it.id],
        return_type: "refund", item_condition: condition, status: "pending",
        note: `${reason}${note ? " — " + note : ""}`,
      }));
      const { error } = await supabase.from("erp_return_cases").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Return initiated"); qc.invalidateQueries({ queryKey: ["order-detail", orderId] }); onOpenChange(false); setSelected({}); setReason(""); setNote(""); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Initiate Return</DialogTitle>
          <DialogDescription>Select items and reason</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          <div className="space-y-1.5">
            {items.map((it) => {
              const qty = selected[it.id] ?? 0;
              return (
                <div key={it.id} className="flex items-center gap-2 rounded-md border px-2 py-1.5">
                  <Checkbox checked={qty > 0} onCheckedChange={(v) => setSelected((s) => ({ ...s, [it.id]: v ? it.quantity : 0 }))} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{it.name}</div>
                    <div className="text-[10px] text-muted-foreground">৳{bdt(Number(it.unit_price ?? it.price))} × {it.quantity}</div>
                  </div>
                  <Input type="number" min={0} max={it.quantity} value={qty} onChange={(e) => setSelected((s) => ({ ...s, [it.id]: Math.min(it.quantity, Math.max(0, Number(e.target.value) || 0)) }))} className="w-16 h-8 text-xs tabular-nums" />
                </div>
              );
            })}
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Reason</label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select reason" /></SelectTrigger>
              <SelectContent>{RETURN_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Condition</label>
            <Select value={condition} onValueChange={(v) => setCondition(v as typeof condition)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sellable">Sellable</SelectItem>
                <SelectItem value="damaged">Damaged</SelectItem>
                <SelectItem value="missing">Missing</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Note (optional)</label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="resize-none text-xs" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={submit.isPending} onClick={() => submit.mutate()} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            {submit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit Return"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ExchangeDialog({
  open, onOpenChange, orderId, brandId, items,
}: { open: boolean; onOpenChange: (v: boolean) => void; orderId: string; brandId: string | null; items: ItemLite[] }) {
  const qc = useQueryClient();
  const [originalItemId, setOriginalItemId] = useState("");
  const [replacementSearch, setReplacementSearch] = useState("");
  const [replacementId, setReplacementId] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [condition, setCondition] = useState("sellable");
  const [note, setNote] = useState("");

  const { data: results } = useQuery({
    queryKey: ["exchange-product-search", brandId, replacementSearch],
    enabled: !!brandId && replacementSearch.length >= 2,
    queryFn: async () => {
      const { data } = await supabase.from("products").select("id, title, price, stock").eq("brand_id", brandId!).eq("is_active", true).ilike("title", `%${replacementSearch}%`).limit(8);
      return data ?? [];
    },
  });
  const replacement = useMemo(() => results?.find((p) => p.id === replacementId), [results, replacementId]);
  const originalItem = useMemo(() => items.find((it) => it.id === originalItemId), [items, originalItemId]);

  const submit = useMutation({
    mutationFn: async () => {
      if (!originalItem) throw new Error("Select item to exchange");
      if (!replacement) throw new Error("Select replacement product");
      if (!brandId) throw new Error("Brand not set on order");
      const { error } = await supabase.from("erp_exchange_cases").insert({
        brand_id: brandId!,
        original_order_id: orderId,
        original_order_item_id: originalItem.id,
        original_product_id: originalItem.product_id,
        exchange_type: "product_swap",
        old_item_condition: condition,
        replacement_product_id: replacement.id,
        replacement_qty: qty,
        status: "pending",
        note,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Exchange initiated"); qc.invalidateQueries({ queryKey: ["order-detail", orderId] }); onOpenChange(false); setOriginalItemId(""); setReplacementId(null); setReplacementSearch(""); setNote(""); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Initiate Exchange</DialogTitle>
          <DialogDescription>Swap an item with a new product</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Item to exchange</label>
            <Select value={originalItemId} onValueChange={setOriginalItemId}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select item" /></SelectTrigger>
              <SelectContent>{items.map((it) => <SelectItem key={it.id} value={it.id}>{it.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Replacement product</label>
            <Input placeholder="Search product…" value={replacementSearch} onChange={(e) => { setReplacementSearch(e.target.value); setReplacementId(null); }} className="h-9 text-xs" />
            {results && results.length > 0 && !replacement && (
              <ul className="border rounded-md divide-y max-h-40 overflow-y-auto">
                {results.map((p) => (
                  <li key={p.id} className="px-2 py-1.5 text-xs hover:bg-muted/40 cursor-pointer" onClick={() => setReplacementId(p.id)}>
                    <div className="truncate">{p.title}</div>
                    <div className="text-[10px] text-muted-foreground">৳{bdt(Number(p.price))} · Stock {p.stock}</div>
                  </li>
                ))}
              </ul>
            )}
            {replacement && (
              <div className="rounded-md border bg-muted/30 px-2 py-1.5 text-xs flex items-center justify-between">
                <span className="truncate">{replacement.title}</span>
                <button onClick={() => setReplacementId(null)} className="text-[10px] text-muted-foreground hover:text-foreground">change</button>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Qty</label>
              <Input type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} className="h-9 text-xs tabular-nums" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Old item</label>
              <Select value={condition} onValueChange={setCondition}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sellable">Sellable</SelectItem>
                  <SelectItem value="damaged">Damaged</SelectItem>
                  <SelectItem value="missing">Missing</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Note</label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="resize-none text-xs" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={submit.isPending} onClick={() => submit.mutate()} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            {submit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Repeat className="h-4 w-4 mr-1" />Submit Exchange</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Prev / Next nav + keyboard                                                 */
/* ────────────────────────────────────────────────────────────────────────── */

export const ORDER_NAV_KEY = "order-nav-list";

export function useOrderNeighbors(orderId: string) {
  return useMemo(() => {
    if (typeof window === "undefined") return { prev: null, next: null, index: -1, total: 0 };
    try {
      const raw = sessionStorage.getItem(ORDER_NAV_KEY);
      if (!raw) return { prev: null, next: null, index: -1, total: 0 };
      const list = JSON.parse(raw) as string[];
      const idx = list.indexOf(orderId);
      return {
        prev: idx > 0 ? list[idx - 1] : null,
        next: idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null,
        index: idx, total: list.length,
      };
    } catch { return { prev: null, next: null, index: -1, total: 0 }; }
  }, [orderId]);
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Return/Exchange icons re-exports                                           */
/* ────────────────────────────────────────────────────────────────────────── */

export { RotateCcw as ReturnIcon, Repeat as ExchangeIcon };

/* ────────────────────────────────────────────────────────────────────────── */
/*  Order Cases Panel — return/exchange cases for this order                  */
/* ────────────────────────────────────────────────────────────────────────── */

export function OrderCasesPanel({ orderId }: { orderId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["order-cases", orderId],
    queryFn: async () => {
      const sb: any = supabase;
      const [{ data: rets }, { data: excs }] = await Promise.all([
        sb.from("erp_return_cases")
          .select("id, case_number, return_status, refund_amount, qty, created_at")
          .eq("order_id", orderId).order("created_at", { ascending: false }),
        sb.from("erp_exchange_cases")
          .select("id, case_number, exchange_status, exchange_charge_collected, replacement_qty, created_at")
          .eq("original_order_id", orderId).order("created_at", { ascending: false }),
      ]);
      return {
        rets: (rets ?? []) as Array<{ id: string; case_number?: string; return_status: string; refund_amount: number; qty: number; created_at: string }>,
        excs: (excs ?? []) as Array<{ id: string; case_number?: string; exchange_status: string; exchange_charge_collected: number; replacement_qty: number; created_at: string }>,
      };
    },
  });

  const total = (data?.rets.length ?? 0) + (data?.excs.length ?? 0);

  return (
    <section className="rounded-2xl border border-gray-100 dark:border-border bg-white dark:bg-card shadow-sm overflow-hidden">
      <header className="px-5 py-3 border-b border-gray-100 dark:border-border flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
        <RotateCcw className="h-3.5 w-3.5 text-rose-600" />
        <h3 className="text-[13px] font-semibold">Returns & Exchanges</h3>
        {total > 0 && (
          <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-gray-100 dark:bg-muted text-[10px] font-semibold text-gray-600 tabular-nums">
            {total}
          </span>
        )}
      </header>
      <div className="p-4 space-y-2 text-xs">
        {isLoading ? (
          <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : total === 0 ? (
          <p className="text-muted-foreground text-center py-2">No cases yet</p>
        ) : (
          <ul className="space-y-1.5">
            {data!.rets.map((r) => (
              <li key={r.id} className="flex items-center gap-2 rounded-md border px-2 py-1.5">
                <RotateCcw className="h-3 w-3 text-emerald-600 shrink-0" />
                <span className="font-mono text-[11px] truncate">{r.case_number ?? r.id.slice(0, 8)}</span>
                <span className="text-[10px] text-muted-foreground">qty {r.qty}</span>
                <span className="ml-auto inline-flex items-center gap-1">
                  <span className="capitalize text-[10px] rounded px-1.5 py-0.5 bg-muted">{r.return_status.replace(/_/g, " ")}</span>
                  <span className="tabular-nums text-[10px] text-rose-600">৳{bdt(Number(r.refund_amount ?? 0))}</span>
                </span>
                <Link to="/erp/returns/$caseId" params={{ caseId: r.id }} className="text-sky-600 hover:underline text-[11px]">View</Link>
              </li>
            ))}
            {data!.excs.map((r) => (
              <li key={r.id} className="flex items-center gap-2 rounded-md border px-2 py-1.5">
                <Repeat className="h-3 w-3 text-indigo-600 shrink-0" />
                <span className="font-mono text-[11px] truncate">{r.case_number ?? r.id.slice(0, 8)}</span>
                <span className="text-[10px] text-muted-foreground">qty {r.replacement_qty}</span>
                <span className="ml-auto inline-flex items-center gap-1">
                  <span className="capitalize text-[10px] rounded px-1.5 py-0.5 bg-muted">{r.exchange_status.replace(/_/g, " ")}</span>
                  <span className="tabular-nums text-[10px]">৳{bdt(Number(r.exchange_charge_collected ?? 0))}</span>
                </span>
                <Link to="/erp/returns/$caseId" params={{ caseId: r.id }} className="text-sky-600 hover:underline text-[11px]">View</Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}