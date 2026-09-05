import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { MapPin, Truck, Loader2, ShieldCheck, AlertTriangle, Sparkles, PackageCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { fetchCourierHistoryFn } from "@/lib/erp/courier-history.functions";
import { detectAddressFn, detectAddressCached, type AddressDetectionResult } from "@/lib/erp/address-detection";

type Props = {
  orderId: string | null;
  phone: string | null;
  address: string | null;
  brandId?: string | null;
};

type Provider = { name: string; label: string; total: number; success: number; cancelled: number; ok?: boolean };

const LABELS: Record<string, string> = {
  pathao: "Pathao",
  steadfast: "Steadfast",
  redx: "RedX",
  paperfly: "Paperfly",
  ecourier: "eCourier",
};

function normPhone(raw: string) {
  const d = raw.replace(/\D/g, "");
  if (d.startsWith("880")) return "0" + d.slice(3);
  if (d.length === 10 && d.startsWith("1")) return "0" + d;
  return d;
}

function rateTone(rate: number) {
  if (rate >= 80) return { text: "text-emerald-700 dark:text-emerald-300", bar: "bg-emerald-500", ring: "border-emerald-300/70 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/40" };
  if (rate >= 50) return { text: "text-amber-700 dark:text-amber-300", bar: "bg-amber-500", ring: "border-amber-300/70 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/40" };
  return { text: "text-rose-700 dark:text-rose-300", bar: "bg-rose-500", ring: "border-rose-300/70 bg-rose-50 dark:border-rose-900/60 dark:bg-rose-950/40" };
}

/**
 * Compact delivery intelligence strip for the order popup:
 * courier success rate by provider, detected city/zone/area, live shipment.
 */
export function OrderDeliveryIntel({ orderId, phone, address, brandId }: Props) {
  const digits = phone ? normPhone(phone) : "";
  const fetchHistory = useServerFn(fetchCourierHistoryFn);
  const detectFn = useServerFn(detectAddressFn);

  /* ---- Courier success rate (cache first, live fallback) ---------------- */
  const cachedQ = useQuery({
    queryKey: ["order-intel-courier-cache", digits],
    enabled: digits.length >= 10,
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("courier_history_cache")
        .select("phone, data")
        .eq("phone", digits)
        .maybeSingle();
      const hist = data?.data as { providers?: Provider[]; fetched_at?: string } | null;
      return hist?.providers?.length ? { providers: hist.providers, fetched_at: hist.fetched_at ?? null } : null;
    },
  });

  const liveQ = useQuery({
    queryKey: ["order-intel-courier-live", digits],
    enabled: digits.length >= 10 && cachedQ.isFetched && !cachedQ.data,
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const res = await fetchHistory({ data: { phones: [digits], brandId: brandId ?? undefined } });
      const hit = res.results[digits] ?? Object.values(res.results)[0];
      return hit?.providers?.length ? { providers: hit.providers as Provider[], fetched_at: hit.fetched_at ?? null } : null;
    },
  });

  const hist = cachedQ.data ?? liveQ.data ?? null;
  const providers = (hist?.providers ?? []).filter((p) => p.ok !== false && (p.total ?? 0) > 0);
  const totals = providers.reduce(
    (a, p) => ({ total: a.total + (p.total ?? 0), success: a.success + (p.success ?? 0) }),
    { total: 0, success: 0 },
  );
  const rate = totals.total > 0 ? Math.round((totals.success / totals.total) * 100) : null;
  const historyLoading = cachedQ.isLoading || liveQ.isLoading;

  /* ---- City / zone / area detection ------------------------------------ */
  const [detected, setDetected] = useState<AddressDetectionResult | null>(null);
  const [detecting, setDetecting] = useState(false);
  useEffect(() => {
    let alive = true;
    const addr = (address ?? "").trim();
    setDetected(null);
    if (addr.length < 5) return;
    setDetecting(true);
    detectAddressCached(detectFn, addr)
      .then((r) => { if (alive) setDetected(r); })
      .catch(() => { /* detection is best-effort */ })
      .finally(() => { if (alive) setDetecting(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  /* ---- Live shipment ---------------------------------------------------- */
  const shipmentQ = useQuery({
    queryKey: ["order-intel-shipment", orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const { data } = await supabase
        .from("courier_shipments")
        .select("provider, consignment_id, tracking_code, status, delivery_fee, created_at")
        .eq("order_id", orderId!)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data ?? null;
    },
  });
  const shipment = shipmentQ.data;

  const tone = rateTone(rate ?? 0);
  const hasAnything = digits.length >= 10 || (address ?? "").trim().length >= 5 || !!shipment;
  if (!hasAnything) return null;

  return (
    <section className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <Truck className="h-3.5 w-3.5" /> Delivery intelligence
        </h3>
        {hist?.fetched_at && (
          <span className="text-[10px] text-muted-foreground">
            synced {format(new Date(hist.fetched_at), "dd MMM, hh:mm a")}
          </span>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {/* Courier success rate */}
        <div className={cn("rounded-lg border p-3", rate !== null ? tone.ring : "bg-muted/30")}>
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {rate !== null && rate >= 80 ? <ShieldCheck className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
              Courier success rate
            </span>
            {historyLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          </div>

          {rate === null ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {historyLoading ? "Courier history আনা হচ্ছে…" : "এই নাম্বারে কোনো courier history পাওয়া যায়নি।"}
            </p>
          ) : (
            <>
              <div className="mt-1.5 flex items-baseline gap-2">
                <span className={cn("text-2xl font-bold tabular-nums", tone.text)}>{rate}%</span>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {totals.success}/{totals.total} delivered
                </span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div className={cn("h-full rounded-full", tone.bar)} style={{ width: `${Math.min(100, rate)}%` }} />
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {providers.map((p) => {
                  const r = p.total > 0 ? Math.round((p.success / p.total) * 100) : 0;
                  const t = rateTone(r);
                  return (
                    <span
                      key={p.name}
                      title={`${p.success} success · ${p.cancelled} cancel`}
                      className="inline-flex items-center gap-1 rounded-full border bg-background/70 px-2 py-0.5 text-[10px] font-medium"
                    >
                      {LABELS[p.name] ?? p.label ?? p.name}
                      <span className={cn("font-bold tabular-nums", t.text)}>{r}%</span>
                      <span className="text-muted-foreground tabular-nums">({p.total})</span>
                    </span>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Detected city / zone / area */}
        <div className="rounded-lg border bg-muted/20 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <MapPin className="h-3 w-3" /> Detected location
            </span>
            {detecting ? (
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            ) : detected?.source && detected.source !== "none" ? (
              <span className="inline-flex items-center gap-1 rounded-full border bg-background px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                {detected.source === "ai" && <Sparkles className="h-2.5 w-2.5" />}
                {detected.source} · {Math.round((detected.confidence ?? 0) * 100)}%
              </span>
            ) : null}
          </div>

          {detected?.city ? (
            <div className="mt-2 space-y-1.5">
              {([
                ["City", detected.city?.name],
                ["Zone", detected.zone?.name],
                ["Area", detected.area?.name],
              ] as const).map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
                  <span className={cn("truncate font-medium", value ? "text-foreground" : "text-muted-foreground")}>
                    {value ?? "Detect হয়নি"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              {detecting ? "Address থেকে city/zone বের করা হচ্ছে…" : "Address থেকে city detect করা যায়নি।"}
            </p>
          )}
        </div>
      </div>

      {/* Live shipment */}
      {shipment && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border bg-muted/20 px-3 py-2 text-xs">
          <span className="flex items-center gap-1.5 font-semibold capitalize">
            <PackageCheck className="h-3.5 w-3.5 text-muted-foreground" />
            {LABELS[shipment.provider] ?? shipment.provider}
          </span>
          {shipment.status && (
            <span className="rounded-full border bg-background px-2 py-0.5 text-[10px] font-medium capitalize">
              {String(shipment.status).replace(/_/g, " ")}
            </span>
          )}
          {(shipment.tracking_code || shipment.consignment_id) && (
            <span className="font-mono text-[11px] text-muted-foreground">
              {shipment.tracking_code ?? shipment.consignment_id}
            </span>
          )}
          {shipment.delivery_fee != null && (
            <span className="tabular-nums text-muted-foreground">Fee ৳{Number(shipment.delivery_fee).toLocaleString()}</span>
          )}
          <span className="ml-auto text-[10px] text-muted-foreground">
            {format(new Date(shipment.created_at), "dd MMM, hh:mm a")}
          </span>
        </div>
      )}
    </section>
  );
}
